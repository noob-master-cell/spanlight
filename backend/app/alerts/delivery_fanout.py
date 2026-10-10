"""Turn one alert or insight payload into outbox rows for a channel, and queue them.

`outbox_rows_for` is pure: it says which rows a channel gets. An email channel gets one `email`
row per allowed recipient, carrying the rendered message; every other kind gets one row whose
target is `{"channel_id"}` and whose payload is the alert or insight payload (its deliverer
renders it and opens the channel's secret at send time). Every row's payload carries the
`summary` the delivery log shows after the row is settled, and every row is tied to its channel.

`enqueue_for_channel` is the async shell that evaluation and the channel code call inside their
transaction. It never commits.
"""

import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.channels.email_render import render_alert_email, render_insight_email
from app.alerts.channels.resolve import ResolvedChannel
from app.alerts.payload import AlertPayload, InsightPayload, NotifyPayload
from app.alerts.service import allowed_recipients
from app.db.models import AlertChannel, AlertChannelKind
from app.email.message import EmailMessage
from app.notifications.outbox import NotificationKind, enqueue

if TYPE_CHECKING:
    from app.config import Settings

logger = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class OutboxRowSpec:
    kind: NotificationKind
    target: dict[str, Any]
    payload: dict[str, Any]
    channel_id: uuid.UUID


def alert_summary(payload: AlertPayload) -> dict[str, Any]:
    """What the delivery log can still say about a row once its payload is reduced."""
    return {
        "event": payload.event,
        "event_id": str(payload.event_id),
        "rule_id": str(payload.rule.id),
        "rule_name": payload.rule.name,
    }


def insight_summary(payload: InsightPayload) -> dict[str, Any]:
    """The delivery log's description of an insight row."""
    return {
        "event": payload.event,
        "event_id": str(payload.event_id),
        "project_id": str(payload.project.id),
        "insight_id": str(payload.insight.id),
        "title": payload.insight.title,
    }


def _summary(payload: NotifyPayload) -> dict[str, Any]:
    if isinstance(payload, InsightPayload):
        return insight_summary(payload)
    return alert_summary(payload)


def _render_email(payload: NotifyPayload, *, channel_name: str) -> EmailMessage:
    if isinstance(payload, InsightPayload):
        return render_insight_email(payload, channel_name=channel_name)
    return render_alert_email(payload, channel_name=channel_name)


def _recipients(channel: ResolvedChannel) -> list[str]:
    return [str(address) for address in channel.config.get("to", [])]


def skipped_recipients(
    channel: ResolvedChannel, allowed_emails: frozenset[str] | None
) -> list[str]:
    """The email channel's addresses that `outbox_rows_for` leaves out (for the caller to log)."""
    if channel.kind is not AlertChannelKind.EMAIL or allowed_emails is None:
        return []
    return [address for address in _recipients(channel) if address.lower() not in allowed_emails]


def outbox_rows_for(
    channel: ResolvedChannel,
    payload: NotifyPayload,
    *,
    allowed_emails: frozenset[str] | None,
) -> list[OutboxRowSpec]:
    """The rows to queue for `channel`.

    `allowed_emails` is the lower-cased set of addresses that may receive mail (the verified
    members), or None when any address may (`ALERT_EMAIL_ANY_RECIPIENT`). Recipients outside it
    get no row; `skipped_recipients` lists them.
    """
    summary = _summary(payload)
    if channel.kind is AlertChannelKind.EMAIL:
        message = _render_email(payload, channel_name=channel.name)
        body = {
            "subject": message.subject,
            "text": message.text,
            "html": message.html,
            "summary": summary,
        }
        return [
            OutboxRowSpec(NotificationKind.EMAIL, {"to": address}, body, channel.id)
            for address in _recipients(channel)
            if allowed_emails is None or address.lower() in allowed_emails
        ]
    return [
        OutboxRowSpec(
            NotificationKind(channel.kind.value),
            {"channel_id": str(channel.id)},
            {**payload.to_json_dict(), "summary": summary},
            channel.id,
        )
    ]


async def enqueue_for_channel(
    db: AsyncSession, channel: AlertChannel, payload: NotifyPayload, *, settings: "Settings"
) -> int:
    """Queue `payload` for `channel` in the caller's transaction; returns how many rows.

    An email channel only gets the recipients who are still verified members of the
    organization (all of them with `ALERT_EMAIL_ANY_RECIPIENT`); a departed member is skipped
    and logged by count.
    """
    allowed: frozenset[str] | None = None
    if channel.kind is AlertChannelKind.EMAIL and not settings.alert_email_any_recipient:
        addresses = [str(address) for address in channel.config.get("to", [])]
        allowed = frozenset(
            address.lower()
            for address in await allowed_recipients(
                db, channel.org_id, addresses, settings=settings
            )
        )
    resolved = ResolvedChannel(
        id=channel.id,
        org_id=channel.org_id,
        kind=channel.kind,
        name=channel.name,
        config=dict(channel.config),
        secret=None,  # rows never carry the secret; the deliverer opens it at send time
    )
    skipped = skipped_recipients(resolved, allowed)
    if skipped:
        logger.warning("alert_recipient_skipped", channel_id=str(channel.id), skipped=len(skipped))
    rows = outbox_rows_for(resolved, payload, allowed_emails=allowed)
    for row in rows:
        await enqueue(db, row.kind, row.target, row.payload, channel_id=row.channel_id)
    return len(rows)
