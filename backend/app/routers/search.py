from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_session


router = APIRouter(prefix="/search", tags=["search"])


class SearchHit(BaseModel):
    id: int
    snippet: str
    rank: float


_FTS_SQL = text(
    """
    SELECT
        entries_fts.rowid AS id,
        snippet(entries_fts, 0, '<mark>', '</mark>', '…', 12) AS snippet_raw,
        snippet(entries_fts, 1, '<mark>', '</mark>', '…', 12) AS snippet_prose,
        rank
    FROM entries_fts
    WHERE entries_fts MATCH :q
    ORDER BY rank
    LIMIT :limit
    """
)


def _escape_fts_query(q: str) -> str:
    """Wrap each term in double quotes to defang FTS5 syntax characters like
    `:` and `*` from user input. Multi-token queries become an implicit AND."""
    tokens = [t for t in q.replace('"', " ").split() if t]
    if not tokens:
        return ""
    return " ".join(f'"{t}"' for t in tokens)


@router.get("", response_model=list[SearchHit])
def search(
    q: str = Query("", description="Search query"),
    limit: int = Query(30, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[SearchHit]:
    cleaned = _escape_fts_query(q)
    if not cleaned:
        return []
    rows = session.execute(_FTS_SQL, {"q": cleaned, "limit": limit}).mappings().all()
    hits: list[SearchHit] = []
    for r in rows:
        snippet = r["snippet_prose"] or r["snippet_raw"] or ""
        hits.append(SearchHit(id=r["id"], snippet=snippet, rank=float(r["rank"])))
    return hits
