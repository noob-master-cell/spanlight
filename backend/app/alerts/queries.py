"""Reads and locks for alert channels. Every query filters by the organization.

`alert_channels` is scoped to an organization and not under row-level security, so the
`org_id` filter here is what keeps one organization from seeing another's channels.
"""

import uuid
from collections.abc import Iterable, Sequence
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AlertChannel, Membership, User


async def list_channels(db: AsyncSession, org_id: uuid.UUID) -> Sequence[AlertChannel]:
    """The organization's channels, by name. Unpaginated: an organization has at most 20."""
    rows = await db.scalars(
        select(AlertChannel)
        .where(AlertChannel.org_id == org_id)
        .order_by(AlertChannel.name, AlertChannel.id)
    )
    return rows.all()


async def get_channel(
    db: AsyncSession, org_id: uuid.UUID, channel_id: uuid.UUID
) -> AlertChannel | None:
    return await db.scalar(
        select(AlertChannel).where(AlertChannel.org_id == org_id, AlertChannel.id == channel_id)
    )


async def lock_channel(
    db: AsyncSession, org_id: uuid.UUID, channel_id: uuid.UUID
) -> AlertChannel | None:
    """The channel, locked until the transaction ends, so two edits do not interleave."""
    return await db.scalar(
        select(AlertChannel)
        .where(AlertChannel.org_id == org_id, AlertChannel.id == channel_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def count_channels(db: AsyncSession, org_id: uuid.UUID) -> int:
    """How many channels the organization has. Callers hold the organization's lock."""
    count = await db.scalar(
        select(func.count()).select_from(AlertChannel).where(AlertChannel.org_id == org_id)
    )
    return int(count or 0)


async def verified_member_emails(
    db: AsyncSession, org_id: uuid.UUID, addresses: Iterable[str]
) -> set[str]:
    """Which of `addresses` belong to current members of the organization with a verified email.

    Returned lower-cased. The comparison ignores case (`users.email` is `citext`).
    """
    wanted = list(addresses)
    if not wanted:
        return set()
    rows = await db.scalars(
        select(User.email)
        .join(Membership, Membership.user_id == User.id)
        .where(
            Membership.org_id == org_id,
            User.email_verified_at.is_not(None),
            User.email.in_(wanted),
        )
    )
    return {email.lower() for email in rows}


async def mark_verified(
    db: AsyncSession,
    org_id: uuid.UUID,
    channel_id: uuid.UUID,
    now: datetime,
    seen_updated_at: datetime,
) -> None:
    """Record a test notification that went through.

    Only while the channel is as it was when the test was queued (`updated_at` unchanged): an
    edit since then changed the target, so the test proves nothing about it. A channel deleted
    since is left alone too.
    """
    await db.execute(
        update(AlertChannel)
        .where(
            AlertChannel.org_id == org_id,
            AlertChannel.id == channel_id,
            AlertChannel.updated_at == seen_updated_at,
        )
        .values(verified_at=now)
    )
