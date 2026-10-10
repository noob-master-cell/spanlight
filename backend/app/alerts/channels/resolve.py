"""Look up a channel at delivery time, with its secret opened.

Slack, webhook and PagerDuty outbox rows carry only `{"channel_id"}` as their target, so the
secret stays sealed in `alert_channels` and never lands in the outbox. Their deliverers call
`resolve_channel` just before sending, which also picks up an edit made after the row was queued.
"""

import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.alerts.channels.secrets import open_secret
from app.core.crypto import CryptoError
from app.db.models import AlertChannel, AlertChannelKind
from app.notifications.registry import PermanentDeliveryError

if TYPE_CHECKING:
    from app.config import Settings

CANNOT_DECRYPT = (
    "The channel's secret could not be decrypted. Check CREDENTIALS_KEYS, or save the channel's "
    "secret again."
)


@dataclass(frozen=True)
class ResolvedChannel:
    id: uuid.UUID
    org_id: uuid.UUID
    kind: AlertChannelKind
    name: str
    config: dict[str, Any]
    # The clear secret: the Slack URL, the webhook signing secret or the PagerDuty routing key.
    # None for an email channel. Kept out of the repr so a logged channel never shows it.
    secret: str | None = field(repr=False)


async def resolve_channel(
    session_factory: async_sessionmaker[AsyncSession],
    channel_id: uuid.UUID,
    *,
    settings: "Settings",
) -> ResolvedChannel | None:
    """The channel with its secret opened, or None when it has been deleted.

    Raises `PermanentDeliveryError` when the secret cannot be opened (CREDENTIALS_KEYS is unset or
    no longer holds the key it was sealed under): no retry can fix that.
    """
    async with session_factory() as db:
        channel = await db.scalar(select(AlertChannel).where(AlertChannel.id == channel_id))
    if channel is None:
        return None
    try:
        secret = open_secret(channel, settings=settings)
    except (CryptoError, UnicodeDecodeError):
        raise PermanentDeliveryError(CANNOT_DECRYPT) from None
    return ResolvedChannel(
        id=channel.id,
        org_id=channel.org_id,
        kind=channel.kind,
        name=channel.name,
        config=dict(channel.config),
        secret=secret,
    )
