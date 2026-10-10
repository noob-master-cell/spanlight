"""The deliverers a process starts with."""

import structlog

from app.config import Settings
from app.email import EmailDeliverer, get_email_sender
from app.notifications.outbox import NotificationKind
from app.notifications.registry import DELIVERERS, DelivererRegistry

logger = structlog.get_logger(__name__)


def register_default_deliverers(
    settings: Settings, registry: DelivererRegistry = DELIVERERS
) -> None:
    """Register a deliverer for every notification kind `settings` can really send.

    The worker calls this at startup, and so does the api (`create_app`), which delivers an alert
    channel's test-send in the request. Tests pass a registry of their own so nothing is
    registered process-wide.

    A kind that is not configured is left out on purpose. The outbox then fails its rows with
    "no deliverer registered" instead of marking them sent after a deliverer that delivers
    nothing (the console provider without a file only logs). Nothing fakes success.
    """
    if settings.is_email_configured:
        registry.register(NotificationKind.EMAIL, EmailDeliverer(get_email_sender(settings)))
    logger.info(
        "deliverers_registered",
        kinds=registry.kinds(),
        email_provider=settings.email_provider,
        email_configured=settings.is_email_configured,
    )
