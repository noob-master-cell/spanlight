"""The channel an outbox row's target points at, checked to be the kind the deliverer serves.

The webhook and PagerDuty deliverers both start the same way: read `channel_id` from the target,
open the channel and refuse a deleted channel, one of another kind, or one without its secret.
"""

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.alerts.channels.resolve import ResolvedChannel, resolve_channel
from app.db.models import AlertChannelKind
from app.notifications.registry import PermanentDeliveryError

if TYPE_CHECKING:
    from app.config import Settings

BAD_TARGET = "The delivery names no valid channel"
BAD_PAYLOAD = "The delivery carries no valid alert payload"


async def resolve_target(
    session_factory: async_sessionmaker[AsyncSession],
    settings: "Settings",
    target: dict[str, Any],
    *,
    kind: AlertChannelKind,
    label: str,
) -> ResolvedChannel:
    """The target's channel with its secret opened. `label` names the kind in error messages.

    Raises `PermanentDeliveryError` when the target names no channel, the channel is gone, is of
    another kind, or has no secret: a retry cannot change any of those.
    """
    try:
        channel_id = uuid.UUID(str(target["channel_id"]))
    except (KeyError, ValueError):
        raise PermanentDeliveryError(BAD_TARGET) from None
    channel = await resolve_channel(session_factory, channel_id, settings=settings)
    if channel is None:
        raise PermanentDeliveryError(f"The {label} channel was deleted")
    if channel.kind is not kind:
        raise PermanentDeliveryError(f"The channel is not a {label} channel")
    if not channel.secret:
        raise PermanentDeliveryError(f"The {label} channel has no secret")
    return channel


def summary_event(payload: dict[str, Any]) -> str | None:
    """The `summary.event` of an outbox payload, for a log line (never the payload itself)."""
    summary = payload.get("summary")
    event = summary.get("event") if isinstance(summary, dict) else None
    return event if isinstance(event, str) else None
