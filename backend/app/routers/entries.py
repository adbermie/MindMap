from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_session
from ..ironer import iron_entry
from ..models import Entry, EntryLink, EntryTag, Question, Tag, Task
from ..schemas import (
    EntryCreate,
    EntryLinkRead,
    EntryRead,
    EntryUpdate,
    QuestionRead,
    ReprocessRequest,
    TagRead,
    TaskRead,
)


router = APIRouter(prefix="/entries", tags=["entries"])


# ---- serialization -----------------------------------------------------------


def _serialize_entry(entry: Entry, session: Session) -> EntryRead:
    """Build the full EntryRead from a (eager-loaded) Entry row."""
    tags = [TagRead.model_validate(et.tag) for et in entry.tags if et.tag is not None]
    tasks = [TaskRead.model_validate(t) for t in entry.tasks]
    questions = [QuestionRead.model_validate(q) for q in entry.questions]
    link_rows = session.scalars(
        select(EntryLink).where(EntryLink.src_entry_id == entry.id)
    ).all()
    links_out = [
        EntryLinkRead(
            dst_entry_id=row.dst_entry_id,
            reason=row.reason,
            weight=row.weight,
        )
        for row in link_rows
    ]
    return EntryRead(
        id=entry.id,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        raw_text=entry.raw_text,
        source=entry.source,
        processed_at=entry.processed_at,
        ironed_prose=entry.ironed_prose,
        status=entry.status,
        tags=tags,
        tasks=tasks,
        questions=questions,
        links_out=links_out,
    )


def _entry_with_relations_stmt():
    return select(Entry).options(
        selectinload(Entry.tags).selectinload(EntryTag.tag),
        selectinload(Entry.tasks),
        selectinload(Entry.questions),
    )


# ---- CRUD --------------------------------------------------------------------


@router.post("", response_model=EntryRead, status_code=status.HTTP_201_CREATED)
def create_entry(payload: EntryCreate, session: Session = Depends(get_session)) -> EntryRead:
    entry = Entry(raw_text=payload.raw_text, source=payload.source)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return _serialize_entry(entry, session)


@router.get("", response_model=list[EntryRead])
def list_entries(
    limit: int = Query(50, ge=1, le=200),
    before_id: int | None = Query(None, description="Return entries with id < before_id (cursor)"),
    session: Session = Depends(get_session),
) -> list[EntryRead]:
    stmt = _entry_with_relations_stmt().order_by(desc(Entry.created_at)).limit(limit)
    if before_id is not None:
        stmt = stmt.where(Entry.id < before_id)
    entries = list(session.scalars(stmt).all())
    return [_serialize_entry(e, session) for e in entries]


@router.get("/{entry_id}", response_model=EntryRead)
def get_entry(entry_id: int, session: Session = Depends(get_session)) -> EntryRead:
    entry = session.scalar(_entry_with_relations_stmt().where(Entry.id == entry_id))
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    return _serialize_entry(entry, session)


@router.patch("/{entry_id}", response_model=EntryRead)
def update_entry(
    entry_id: int, payload: EntryUpdate, session: Session = Depends(get_session)
) -> EntryRead:
    entry = session.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(entry, key, value)
    session.commit()
    session.refresh(entry)
    return _serialize_entry(entry, session)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_entry(entry_id: int, session: Session = Depends(get_session)):
    entry = session.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    session.delete(entry)
    session.commit()
    return None


# ---- /process and /reprocess -------------------------------------------------


def _build_recent_context(session: Session, exclude_entry_id: int, limit: int = 30) -> list[dict]:
    """Pull the last N entries (excluding the one being processed) and shape
    them as {id, summary, tags} for the ironer."""
    stmt = (
        _entry_with_relations_stmt()
        .where(Entry.id != exclude_entry_id)
        .order_by(desc(Entry.created_at))
        .limit(limit)
    )
    entries = list(session.scalars(stmt).all())
    out: list[dict] = []
    for e in entries:
        summary = e.ironed_prose or e.raw_text
        tags = [et.tag.name for et in e.tags if et.tag is not None]
        out.append({"id": e.id, "summary": summary, "tags": tags})
    return out


def _upsert_tag(session: Session, name: str) -> Tag:
    cleaned = name.strip().lower()
    tag = session.scalar(select(Tag).where(Tag.name == cleaned))
    if tag is None:
        tag = Tag(name=cleaned)
        session.add(tag)
        session.flush()  # assign id
    return tag


def _apply_iron_result(
    session: Session,
    entry: Entry,
    result: dict,
    replace_extracted: bool,
) -> None:
    """Apply the ironer output to the DB row. When `replace_extracted` is True
    (used by /reprocess) we wipe existing tags/tasks/questions/links_out and
    re-create them; otherwise (/process) we assume the entry has no extracted
    rows yet."""
    if replace_extracted:
        for row in list(entry.tags):
            session.delete(row)
        for row in list(entry.tasks):
            session.delete(row)
        for row in list(entry.questions):
            session.delete(row)
        outbound = session.scalars(
            select(EntryLink).where(EntryLink.src_entry_id == entry.id)
        ).all()
        for row in outbound:
            session.delete(row)
        session.flush()

    entry.ironed_prose = (result.get("prose") or "").strip() or None
    entry.processed_at = datetime.now(timezone.utc)
    entry.status = "processed"

    for raw_name in result.get("tags") or []:
        if not isinstance(raw_name, str) or not raw_name.strip():
            continue
        tag = _upsert_tag(session, raw_name)
        session.add(EntryTag(entry_id=entry.id, tag_id=tag.id))

    for task in result.get("tasks") or []:
        if not isinstance(task, dict):
            continue
        title = (task.get("title") or "").strip()
        if not title:
            continue
        priority = task.get("priority_hint")
        if priority not in (None, "low", "med", "high"):
            priority = None
        due = task.get("due_hint")
        if isinstance(due, str):
            due = due.strip() or None
        else:
            due = None
        session.add(
            Task(
                entry_id=entry.id,
                title=title,
                priority_hint=priority,
                due_hint=due,
            )
        )

    for q in result.get("questions") or []:
        if not isinstance(q, str):
            continue
        text = q.strip()
        if not text:
            continue
        session.add(Question(entry_id=entry.id, text=text))

    for link in result.get("links") or []:
        if not isinstance(link, dict):
            continue
        dst = link.get("entry_id")
        if not isinstance(dst, int) or dst == entry.id:
            continue
        if session.get(Entry, dst) is None:
            continue
        reason = link.get("reason")
        if isinstance(reason, str):
            reason = reason.strip() or None
        else:
            reason = None
        session.add(
            EntryLink(
                src_entry_id=entry.id,
                dst_entry_id=dst,
                reason=reason,
            )
        )


@router.post("/{entry_id}/process", response_model=EntryRead)
def process_entry(entry_id: int, session: Session = Depends(get_session)) -> EntryRead:
    entry = session.scalar(_entry_with_relations_stmt().where(Entry.id == entry_id))
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.status != "raw":
        raise HTTPException(
            status_code=409,
            detail="Entry is already processed. Use /reprocess to re-run.",
        )

    recent = _build_recent_context(session, exclude_entry_id=entry.id)
    try:
        result = iron_entry(entry.raw_text, recent)
    except Exception as exc:  # surface a clean 502 for upstream/auth issues
        raise HTTPException(status_code=502, detail=f"Iron-out failed: {exc}") from exc

    _apply_iron_result(session, entry, result, replace_extracted=False)
    session.commit()
    session.expire_all()

    entry = session.scalar(_entry_with_relations_stmt().where(Entry.id == entry_id))
    return _serialize_entry(entry, session)


@router.get("/{entry_id}/export.md", response_class=PlainTextResponse)
def export_entry_markdown(
    entry_id: int, session: Session = Depends(get_session)
) -> PlainTextResponse:
    entry = session.scalar(_entry_with_relations_stmt().where(Entry.id == entry_id))
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")

    lines: list[str] = []
    lines.append(f"# Entry #{entry.id}")
    lines.append("")
    lines.append(f"*{entry.created_at.isoformat()} — status: {entry.status}*")
    lines.append("")
    if entry.ironed_prose:
        lines.append("## Ironed")
        lines.append("")
        lines.append(entry.ironed_prose)
        lines.append("")
    lines.append("## Raw")
    lines.append("")
    lines.append(entry.raw_text)
    lines.append("")
    if entry.tags:
        tag_names = " ".join(f"#{et.tag.name}" for et in entry.tags if et.tag is not None)
        if tag_names:
            lines.append(f"**Tags:** {tag_names}")
            lines.append("")
    if entry.tasks:
        lines.append("## Tasks")
        lines.append("")
        for t in entry.tasks:
            checkbox = "[x]" if t.status == "done" else "[ ]"
            extras = []
            if t.priority_hint:
                extras.append(t.priority_hint)
            if t.due_hint:
                extras.append(t.due_hint)
            suffix = f" _({', '.join(extras)})_" if extras else ""
            lines.append(f"- {checkbox} {t.title}{suffix}")
        lines.append("")
    if entry.questions:
        lines.append("## Questions")
        lines.append("")
        for q in entry.questions:
            lines.append(f"- {q.text}")
        lines.append("")
    outbound = session.scalars(
        select(EntryLink).where(EntryLink.src_entry_id == entry.id)
    ).all()
    if outbound:
        lines.append("## Links")
        lines.append("")
        for link in outbound:
            reason = f" — {link.reason}" if link.reason else ""
            lines.append(f"- → Entry #{link.dst_entry_id}{reason}")
        lines.append("")

    body = "\n".join(lines).rstrip() + "\n"
    return PlainTextResponse(
        content=body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="entry-{entry.id}.md"'},
    )


@router.post("/{entry_id}/reprocess", response_model=EntryRead)
def reprocess_entry(
    entry_id: int,
    payload: ReprocessRequest | None = None,
    session: Session = Depends(get_session),
) -> EntryRead:
    entry = session.scalar(_entry_with_relations_stmt().where(Entry.id == entry_id))
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")

    instruction = payload.instruction if payload else None
    recent = _build_recent_context(session, exclude_entry_id=entry.id)
    try:
        result = iron_entry(entry.raw_text, recent, instruction=instruction)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Iron-out failed: {exc}") from exc

    _apply_iron_result(session, entry, result, replace_extracted=True)
    session.commit()
    session.expire_all()

    entry = session.scalar(_entry_with_relations_stmt().where(Entry.id == entry_id))
    return _serialize_entry(entry, session)
