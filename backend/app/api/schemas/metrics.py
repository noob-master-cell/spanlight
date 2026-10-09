"""Project-level KPIs, time series and per-model breakdowns."""

from datetime import datetime

from pydantic import BaseModel

from app.api.schemas.common import Money


class KpisOut(BaseModel):
    traces: int
    llm_calls: int
    error_rate: float | None
    p50_ms: float | None
    p95_ms: float | None
    cost_usd: Money | None
    unpriced_calls: int
    input_tokens: int
    output_tokens: int


class OverviewOut(BaseModel):
    current: KpisOut
    previous: KpisOut
    approximate: bool


class TimeseriesPointOut(BaseModel):
    bucket_start: datetime
    llm_calls: int
    errors: int
    p95_ms: float | None
    cost_usd: Money | None
    tokens: int
    approximate: bool


class ModelMetricsOut(BaseModel):
    provider: str | None
    model: str | None
    calls: int
    errors: int
    p50_ms: float | None
    p95_ms: float | None
    input_tokens: int
    output_tokens: int
    cost_usd: Money | None
    approximate: bool
