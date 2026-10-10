"""Projects and their onboarding state."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

from app.api.schemas.common import ApiModel, Confirmation, Name


class ProjectOut(ApiModel):
    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    slug: str
    retention_days: int
    capture_payloads: bool
    weekly_digest_enabled: bool
    created_at: datetime


class ProjectCreateIn(BaseModel):
    name: Name


class ProjectUpdateIn(BaseModel):
    name: Name | None = None
    retention_days: Annotated[int, Field(ge=1, le=90)] | None = None
    capture_payloads: bool | None = None
    weekly_digest_enabled: bool | None = None


class ProjectDeleteIn(BaseModel):
    # The project's slug, typed out as it is shown. The route compares it; see `Confirmation`.
    confirm: Confirmation


class OnboardingOut(BaseModel):
    has_traces: bool
    first_trace_at: datetime | None
