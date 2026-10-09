"""The notification outbox: written in the producer's transaction, delivered one row at a time."""

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from prometheus_client import REGISTRY
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.db.models import JobStatus, NotificationOutbox, NotificationStatus
from app.jobs import queue
from app.jobs.tasks import TASKS
from app.jobs.tasks.cleanup import cleanup
from app.jobs.worker import TASK_TIMEOUT_SECONDS, Worker
from app.notifications import NotificationKind, enqueue
from app.notifications.jobs import (
    MAX_ATTEMPTS,
    RUN_BUDGET,
    SEND_TIMEOUT,
    DeliveryOutcome,
    _record_unstorable_outcome,
    deliver_due,
    retry_delay,
    run_deliver_notifications,
)
from app.notifications.outbox import claim_next_due
from app.notifications.registry import DelivererRegistry

SessionFactory = async_sessionmaker[AsyncSession]

T0 = datetime(2026, 10, 8, 12, 0, tzinfo=UTC)
FAR_FUTURE = datetime(2100, 1, 1, tzinfo=UTC)


class Clock:
    """A settable clock, passed to the unit under test in place of `datetime.now`."""

    def __init__(self, start: datetime) -> None:
        self.current = start

    def __call__(self) -> datetime:
        return self.current

    def advance(self, delta: timedelta) -> None:
        self.current += delta


class RecordingDeliverer:
    """A real `Deliverer` that records what it was asked to send and can be told to fail."""

    def __init__(
        self,
        *,
        error: Exception | None = None,
        only_for_subject: str | None = None,
        delay: float = 0,
    ) -> None:
        self.calls: list[tuple[dict[str, Any], dict[str, Any]]] = []
        self._error = error
        self._only_for_subject = only_for_subject
        self._delay = delay

    async def deliver(self, target: dict[str, Any], payload: dict[str, Any]) -> None:
        self.calls.append((target, payload))
        if self._delay:
            await asyncio.sleep(self._delay)
        if self._error is not None and self._only_for_subject in (None, payload.get("subject")):
            raise self._error

    @property
    def subjects(self) -> list[str]:
        return [payload["subject"] for _, payload in self.calls]


def _registry(deliverer: RecordingDeliverer) -> DelivererRegistry:
    registry = DelivererRegistry()
    registry.register(NotificationKind.EMAIL, deliverer)
    return registry


async def _insert(
    session_factory: SessionFactory,
    *,
    due: datetime = T0,
    kind: str = "email",
    subject: str | None = "Welcome",
    **columns: Any,
) -> uuid.UUID:
    """Insert a row directly, so a test controls every column the unit under test reads."""
    payload = {"body": "Open https://app.example.com/reset?token=abc"}
    if subject is not None:
        payload["subject"] = subject
    row = NotificationOutbox(
        kind=kind,
        target={"to": "ada@example.com"},
        payload=payload,
        next_attempt_at=due,
        **columns,
    )
    async with session_factory() as db:
        db.add(row)
        await db.commit()
    return row.id


async def _row(session_factory: SessionFactory, row_id: uuid.UUID) -> NotificationOutbox:
    async with session_factory() as db:
        row = await db.get(NotificationOutbox, row_id)
        assert row is not None
        return row


def _sample(name: str, **labels: str) -> float:
    return REGISTRY.get_sample_value(name, labels) or 0.0


async def test_enqueue_then_claim_returns_row(session_factory: SessionFactory) -> None:
    async with session_factory() as db:
        row_id = await enqueue(
            db,
            NotificationKind.EMAIL,
            target={"to": "ada@example.com"},
            payload={"subject": "Welcome", "body": "Hello Ada"},
        )
        await db.commit()

    async with session_factory() as db:
        claimed = await claim_next_due(db, FAR_FUTURE)

    assert claimed is not None and claimed.id == row_id
    assert claimed.kind == "email"
    assert claimed.channel_id is None
    assert claimed.target == {"to": "ada@example.com"}
    assert claimed.payload == {"subject": "Welcome", "body": "Hello Ada"}
    assert claimed.status is NotificationStatus.PENDING
    assert claimed.attempts == 0
    assert claimed.sent_at is None and claimed.last_error is None


async def test_enqueue_stores_the_channel_id(session_factory: SessionFactory) -> None:
    channel_id = uuid.uuid4()
    async with session_factory() as db:
        row_id = await enqueue(
            db, NotificationKind.EMAIL, target={}, payload={}, channel_id=channel_id
        )
        await db.commit()
    assert (await _row(session_factory, row_id)).channel_id == channel_id


async def test_enqueue_belongs_to_the_callers_transaction(session_factory: SessionFactory) -> None:
    """The decision and its delivery request commit or roll back together."""
    async with session_factory() as db:
        await enqueue(db, NotificationKind.EMAIL, target={}, payload={"subject": "Lost"})
        await db.rollback()

    async with session_factory() as db:
        assert await claim_next_due(db, FAR_FUTURE) is None


async def test_enqueue_fails_at_the_call_site_when_the_payload_cannot_be_stored(
    session_factory: SessionFactory,
) -> None:
    """A bad payload must surface where the producer can handle it, not at its later commit."""
    async with session_factory() as db:
        with pytest.raises(TypeError, match="not JSON serializable"):
            await enqueue(db, NotificationKind.EMAIL, target={}, payload={"cc": {"ada", "bob"}})


async def test_claim_ignores_rows_that_are_not_due_or_not_pending(
    session_factory: SessionFactory,
) -> None:
    await _insert(session_factory, due=T0 + timedelta(minutes=5))
    await _insert(session_factory, status=NotificationStatus.FAILED)
    await _insert(session_factory, status=NotificationStatus.SENT, sent_at=T0)

    async with session_factory() as db:
        assert await claim_next_due(db, T0) is None


def test_retry_delay_doubles_from_30_seconds_and_is_capped_at_one_hour() -> None:
    delays = [retry_delay(attempts).total_seconds() for attempts in range(1, 9)]
    assert delays == [30, 60, 120, 240, 480, 960, 1920, 3600]
    assert retry_delay(500) == timedelta(hours=1)  # no overflow for a runaway counter


async def test_failed_delivery_backs_off(session_factory: SessionFactory) -> None:
    # Written out, not computed with `retry_delay`, so the test cannot agree with a wrong schedule.
    delays = [30, 60, 120, 240, 480, 960, 1920]
    clock = Clock(T0)
    deliverer = RecordingDeliverer(error=RuntimeError("smtp down"))
    row_id = await _insert(session_factory, due=T0)

    for attempt, seconds in enumerate(delays, start=1):
        delay = timedelta(seconds=seconds)
        run = await deliver_due(session_factory, _registry(deliverer), now=clock)
        assert (run.sent, run.retried, run.failed) == (0, 1, 0)

        row = await _row(session_factory, row_id)
        assert (row.attempts, row.status) == (attempt, NotificationStatus.PENDING)
        assert row.next_attempt_at == clock.current + delay
        assert row.last_error == "RuntimeError: smtp down"
        assert row.payload["body"].startswith("Open ")  # still needed for the next attempt

        # Not due one second early, due exactly when the delay has passed.
        clock.advance(delay - timedelta(seconds=1))
        assert (await deliver_due(session_factory, _registry(deliverer), now=clock)).attempted == 0
        clock.advance(timedelta(seconds=1))

    last = await deliver_due(session_factory, _registry(deliverer), now=clock)
    assert (last.sent, last.retried, last.failed) == (0, 0, 1)
    row = await _row(session_factory, row_id)
    assert (row.attempts, row.status) == (8, NotificationStatus.FAILED)
    assert row.sent_at is None

    clock.advance(timedelta(days=30))
    assert (await deliver_due(session_factory, _registry(deliverer), now=clock)).attempted == 0
    assert len(deliverer.calls) == 8


async def test_a_retry_that_succeeds_is_sent_and_keeps_the_last_error(
    session_factory: SessionFactory,
) -> None:
    row_id = await _insert(session_factory, subject="Welcome")
    clock = Clock(T0)
    await deliver_due(
        session_factory, _registry(RecordingDeliverer(error=ConnectionError("reset"))), now=clock
    )
    clock.advance(timedelta(seconds=30))

    run = await deliver_due(session_factory, _registry(RecordingDeliverer()), now=clock)

    row = await _row(session_factory, row_id)
    assert run.sent == 1
    assert (row.status, row.attempts, row.sent_at) == (NotificationStatus.SENT, 2, clock.current)
    assert row.last_error == "ConnectionError: reset"  # history for whoever investigates


async def test_error_text_is_the_class_name_and_message_truncated_to_500_characters(
    session_factory: SessionFactory,
) -> None:
    row_id = await _insert(session_factory)
    deliverer = RecordingDeliverer(error=ValueError("x" * 2000))

    await deliver_due(session_factory, _registry(deliverer), now=Clock(T0))

    error = (await _row(session_factory, row_id)).last_error
    assert error is not None and len(error) == 500
    assert error.startswith("ValueError: xxx")


async def test_a_slow_deliverer_times_out_and_is_retried(session_factory: SessionFactory) -> None:
    row_id = await _insert(session_factory)
    deliverer = RecordingDeliverer(delay=5)

    run = await deliver_due(
        session_factory,
        _registry(deliverer),
        now=Clock(T0),
        send_timeout=timedelta(milliseconds=50),
    )

    row = await _row(session_factory, row_id)
    assert run.retried == 1
    assert (row.status, row.attempts) == (NotificationStatus.PENDING, 1)
    assert row.last_error is not None and row.last_error.startswith("TimeoutError")


async def test_one_failing_row_does_not_stop_the_rest_of_the_batch(
    session_factory: SessionFactory,
) -> None:
    ids = {
        subject: await _insert(session_factory, subject=subject, due=T0 + timedelta(seconds=n))
        for n, subject in enumerate(["first", "boom", "third"])
    }
    deliverer = RecordingDeliverer(error=RuntimeError("rejected"), only_for_subject="boom")

    run = await deliver_due(
        session_factory, _registry(deliverer), now=Clock(T0 + timedelta(minutes=1))
    )

    assert (run.sent, run.retried, run.failed) == (2, 1, 0)
    assert deliverer.subjects == ["first", "boom", "third"]  # oldest due first
    statuses = {s: (await _row(session_factory, i)).status for s, i in ids.items()}
    assert statuses == {
        "first": NotificationStatus.SENT,
        "boom": NotificationStatus.PENDING,
        "third": NotificationStatus.SENT,
    }


@pytest.mark.parametrize(
    ("message", "stored"),
    [
        ("a\x00b", "RuntimeError: a\\x00b"),
        ("a\udc80b", "RuntimeError: a\\udc80b"),
    ],
    ids=["nul-byte", "lone-surrogate"],
)
async def test_error_text_postgres_cannot_store_is_escaped_and_the_next_row_still_sends(
    session_factory: SessionFactory, message: str, stored: str
) -> None:
    """A deliverer that echoes bad text (a provider's reply) must not wedge the outbox."""
    poison = await _insert(session_factory, subject="poison", due=T0)
    innocent = await _insert(session_factory, subject="innocent", due=T0 + timedelta(seconds=1))
    deliverer = RecordingDeliverer(error=RuntimeError(message), only_for_subject="poison")

    run = await deliver_due(
        session_factory, _registry(deliverer), now=Clock(T0 + timedelta(minutes=1))
    )

    assert (run.sent, run.retried, run.failed) == (1, 1, 0)
    assert deliverer.subjects == ["poison", "innocent"]  # the poison row is not sent twice
    row = await _row(session_factory, poison)
    assert (row.attempts, row.status) == (1, NotificationStatus.PENDING)
    assert row.last_error == stored
    assert (await _row(session_factory, innocent)).status is NotificationStatus.SENT


class UnprintableError(Exception):
    def __str__(self) -> str:
        raise RuntimeError("cannot describe myself")


async def test_an_exception_that_cannot_be_printed_is_still_recorded(
    session_factory: SessionFactory,
) -> None:
    row_id = await _insert(session_factory)

    run = await deliver_due(
        session_factory, _registry(RecordingDeliverer(error=UnprintableError())), now=Clock(T0)
    )

    assert run.retried == 1
    assert (await _row(session_factory, row_id)).last_error == (
        "UnprintableError: <message unavailable>"
    )


@pytest.fixture
async def reject_forbidden_error_text(session_factory: SessionFactory) -> AsyncIterator[None]:
    """A real constraint that makes one error text unstorable, standing in for any such value."""
    async with session_factory() as db:
        await db.execute(
            text(
                "ALTER TABLE notification_outbox ADD CONSTRAINT test_no_forbidden_error_text "
                "CHECK (last_error IS NULL OR last_error NOT LIKE '%forbidden%')"
            )
        )
        await db.commit()
    yield
    async with session_factory() as db:
        await db.execute(
            text("ALTER TABLE notification_outbox DROP CONSTRAINT test_no_forbidden_error_text")
        )
        await db.commit()


@pytest.mark.parametrize(
    ("attempts_before", "status", "retried", "failed"),
    [(0, NotificationStatus.PENDING, 1, 0), (7, NotificationStatus.FAILED, 0, 1)],
    ids=["retry", "final-attempt"],
)
async def test_a_row_whose_outcome_cannot_be_stored_still_advances(
    session_factory: SessionFactory,
    reject_forbidden_error_text: None,
    attempts_before: int,
    status: NotificationStatus,
    retried: int,
    failed: int,
) -> None:
    """If recording an outcome fails for any reason, no row may stay at the head of the queue."""
    clock = Clock(T0 + timedelta(minutes=1))
    stuck = await _insert(session_factory, subject="stuck", due=T0, attempts=attempts_before)
    after = await _insert(session_factory, subject="after", due=T0 + timedelta(seconds=1))
    deliverer = RecordingDeliverer(error=RuntimeError("forbidden"), only_for_subject="stuck")

    run = await deliver_due(session_factory, _registry(deliverer), now=clock)

    assert (run.sent, run.retried, run.failed) == (1, retried, failed)
    assert deliverer.subjects == ["stuck", "after"]  # not sent again within the run
    row = await _row(session_factory, stuck)
    assert (row.attempts, row.status) == (attempts_before + 1, status)
    assert row.last_error is not None
    assert row.last_error.startswith("outcome could not be recorded (")
    assert "forbidden" not in row.last_error
    if status is NotificationStatus.PENDING:
        assert row.next_attempt_at == clock.current + timedelta(seconds=30)
        assert row.payload["body"].startswith("Open ")  # a retry still has to send it
    else:
        assert row.payload == {"subject": "stuck"}  # the link does not outlive the row
    assert (await _row(session_factory, after)).status is NotificationStatus.SENT


async def test_the_fallback_write_leaves_a_row_another_worker_already_settled(
    session_factory: SessionFactory,
) -> None:
    """Its update is conditional on the attempt count it saw, so it cannot double-count."""
    row_id = await _insert(session_factory, attempts=3)

    outcome = await _record_unstorable_outcome(
        session_factory, row_id, "email", 2, Clock(T0), ValueError("late")
    )

    row = await _row(session_factory, row_id)
    assert outcome is DeliveryOutcome.RETRY
    assert (row.attempts, row.status, row.last_error) == (3, NotificationStatus.PENDING, None)


class PayloadMutatingDeliverer:
    """Sends fine, but leaves a value in the payload that JSON cannot store."""

    async def deliver(self, target: dict[str, Any], payload: dict[str, Any]) -> None:
        payload["subject"] = {"not", "json"}


async def test_a_sent_row_whose_reduced_payload_cannot_be_stored_is_retried_not_stuck(
    session_factory: SessionFactory,
) -> None:
    row_id = await _insert(session_factory)
    clock = Clock(T0)

    run = await deliver_due(
        session_factory,
        _registry(PayloadMutatingDeliverer()),
        now=clock,  # type: ignore[arg-type]
    )

    row = await _row(session_factory, row_id)
    assert (run.sent, run.retried) == (0, 1)
    assert (row.attempts, row.status) == (1, NotificationStatus.PENDING)
    assert row.sent_at is None and row.payload["body"].startswith("Open ")  # nothing half-saved
    assert row.last_error == "outcome could not be recorded (TypeError)"
    assert row.next_attempt_at == clock.current + timedelta(seconds=30)


async def test_two_claimers_never_share_a_row(session_factory: SessionFactory) -> None:
    first_id = await _insert(session_factory, due=T0)
    second_id = await _insert(session_factory, due=T0 + timedelta(seconds=1))
    now = T0 + timedelta(minutes=1)

    # Three open transactions: each holds its row lock until the end of the block, which is
    # exactly the state two workers are in while they send. Without SKIP LOCKED the second and
    # third claim would block on the first row, hence the timeout.
    async with session_factory() as one, session_factory() as two, session_factory() as three:
        async with asyncio.timeout(10):
            claimed_one = await claim_next_due(one, now)
            claimed_two = await claim_next_due(two, now)
            claimed_three = await claim_next_due(three, now)

    assert claimed_one is not None and claimed_two is not None
    assert {claimed_one.id, claimed_two.id} == {first_id, second_id}
    assert claimed_three is None


async def test_concurrent_runs_deliver_each_row_exactly_once(
    session_factory: SessionFactory,
) -> None:
    subjects = [f"mail-{n}" for n in range(8)]
    for n, subject in enumerate(subjects):
        await _insert(session_factory, subject=subject, due=T0 + timedelta(milliseconds=n))
    deliverer = RecordingDeliverer(delay=0.02)  # long enough for the runs to interleave
    registry = _registry(deliverer)

    runs = await asyncio.gather(
        deliver_due(session_factory, registry, now=Clock(T0 + timedelta(minutes=1))),
        deliver_due(session_factory, registry, now=Clock(T0 + timedelta(minutes=1))),
    )

    assert sorted(deliverer.subjects) == subjects  # none twice, none missed
    assert sum(run.sent for run in runs) == len(subjects)


async def test_unknown_kind_marks_failed_without_retry(session_factory: SessionFactory) -> None:
    row_id = await _insert(session_factory, kind="carrier-pigeon")
    deliverer = RecordingDeliverer()
    clock = Clock(T0)

    run = await deliver_due(session_factory, _registry(deliverer), now=clock)

    row = await _row(session_factory, row_id)
    assert (run.sent, run.retried, run.failed) == (0, 0, 1)
    assert (row.status, row.attempts) == (NotificationStatus.FAILED, 1)
    assert row.last_error is not None
    assert "no deliverer registered" in row.last_error and "carrier-pigeon" in row.last_error
    assert deliverer.calls == []

    clock.advance(timedelta(days=1))
    assert (await deliver_due(session_factory, _registry(deliverer), now=clock)).attempted == 0


async def test_sent_payload_is_reduced_to_subject(session_factory: SessionFactory) -> None:
    with_subject = await _insert(session_factory, subject="Reset your password")
    without_subject = await _insert(session_factory, subject=None, due=T0 + timedelta(seconds=1))
    deliverer = RecordingDeliverer()
    clock = Clock(T0 + timedelta(minutes=1))

    run = await deliver_due(session_factory, _registry(deliverer), now=clock)

    assert run.sent == 2
    # The deliverer got the whole payload; only the stored copy is reduced afterwards.
    assert "token=abc" in str(deliverer.calls[0][1])
    first = await _row(session_factory, with_subject)
    assert first.payload == {"subject": "Reset your password"}
    assert (first.status, first.attempts, first.sent_at) == (
        NotificationStatus.SENT,
        1,
        clock.current,
    )
    assert (await _row(session_factory, without_subject)).payload == {}


async def test_failed_payload_is_reduced_to_subject(session_factory: SessionFactory) -> None:
    """A row that will never be sent must not keep a live link (a reset link is a takeover)."""
    with_subject = await _insert(
        session_factory, subject="Reset your password", attempts=MAX_ATTEMPTS - 1
    )
    without_subject = await _insert(
        session_factory,
        subject=None,
        due=T0 + timedelta(seconds=1),
        attempts=MAX_ATTEMPTS - 1,
    )
    deliverer = RecordingDeliverer(error=RuntimeError("smtp down"))

    run = await deliver_due(
        session_factory, _registry(deliverer), now=Clock(T0 + timedelta(minutes=1))
    )

    assert (run.sent, run.retried, run.failed) == (0, 0, 2)
    first = await _row(session_factory, with_subject)
    assert (first.status, first.sent_at) == (NotificationStatus.FAILED, None)
    assert first.payload == {"subject": "Reset your password"}
    assert first.last_error == "RuntimeError: smtp down"  # the reduction touches nothing else
    assert (await _row(session_factory, without_subject)).payload == {}


async def test_a_row_for_an_unknown_kind_is_reduced_when_it_fails(
    session_factory: SessionFactory,
) -> None:
    row_id = await _insert(session_factory, kind="carrier-pigeon", subject="Reset your password")

    await deliver_due(session_factory, _registry(RecordingDeliverer()), now=Clock(T0))

    row = await _row(session_factory, row_id)
    assert row.status is NotificationStatus.FAILED
    assert row.payload == {"subject": "Reset your password"}


async def test_delivery_stops_when_the_time_budget_is_spent(
    session_factory: SessionFactory,
) -> None:
    row_id = await _insert(session_factory)
    deliverer = RecordingDeliverer()

    run = await deliver_due(
        session_factory, _registry(deliverer), now=Clock(T0), budget=timedelta(0)
    )

    assert run.attempted == 0 and deliverer.calls == []
    assert (await _row(session_factory, row_id)).status is NotificationStatus.PENDING


def test_a_run_always_ends_before_the_workers_task_timeout() -> None:
    """The last row may start just inside the budget and then take the full send timeout."""
    worst_case = RUN_BUDGET + SEND_TIMEOUT
    assert worst_case.total_seconds() < TASK_TIMEOUT_SECONDS


async def test_delivery_updates_the_metrics(session_factory: SessionFactory) -> None:
    await _insert(session_factory, subject="ok", due=T0)
    await _insert(session_factory, subject="boom", due=T0 + timedelta(seconds=1))
    await _insert(
        session_factory,
        subject="boom",
        due=T0 + timedelta(seconds=2),
        attempts=7,
    )
    deliverer = RecordingDeliverer(error=RuntimeError("rejected"), only_for_subject="boom")
    labels = {"kind": "email"}
    before = {
        outcome: _sample("spanlight_notifications_delivered_total", outcome=outcome, **labels)
        for outcome in ("sent", "retry", "failed")
    }

    await deliver_due(session_factory, _registry(deliverer), now=Clock(T0 + timedelta(minutes=1)))

    for outcome in ("sent", "retry", "failed"):
        after = _sample("spanlight_notifications_delivered_total", outcome=outcome, **labels)
        assert after - before[outcome] == 1, outcome
    assert _sample("spanlight_outbox_pending") == 1  # the retry is still waiting


async def test_the_scheduled_job_delivers_through_the_worker(
    session_factory: SessionFactory, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    deliverer = RecordingDeliverer()
    monkeypatch.setattr("app.notifications.jobs.DELIVERERS", _registry(deliverer))
    assert TASKS["deliver_notifications"] is run_deliver_notifications
    async with session_factory() as db:
        row_id = await enqueue(
            db, NotificationKind.EMAIL, target={"to": "ada@example.com"}, payload={"subject": "Hi"}
        )
        await queue.enqueue(db, "deliver_notifications")
        await db.commit()
    async with session_factory() as db:  # a margin so a small clock difference cannot matter
        await db.execute(
            text("UPDATE notification_outbox SET next_attempt_at = now() - interval '1 minute'")
        )
        await db.commit()

    assert await Worker(session_factory, settings).run_once() is True

    assert deliverer.subjects == ["Hi"]
    assert (await _row(session_factory, row_id)).status is NotificationStatus.SENT
    async with session_factory() as db:
        job = await db.scalar(text("SELECT status FROM jobs WHERE kind = 'deliver_notifications'"))
    assert job == JobStatus.DONE.value


async def test_cleanup_prunes_rows_older_than_7_days(session_factory: SessionFactory) -> None:
    now = datetime.now(UTC)
    old, recent = now - timedelta(days=8), now - timedelta(days=6)
    kept_ids: dict[str, uuid.UUID] = {}
    for name, status, created_at in (
        ("old pending", NotificationStatus.PENDING, old),  # undelivered mail is never pruned
        ("recent sent", NotificationStatus.SENT, recent),
        ("recent failed", NotificationStatus.FAILED, recent),
    ):
        kept_ids[name] = await _insert(
            session_factory,
            status=status,
            created_at=created_at,
            sent_at=created_at if status is NotificationStatus.SENT else None,
        )
    for status in (NotificationStatus.SENT, NotificationStatus.FAILED):
        await _insert(
            session_factory,
            status=status,
            created_at=old,
            sent_at=old if status is NotificationStatus.SENT else None,
        )

    counts = await cleanup(session_factory, now=now)

    assert counts["outbox_rows_deleted"] == 2
    async with session_factory() as db:
        remaining = set((await db.scalars(select(NotificationOutbox.id))).all())
    assert remaining == set(kept_ids.values())
