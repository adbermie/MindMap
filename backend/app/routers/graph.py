from __future__ import annotations

from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_session
from ..models import Entry, EntryLink, EntryTag


router = APIRouter(prefix="/graph", tags=["graph"])


class GraphNode(BaseModel):
    id: str  # "e:<entry_id>" for entries, "t:<name>" for tags
    type: str  # "entry" | "tag"
    label: str
    entry_id: int | None = None
    primary_tag: str | None = None
    tags: list[str] = Field(default_factory=list)
    status: str | None = None
    created_at: datetime | None = None
    count: int = 0  # entry: tag count; tag: number of entries


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str  # "tag" (entry→tag membership) | "link" (entry→entry, Claude)
    reason: str | None = None


class GraphPayload(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


def _truncate(text: str, n: int = 80) -> str:
    text = text.strip().replace("\n", " ")
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


@router.get("", response_model=GraphPayload)
def get_graph(session: Session = Depends(get_session)) -> GraphPayload:
    entries = list(
        session.scalars(
            select(Entry).options(selectinload(Entry.tags).selectinload(EntryTag.tag))
        )
    )

    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
    tag_counts: Counter[str] = Counter()
    entry_ids: set[int] = set()

    for e in entries:
        entry_ids.add(e.id)
        tag_names = [et.tag.name for et in e.tags if et.tag is not None]
        tag_counts.update(tag_names)
        nodes.append(
            GraphNode(
                id=f"e:{e.id}",
                type="entry",
                label=_truncate(e.ironed_prose or e.raw_text),
                entry_id=e.id,
                primary_tag=tag_names[0] if tag_names else None,
                tags=tag_names,
                status=e.status,
                created_at=e.created_at,
                count=len(tag_names),
            )
        )
        for name in tag_names:
            edges.append(GraphEdge(source=f"e:{e.id}", target=f"t:{name}", type="tag"))

    for name, count in tag_counts.items():
        nodes.append(
            GraphNode(
                id=f"t:{name}",
                type="tag",
                label=f"#{name}",
                primary_tag=name,
                count=count,
            )
        )

    for r in session.scalars(select(EntryLink)):
        if r.src_entry_id in entry_ids and r.dst_entry_id in entry_ids:
            edges.append(
                GraphEdge(
                    source=f"e:{r.src_entry_id}",
                    target=f"e:{r.dst_entry_id}",
                    type="link",
                    reason=r.reason,
                )
            )

    return GraphPayload(nodes=nodes, edges=edges)
