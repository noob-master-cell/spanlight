"""Alerts: the organization's alert channels.

The create and edit bodies, `ChannelCreate` and `ChannelUpdate`, are owned by the alerts domain
(`app.alerts.schemas`), which validates them; they are re-exported here so routers keep importing
from `app.api.schemas`. No response model has a field for a Slack URL or a PagerDuty routing key:
once sent, they are never returned. A webhook's signing secret is returned once, by the create
and by an edit that rotates it.
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

from app.alerts.schemas import ChannelCreate, ChannelUpdate
from app.api.schemas.common import ApiModel
from app.db.models import AlertChannelKind

__all__ = [
    "AlertChannelOut",
    "AlertChannelSecretOut",
    "ChannelCreate",
    "ChannelTestOut",
    "ChannelUpdate",
]


class AlertChannelOut(ApiModel):
    id: uuid.UUID
    org_id: uuid.UUID
    kind: AlertChannelKind
    name: str
    # The kind's settings: `{"to": [...]}`, `{}`, `{"url": ...}` or `{"severity": ...}`.
    config: dict[str, Any]
    # Whether a secret is stored (Slack, webhook and PagerDuty channels). Never the secret.
    has_secret: bool
    # When a test notification last went through; null until one does.
    verified_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AlertChannelSecretOut(AlertChannelOut):
    # A webhook's signing secret, shown in this response only: after a create or a rotation.
    # Null otherwise.
    secret: str | None


class ChannelTestOut(BaseModel):
    # The outbox row of the test; for an email channel, the first that did not go out.
    delivery_id: uuid.UUID
    # `pending` when a failure a retry might fix left the row for the worker.
    status: Literal["sent", "failed", "pending"]
    error: str | None
