from __future__ import annotations

import json
from typing import Any, Callable, Iterator, Literal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select, text
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..db import get_session
from ..ironer import _get_client
from ..models import Entry, EntryTag
from .search import _escape_fts_query

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    # "search": FTS retrieval + Sonnet (the general chat tab).
    # "question": whole-DB context + Haiku, for discussing an open question.
    mode: Literal["search", "question"] = "search"
    focus_question: str | None = None


_SYSTEM_PROMPT = """You are MindMap's chat assistant.

MindMap is a single-user thought-unloader: the user dumps raw streams of
consciousness into entries, which get ironed into prose, tags, tasks, and
questions. The user is now asking you questions about their own past entries.

You are given a set of their entries as context — each one is `#id [tags]: text`.
Answer using only what's in those entries plus reasonable synthesis across them.
Speak directly and concisely, in a calm, observational tone — you're helping the
user see their own thinking, not coaching them. No preamble, no cheerleading.

When you draw on a specific entry, cite it inline as `[#id]` right after the
relevant statement — e.g. "You keep circling back to the backup question [#12]."
Only cite entries you actually used. If the provided entries don't contain
enough to answer, say so plainly rather than inventing facts."""


_QUESTION_SYSTEM_PROMPT = """You are MindMap's question companion — a thinking
partner for the single user.

MindMap is the user's personal thought-unloader: a corpus of their own entries
(ironed prose, tags, tasks, open questions). You are given their ENTIRE corpus
as context. The user has clicked one of their own open questions to think it
through with you.

Your job: help them actually make progress on the question. Draw freely on the
whole corpus — surface relevant past entries, patterns, prior decisions,
contradictions, and tasks that bear on it. Ask a sharp clarifying question when
it would genuinely move things forward, but don't stall — offer a view. Be
concrete and specific to THEIR situation, not generic advice.

Tone: calm, direct, a little incisive — a smart friend who has read everything
they've written. Cite specific entries inline as [#id] when you lean on them.
Keep turns reasonably short so it stays a conversation, not a lecture."""


# Retrieval: id + rank only (the chat context block carries the text itself).
_FTS_IDS_SQL = text(
    """
    SELECT entries_fts.rowid AS id
    FROM entries_fts
    WHERE entries_fts MATCH :q
    ORDER BY rank
    LIMIT :limit
    """
)


def _entry_summary(e: Entry) -> dict[str, Any]:
    summary = (e.ironed_prose or e.raw_text or "").strip().replace("\n", " ")
    if len(summary) > 600:
        summary = summary[:597] + "..."
    tags = [et.tag.name for et in e.tags if et.tag is not None]
    return {"id": e.id, "summary": summary, "tags": tags}


def _all_entries(session: Session, cap: int = 500) -> list[dict[str, Any]]:
    """Whole-DB context for question discussions: every entry (newest first),
    bounded by a generous safety cap so a runaway corpus can't blow the context
    window. For a personal single-user app this is effectively all of it."""
    entries = session.scalars(
        select(Entry)
        .options(selectinload(Entry.tags).selectinload(EntryTag.tag))
        .order_by(desc(Entry.created_at))
        .limit(cap)
    ).all()
    return [_entry_summary(e) for e in entries]


def _retrieve(
    session: Session,
    query: str,
    k_fts: int = 15,
    k_recent: int = 15,
    cap: int = 30,
) -> list[dict[str, Any]]:
    """Hybrid retrieval: top FTS matches for the question, unioned with the most
    recent entries (so vague questions with no keyword overlap still get context),
    deduped and capped."""
    fts_ids: list[int] = []
    cleaned = _escape_fts_query(query)
    if cleaned:
        rows = session.execute(
            _FTS_IDS_SQL, {"q": cleaned, "limit": k_fts}
        ).mappings().all()
        fts_ids = [r["id"] for r in rows]

    recent_ids = list(
        session.scalars(
            select(Entry.id).order_by(desc(Entry.created_at)).limit(k_recent)
        ).all()
    )

    ordered: list[int] = []
    seen: set[int] = set()
    for eid in fts_ids + recent_ids:
        if eid not in seen:
            seen.add(eid)
            ordered.append(eid)
        if len(ordered) >= cap:
            break
    if not ordered:
        return []

    entries = session.scalars(
        select(Entry)
        .options(selectinload(Entry.tags).selectinload(EntryTag.tag))
        .where(Entry.id.in_(ordered))
    ).all()
    by_id = {e.id: e for e in entries}

    out: list[dict[str, Any]] = []
    for eid in ordered:
        e = by_id.get(eid)
        if e is None:
            continue
        out.append(_entry_summary(e))
    return out


def _format_context(entries: list[dict[str, Any]]) -> str:
    if not entries:
        return "The user has no entries yet."
    lines = ["The user's entries (most relevant first) — #id [tags]: text"]
    for e in entries:
        tags = ", ".join(e["tags"]) or "-"
        lines.append(f"#{e['id']} [{tags}]: {e['summary']}")
    return "\n".join(lines)


def _sse(obj: dict[str, Any]) -> str:
    return f"data: {json.dumps(obj)}\n\n"


def _make_stream(
    messages_payload: list[dict[str, str]],
    system_blocks: list[dict[str, Any]],
    context_entry_ids: list[int],
    model: str,
) -> Callable[[], Iterator[str]]:
    def gen() -> Iterator[str]:
        # Tell the client up front which entries are in context.
        yield _sse({"type": "context", "entry_ids": context_entry_ids})
        try:
            client = _get_client()
            with client.messages.stream(
                model=model,
                max_tokens=2048,
                system=system_blocks,
                messages=messages_payload,
            ) as stream:
                for chunk in stream.text_stream:
                    if chunk:
                        yield _sse({"type": "token", "text": chunk})
            yield _sse({"type": "done"})
        except Exception as exc:  # surface a clean error event to the client
            yield _sse({"type": "error", "detail": str(exc)})

    return gen


@router.post("")
def chat(payload: ChatRequest, session: Session = Depends(get_session)) -> StreamingResponse:
    if payload.mode == "question":
        entries = _all_entries(session)
        model = settings.anthropic_haiku_model
        system_text = _QUESTION_SYSTEM_PROMPT
        if payload.focus_question and payload.focus_question.strip():
            system_text += (
                f"\n\nThe open question under discussion: "
                f"{payload.focus_question.strip()}"
            )
    else:
        latest_user = next(
            (m.content for m in reversed(payload.messages) if m.role == "user"), ""
        )
        entries = _retrieve(session, latest_user)
        model = settings.anthropic_model
        system_text = _SYSTEM_PROMPT

    system_blocks = [
        {
            "type": "text",
            "text": system_text,
            "cache_control": {"type": "ephemeral"},
        },
        {"type": "text", "text": _format_context(entries)},
    ]
    messages_payload = [{"role": m.role, "content": m.content} for m in payload.messages]

    gen = _make_stream(messages_payload, system_blocks, [e["id"] for e in entries], model)
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # tell nginx not to buffer the stream
        },
    )
