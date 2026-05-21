from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Source = Literal["text", "voice"]
EntryStatus = Literal["raw", "processed", "archived"]
TaskStatus = Literal["open", "done", "dropped"]
PriorityHint = Literal["low", "med", "high"]


class EntryCreate(BaseModel):
    raw_text: str = Field(min_length=1)
    source: Source = "text"


class EntryUpdate(BaseModel):
    raw_text: str | None = None
    ironed_prose: str | None = None
    status: EntryStatus | None = None


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entry_id: int
    title: str
    notes: str | None
    status: TaskStatus
    priority_hint: PriorityHint | None
    due_hint: str | None
    created_at: datetime
    completed_at: datetime | None


class QuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entry_id: int
    text: str
    dismissed_at: datetime | None


class EntryLinkRead(BaseModel):
    """Outbound link from this entry to another."""

    dst_entry_id: int
    reason: str | None
    weight: float


class EntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    raw_text: str
    source: Source
    processed_at: datetime | None
    ironed_prose: str | None
    status: EntryStatus

    tags: list[TagRead] = Field(default_factory=list)
    tasks: list[TaskRead] = Field(default_factory=list)
    questions: list[QuestionRead] = Field(default_factory=list)
    links_out: list[EntryLinkRead] = Field(default_factory=list)


class ReprocessRequest(BaseModel):
    instruction: str | None = None


class TaskUpdate(BaseModel):
    status: TaskStatus | None = None
    title: str | None = None
    notes: str | None = None
    priority_hint: PriorityHint | None = None
    due_hint: str | None = None
