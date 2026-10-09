"""Delete traces (and, by cascade, their spans) past each project's retention."""

from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import Project
from app.db.rls import bypass_rls
from app.jobs.context import TaskContext
from app.rollups.compute import floor_hour

logger = structlog.get_logger(__name__)

BATCH_SIZE = 5000

# Small batches keep each transaction (and its locks) short on large projects.
_DELETE_BATCH = text(
    """
    DELETE FROM traces
    WHERE (project_id, trace_id) IN (
        SELECT project_id, trace_id
        FROM traces
        WHERE project_id = :project_id AND started_at < :cutoff
        LIMIT :batch_size
    )
    """
)


# Rollups are derived from the raw rows, so they must not outlive them. Only whole hours that end
# before the cutoff go; the hour that holds the cutoff may still have spans behind it.
_DELETE_SPAN_ROLLUPS = text(
    "DELETE FROM span_rollups_hourly "
    "WHERE project_id = :project_id AND bucket_start < :bucket_cutoff"
)
_DELETE_TRACE_ROLLUPS = text(
    "DELETE FROM trace_rollups_hourly "
    "WHERE project_id = :project_id AND bucket_start < :bucket_cutoff"
)


async def run_retention(context: TaskContext, _: dict[str, Any]) -> None:
    deleted = await apply_retention(context.session_factory, now=datetime.now(UTC))
    logger.info("retention_applied", traces_deleted=deleted)


async def apply_retention(
    session_factory: async_sessionmaker[AsyncSession], *, now: datetime
) -> int:
    async with session_factory() as db:
        projects = (await db.execute(select(Project.id, Project.retention_days))).all()

    total = 0
    for project_id, retention_days in projects:
        cutoff = now - timedelta(days=retention_days)
        while True:
            async with session_factory() as db:
                await bypass_rls(db)
                result = await db.execute(
                    _DELETE_BATCH,
                    {"project_id": project_id, "cutoff": cutoff, "batch_size": BATCH_SIZE},
                )
                await db.commit()
            deleted = int(getattr(result, "rowcount", 0))
            total += deleted
            if deleted < BATCH_SIZE:
                break
        async with session_factory() as db:
            await bypass_rls(db)
            params = {"project_id": project_id, "bucket_cutoff": floor_hour(cutoff)}
            await db.execute(_DELETE_SPAN_ROLLUPS, params)
            await db.execute(_DELETE_TRACE_ROLLUPS, params)
            await db.commit()
    return total
