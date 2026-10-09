"""Project metrics: KPI overview, time series and per-model breakdown.

Definitions (shared with the frontend, see docs/api-deviations.md):
- `llm_calls`, `error_rate`, latency percentiles and `unpriced_calls` are over
  spans of kind `llm` that started inside the window.
- `cost_usd` and token totals are over all spans in the window, matching the
  trace rollups. `cost_usd` is null when no span in the window was priced.
- `traces` counts traces that started inside the window.
- An `environment` filter applies to the trace the span belongs to.

Windows of 24 h or less are computed from the raw spans. Longer windows are read from the hourly
rollups with the same definitions (see `app.rollups.queries`): the hours that overlap the window
are included in full, percentiles are estimated from merged latency histograms, and every
response says `approximate: true`.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DbSession, ReadAccess, require
from app.api.schemas import KpisOut, ModelMetricsOut, OverviewOut, TimeseriesPointOut
from app.api.window import TimeWindow, Window
from app.core.permissions import Permission
from app.metrics.source import choose_source
from app.rollups.compute import HOUR, floor_hour
from app.rollups.queries import (
    HourlyRollup,
    combine,
    group_hours,
    read_model_rollups,
    read_rollups,
)

router = APIRouter(prefix="/projects/{project_id}/metrics", tags=["metrics"])

# Also readable by an API key with `traces:read`, for the project it belongs to.
ProjectReader = Annotated[ReadAccess, Depends(require(Permission.PROJECT_READ, allow_api_key=True))]
EnvironmentFilter = Annotated[str | None, Query(max_length=64)]

# Shared FROM/WHERE for span aggregates. `:environment` is NULL for "all".
_SPANS_IN_WINDOW = """
    FROM spans AS s
    JOIN traces AS t ON t.project_id = s.project_id AND t.trace_id = s.trace_id
    WHERE s.project_id = :project_id
      AND s.started_at >= :start
      AND s.started_at < :end
      AND (:environment IS NULL OR t.environment = :environment)
"""

_SPAN_KPIS = text(
    f"""
    SELECT count(*) FILTER (WHERE s.kind = 'llm')                              AS llm_calls,
           count(*) FILTER (WHERE s.kind = 'llm' AND s.status = 'error')       AS llm_errors,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY s.duration_ms)
               FILTER (WHERE s.kind = 'llm')                                   AS p50_ms,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY s.duration_ms)
               FILTER (WHERE s.kind = 'llm')                                   AS p95_ms,
           sum(s.cost_usd)                                                     AS cost_usd,
           count(*) FILTER (WHERE s.kind = 'llm' AND s.cost_usd IS NULL)       AS unpriced_calls,
           coalesce(sum(s.input_tokens), 0)                                    AS input_tokens,
           coalesce(sum(s.output_tokens), 0)                                   AS output_tokens
    {_SPANS_IN_WINDOW}
    """
).bindparams(bindparam("environment", type_=String))

_TRACE_COUNT = text(
    """
    SELECT count(*)
    FROM traces AS t
    WHERE t.project_id = :project_id
      AND t.started_at >= :start
      AND t.started_at < :end
      AND (:environment IS NULL OR t.environment = :environment)
    """
).bindparams(bindparam("environment", type_=String))

_TIMESERIES = text(
    f"""
    WITH buckets AS (
        SELECT generate_series(
                   date_trunc(:bucket, CAST(:start AS timestamptz), 'UTC') AT TIME ZONE 'UTC',
                   CAST(:end AS timestamptz) AT TIME ZONE 'UTC',
                   CAST(:step AS interval)
               ) AT TIME ZONE 'UTC' AS bucket_start
    ),
    aggregated AS (
        SELECT date_trunc(:bucket, s.started_at, 'UTC')                       AS bucket_start,
               count(*) FILTER (WHERE s.kind = 'llm')                          AS llm_calls,
               count(*) FILTER (WHERE s.kind = 'llm' AND s.status = 'error')   AS errors,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY s.duration_ms)
                   FILTER (WHERE s.kind = 'llm')                               AS p95_ms,
               sum(s.cost_usd)                                                 AS cost_usd,
               coalesce(sum(s.input_tokens), 0) + coalesce(sum(s.output_tokens), 0) AS tokens
        {_SPANS_IN_WINDOW}
        GROUP BY 1
    )
    SELECT b.bucket_start,
           coalesce(a.llm_calls, 0) AS llm_calls,
           coalesce(a.errors, 0)    AS errors,
           a.p95_ms,
           a.cost_usd,
           coalesce(a.tokens, 0)    AS tokens
    FROM buckets AS b
    LEFT JOIN aggregated AS a ON a.bucket_start = b.bucket_start
    WHERE b.bucket_start < :end
    ORDER BY b.bucket_start
    """
).bindparams(bindparam("environment", type_=String))

_MODELS = text(
    f"""
    SELECT s.provider,
           s.model,
           count(*)                                                    AS calls,
           count(*) FILTER (WHERE s.status = 'error')                  AS errors,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY s.duration_ms)  AS p50_ms,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY s.duration_ms) AS p95_ms,
           coalesce(sum(s.input_tokens), 0)                            AS input_tokens,
           coalesce(sum(s.output_tokens), 0)                           AS output_tokens,
           sum(s.cost_usd)                                             AS cost_usd
    {_SPANS_IN_WINDOW}
      AND s.kind = 'llm'
    GROUP BY s.provider, s.model
    ORDER BY calls DESC, s.provider NULLS LAST, s.model NULLS LAST
    LIMIT 100
    """
).bindparams(bindparam("environment", type_=String))


def _params(project_id: uuid.UUID, window: TimeWindow, environment: str | None) -> dict[str, Any]:
    return {
        "project_id": project_id,
        "start": window.start,
        "end": window.end,
        "environment": environment,
    }


async def _kpis(
    db: AsyncSession, project_id: uuid.UUID, window: TimeWindow, environment: str | None
) -> KpisOut:
    params = _params(project_id, window, environment)
    spans = (await db.execute(_SPAN_KPIS, params)).one()
    trace_count = (await db.execute(_TRACE_COUNT, params)).scalar_one()
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


def _bucket_start(hour: datetime, bucket: Literal["hour", "day"]) -> datetime:
    """The UTC bucket that holds an hour: the hour itself, or midnight of its day."""
    utc_hour = hour.astimezone(UTC)
    return utc_hour if bucket == "hour" else utc_hour.replace(hour=0)


async def _rollup_timeseries(
    db: AsyncSession,
    project_id: uuid.UUID,
    window: TimeWindow,
    environment: str | None,
    bucket: Literal["hour", "day"],
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


@router.get("/overview", response_model=OverviewOut)
async def overview(
    project_id: uuid.UUID,
    access: ProjectReader,
    db: DbSession,
    window: Window,
    environment: EnvironmentFilter = None,
) -> OverviewOut:
    project = access.require_project()
    previous = window.previous()
    if choose_source(window) == "rollups":
        return OverviewOut(
            current=await _rollup_kpis(db, project.id, window, environment),
            previous=await _rollup_kpis(db, project.id, previous, environment),
            approximate=True,
        )
    return OverviewOut(
        current=await _kpis(db, project.id, window, environment),
        previous=await _kpis(db, project.id, previous, environment),
        approximate=False,
    )


@router.get("/timeseries", response_model=list[TimeseriesPointOut])
async def timeseries(
    project_id: uuid.UUID,
    access: ProjectReader,
    db: DbSession,
    window: Window,
    environment: EnvironmentFilter = None,
    bucket: Literal["hour", "day"] = "hour",
) -> list[TimeseriesPointOut]:
    project = access.require_project()
    if choose_source(window) == "rollups":
        return await _rollup_timeseries(db, project.id, window, environment, bucket)
    params = {
        **_params(project.id, window, environment),
        "bucket": bucket,
        "step": f"1 {bucket}",
    }
    rows = (await db.execute(_TIMESERIES, params)).all()
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


@router.get("/models", response_model=list[ModelMetricsOut])
async def models(
    project_id: uuid.UUID,
    access: ProjectReader,
    db: DbSession,
    window: Window,
    environment: EnvironmentFilter = None,
) -> list[ModelMetricsOut]:
    project = access.require_project()
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
            for row in await read_model_rollups(db, project.id, window, environment)
        ]
    rows = (await db.execute(_MODELS, _params(project.id, window, environment))).all()
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
        for row in rows
    ]
