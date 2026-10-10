"""The producer end of the notification outbox table.

Producers call `enqueue` inside the transaction that makes the decision to notify, so the
decision and its delivery request commit or roll back together. Delivery claims rows under a
lease (see `lease.py`) and sends them (see `delivery.py`).
"""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import new_id
from app.db.models import AlertChannel, NotificationOutbox, NotificationStatus


class NotificationKind(enum.StrEnum):
    """What delivers a notification. Alert emails use `email`, like every other mail."""

    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"
    PAGERDUTY = "pagerduty"


async def enqueue(
    db: AsyncSession,
    kind: NotificationKind,
    target: dict[str, Any],
    payload: dict[str, Any],
    channel_id: uuid.UUID | None = None,
) -> uuid.UUID:
    """Add a pending notification to the caller's transaction and return its id.

    This flushes but never commits: if the caller rolls back, the notification disappears
    with the rest of its work. `target` says where it goes, `payload` what it says. Once the
    notification is settled, the stored payload is reduced to its `subject` and `summary`, so a
    link in the body does not stay in the database (see `lease.py` for the exact rule).
    """
    row_id = new_id()
    db.add(
        NotificationOutbox(
            id=row_id, kind=kind.value, channel_id=channel_id, target=target, payload=payload
        )
    )
    await db.flush()
    return row_id


async def count_pending(db: AsyncSession) -> int:
    statement = (
        select(func.count())
        .select_from(NotificationOutbox)
        .where(NotificationOutbox.status == NotificationStatus.PENDING)
    )
    return int(await db.scalar(statement) or 0)


async def retry_failed(
    db: AsyncSession, org_id: uuid.UUID, channel_id: uuid.UUID, row_id: uuid.UUID, now: datetime
) -> bool:
    """Put a failed alert delivery back in the queue; False when the row is not one.

    Only a `failed` row of this channel of this organization qualifies. A failed row that has a
    `channel_id` kept its payload (see `lease.py`), so it can be sent again; transactional mail
    has no channel and is never matched. The row keeps its id, so a receiver still sees the same
    `X-Spanlight-Delivery`. It starts over (`attempts = 0`, due now, no lease) and keeps its
    `last_error` until the next attempt replaces it. Flushes but never commits.

    The `org_id` and `channel_id` conditions are the only guard: the outbox is not under
    row-level security.
    """
    channel_of_org = (
        select(AlertChannel.id)
        .where(AlertChannel.org_id == org_id, AlertChannel.id == channel_id)
        .scalar_subquery()
    )
    retried = await db.scalar(
        update(NotificationOutbox)
        .where(
            NotificationOutbox.id == row_id,
            NotificationOutbox.channel_id == channel_of_org,
            NotificationOutbox.status == NotificationStatus.FAILED,
        )
        .values(
            status=NotificationStatus.PENDING,
            attempts=0,
            next_attempt_at=now,
            lease_until=None,
        )
        .returning(NotificationOutbox.id)
    )
    return retried is not None
