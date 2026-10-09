"""Housekeeping for exports: expire finished ones, and reap the ones that never finished.

All of it spans projects, so it runs with the row-level-security bypass flag, like the other
cross-project maintenance. Every export is handled in a transaction of its own: deleting an
object is a network call, and a slow or failing store must neither hold row locks for the whole
run nor undo the exports already handled. The work is cut off at a time budget so a run ends
inside the cleanup task's timeout; what is left is taken by the next run.
"""

import time
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import Text, cast, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import QueryableAttribute
from sqlalchemy.sql.elements import ColumnElement

from app.db.models import Export, ExportStatus, Job, JobStatus
from app.db.rls import bypass_rls
from app.exports.jobs import ERROR_FAILED
from app.exports.service import CREATE_EXPORT_JOB, export_prefix
from app.storage.object_store import ObjectStore

logger = structlog.get_logger(__name__)

# One run handles at most this many exports per step; the next hourly run takes the rest.
BATCH = 500
# The cleanup task is cut off after 50 s, so each step stops starting new exports after this.
STEP_BUDGET_SECONDS = 15.0
# Backstop for an export whose job row cannot be found or is still reported live after this long.
STUCK_AFTER = timedelta(hours=24)


async def expire_exports(
    session_factory: async_sessionmaker[AsyncSession],
    store: ObjectStore | None,
    *,
    now: datetime,
    budget_seconds: float = STEP_BUDGET_SECONDS,
) -> int:
    """Delete the file of every `done` export past its `expires_at` and mark it `expired`.

    A row is marked `expired` only after its object is gone (deleting an object that does not
    exist counts as gone), so a storage failure leaves the row `done` and the next run tries
    again. Without object storage nothing can be deleted: exports are left as they are rather
    than marked expired while their files remain.

    Returns the number of exports expired.
    """
    if store is None:
        logger.warning("exports_expiry_skipped", reason="object storage is not configured")
        return 0
    due = (Export.status == ExportStatus.DONE, Export.expires_at <= now)
    expired = 0
    deadline = time.monotonic() + budget_seconds
    for export_id in await _ids(session_factory, due, order=Export.expires_at):
        if time.monotonic() > deadline:
            logger.info("exports_expiry_cut_off", expired=expired)
            break
        async with session_factory() as db:
            await bypass_rls(db)
            export = await _lock(db, export_id, due)
            if export is None:
                continue
            if not await _delete(store, export):
                continue
            export.status = ExportStatus.EXPIRED
            export.storage_key = None
            await db.commit()
            expired += 1
    return expired


async def reap_exports(
    session_factory: async_sessionmaker[AsyncSession],
    store: ObjectStore | None,
    *,
    now: datetime,
    budget_seconds: float = STEP_BUDGET_SECONDS,
) -> int:
    """Fail the exports that were abandoned, and delete the files of failed ones.

    A job that dies on its last attempt (the worker is killed, the lease runs out) never gets to
    record the failure, so its export would stay `queued` or `running` for ever. Such an export
    is one with no queued or running job (the job failed, was pruned or ended without finishing it),
    or which is older than `STUCK_AFTER`. It becomes `failed` with
    `EXPORT_FAILED`, and any file it may have left is deleted. A failed export
    that still has a `storage_key` is one whose file could not be deleted at the time; the key
    is the marker for deleting it now.

    Returns the number of exports failed.
    """
    deadline = time.monotonic() + budget_seconds
    failed = 0
    # The export and its job are linked by the job's dedupe key, set in the transaction that
    # inserts the export. No queued or running job means the work is gone: the job failed, was
    # pruned, or ended without finishing the export.
    live_job = exists().where(
        Job.dedupe_key == func.concat(f"{CREATE_EXPORT_JOB}:", cast(Export.id, Text)),
        Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
    )
    stuck = (
        Export.status.in_([ExportStatus.QUEUED, ExportStatus.RUNNING]),
        or_(Export.created_at < now - STUCK_AFTER, ~live_job),
    )
    for export_id in await _ids(session_factory, stuck, order=Export.created_at):
        if time.monotonic() > deadline:
            logger.info("exports_reap_cut_off", failed=failed)
            break
        async with session_factory() as db:
            await bypass_rls(db)
            export = await _lock(db, export_id, stuck)
            if export is None:
                continue
            export.status = ExportStatus.FAILED
            export.error_code = ERROR_FAILED
            export.completed_at = now
            # The job may have written objects before it died, under keys the row never learned.
            # Mark the export's prefix, so that the step below deletes them if the delete here
            # fails or there is no store to ask.
            export.storage_key = export_prefix(export.project_id, export.id)
            if store is not None and await _delete(store, export):
                export.storage_key = None
            await db.commit()
            failed += 1
            logger.warning("export_reaped", export_id=str(export_id))

    if store is not None:
        await _delete_failed_files(session_factory, store, deadline)
    return failed


async def _delete_failed_files(
    session_factory: async_sessionmaker[AsyncSession], store: ObjectStore, deadline: float
) -> None:
    leftover = (Export.status == ExportStatus.FAILED, Export.storage_key.is_not(None))
    for export_id in await _ids(session_factory, leftover, order=Export.created_at):
        if time.monotonic() > deadline:
            return
        async with session_factory() as db:
            await bypass_rls(db)
            export = await _lock(db, export_id, leftover)
            if export is None or not await _delete(store, export):
                continue
            export.storage_key = None
            await db.commit()


async def _ids(
    session_factory: async_sessionmaker[AsyncSession],
    conditions: Sequence[ColumnElement[bool]],
    *,
    order: QueryableAttribute[Any],
) -> list[uuid.UUID]:
    async with session_factory() as db:
        await bypass_rls(db)
        return list(
            (
                await db.scalars(select(Export.id).where(*conditions).order_by(order).limit(BATCH))
            ).all()
        )


async def _lock(
    db: AsyncSession, export_id: uuid.UUID, conditions: Sequence[ColumnElement[bool]]
) -> Export | None:
    """The export if it still matches `conditions` and no other worker has it locked."""
    return await db.scalar(
        select(Export).where(Export.id == export_id, *conditions).with_for_update(skip_locked=True)
    )


async def _delete(store: ObjectStore, export: Export) -> bool:
    """Delete every object of the export: the one the row names and anything under its prefix.

    Each attempt of the job writes its own key, so an attempt that died or lost its lease can
    have left an object the row never learned of. A failure is logged and reported, so the row is
    kept and the next run tries again.
    """
    try:
        keys = {
            stored.key for stored in await store.list(export_prefix(export.project_id, export.id))
        }
        if export.storage_key is not None:
            keys.add(export.storage_key)
        for key in keys:
            await store.delete(key)
    except Exception:
        logger.error("export_delete_failed", export_id=str(export.id), exc_info=True)
        return False
    return True
