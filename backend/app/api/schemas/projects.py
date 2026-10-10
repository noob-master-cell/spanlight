"""Projects and their onboarding state."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

from app.alerts.rule_spec import ChannelIds
from app.api.schemas.common import ApiModel, Confirmation, Name


class ProjectOut(ApiModel):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    slug: str
    retention_days: int
    capture_payloads: bool
    weekly_digest_enabled: bool
    # Alert channels of the organization that hear about critical insights.
    insight_channel_ids: list[uuid.UUID]
    created_at: datetime


class ProjectCreateIn(BaseModel):
    name: Name


class ProjectUpdateIn(BaseModel):
    name: Name | None = None
    retention_days: Annotated[int, Field(ge=1, le=90)] | None = None
    capture_payloads: bool | None = None
    weekly_digest_enabled: bool | None = None
    # At most 10, repeats dropped; each must be an alert channel of the project's organization
    # (else 422 `UNKNOWN_CHANNEL`). `[]` turns insight notifications off.
    insight_channel_ids: ChannelIds | None = None


class ProjectDeleteIn(BaseModel):
    # The project's slug, typed out as it is shown. The route compares it; see `Confirmation`.
    confirm: Confirmation


class OnboardingOut(BaseModel):
    has_traces: bool
    first_trace_at: datetime | None
