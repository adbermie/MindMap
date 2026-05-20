from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Source = Literal["text", "voice"]
EntryStatus = Literal["raw", "processed", "archived"]


class EntryCreate(BaseModel):
    raw_text: str = Field(min_length=1)
    source: Source = "text"


class EntryUpdate(BaseModel):
    raw_text: str | None = None
    ironed_prose: str | None = None
    status: EntryStatus | None = None


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
