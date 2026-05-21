"""SQLite FTS5 index for entries.raw_text + ironed_prose.

We keep a contentless-external-content FTS5 table that mirrors the entries
rows. The table is wired up with AFTER INSERT / UPDATE / DELETE triggers so
SQLAlchemy writes stay in sync without any application-side coupling. On
startup we also issue a `rebuild` command which is idempotent and cheap, so
the index always matches the current entries table even if a row was inserted
while triggers weren't installed yet (e.g. against an older schema)."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine


_DDL = [
    # The virtual table itself.
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
        raw_text,
        ironed_prose,
        content='entries',
        content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
    )
    """,
    # Keep the FTS index in sync with the entries table.
    """
    CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
        INSERT INTO entries_fts(rowid, raw_text, ironed_prose)
        VALUES (new.id, new.raw_text, coalesce(new.ironed_prose, ''));
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, raw_text, ironed_prose)
        VALUES ('delete', old.id, old.raw_text, coalesce(old.ironed_prose, ''));
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, raw_text, ironed_prose)
        VALUES ('delete', old.id, old.raw_text, coalesce(old.ironed_prose, ''));
        INSERT INTO entries_fts(rowid, raw_text, ironed_prose)
        VALUES (new.id, new.raw_text, coalesce(new.ironed_prose, ''));
    END
    """,
]


def install_fts(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.begin() as conn:
        for stmt in _DDL:
            conn.execute(text(stmt))
        # Rebuild repairs any drift between entries and entries_fts.
        conn.execute(text("INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')"))
