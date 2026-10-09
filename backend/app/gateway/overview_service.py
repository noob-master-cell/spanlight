"""The gateway overview: counts and latencies of a window's gateway calls, with their ratios.

A ratio is `None` when its denominator is zero, never 0; a latency is `None` when no request
measured it (`app.gateway.overview_queries` says where each number comes from).
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.gateway import (
    FaultScenarioCountOut,
    GatewayCacheOut,
    GatewayKeyUsageOut,
    GatewayOverviewOut,
    GatewayTargetUsageOut,
)
from app.api.window import TimeWindow
from app.gateway import overview_queries as queries


def ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator > 0 else None


async def overview(
    db: AsyncSession,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
    window: TimeWindow,
    environment: str | None,
) -> GatewayOverviewOut:
    """Four statements, each bounded by the window and the project's gateway spans."""
    totals = await queries.read_totals(db, project_id, window, environment)
    by_target = await queries.read_by_target(db, project_id, org_id, window, environment)
    by_key = await queries.read_by_key(db, project_id, window, environment)
    faults = await queries.read_faults(db, project_id, window, environment)
    return GatewayOverviewOut(
        requests=totals.requests,
        errors=totals.errors,
        error_rate=ratio(totals.errors, totals.requests),
        cache=GatewayCacheOut(
            hits=totals.cache_hits,
            misses=totals.cache_misses,
            hit_rate=ratio(totals.cache_hits, totals.cache_hits + totals.cache_misses),
        ),
        fallbacks=totals.fallbacks,
        retries=totals.retries,
        p95_overhead_ms=totals.p95_overhead_ms,
        p95_ttft_ms=totals.p95_ttft_ms,
        by_target=[
            GatewayTargetUsageOut(
                credential_id=row.credential_id,
                credential_name=row.credential_name,
                provider=row.provider,
                requests=row.requests,
                errors=row.errors,
                p95_ms=row.p95_ms,
            )
            for row in by_target
        ],
        by_key=[
            GatewayKeyUsageOut(
                key_id=row.key_id,
                name=row.name,
                environment=row.environment,
                requests=row.requests,
                errors=row.errors,
                cost_usd=row.cost_usd,
            )
            for row in by_key
        ],
        faults=[FaultScenarioCountOut(scenario=row.scenario, count=row.calls) for row in faults],
    )
