from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal, get_session
from ..ironer import _get_client
from ..models import Conversation, ConversationMessage, utcnow
from ..rollup import generate_rollup
from ..schemas import (
    ConversationCreate,
    ConversationListItem,
    ConversationRead,
    MessageRead,
    RollupResult,
    SendMessageRequest,
)
from .chat import (
    _QUESTION_SYSTEM_PROMPT,
    _SYSTEM_PROMPT,
    _all_entries,
    _format_context,
    _retrieve,
    _sse,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])
maintenance_router = APIRouter(prefix="/maintenance", tags=["maintenance"])


# ---- helpers -----------------------------------------------------------------


def _handovers_dir() -> Path:
    url = settings.database_url
    if url.startswith("sqlite:///"):
        base = Path(url.replace("sqlite:///", "", 1)).parent
    else:
        base = Path("./data")
    d = base / "handovers"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write_handover_file(conv: Conversation) -> str:
    path = _handovers_dir() / f"conv-{conv.id}.md"
    stamp = (conv.last_rollup_at or utcnow()).strftime("%Y-%m-%d")
    header = f"# {conv.title}\n\n_Conversation #{conv.id} · updated {stamp}_\n\n"
    path.write_text(header + (conv.handover or ""), encoding="utf-8")
    return str(path)


def _serialize(conv: Conversation, session: Session) -> ConversationRead:
    live = [m for m in conv.messages if not m.rolled_up]
    archived = sum(1 for m in conv.messages if m.rolled_up)
    return ConversationRead(
        id=conv.id,
        kind=conv.kind,
        title=conv.title,
        focus_question=conv.focus_question,
        seed_entry_id=conv.seed_entry_id,
        created_at=conv.created_at,
        last_activity_at=conv.last_activity_at,
        summary=conv.summary,
        last_rollup_at=conv.last_rollup_at,
        transcript_pruned=conv.transcript_pruned,
        messages=[MessageRead.model_validate(m) for m in live],
        archived_count=archived,
    )


def _today_start_utc() -> datetime:
    local_now = datetime.now().astimezone()
    local_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    return local_midnight.astimezone(timezone.utc)


# ---- CRUD --------------------------------------------------------------------


@router.get("", response_model=list[ConversationListItem])
def list_conversations(session: Session = Depends(get_session)) -> list[ConversationListItem]:
    convs = session.scalars(
        select(Conversation).order_by(desc(Conversation.last_activity_at))
    ).all()
    return [
        ConversationListItem(
            id=c.id,
            kind=c.kind,
            title=c.title,
            last_activity_at=c.last_activity_at,
            has_summary=bool(c.summary),
        )
        for c in convs
    ]


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreate, session: Session = Depends(get_session)
) -> ConversationRead:
    title = (payload.title or "").strip()
    if not title:
        if payload.kind == "question" and payload.focus_question:
            title = payload.focus_question.strip()[:200]
        else:
            title = "New chat"
    conv = Conversation(
        kind=payload.kind,
        title=title or "New chat",
        focus_question=payload.focus_question,
        seed_entry_id=payload.seed_entry_id,
    )
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return _serialize(conv, session)


@router.get("/{conversation_id}", response_model=ConversationRead)
def get_conversation(
    conversation_id: int, session: Session = Depends(get_session)
) -> ConversationRead:
    conv = session.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _serialize(conv, session)


@router.get("/{conversation_id}/transcript", response_model=list[MessageRead])
def get_transcript(
    conversation_id: int, session: Session = Depends(get_session)
) -> list[MessageRead]:
    conv = session.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return [MessageRead.model_validate(m) for m in conv.messages]


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_conversation(conversation_id: int, session: Session = Depends(get_session)):
    conv = session.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    path = _handovers_dir() / f"conv-{conv.id}.md"
    session.delete(conv)
    session.commit()
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
    return None


# ---- send a message (streamed, persisted) ------------------------------------


def _make_message_stream(
    conversation_id: int,
    messages_payload: list[dict[str, str]],
    system_blocks: list[dict],
    entry_ids: list[int],
    model: str,
) -> Callable[[], Iterator[str]]:
    def gen() -> Iterator[str]:
        yield _sse({"type": "context", "entry_ids": entry_ids})
        acc: list[str] = []
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
                        acc.append(chunk)
                        yield _sse({"type": "token", "text": chunk})
            text = "".join(acc).strip()
            if text:
                # Fresh session: the request's session is closed by the time the
                # generator runs.
                with SessionLocal() as s:
                    s.add(
                        ConversationMessage(
                            conversation_id=conversation_id,
                            role="assistant",
                            content=text,
                        )
                    )
                    conv = s.get(Conversation, conversation_id)
                    if conv is not None:
                        conv.last_activity_at = utcnow()
                    s.commit()
            yield _sse({"type": "done"})
        except Exception as exc:  # surface a clean error event to the client
            yield _sse({"type": "error", "detail": str(exc)})

    return gen


@router.post("/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    payload: SendMessageRequest,
    session: Session = Depends(get_session),
) -> StreamingResponse:
    conv = session.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    content = payload.content.strip()
    session.add(
        ConversationMessage(conversation_id=conv.id, role="user", content=content)
    )
    conv.last_activity_at = utcnow()
    # Give search chats a real title from their first message.
    if conv.kind == "search" and conv.title in ("", "New chat"):
        conv.title = content[:60]
    session.commit()

    # Live (not-yet-rolled-up) messages form the current turn's transcript.
    live = session.scalars(
        select(ConversationMessage)
        .where(
            ConversationMessage.conversation_id == conv.id,
            ConversationMessage.rolled_up.is_(False),
        )
        .order_by(ConversationMessage.created_at)
    ).all()
    messages_payload = [{"role": m.role, "content": m.content} for m in live]

    if conv.kind == "question":
        entries = _all_entries(session)
        model = settings.anthropic_haiku_model
        sys_text = _QUESTION_SYSTEM_PROMPT
        if conv.focus_question and conv.focus_question.strip():
            sys_text += (
                f"\n\nThe open question under discussion: {conv.focus_question.strip()}"
            )
    else:
        entries = _retrieve(session, content)
        model = settings.anthropic_model
        sys_text = _SYSTEM_PROMPT

    system_blocks: list[dict] = [
        {"type": "text", "text": sys_text, "cache_control": {"type": "ephemeral"}},
    ]
    if conv.handover:
        system_blocks.append(
            {
                "type": "text",
                "text": (
                    "Running handover from earlier in this conversation "
                    "(prior context, carry it forward):\n\n" + conv.handover
                ),
            }
        )
    system_blocks.append({"type": "text", "text": _format_context(entries)})

    gen = _make_message_stream(
        conv.id, messages_payload, system_blocks, [e["id"] for e in entries], model
    )
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---- maintenance: lazy daily rollup + retention prune ------------------------


@maintenance_router.post("/rollup", response_model=RollupResult)
def run_rollup(session: Session = Depends(get_session)) -> RollupResult:
    """Idempotent. Rolls up every thread that has un-rolled messages from before
    local midnight, then prunes transcripts idle past the retention window. Safe
    to call on every app load; a scheduler can call it later instead."""
    today_start = _today_start_utc()

    conv_ids = session.scalars(
        select(ConversationMessage.conversation_id)
        .where(
            ConversationMessage.rolled_up.is_(False),
            ConversationMessage.created_at < today_start,
        )
        .distinct()
    ).all()

    rolled = 0
    for cid in conv_ids:
        conv = session.get(Conversation, cid)
        if conv is None:
            continue
        msgs = session.scalars(
            select(ConversationMessage)
            .where(
                ConversationMessage.conversation_id == cid,
                ConversationMessage.rolled_up.is_(False),
                ConversationMessage.created_at < today_start,
            )
            .order_by(ConversationMessage.created_at)
        ).all()
        if not msgs:
            continue
        payload = [{"role": m.role, "content": m.content} for m in msgs]
        try:
            result = generate_rollup(conv.handover, payload, conv.focus_question)
        except Exception:
            continue  # leave un-rolled; next run will retry
        conv.handover = result["handover"] or conv.handover
        conv.summary = result["summary"] or conv.summary
        if result["title"]:
            conv.title = result["title"][:200]
        conv.last_rollup_at = utcnow()
        for m in msgs:
            m.rolled_up = True
        session.flush()
        try:
            conv.handover_path = _write_handover_file(conv)
        except OSError:
            pass
        session.commit()
        rolled += 1

    # Retention: drop the raw transcript for stale threads, keep the handover.
    cutoff = utcnow() - timedelta(days=settings.transcript_retention_days)
    pruned = 0
    stale = session.scalars(
        select(Conversation).where(
            Conversation.last_activity_at < cutoff,
            Conversation.transcript_pruned.is_(False),
            Conversation.handover.is_not(None),  # never prune away the only record
        )
    ).all()
    for conv in stale:
        msgs = list(conv.messages)
        for m in msgs:
            session.delete(m)
        conv.transcript_pruned = True
        session.commit()
        pruned += 1

    return RollupResult(rolled_up=rolled, pruned=pruned)
