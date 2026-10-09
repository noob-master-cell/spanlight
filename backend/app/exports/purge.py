"""Deleting a deleted project's export files.

Deleting a project removes its `exports` rows with it (the foreign key cascades), but the files
they pointed to sit in object storage and hold prompts and completions. The deletion enqueues a
`purge_project_objects` job in the same transaction, and the job lists everything under the
project's export prefix and deletes it. Listing by prefix, not by row, is what makes it work
after the rows are gone.
"""

import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.jobs.context import TaskContext
from app.jobs.outcome import JobOutcome
from app.jobs.queue import enqueue
from app.storage.object_store import get_object_store

logger = structlog.get_logger(__name__)

PURGE_JOB = "purge_project_objects"


def project_prefix(project_id: uuid.UUID) -> str:
    """The key prefix of every export file of a project (the trailing slash matters)."""
    return f"exports/{project_id}/"


async def enqueue_project_purge(db: AsyncSession, project_id: uuid.UUID) -> None:
    """Queue the deletion of a project's export files. The caller commits it with the deletion."""
    await enqueue(
        db, PURGE_JOB, {"project_id": str(project_id)}, dedupe_key=f"{PURGE_JOB}:{project_id}"
    )


async def run_purge_project_objects(context: TaskContext, payload: dict[str, Any]) -> JobOutcome:
    """Delete every object under the project's export prefix. Safe to run again: it lists first."""
    store = get_object_store(context.settings)
    if store is None:
        logger.info("purge_skipped", reason="object storage is not configured")
        return JobOutcome.SKIPPED_NOT_CONFIGURED
    project_id = uuid.UUID(payload["project_id"])
    objects = await store.list(project_prefix(project_id))
    for stored in objects:
        await store.delete(stored.key)
    logger.info("project_objects_purged", project_id=str(project_id), deleted=len(objects))
    return JobOutcome.OK
