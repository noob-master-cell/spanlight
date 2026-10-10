"""Alert channels: where an organization's alerts are delivered, and how their secrets are kept."""

from dataclasses import dataclass
from typing import TYPE_CHECKING

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.alerts.channels.http import SharedClient
from app.alerts.channels.pagerduty import PagerDutyDeliverer
from app.alerts.channels.slack import SlackDeliverer
from app.alerts.channels.webhook import WebhookDeliverer
from app.notifications.outbox import NotificationKind
from app.notifications.registry import DELIVERERS, DelivererRegistry

if TYPE_CHECKING:
    from app.config import Settings

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class ChannelClients:
    """The two HTTP clients the channel deliverers send with. Closed together at shutdown."""

    # Never reaches private addresses (Slack, PagerDuty).
    public: SharedClient
    # Reaches them only when WEBHOOK_ALLOW_PRIVATE_TARGETS is set (customer webhooks).
    webhook: SharedClient

    async def aclose(self) -> None:
        try:
            await self.public.aclose()
        finally:
            await self.webhook.aclose()


def register_channel_deliverers(
    session_factory: async_sessionmaker[AsyncSession],
    settings: "Settings",
    registry: DelivererRegistry = DELIVERERS,
    *,
    public_client: SharedClient | None = None,
    webhook_client: SharedClient | None = None,
) -> ChannelClients:
    """Register the deliverers for the alert channels that call out over HTTP.

    The worker and the api both call this (the api for a channel's test-send). Registering again
    replaces the earlier deliverers, so building a second app is safe. `public_client` and
    `webhook_client` are the clients for Slack/PagerDuty and for webhooks; tests pass ones with a
    mock transport.

    Returns the clients. The caller owns them and awaits `aclose()` at shutdown. Logs every kind
    the registry now delivers, since `register_default_deliverers` logs before these are added.
    """
    public = public_client or SharedClient(allow_private=False)
    webhook = webhook_client or SharedClient(allow_private=settings.webhook_allow_private_targets)
    registry.register(NotificationKind.SLACK, SlackDeliverer(session_factory, settings, public))
    registry.register(
        NotificationKind.WEBHOOK, WebhookDeliverer(session_factory, settings, webhook)
    )
    registry.register(
        NotificationKind.PAGERDUTY, PagerDutyDeliverer(session_factory, settings, public)
    )
    logger.info("channel_deliverers_registered", kinds=registry.kinds())
    return ChannelClients(public=public, webhook=webhook)
