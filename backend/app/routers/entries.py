from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Entry
from ..schemas import EntryCreate, EntryRead, EntryUpdate


router = APIRouter(prefix="/entries", tags=["entries"])


@router.post("", response_model=EntryRead, status_code=status.HTTP_201_CREATED)
def create_entry(payload: EntryCreate, session: Session = Depends(get_session)) -> Entry:
    entry = Entry(raw_text=payload.raw_text, source=payload.source)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.get("", response_model=list[EntryRead])
def list_entries(
    limit: int = Query(50, ge=1, le=200),
    before_id: int | None = Query(None, description="Return entries with id < before_id (cursor)"),
    session: Session = Depends(get_session),
) -> list[Entry]:
    stmt = select(Entry).order_by(desc(Entry.created_at)).limit(limit)
    if before_id is not None:
        stmt = stmt.where(Entry.id < before_id)
    return list(session.scalars(stmt).all())


@router.get("/{entry_id}", response_model=EntryRead)
def get_entry(entry_id: int, session: Session = Depends(get_session)) -> Entry:
    entry = session.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


@router.patch("/{entry_id}", response_model=EntryRead)
def update_entry(
    entry_id: int, payload: EntryUpdate, session: Session = Depends(get_session)
) -> Entry:
    entry = session.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(entry, key, value)
    session.commit()
    session.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, session: Session = Depends(get_session)) -> None:
    entry = session.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    session.delete(entry)
    session.commit()
