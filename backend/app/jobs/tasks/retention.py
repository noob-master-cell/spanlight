"""Delete traces (and, by cascade, their spans) past each project's retention, with the
project's resolved insights, its old detector runs and its old per-user daily stats."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.sql.elements import TextClause

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


# A resolved insight goes with the traces it cites; a detector run is only worth a week.
_DELETE_RESOLVED_INSIGHTS = text(
    """
    DELETE FROM insights
    WHERE id IN (
        SELECT id
        FROM insights
        WHERE project_id = :project_id AND status = 'resolved' AND resolved_at < :cutoff
        LIMIT :batch_size
    )
    """
)
_DELETE_DETECTOR_RUNS = text(
    """
    DELETE FROM detector_runs
    WHERE id IN (
        SELECT id
        FROM detector_runs
        WHERE project_id = :project_id AND ran_at < :cutoff
        LIMIT :batch_size
    )
    """
)
DETECTOR_RUN_RETENTION = timedelta(days=7)

# The per-user daily stats are derived from the traces, so they go with them: a day goes once it
# ends before the project's cutoff.
_DELETE_USER_STATS = text(
    """
    DELETE FROM user_stats_daily
    WHERE (project_id, day, external_user_id) IN (
        SELECT project_id, day, external_user_id
        FROM user_stats_daily
        WHERE project_id = :project_id
          AND day < (CAST(:cutoff AS timestamptz) AT TIME ZONE 'UTC')::date
        LIMIT :batch_size
    )
    """
)


async def run_retention(context: TaskContext, _: dict[str, Any]) -> None:
    now = datetime.now(UTC)
    deleted = await apply_retention(context.session_factory, now=now)
    insights, runs = await apply_insight_retention(context.session_factory, now=now)
    user_stats = await apply_user_stats_retention(context.session_factory, now=now)
    logger.info(
        "retention_applied",
        traces_deleted=deleted,
        insights_deleted=insights,
        detector_runs_deleted=runs,
        user_stats_deleted=user_stats,
    )


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


async def apply_insight_retention(
    session_factory: async_sessionmaker[AsyncSession], *, now: datetime
) -> tuple[int, int]:
    """Delete resolved insights past each project's retention (by `resolved_at`) and detector
    runs older than `DETECTOR_RUN_RETENTION`. Returns how many of each went."""
    async with session_factory() as db:
        projects = (await db.execute(select(Project.id, Project.retention_days))).all()

    insights = runs = 0
    for project_id, retention_days in projects:
        insights += await _delete_in_batches(
            session_factory,
            _DELETE_RESOLVED_INSIGHTS,
            project_id=project_id,
            cutoff=now - timedelta(days=retention_days),
        )
        runs += await _delete_in_batches(
            session_factory,
            _DELETE_DETECTOR_RUNS,
            project_id=project_id,
            cutoff=now - DETECTOR_RUN_RETENTION,
        )
    return insights, runs


async def apply_user_stats_retention(
    session_factory: async_sessionmaker[AsyncSession], *, now: datetime
) -> int:
    """Delete per-user daily stats of days before each project's retention cutoff (UTC date)."""
    async with session_factory() as db:
        projects = (await db.execute(select(Project.id, Project.retention_days))).all()

    deleted = 0
    for project_id, retention_days in projects:
        deleted += await _delete_in_batches(
            session_factory,
            _DELETE_USER_STATS,
            project_id=project_id,
            cutoff=now - timedelta(days=retention_days),
        )
    return deleted


async def _delete_in_batches(
    session_factory: async_sessionmaker[AsyncSession],
    statement: TextClause,
    *,
    project_id: uuid.UUID,
    cutoff: datetime,
) -> int:
    """Run a batched DELETE until a batch comes back short, one transaction per batch."""
    total = 0
    params = {"project_id": project_id, "cutoff": cutoff, "batch_size": BATCH_SIZE}
    while True:
        async with session_factory() as db:
            await bypass_rls(db)
            result = await db.execute(statement, params)
            await db.commit()
        deleted = int(getattr(result, "rowcount", 0))
        total += deleted
        if deleted < BATCH_SIZE:
            return total
