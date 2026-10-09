"""Traces, spans, sessions and the filter options offered for them."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.api.schemas.common import Money
from app.db.models import SpanKind, SpanStatus


class TraceSummaryOut(BaseModel):
    trace_id: str
    name: str | None
    environment: str | None
    release: str | None
    external_user_id: str | None
    session_id: str | None
    tags: list[str]
    started_at: datetime
    ended_at: datetime
    duration_ms: float
    span_count: int
    error_count: int
    input_tokens: int
    output_tokens: int
    cost_usd: Money | None
    has_unpriced: bool
    models: list[str]
    error_message: str | None
    """Earliest failed span's status message; null if nothing failed or no message was sent."""


class SpanOut(BaseModel):
    span_id: str
    parent_span_id: str | None
    kind: SpanKind
    name: str
    status: SpanStatus
    status_message: str | None
    started_at: datetime
    ended_at: datetime
    duration_ms: float
    provider: str | None
    model: str | None
    input_tokens: int | None
    output_tokens: int | None
    cached_tokens: int | None
    cost_usd: Money | None
    pricing_version: str | None
    time_to_first_token_ms: float | None
    input: Any
    output: Any
    attributes: dict[str, Any]
    truncated: bool


class TraceDetailOut(TraceSummaryOut):
    spans: list[SpanOut]


class SessionSummaryOut(BaseModel):
    session_id: str
    trace_count: int
    first_at: datetime
    last_at: datetime
    cost_usd: Money | None
    error_count: int


class FiltersOut(BaseModel):
    environments: list[str]
    releases: list[str]
    models: list[str]
    tags: list[str]
