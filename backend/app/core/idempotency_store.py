"""The `idempotency_keys` table: reserving a key, completing it, giving it up.

Each function opens its own short transaction on a session of its own, never the request's. The
request's transaction carries the row-level-security binding (`SET LOCAL`) that its handler
needs, and committing it here would drop that binding. A separate transaction also means the
reservation is committed before the handler runs, which is what lets a concurrent duplicate see
it, and that a handler that rolls back does not take the reservation with it.

Time comes from the database clock throughout, so API replicas with skewed clocks agree on
whether a request is abandoned or a row has expired.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.errors import idempotency_in_progress, idempotency_mismatch
from app.core.observability import IDEMPOTENCY_REQUESTS
from app.db.models import IdempotencyKey

logger = structlog.get_logger(__name__)

SessionFactory = async_sessionmaker[AsyncSession]

IN_FLIGHT_TIMEOUT = timedelta(seconds=60)
"""A request still unanswered after this long is taken to have died, and its key can be reused."""

RETENTION = timedelta(hours=24)
"""How long a key is remembered, counted from when it was reserved."""

_RESERVE_ATTEMPTS = 3


@dataclass(frozen=True)
class Reservation:
    """A key this request owns until it completes or releases it."""

    principal_id: str
    key: str
    token: datetime
    """The row's `created_at`. A request that takes an abandoned row over writes a new one, so a
    request that is slower than the timeout can no longer complete or delete the new owner's row."""


@dataclass(frozen=True)
class StoredResponse:
    """The answer a finished request left behind. `body` is None for an answer with no body."""

    status: int
    body: Any
    content_type: str | None


async def reserve(
    session_factory: SessionFactory, principal_id: str, key: str, request_hash: bytes
) -> Reservation | StoredResponse:
    """Claim `key` for this request, or find out what became of the request that already did.

    Returns a `Reservation` when the caller should run the request: the key was new, had expired,
    or belonged to a request that has been unanswered for over a minute. Returns the
    `StoredResponse` when the same request already finished. Raises `IDEMPOTENCY_MISMATCH` (422)
    when the key was first used for a different request and `IDEMPOTENCY_IN_PROGRESS` (409) when
    the same request is still running.
    """
    for _ in range(_RESERVE_ATTEMPTS):
        async with session_factory() as db:
            outcome = await _try_reserve(db, principal_id, key, request_hash)
        if outcome is not None:
            return outcome
    # The row kept vanishing between the insert that found it and the read that locks it: other
    # requests with this key are failing and releasing it in a loop. Let the client come back.
    IDEMPOTENCY_REQUESTS.labels("in_progress").inc()
    raise idempotency_in_progress()


async def complete(
    session_factory: SessionFactory, reservation: Reservation, response: StoredResponse
) -> bool:
    """Store the answer under the reservation. False when the row is no longer this request's."""
    async with session_factory() as db:
        result = await db.execute(
            update(IdempotencyKey)
            .where(*_owned(reservation))
            .values(status=response.status, body=response.body, content_type=response.content_type)
            .execution_options(synchronize_session=False)
        )
        await db.commit()
    return bool(getattr(result, "rowcount", 0))


async def release(session_factory: SessionFactory, reservation: Reservation) -> bool:
    """Forget the reservation so a retry can run. False when the row is no longer this request's."""
    async with session_factory() as db:
        result = await db.execute(
            delete(IdempotencyKey)
            .where(*_owned(reservation))
            .execution_options(synchronize_session=False)
        )
        await db.commit()
    return bool(getattr(result, "rowcount", 0))


def _owned(reservation: Reservation) -> tuple[Any, ...]:
    """The row, but only while it is still the unanswered one this reservation made."""
    return (
        IdempotencyKey.principal_id == reservation.principal_id,
        IdempotencyKey.key == reservation.key,
        IdempotencyKey.created_at == reservation.token,
        IdempotencyKey.status.is_(None),
    )


async def _try_reserve(
    db: AsyncSession, principal_id: str, key: str, request_hash: bytes
) -> Reservation | StoredResponse | None:
    """One round of `reserve`. None: the row vanished mid-way, so the caller should try again."""
    inserted = await db.execute(
        insert(IdempotencyKey)
        .values(
            principal_id=principal_id,
            key=key,
            request_hash=request_hash,
            expires_at=func.now() + RETENTION,
        )
        .on_conflict_do_nothing()
        .returning(IdempotencyKey.created_at)
    )
    created_at = inserted.scalar_one_or_none()
    if created_at is not None:
        await db.commit()
        IDEMPOTENCY_REQUESTS.labels("reserved").inc()
        return Reservation(principal_id, key, created_at)

    # Someone holds the key. `FOR UPDATE` queues concurrent requests behind each other, so two
    # that find the same abandoned row cannot both take it over.
    row = (
        await db.execute(
            select(
                IdempotencyKey.request_hash,
                IdempotencyKey.status,
                IdempotencyKey.body,
                IdempotencyKey.content_type,
                (IdempotencyKey.expires_at <= func.now()).label("expired"),
                (IdempotencyKey.created_at <= func.now() - IN_FLIGHT_TIMEOUT).label("abandoned"),
            )
            .where(IdempotencyKey.principal_id == principal_id, IdempotencyKey.key == key)
            .with_for_update()
        )
    ).one_or_none()
    if row is None:
        return None

    if row.expired:
        # Past its day but not pruned yet: as good as absent, whatever it held.
        return await _take_over(db, principal_id, key, request_hash, outcome="reserved")
    if bytes(row.request_hash) != request_hash:
        IDEMPOTENCY_REQUESTS.labels("mismatch").inc()
        logger.info("idempotency_mismatch", principal_id=principal_id)
        raise idempotency_mismatch()
    if row.status is not None:
        IDEMPOTENCY_REQUESTS.labels("replayed").inc()
        logger.info("idempotency_replayed", principal_id=principal_id, status=row.status)
        return StoredResponse(row.status, row.body, row.content_type)
    if row.abandoned:
        logger.warning("idempotency_taken_over", principal_id=principal_id)
        return await _take_over(db, principal_id, key, request_hash, outcome="taken_over")
    IDEMPOTENCY_REQUESTS.labels("in_progress").inc()
    logger.info("idempotency_in_progress", principal_id=principal_id)
    raise idempotency_in_progress()


async def _take_over(
    db: AsyncSession, principal_id: str, key: str, request_hash: bytes, *, outcome: str
) -> Reservation:
    """Make the locked row this request's own, in flight and with a full day to live."""
    created_at = (
        await db.execute(
            update(IdempotencyKey)
            .where(IdempotencyKey.principal_id == principal_id, IdempotencyKey.key == key)
            .values(
                request_hash=request_hash,
                status=None,
                body=None,
                content_type=None,
                created_at=func.now(),
                expires_at=func.now() + RETENTION,
            )
            .returning(IdempotencyKey.created_at)
            .execution_options(synchronize_session=False)
        )
    ).scalar_one()
    await db.commit()
    IDEMPOTENCY_REQUESTS.labels(outcome).inc()
    return Reservation(principal_id, key, created_at)
