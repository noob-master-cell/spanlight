"""The `deliver_notifications` job: send every due outbox row, one at a time.

Each row gets its own short transaction: claim it with `FOR UPDATE SKIP LOCKED`, send, record
the outcome, commit. A lock is therefore never held across more than one send, and many
workers can run this concurrently without sharing a row.

Delivery is at-least-once. If the process dies between a successful send and the commit, the
row is still pending and goes out again. Deliverers must tolerate that.
"""

import asyncio
import enum
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import ColumnElement, case, cast, func, literal, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.observability import NOTIFICATIONS_DELIVERED, OUTBOX_PENDING
from app.db.models import NotificationOutbox, NotificationStatus
from app.jobs.context import TaskContext
from app.notifications.outbox import claim_next_due, count_pending
from app.notifications.registry import DELIVERERS, DelivererRegistry

logger = structlog.get_logger(__name__)

# A send that takes longer than this counts as a failed attempt.
SEND_TIMEOUT = timedelta(seconds=15)
# No new row is started after this long. The last row can begin just inside the budget and
# then take a full SEND_TIMEOUT, and the sum must stay below the worker's 50 s task timeout:
# a task cancelled mid-send would repeat that send.
RUN_BUDGET = timedelta(seconds=30)

MAX_ATTEMPTS = 8
BASE_RETRY_DELAY = timedelta(seconds=30)
MAX_RETRY_DELAY = timedelta(hours=1)
MAX_ERROR_LENGTH = 500

Clock = Callable[[], datetime]


class DeliveryOutcome(enum.StrEnum):
    """The values of the `outcome` label on `spanlight_notifications_delivered_total`."""

    SENT = "sent"
    RETRY = "retry"
    FAILED = "failed"


@dataclass
class DeliveryRun:
    sent: int = 0
    retried: int = 0
    failed: int = 0

    @property
    def attempted(self) -> int:
        return self.sent + self.retried + self.failed

    def record(self, outcome: DeliveryOutcome) -> None:
        match outcome:
            case DeliveryOutcome.SENT:
                self.sent += 1
            case DeliveryOutcome.RETRY:
                self.retried += 1
            case DeliveryOutcome.FAILED:
                self.failed += 1


def _utcnow() -> datetime:
    return datetime.now(UTC)


def retry_delay(attempts: int) -> timedelta:
    """The wait after the `attempts`-th failed attempt: 30 s, 60 s, 120 s, … capped at 1 h."""
    doublings = min(max(attempts - 1, 0), 16)  # the cap keeps the shift small
    return min(BASE_RETRY_DELAY * (1 << doublings), MAX_RETRY_DELAY)


def reduced_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """What is kept of a payload once its row is settled: the subject, never the body or links.

    A row is settled when it is sent or failed for good. A row that will be tried again keeps
    its payload, because the next attempt needs it.
    """
    return {"subject": payload["subject"]} if "subject" in payload else {}


def _reduced_payload_sql() -> ColumnElement[Any]:
    """`reduced_payload` for an UPDATE, evaluated by Postgres on the stored payload.

    Used where the payload cannot be trusted to round-trip through Python.
    """
    stored = NotificationOutbox.payload
    return case(
        (stored.has_key("subject"), func.jsonb_build_object("subject", stored["subject"])),
        else_=cast(literal("{}"), JSONB),
    )


def _describe(exc: Exception) -> str:
    """The text stored in `last_error`: always something Postgres will accept.

    Error text can come from outside (a provider echoing a reply), so it may hold a NUL byte,
    which a Postgres `text` column rejects, or a lone surrogate, which is not valid UTF-8.
    Either would make the commit fail and leave the row at the head of the queue, so both are
    written out as escape sequences instead.
    """
    try:
        text = str(exc)
    except Exception:  # noqa: BLE001 - an exception that cannot describe itself still has a name
        text = "<message unavailable>"
    message = f"{type(exc).__name__}: {text}" if text else type(exc).__name__
    safe = message.replace("\x00", "\\x00").encode("utf-8", "backslashreplace").decode("utf-8")
    return safe[:MAX_ERROR_LENGTH]


async def deliver_due(
    session_factory: async_sessionmaker[AsyncSession],
    registry: DelivererRegistry,
    *,
    now: Clock = _utcnow,
    budget: timedelta = RUN_BUDGET,
    send_timeout: timedelta = SEND_TIMEOUT,
) -> DeliveryRun:
    """Deliver due rows until none is left or the time budget is spent."""
    run = DeliveryRun()
    started = time.monotonic()
    while time.monotonic() - started < budget.total_seconds():
        outcome = await _deliver_next(session_factory, registry, now, send_timeout)
        if outcome is None:
            break
        run.record(outcome)

    async with session_factory() as db:
        OUTBOX_PENDING.set(await count_pending(db))
    return run


async def _deliver_next(
    session_factory: async_sessionmaker[AsyncSession],
    registry: DelivererRegistry,
    now: Clock,
    send_timeout: timedelta,
) -> DeliveryOutcome | None:
    """Claim, send and settle one row in its own transaction. None when nothing is due."""
    async with session_factory() as db:
        row = await claim_next_due(db, now())
        if row is None:
            return None
        # Read now: a rollback expires the row, and an async session cannot reload it later.
        row_id, kind, attempts_before = row.id, row.kind, row.attempts
        outcome = await _attempt(row, registry, now, send_timeout)
        commit_error = await _try_commit(db)
        if commit_error is None:
            _report(outcome, row_id, kind, row.attempts, row.last_error, row.next_attempt_at)
            return outcome

    return await _record_unstorable_outcome(
        session_factory, row_id, kind, attempts_before, now, commit_error
    )


async def _try_commit(db: AsyncSession) -> Exception | None:
    """Commit, or roll back and return what went wrong."""
    try:
        await db.commit()
    except Exception as exc:  # noqa: BLE001 - the caller records the failure; see its docstring
        await db.rollback()
        return exc
    return None


async def _record_unstorable_outcome(
    session_factory: async_sessionmaker[AsyncSession],
    row_id: uuid.UUID,
    kind: str,
    attempts_before: int,
    now: Clock,
    cause: Exception,
) -> DeliveryOutcome:
    """Count the attempt in a fresh transaction after its outcome could not be saved.

    Whatever made the commit fail (a value Postgres rejects, a constraint, a deliverer that
    left something unserializable in the payload), the row is unchanged and still the oldest
    due one, so every later run would hit it first and nothing behind it would ever be sent.
    This records only values this module builds itself, which always fit: one more attempt,
    a generic error that names the exception class and nothing else, and a later retry time
    (or `failed` once attempts are used up, which also reduces the payload, in SQL because the
    stored value is the one thing not to read back into Python). If the send had succeeded,
    the row goes out again, which at-least-once delivery already allows.

    The update is conditional on the attempts it read, so a row another worker has settled
    in the meantime is left alone. If even this write fails, the database is the problem and
    the error propagates.
    """
    attempts = attempts_before + 1
    error = f"outcome could not be recorded ({type(cause).__name__})"
    values: dict[str, Any] = {"attempts": attempts, "last_error": error}
    if attempts >= MAX_ATTEMPTS:
        outcome = DeliveryOutcome.FAILED
        next_attempt_at = now()
        values["status"] = NotificationStatus.FAILED
        values["payload"] = _reduced_payload_sql()
    else:
        outcome = DeliveryOutcome.RETRY
        next_attempt_at = now() + retry_delay(attempts)
        values["next_attempt_at"] = next_attempt_at
    async with session_factory() as db:
        await db.execute(
            update(NotificationOutbox)
            .where(
                NotificationOutbox.id == row_id,
                NotificationOutbox.status == NotificationStatus.PENDING,
                NotificationOutbox.attempts == attempts_before,
            )
            .values(**values)
        )
        await db.commit()
    logger.error("notification_outcome_not_recorded", notification_id=str(row_id), cause=error)
    _report(outcome, row_id, kind, attempts, error, next_attempt_at)
    return outcome


def _report(
    outcome: DeliveryOutcome,
    row_id: uuid.UUID,
    kind: str,
    attempts: int,
    error: str | None,
    next_attempt_at: datetime,
) -> None:
    """Count and log a settled attempt. Never logs the row's target or payload."""
    NOTIFICATIONS_DELIVERED.labels(kind, outcome.value).inc()
    log = logger.bind(notification_id=str(row_id), kind=kind, attempts=attempts)
    match outcome:
        case DeliveryOutcome.SENT:
            log.info("notification_sent")
        case DeliveryOutcome.RETRY:
            log.warning(
                "notification_retry", error=error, next_attempt_at=next_attempt_at.isoformat()
            )
        case DeliveryOutcome.FAILED:
            log.error("notification_failed", error=error)


async def _attempt(
    row: NotificationOutbox, registry: DelivererRegistry, now: Clock, send_timeout: timedelta
) -> DeliveryOutcome:
    """Send `row` and record the result on it. The caller commits."""
    row.attempts += 1
    deliverer = registry.get(row.kind)
    if deliverer is None:
        # Retrying cannot help: nothing will register a deliverer while the row waits.
        row.status = NotificationStatus.FAILED
        row.last_error = f"no deliverer registered for kind {row.kind!r}"[:MAX_ERROR_LENGTH]
        row.payload = reduced_payload(row.payload)
        return DeliveryOutcome.FAILED

    try:
        async with asyncio.timeout(send_timeout.total_seconds()):
            await deliverer.deliver(row.target, row.payload)
    except Exception as exc:  # noqa: BLE001 - any deliverer failure is recorded on its row
        # One failing send must never stop the rows behind it, so nothing escapes this block.
        row.last_error = _describe(exc)
        if row.attempts >= MAX_ATTEMPTS:
            row.status = NotificationStatus.FAILED
            row.payload = reduced_payload(row.payload)
            return DeliveryOutcome.FAILED
        row.next_attempt_at = now() + retry_delay(row.attempts)
        return DeliveryOutcome.RETRY

    row.status = NotificationStatus.SENT
    row.sent_at = now()
    row.payload = reduced_payload(row.payload)
    return DeliveryOutcome.SENT


async def run_deliver_notifications(context: TaskContext, _: dict[str, Any]) -> None:
    run = await deliver_due(context.session_factory, DELIVERERS)
    if run.attempted:
        logger.info(
            "notifications_delivered", sent=run.sent, retried=run.retried, failed=run.failed
        )
