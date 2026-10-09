"""The ``prune_gateway_cache`` job: free the space of rows the gateway no longer reads.

Two things go, across all projects, so the job sets the RLS bypass flag (it is maintenance code,
the only kind allowed to):

* cache entries past their ``expires_at``. A lookup ignores them already; this only frees space.
* ``gateway_key_minutes`` rows older than two hours. The tokens-per-minute limit reads the
  current minute only, so older rows have no reader.

Deletes run in batches, one transaction each, so no lock is held for long when a lot expired at
once. The lease is extended before every batch, and a run that is cut short simply continues on
the next hourly run.
"""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.rls import bypass_rls
from app.jobs.context import TaskContext

logger = structlog.get_logger(__name__)

Heartbeat = Callable[[], Awaitable[None]]

BATCH_SIZE = 1000  # cache rows hold up to 1 MB each, so a batch is kept modest
MINUTES_RETENTION = timedelta(hours=2)

_DELETE_EXPIRED_ENTRIES = text(
    """
    DELETE FROM gateway_cache
    WHERE ctid IN (
        SELECT ctid FROM gateway_cache WHERE expires_at <= :now LIMIT :batch_size
    )
    """
)
_DELETE_OLD_MINUTES = text(
    """
    DELETE FROM gateway_key_minutes
    WHERE ctid IN (
        SELECT ctid FROM gateway_key_minutes WHERE minute_start < :cutoff LIMIT :batch_size
    )
    """
)


async def run_prune_gateway_cache(context: TaskContext, _: dict[str, Any]) -> None:
    counts = await prune_gateway_cache(
        context.session_factory, now=datetime.now(UTC), heartbeat=context.heartbeat
    )
    logger.info("gateway_cache_pruned", **counts)


async def prune_gateway_cache(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    now: datetime,
    heartbeat: Heartbeat | None = None,
) -> dict[str, int]:
    """Delete expired cache entries and old key minutes. Returns how many of each."""
    return {
        "cache_entries_deleted": await _delete_in_batches(
            session_factory, _DELETE_EXPIRED_ENTRIES, {"now": now}, heartbeat
        ),
        "key_minutes_deleted": await _delete_in_batches(
            session_factory, _DELETE_OLD_MINUTES, {"cutoff": now - MINUTES_RETENTION}, heartbeat
        ),
    }


async def _delete_in_batches(
    session_factory: async_sessionmaker[AsyncSession],
    statement: Any,
    params: dict[str, Any],
    heartbeat: Heartbeat | None,
) -> int:
    total = 0
    while True:
        if heartbeat is not None:
            await heartbeat()
        async with session_factory() as db:
            await bypass_rls(db)
            result = await db.execute(statement, {**params, "batch_size": BATCH_SIZE})
            await db.commit()
        deleted = int(getattr(result, "rowcount", 0))
        total += deleted
        if deleted < BATCH_SIZE:
            return total
