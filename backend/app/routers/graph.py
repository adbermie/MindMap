from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_session
from ..models import Entry, EntryLink, EntryTag


router = APIRouter(prefix="/graph", tags=["graph"])


class GraphNode(BaseModel):
    id: int
    label: str
    primary_tag: str | None
    status: str
    tag_count: int


class GraphEdge(BaseModel):
    source: int
    target: int
    reason: str | None


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
    for e in entries:
        tag_names = [et.tag.name for et in e.tags if et.tag is not None]
        label_source = e.ironed_prose or e.raw_text
        nodes.append(
            GraphNode(
                id=e.id,
                label=_truncate(label_source),
                primary_tag=tag_names[0] if tag_names else None,
                status=e.status,
                tag_count=len(tag_names),
            )
        )
    node_ids = {n.id for n in nodes}
    link_rows = list(session.scalars(select(EntryLink)))
    edges = [
        GraphEdge(source=r.src_entry_id, target=r.dst_entry_id, reason=r.reason)
        for r in link_rows
        if r.src_entry_id in node_ids and r.dst_entry_id in node_ids
    ]
    return GraphPayload(nodes=nodes, edges=edges)
