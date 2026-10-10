"""The one fan-out from an alert or insight payload to an organization's alert channels.

Every producer of notifications (the evaluation job; the Doctor's `notify_opened`) calls
`notify_channels` inside the transaction that decided to notify, so the decision and its outbox
rows commit or roll back together.
"""

import uuid
from collections.abc import Sequence
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.delivery_fanout import enqueue_for_channel
from app.alerts.payload import AlertPayload, NotifyPayload
from app.db.models import AlertChannel

if TYPE_CHECKING:
    from app.config import Settings

logger = structlog.get_logger(__name__)


async def notify_channels(
    db: AsyncSession,
    channel_ids: Sequence[uuid.UUID],
    payload: NotifyPayload,
    *,
    settings: "Settings",
) -> int:
    """Queue `payload` for each channel in `channel_ids`, in order; returns how many rows.

    Only channels of the payload's organization are used. An id that names no such channel (the
    channel was deleted; rules and projects keep the id) is skipped and logged as
    `alert_channel_missing`. Never commits.
    """
    wanted = list(dict.fromkeys(channel_ids))
    if not wanted:
        return 0
    channels = {
        channel.id: channel
        for channel in await db.scalars(
            select(AlertChannel).where(
                AlertChannel.org_id == payload.org.id, AlertChannel.id.in_(wanted)
            )
        )
    }
    queued = 0
    for channel_id in wanted:
        channel = channels.get(channel_id)
        if channel is None:
            _log_missing(channel_id, payload)
            continue
        queued += await enqueue_for_channel(db, channel, payload, settings=settings)
    return queued


def _log_missing(channel_id: uuid.UUID, payload: NotifyPayload) -> None:
    if isinstance(payload, AlertPayload):
        logger.warning(
            "alert_channel_missing",
            channel_id=str(channel_id),
            rule_id=str(payload.rule.id),
            event_id=str(payload.event_id),
        )
    else:
        logger.warning(
            "alert_channel_missing",
            channel_id=str(channel_id),
            insight_id=str(payload.insight.id),
            event_id=str(payload.event_id),
        )
