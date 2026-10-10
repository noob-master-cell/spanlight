"""The `deliver_notifications` job: send every due outbox row, one at a time.

Each row is claimed under a lease in a short transaction of its own, then sent and settled by
`deliver_one` (see `delivery.py`) with no transaction open during the send. Many workers can run
this concurrently: a claim skips rows another worker holds, and the fencing token keeps a worker
that lost its lease from sending or settling a row twice (see `lease.py`).

Delivery is at-least-once. If the process dies between a successful send and its mark, the
row's lease expires and the row goes out again. Deliverers must tolerate that.
"""

import time
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.observability import OUTBOX_PENDING
from app.jobs.context import TaskContext
from app.notifications.delivery import (
    SEND_TIMEOUT,
    Clock,
    DeliveryOutcome,
    _utcnow,
    deliver_one,
)
from app.notifications.lease import claim
from app.notifications.outbox import count_pending
from app.notifications.registry import DELIVERERS, DelivererRegistry

logger = structlog.get_logger(__name__)

# No new row is started after this long. The last row can begin just inside the budget and
# then take a full SEND_TIMEOUT, and the sum must stay below the worker's 50 s task timeout:
# a task cancelled mid-send would repeat that send.
RUN_BUDGET = timedelta(seconds=30)


@dataclass
class DeliveryRun:
    sent: int = 0
    retried: int = 0
    failed: int = 0
    lost: int = 0

    @property
    def attempted(self) -> int:
        return self.sent + self.retried + self.failed + self.lost

    def record(self, outcome: DeliveryOutcome) -> None:
        match outcome:
            case DeliveryOutcome.SENT:
                self.sent += 1
            case DeliveryOutcome.RETRY:
                self.retried += 1
            case DeliveryOutcome.FAILED:
                self.failed += 1
            case DeliveryOutcome.LOST:
                self.lost += 1


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
        async with session_factory() as db:
            row = await claim(db, now())
        if row is None:
            break
        result = await deliver_one(
            session_factory, row, registry.get(row.kind), now=now, send_timeout=send_timeout
        )
        run.record(result.status)

    async with session_factory() as db:
        OUTBOX_PENDING.set(await count_pending(db))
    return run


async def run_deliver_notifications(context: TaskContext, _: dict[str, Any]) -> None:
    run = await deliver_due(context.session_factory, DELIVERERS)
    if run.attempted:
        logger.info(
            "notifications_delivered",
            sent=run.sent,
            retried=run.retried,
            failed=run.failed,
            lost=run.lost,
        )
