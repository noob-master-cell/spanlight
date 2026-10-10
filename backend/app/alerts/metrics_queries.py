"""Raw-span reads behind alert metrics: one row of aggregates per requested group of ranges.

The definitions are the metrics endpoints' (``app.metrics.queries``): ``llm_calls``, errors and
latency percentiles are over spans of kind ``llm``; ``spans``, ``cost_usd`` and token totals are
over every kind, and ``cost_usd`` is NULL when no span was priced. The TTFT percentile reads only
``llm`` spans that measured a time to first token.

A metric window's raw part is a group of up to two disjoint time ranges (the partial hours
around the rollup hours, see ``app.alerts.metrics``). Every range of a request is read by one
statement: the ranges are passed as three arrays (start, end, group) and joined to ``spans`` with
``unnest``, so each one is an index range scan, and the result is grouped by the group number.
Ranges of different groups may overlap; ranges of one group must not.

The statement is assembled from fixed fragments according to which filters are set, so values
only ever travel as bound parameters. ``traces`` is joined only for the filters that live on the
trace (``environment``, ``external_user_id``): without them the read stays on
``spans_project_started_cov_idx`` (see ``app.metrics.queries``). ``source_key_id`` is served by
``spans_project_source_key_started_idx`` and ``external_user_id`` by the partial index of
migration 0302.

Percentiles are exact (``percentile_cont``). When the caller merges the raw part of a window with
hourly rollups it asks for a latency histogram as well, bucketed exactly as the rollup job does
(``app.rollups.compute``), so both halves add up element-wise.

The queries run in the caller's session and rely on its project binding for row-level security;
the explicit ``project_id`` filter is a second guard, not the only one.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from functools import cache
from typing import Any, Literal, get_args

from sqlalchemy import DateTime, Double, Integer, TextClause, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.types import MetricFilters
from app.api.window import TimeWindow
from app.core.model_match import like_prefix, model_filter_sql
from app.rollups.buckets import BUCKET_COUNT
from app.rollups.compute import BUCKET_INDEX_SQL, NEGATED_BOUNDS

LatencyColumn = Literal["duration_ms", "time_to_first_token_ms"]
"""The span column a percentile metric reads."""

_COUNTS = """
    count(*)                                                          AS spans,
    count(*) FILTER (WHERE s.kind = 'llm')                            AS llm_calls,
    count(*) FILTER (WHERE s.kind = 'llm' AND s.status = 'error')     AS llm_errors,
    sum(s.cost_usd)                                                   AS cost_usd,
    coalesce(sum(s.input_tokens), 0)                                  AS input_tokens,
    coalesce(sum(s.output_tokens), 0)                                 AS output_tokens
"""

_TRACE_JOIN = "JOIN traces AS t ON t.project_id = s.project_id AND t.trace_id = s.trace_id"

_CONDITIONS = {
    "environment": "t.environment = :environment",
    # A trace starts no later than its first span, so the bound drops no row and lets the
    # partial index of 0302 stop at the window's end.
    "external_user_id": "t.external_user_id = :external_user_id AND t.started_at < w.end_at",
    "provider": "s.provider = :provider",
    "model": model_filter_sql("s.model"),
    "source_key_id": "s.source_key_id = :source_key_id",
}
_TRACE_FILTERS = frozenset({"environment", "external_user_id"})


@dataclass(frozen=True, slots=True)
class RawAggregate:
    """The raw-span aggregates of one window.

    ``percentile`` is the exact p95 of the requested column (``None`` without calls or when no
    column was requested); ``histogram`` is that column's llm histogram, when requested.
    """

    spans: int
    llm_calls: int
    llm_errors: int
    input_tokens: int
    output_tokens: int
    cost_usd: Decimal | None
    percentile: float | None
    histogram: list[int] | None


EMPTY = RawAggregate(0, 0, 0, 0, 0, None, None, None)


def _histogram(column: str) -> str:
    """A 32-element ``integer[]`` counting the llm spans whose ``column`` is in each bucket.

    The NULL test is required: ``least`` ignores NULL arguments, so the index of a NULL value
    would be the last bucket, not NULL.
    """
    measured = f"s.kind = 'llm' AND s.{column} IS NOT NULL"
    index = BUCKET_INDEX_SQL.format(value=f"s.{column}")
    counts = ", ".join(
        f"count(*) FILTER (WHERE {measured} AND {index} = {position})"
        for position in range(BUCKET_COUNT)
    )
    return f"CAST(ARRAY[{counts}] AS integer[])"


@cache
def _statement(
    filters: frozenset[str], latency: LatencyColumn | None, with_histogram: bool
) -> TextClause:
    """The statement for one combination of set filters and requested latency columns."""
    columns = [_COUNTS]
    if latency is not None:
        columns.append(
            f"percentile_cont(0.95) WITHIN GROUP (ORDER BY s.{latency}) "
            "FILTER (WHERE s.kind = 'llm') AS percentile"
        )
        if with_histogram:
            columns.append(f"{_histogram(latency)} AS histogram")
    join = _TRACE_JOIN if filters & _TRACE_FILTERS else ""
    conditions = "".join(f"\n      AND {_CONDITIONS[name]}" for name in sorted(filters))
    statement = text(
        f"""
        SELECT w.grp, {", ".join(columns)}
        FROM unnest(
                 CAST(:starts AS timestamptz[]),
                 CAST(:ends AS timestamptz[]),
                 CAST(:groups AS integer[])
             ) AS w(start_at, end_at, grp)
        JOIN spans AS s
          ON s.project_id = :project_id
         AND s.started_at >= w.start_at
         AND s.started_at < w.end_at
        {join}
        WHERE TRUE{conditions}
        GROUP BY w.grp
        """
    ).bindparams(
        bindparam("starts", type_=ARRAY(DateTime(timezone=True))),
        bindparam("ends", type_=ARRAY(DateTime(timezone=True))),
        bindparam("groups", type_=ARRAY(Integer())),
    )
    if latency is not None and with_histogram:
        statement = statement.bindparams(bindparam("neg_bounds", type_=ARRAY(Double())))
    return statement


def _set_filters(filters: MetricFilters) -> dict[str, Any]:
    values = {
        "environment": filters.environment,
        "external_user_id": filters.external_user_id,
        "provider": filters.provider,
        "model": filters.model,
        "source_key_id": filters.source_key_id,
    }
    return {name: value for name, value in values.items() if value is not None}


async def read_window_aggregates(
    db: AsyncSession,
    project_id: uuid.UUID,
    groups: Sequence[Sequence[TimeWindow]],
    filters: MetricFilters,
    latency: LatencyColumn | None = None,
    with_histogram: bool = False,
) -> list[RawAggregate]:
    """Aggregates for each group of disjoint ranges, in order. A group without a non-empty range
    yields :data:`EMPTY`.

    Raises:
        ValueError: ``latency`` is not a span column this module reads; it is written into the
            SQL, so it is checked at run time, not only by the type checker.
    """
    if latency is not None and latency not in get_args(LatencyColumn):
        raise ValueError(f"unsupported latency column: {latency!r}")
    readable = [(g, r) for g, ranges in enumerate(groups) for r in ranges if r.start < r.end]
    results = [EMPTY] * len(groups)
    if not readable:
        return results
    set_filters = _set_filters(filters)
    params: dict[str, Any] = {
        **set_filters,
        **({"model_like": like_prefix(filters.model)} if filters.model is not None else {}),
        "project_id": project_id,
        "starts": [r.start for _, r in readable],
        "ends": [r.end for _, r in readable],
        "groups": [g for g, _ in readable],
    }
    with_histogram = with_histogram and latency is not None
    if with_histogram:
        params["neg_bounds"] = list(NEGATED_BOUNDS)
    statement = _statement(frozenset(set_filters), latency, with_histogram)
    for row in (await db.execute(statement, params)).all():
        results[int(row.grp)] = _aggregate(row, latency, with_histogram)
    return results


def _aggregate(row: Any, latency: LatencyColumn | None, with_histogram: bool) -> RawAggregate:
    return RawAggregate(
        spans=int(row.spans),
        llm_calls=int(row.llm_calls),
        llm_errors=int(row.llm_errors),
        input_tokens=int(row.input_tokens),
        output_tokens=int(row.output_tokens),
        cost_usd=row.cost_usd,
        percentile=row.percentile if latency is not None else None,
        histogram=[int(count) for count in row.histogram] if with_histogram else None,
    )
