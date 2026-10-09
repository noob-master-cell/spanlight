"""Project metrics use-cases: KPI overview, time series and per-model breakdown.

Definitions (shared with the frontend, see docs/api-deviations.md):
- `llm_calls`, `error_rate`, latency percentiles and `unpriced_calls` are over
  spans of kind `llm` that started inside the window.
- `cost_usd` and token totals are over all spans in the window, matching the
  trace rollups. `cost_usd` is null when no span in the window was priced.
- `traces` counts traces that started inside the window.
- An `environment` filter applies to the trace the span belongs to.

Windows of 24 h or less are computed from the raw spans (``app.metrics.queries``). Longer windows
are read from the hourly rollups with the same definitions (see ``app.rollups.queries``): the hours
that overlap the window are included in full, percentiles are estimated from merged latency
histograms, and every response says `approximate: true`.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import KpisOut, ModelMetricsOut, OverviewOut, TimeseriesPointOut
from app.api.window import TimeWindow
from app.metrics import queries
from app.metrics.source import choose_source
from app.rollups.compute import HOUR, floor_hour
from app.rollups.queries import (
    HourlyRollup,
    combine,
    group_hours,
    read_model_rollups,
    read_rollups,
)

Bucket = Literal["hour", "day"]


async def overview(
    db: AsyncSession, project_id: uuid.UUID, window: TimeWindow, environment: str | None
) -> OverviewOut:
    """KPIs for the window and for the window of equal length right before it."""
    previous = window.previous()
    if choose_source(window) == "rollups":
        return OverviewOut(
            current=await _rollup_kpis(db, project_id, window, environment),
            previous=await _rollup_kpis(db, project_id, previous, environment),
            approximate=True,
        )
    return OverviewOut(
        current=await _raw_kpis(db, project_id, window, environment),
        previous=await _raw_kpis(db, project_id, previous, environment),
        approximate=False,
    )


async def timeseries(
    db: AsyncSession,
    project_id: uuid.UUID,
    window: TimeWindow,
    environment: str | None,
    bucket: Bucket,
) -> list[TimeseriesPointOut]:
    """Gapless points, one per UTC bucket from the one holding ``window.start`` up to its end."""
    if choose_source(window) == "rollups":
        return await _rollup_timeseries(db, project_id, window, environment, bucket)
    rows = await queries.read_timeseries(db, project_id, window, environment, bucket)
    return [
        TimeseriesPointOut(
            bucket_start=row.bucket_start,
            llm_calls=row.llm_calls,
            errors=row.errors,
            p95_ms=row.p95_ms,
            cost_usd=row.cost_usd,
            tokens=row.tokens,
            approximate=False,
        )
        for row in rows
    ]


async def models(
    db: AsyncSession, project_id: uuid.UUID, window: TimeWindow, environment: str | None
) -> list[ModelMetricsOut]:
    """Calls, errors, latency, tokens and cost per provider and model, busiest first."""
    if choose_source(window) == "rollups":
        return [
            ModelMetricsOut(
                provider=row.provider,
                model=row.model,
                calls=row.calls,
                errors=row.errors,
                p50_ms=row.p50_ms,
                p95_ms=row.p95_ms,
                input_tokens=row.input_tokens,
                output_tokens=row.output_tokens,
                cost_usd=row.cost_usd,
                approximate=True,
            )
            for row in await read_model_rollups(db, project_id, window, environment)
        ]
    return [
        ModelMetricsOut(
            provider=row.provider,
            model=row.model,
            calls=row.calls,
            errors=row.errors,
            p50_ms=row.p50_ms,
            p95_ms=row.p95_ms,
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
            cost_usd=row.cost_usd,
            approximate=False,
        )
        for row in await queries.read_models(db, project_id, window, environment)
    ]


async def _raw_kpis(
    db: AsyncSession, project_id: uuid.UUID, window: TimeWindow, environment: str | None
) -> KpisOut:
    spans = await queries.read_span_kpis(db, project_id, window, environment)
    trace_count = await queries.read_trace_count(db, project_id, window, environment)
    error_rate = spans.llm_errors / spans.llm_calls if spans.llm_calls else None
    return KpisOut(
        traces=trace_count,
        llm_calls=spans.llm_calls,
        error_rate=error_rate,
        p50_ms=spans.p50_ms,
        p95_ms=spans.p95_ms,
        cost_usd=spans.cost_usd,
        unpriced_calls=spans.unpriced_calls,
        input_tokens=spans.input_tokens,
        output_tokens=spans.output_tokens,
    )


async def _rollup_kpis(
    db: AsyncSession, project_id: uuid.UUID, window: TimeWindow, environment: str | None
) -> KpisOut:
    series = await read_rollups(db, project_id, window, environment)
    total = combine(window.start, series.hours)
    return KpisOut(
        traces=total.traces,
        llm_calls=total.llm_calls,
        error_rate=total.error_rate,
        p50_ms=total.p50_ms,
        p95_ms=total.p95_ms,
        cost_usd=total.cost_usd,
        unpriced_calls=total.unpriced_calls,
        input_tokens=total.input_tokens,
        output_tokens=total.output_tokens,
    )


def _bucket_start(hour: datetime, bucket: Bucket) -> datetime:
    """The UTC bucket that holds an hour: the hour itself, or midnight of its day."""
    utc_hour = hour.astimezone(UTC)
    return utc_hour if bucket == "hour" else utc_hour.replace(hour=0)


async def _rollup_timeseries(
    db: AsyncSession,
    project_id: uuid.UUID,
    window: TimeWindow,
    environment: str | None,
    bucket: Bucket,
) -> list[TimeseriesPointOut]:
    series = await read_rollups(db, project_id, window, environment)
    by_bucket = group_hours(series, lambda hour: _bucket_start(hour, bucket))
    step = HOUR if bucket == "hour" else timedelta(days=1)
    points: list[TimeseriesPointOut] = []
    # Gapless like the raw query: every bucket from the one holding `start` up to `end`.
    current = _bucket_start(floor_hour(window.start), bucket)
    while current < window.end:
        row: HourlyRollup = by_bucket.get(current) or combine(current, [])
        points.append(
            TimeseriesPointOut(
                bucket_start=current,
                llm_calls=row.llm_calls,
                errors=row.llm_errors,
                p95_ms=row.p95_ms,
                cost_usd=row.cost_usd,
                tokens=row.tokens,
                approximate=True,
            )
        )
        current += step
    return points
