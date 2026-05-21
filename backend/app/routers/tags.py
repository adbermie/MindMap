from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import EntryTag, Tag


router = APIRouter(prefix="/tags", tags=["tags"])


class TagWithCount(BaseModel):
    id: int
    name: str
    color: str | None
    entry_count: int


@router.get("", response_model=list[TagWithCount])
def list_tags(session: Session = Depends(get_session)) -> list[TagWithCount]:
    stmt = (
        select(Tag, func.count(EntryTag.id).label("entry_count"))
        .outerjoin(EntryTag, EntryTag.tag_id == Tag.id)
        .group_by(Tag.id)
        .order_by(func.count(EntryTag.id).desc(), Tag.name.asc())
    )
    rows = session.execute(stmt).all()
    return [
        TagWithCount(id=t.id, name=t.name, color=t.color, entry_count=count)
        for t, count in rows
    ]
