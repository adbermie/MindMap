from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    raw_text: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(16), default="text")  # 'text' | 'voice'
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ironed_prose: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="raw")  # 'raw' | 'processed' | 'archived'

    tags: Mapped[list["EntryTag"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["Task"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )
    questions: Mapped[list["Question"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)


class EntryTag(Base):
    __tablename__ = "entry_tags"
    __table_args__ = (UniqueConstraint("entry_id", "tag_id", name="uq_entry_tag"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("entries.id", ondelete="CASCADE"), index=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), index=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)

    entry: Mapped[Entry] = relationship(back_populates="tags")
    tag: Mapped[Tag] = relationship()


class EntryLink(Base):
    __tablename__ = "entry_links"
    __table_args__ = (UniqueConstraint("src_entry_id", "dst_entry_id", name="uq_entry_link"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    src_entry_id: Mapped[int] = mapped_column(
        ForeignKey("entries.id", ondelete="CASCADE"), index=True
    )
    dst_entry_id: Mapped[int] = mapped_column(
        ForeignKey("entries.id", ondelete="CASCADE"), index=True
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    weight: Mapped[float] = mapped_column(Float, default=1.0)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("entries.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open")  # open|done|dropped
    priority_hint: Mapped[str | None] = mapped_column(String(16), nullable=True)  # low|med|high
    due_hint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    entry: Mapped[Entry] = relationship(back_populates="tasks")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("entries.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    entry: Mapped[Entry] = relationship(back_populates="questions")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), default="search")  # 'search' | 'question'
    title: Mapped[str] = mapped_column(String(200), default="New chat")
    # For question threads: the open question and the entry it came from.
    focus_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    seed_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("entries.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    # Evolving, model-facing running memory (grows; preserves chronology).
    handover: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Human-facing summary derived from the handover, shown in place of transcript.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    handover_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    last_rollup_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    transcript_pruned: Mapped[bool] = mapped_column(Boolean, default=False)

    messages: Mapped[list["ConversationMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ConversationMessage.created_at",
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))  # 'user' | 'assistant'
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    # True once incorporated into the handover (archived; pruned after retention).
    rolled_up: Mapped[bool] = mapped_column(Boolean, default=False)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
