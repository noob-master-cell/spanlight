"""The producer and consumer ends of the notification outbox table.

Producers call `enqueue` inside the transaction that makes the decision to notify, so the
decision and its delivery request commit or roll back together. The delivery job (see
`jobs.py`) claims rows with `claim_next_due`.
"""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import new_id
from app.db.models import NotificationOutbox, NotificationStatus


class NotificationKind(enum.StrEnum):
    """What delivers a notification. Phase 3 adds slack, webhook and pagerduty."""

    EMAIL = "email"


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
    notification is settled (sent, or failed for good), the stored payload is reduced to its
    subject, so a link in the body does not stay in the database.
    """
    row_id = new_id()
    db.add(
        NotificationOutbox(
            id=row_id, kind=kind.value, channel_id=channel_id, target=target, payload=payload
        )
    )
    await db.flush()
    return row_id


async def claim_next_due(db: AsyncSession, now: datetime) -> NotificationOutbox | None:
    """Lock the oldest pending row due at `now` for the rest of the transaction.

    `SKIP LOCKED` lets any number of workers claim at once: a row another transaction is
    sending is skipped instead of waited for, so no two workers ever hold the same row.
    The caller sends, updates the row and commits (or rolls back, releasing the lock).
    """
    statement = (
        select(NotificationOutbox)
        .where(
            NotificationOutbox.status == NotificationStatus.PENDING,
            NotificationOutbox.next_attempt_at <= now,
        )
        .order_by(NotificationOutbox.next_attempt_at, NotificationOutbox.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    return (await db.execute(statement)).scalar_one_or_none()


async def count_pending(db: AsyncSession) -> int:
    statement = (
        select(func.count())
        .select_from(NotificationOutbox)
        .where(NotificationOutbox.status == NotificationStatus.PENDING)
    )
    return int(await db.scalar(statement) or 0)
