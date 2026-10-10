"""Deliver one claimed outbox row: confirm the lease, send, settle.

`deliver_one` is shared by the `deliver_notifications` job (see `jobs.py`), which claims due
rows in a loop, and by `deliver_now`, which claims and sends one specific row in-process (a
channel's test-send uses it, so the result comes back in the same request).

The send runs with no transaction open, under `SEND_TIMEOUT`. Deliverers receive the row's
target with `delivery_id` (the row's id) added, so a receiver can drop a repeat.
"""

import asyncio
import enum
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.observability import NOTIFICATIONS_DELIVERED
from app.db.models import AlertChannel
from app.notifications.lease import (
    ClaimedRow,
    OutboxLeaseLost,
    claim_row,
    confirm_lease,
    mark_failed,
    mark_sent,
)
from app.notifications.outbox import NotificationKind
from app.notifications.registry import (
    DELIVERERS,
    Deliverer,
    DelivererRegistry,
    DeliveryError,
    PermanentDeliveryError,
)

logger = structlog.get_logger(__name__)

# A send that takes longer than this counts as a failed attempt.
SEND_TIMEOUT = timedelta(seconds=15)
MAX_ERROR_LENGTH = 500
# The `last_error` of an alert email whose channel was deleted before it went out: no retry can
# bring the channel back, so the row fails at once.
CHANNEL_DELETED = "Channel deleted"

SessionFactory = async_sessionmaker[AsyncSession]
Clock = Callable[[], datetime]


class DeliveryOutcome(enum.StrEnum):
    """The values of the `outcome` label on `spanlight_notifications_delivered_total`."""

    SENT = "sent"
    RETRY = "retry"
    FAILED = "failed"
    # Another worker claimed the row before this one could confirm or settle it.
    LOST = "lost"


@dataclass(frozen=True)
class DeliveryResult:
    status: DeliveryOutcome
    # What `last_error` now says, for `retry` and `failed`; None otherwise.
    error: str | None = None


def _utcnow() -> datetime:
    return datetime.now(UTC)


async def deliver_now(
    db_factory: SessionFactory,
    row_id: uuid.UUID,
    *,
    registry: DelivererRegistry = DELIVERERS,
    now: Clock = _utcnow,
    send_timeout: timedelta = SEND_TIMEOUT,
) -> DeliveryResult | None:
    """Claim the row `row_id` and deliver it in this process.

    None, with the row untouched, when it is not pending or a worker holds its lease.
    """
    async with db_factory() as db:
        row = await claim_row(db, row_id, now())
    if row is None:
        return None
    return await deliver_one(
        db_factory, row, registry.get(row.kind), now=now, send_timeout=send_timeout
    )


async def deliver_one(
    db_factory: SessionFactory,
    row: ClaimedRow,
    deliverer: Deliverer | None,
    *,
    now: Clock = _utcnow,
    send_timeout: timedelta = SEND_TIMEOUT,
) -> DeliveryResult:
    """Confirm the lease, send and settle one claimed row. Never raises a deliverer's error.

    A lost lease is logged and counted, and returned as `lost`; nothing is sent after it.
    """
    try:
        if deliverer is None:
            # Retrying cannot help: nothing will register a deliverer while the row waits.
            error = f"no deliverer registered for kind {row.kind!r}"[:MAX_ERROR_LENGTH]
            return await _settle_failure(db_factory, row, error, permanent=True, now=now)
        async with db_factory() as db:
            await confirm_lease(db, row.id, row.fence, now=now())
            gone = await _email_channel_gone(db, row)
        if gone:
            return await _settle_failure(db_factory, row, CHANNEL_DELETED, permanent=True, now=now)
        failure = await _send(row, deliverer, send_timeout)
        if failure is not None:
            error, permanent = failure
            return await _settle_failure(db_factory, row, error, permanent=permanent, now=now)
        async with db_factory() as db:
            await mark_sent(db, row.id, row.fence, now=now())
    except OutboxLeaseLost:
        NOTIFICATIONS_DELIVERED.labels(row.kind, DeliveryOutcome.LOST.value).inc()
        logger.warning("outbox_lease_lost", notification_id=str(row.id), kind=row.kind)
        return DeliveryResult(DeliveryOutcome.LOST)
    _report(row, DeliveryOutcome.SENT)
    return DeliveryResult(DeliveryOutcome.SENT)


async def _email_channel_gone(db: AsyncSession, row: ClaimedRow) -> bool:
    """Whether the alert channel of an email row was deleted (with its organization or alone)
    after the row was queued. An alert email carries its address in the target, so its deliverer
    never looks at the channel; Slack, webhook and PagerDuty deliverers check theirs themselves.
    """
    if row.kind != NotificationKind.EMAIL or row.channel_id is None:
        return False
    found = await db.scalar(select(AlertChannel.id).where(AlertChannel.id == row.channel_id))
    return found is None


async def _send(
    row: ClaimedRow, deliverer: Deliverer, send_timeout: timedelta
) -> tuple[str, bool] | None:
    """Send the row. None on success, else the storable error and whether it is permanent."""
    target = row.target | {"delivery_id": str(row.id)}
    try:
        async with asyncio.timeout(send_timeout.total_seconds()):
            await deliverer.deliver(target, row.payload)
    except Exception as exc:  # noqa: BLE001 - any deliverer failure is recorded on its row
        # One failing send must never stop the rows behind it, so nothing escapes this block.
        return _describe(exc), isinstance(exc, PermanentDeliveryError)
    return None


async def _settle_failure(
    db_factory: SessionFactory, row: ClaimedRow, error: str, *, permanent: bool, now: Clock
) -> DeliveryResult:
    async with db_factory() as db:
        next_attempt_at = await mark_failed(
            db, row.id, row.fence, error, permanent=permanent, now=now()
        )
    outcome = DeliveryOutcome.FAILED if next_attempt_at is None else DeliveryOutcome.RETRY
    _report(row, outcome, error, next_attempt_at)
    return DeliveryResult(outcome, error)


def _describe(exc: Exception) -> str:
    """The `last_error` (and logged error) for a failed send.

    A `DeliveryError`'s message was composed by the deliverer to be stored, so it is kept. Any
    other exception is reduced to its class name: its text can quote the request URL (httpx
    errors do), and a Slack webhook URL is the secret itself.
    """
    text = str(exc) if isinstance(exc, DeliveryError) else ""
    if text:
        return _storable(text)
    return _storable(type(exc).__name__)


def _storable(message: str) -> str:
    """`message` as something Postgres will accept, cut to the `last_error` cap.

    Error text can come from outside (a provider echoing a reply), so it may hold a NUL byte,
    which a Postgres `text` column rejects, or a lone surrogate, which is not valid UTF-8.
    Either would make the mark fail, so both are written out as escape sequences instead.
    """
    safe = message.replace("\x00", "\\x00").encode("utf-8", "backslashreplace").decode("utf-8")
    return safe[:MAX_ERROR_LENGTH]


def _report(
    row: ClaimedRow,
    outcome: DeliveryOutcome,
    error: str | None = None,
    next_attempt_at: datetime | None = None,
) -> None:
    """Count and log a settled attempt. Never logs the row's target or payload."""
    NOTIFICATIONS_DELIVERED.labels(row.kind, outcome.value).inc()
    log = logger.bind(notification_id=str(row.id), kind=row.kind, attempts=row.attempts + 1)
    match outcome:
        case DeliveryOutcome.SENT:
            log.info("notification_sent")
        case DeliveryOutcome.RETRY if next_attempt_at is not None:
            log.warning(
                "notification_retry", error=error, next_attempt_at=next_attempt_at.isoformat()
            )
        case _:
            log.error("notification_failed", error=error)
