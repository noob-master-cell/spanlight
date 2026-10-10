"""Claiming and settling outbox rows under a lease guarded by a fencing token.

A send never runs inside a transaction. Instead each step is a short transaction of its own:

1. `claim` picks a due row, increments its `fence` and leases it for `LEASE_DURATION`.
2. `confirm_lease`, just before the send, checks the row still carries that fence and extends
   the lease. If another worker has claimed it since, nothing is sent.
3. `mark_sent` or `mark_failed` settles the row, again only if the fence still matches.

A worker that stalls past its lease can lose the row to another worker. The new claim bumps the
fence, so the stale worker's confirm or mark matches no row and raises `OutboxLeaseLost`
instead of sending or settling a second time. A worker that dies after sending and before
marking leaves its lease to expire, and the row goes out again: delivery is at least once.

Every function here commits the session it is given.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import ColumnElement, case, cast, func, literal, or_, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import NotificationOutbox, NotificationStatus

# Long enough for a confirm, one send (15 s at most) and a mark, with room to spare.
LEASE_DURATION = timedelta(seconds=60)

MAX_ATTEMPTS = 8
BASE_RETRY_DELAY = timedelta(seconds=30)
MAX_RETRY_DELAY = timedelta(hours=1)

# The payload keys a settled row keeps: enough to describe it, never a body or a link.
_KEPT_KEYS = ("subject", "summary")


class OutboxLeaseLost(Exception):  # noqa: N818 - reads as the condition
    """The row no longer carries this worker's fence (or is no longer pending)."""


@dataclass(frozen=True)
class ClaimedRow:
    """A snapshot of a row taken when it was claimed. `fence` is the claim's token."""

    id: uuid.UUID
    fence: int
    kind: str
    target: dict[str, Any]
    payload: dict[str, Any]
    attempts: int
    channel_id: uuid.UUID | None


def retry_delay(attempts: int) -> timedelta:
    """The wait after the `attempts`-th failed attempt: 30 s, 60 s, 120 s, … capped at 1 h."""
    doublings = min(max(attempts - 1, 0), 16)  # the cap keeps the shift small
    return min(BASE_RETRY_DELAY * (1 << doublings), MAX_RETRY_DELAY)


async def claim(db: AsyncSession, now: datetime) -> ClaimedRow | None:
    """Lease the oldest pending row due at `now` that nobody holds, and commit.

    `SKIP LOCKED` lets any number of workers claim at once: a row another transaction is
    claiming is skipped instead of waited for.
    """
    return await _claim(db, now, NotificationOutbox.next_attempt_at <= now)


async def claim_row(db: AsyncSession, row_id: uuid.UUID, now: datetime) -> ClaimedRow | None:
    """Lease one specific row whether or not it is due, and commit.

    None when the row is not pending or a worker holds it, so a row is never sent by two
    processes at once.
    """
    return await _claim(db, now, NotificationOutbox.id == row_id)


async def _claim(
    db: AsyncSession, now: datetime, condition: ColumnElement[bool]
) -> ClaimedRow | None:
    statement = (
        select(NotificationOutbox)
        .where(
            condition,
            NotificationOutbox.status == NotificationStatus.PENDING,
            or_(NotificationOutbox.lease_until.is_(None), NotificationOutbox.lease_until < now),
        )
        .order_by(NotificationOutbox.next_attempt_at, NotificationOutbox.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    row = (await db.execute(statement)).scalar_one_or_none()
    if row is None:
        await db.rollback()
        return None
    row.fence += 1
    row.lease_until = now + LEASE_DURATION
    claimed = ClaimedRow(
        id=row.id,
        fence=row.fence,
        kind=row.kind,
        target=row.target,
        payload=row.payload,
        attempts=row.attempts,
        channel_id=row.channel_id,
    )
    await db.commit()
    return claimed


async def confirm_lease(db: AsyncSession, row_id: uuid.UUID, fence: int, *, now: datetime) -> None:
    """Extend the lease right before the send, and commit. Raises `OutboxLeaseLost`."""
    await _fenced_update(db, row_id, fence, {"lease_until": now + LEASE_DURATION})


async def mark_sent(db: AsyncSession, row_id: uuid.UUID, fence: int, *, now: datetime) -> None:
    """Settle the row as sent, and commit. Raises `OutboxLeaseLost`."""
    values: dict[str, Any] = {
        "status": NotificationStatus.SENT,
        "sent_at": now,
        "attempts": NotificationOutbox.attempts + 1,
        "lease_until": None,
        # A retried delivery kept the error that failed it; a sent row has none.
        "last_error": None,
        "payload": _reduced_payload_sql(),
    }
    await _fenced_update(db, row_id, fence, values)


async def mark_failed(
    db: AsyncSession,
    row_id: uuid.UUID,
    fence: int,
    error: str,
    *,
    permanent: bool,
    now: datetime,
) -> datetime | None:
    """Record a failed attempt, and commit. Raises `OutboxLeaseLost`.

    Returns when the row will be tried again, or None when it has failed for good: the error
    is permanent or this was the last attempt. `error` must already be safe to store.
    """
    attempts = await db.scalar(
        select(NotificationOutbox.attempts).where(*_fenced(row_id, fence)).with_for_update()
    )
    if attempts is None:
        await db.rollback()
        raise OutboxLeaseLost
    attempts += 1
    values: dict[str, Any] = {"attempts": attempts, "last_error": error, "lease_until": None}
    next_attempt_at: datetime | None = None
    if permanent or attempts >= MAX_ATTEMPTS:
        values["status"] = NotificationStatus.FAILED
        values["payload"] = _failed_payload_sql()
    else:
        next_attempt_at = now + retry_delay(attempts)
        values["next_attempt_at"] = next_attempt_at
    await _fenced_update(db, row_id, fence, values)
    return next_attempt_at


def _fenced(row_id: uuid.UUID, fence: int) -> tuple[ColumnElement[bool], ...]:
    return (
        NotificationOutbox.id == row_id,
        NotificationOutbox.fence == fence,
        NotificationOutbox.status == NotificationStatus.PENDING,
    )


async def _fenced_update(
    db: AsyncSession, row_id: uuid.UUID, fence: int, values: dict[str, Any]
) -> None:
    updated = await db.scalar(
        update(NotificationOutbox)
        .where(*_fenced(row_id, fence))
        .values(**values)
        .returning(NotificationOutbox.id)
    )
    if updated is None:
        await db.rollback()
        raise OutboxLeaseLost
    await db.commit()


def _reduced_payload_sql() -> ColumnElement[Any]:
    """What a settled row keeps of its payload, computed by Postgres on the stored value.

    Only `subject` and `summary`, each when present: never a body, and so never a link with a
    token in it. Computed in SQL so the payload never has to round-trip through Python.
    """
    stored = NotificationOutbox.payload
    reduced: ColumnElement[Any] = cast(literal("{}"), JSONB)
    for key in _KEPT_KEYS:
        kept = case(
            (stored.has_key(key), func.jsonb_build_object(key, stored[key])),
            else_=cast(literal("{}"), JSONB),
        )
        reduced = reduced.op("||")(kept)
    return reduced


def _failed_payload_sql() -> ColumnElement[Any]:
    """The payload of a row that failed for good.

    Transactional mail (no `channel_id`: verification, reset, invite, digest) is reduced like a
    sent row, so a reset link does not outlive its mail. An alert delivery (`channel_id` set)
    keeps its payload so it can be retried by hand; alert payloads carry no secrets.
    """
    return case(
        (NotificationOutbox.channel_id.is_(None), _reduced_payload_sql()),
        else_=NotificationOutbox.payload,
    )
