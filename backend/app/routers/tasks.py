from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import EntryTag, Tag, Task
from ..schemas import TaskRead, TaskStatus, TaskUpdate


router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskRead])
def list_tasks(
    status: TaskStatus | None = Query(None),
    tag: str | None = Query(None, description="Tag name filter (case-insensitive)"),
    limit: int = Query(200, ge=1, le=500),
    session: Session = Depends(get_session),
) -> list[Task]:
    stmt = select(Task).order_by(desc(Task.created_at)).limit(limit)
    if status is not None:
        stmt = stmt.where(Task.status == status)
    if tag is not None:
        cleaned = tag.strip().lower()
        stmt = (
            stmt.join(EntryTag, EntryTag.entry_id == Task.entry_id)
            .join(Tag, Tag.id == EntryTag.tag_id)
            .where(Tag.name == cleaned)
        )
    return list(session.scalars(stmt).all())


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: int, payload: TaskUpdate, session: Session = Depends(get_session)
) -> Task:
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    data = payload.model_dump(exclude_unset=True)

    if "status" in data:
        new_status = data["status"]
        if new_status == "done" and task.status != "done":
            task.completed_at = datetime.now(timezone.utc)
        elif new_status != "done":
            task.completed_at = None

    for key, value in data.items():
        setattr(task, key, value)
    session.commit()
    session.refresh(task)
    return task
