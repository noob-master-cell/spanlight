"""The health score of a project over a window: reads the inputs and hands them to `health`."""

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.metrics import MetricValue, metric_value
from app.alerts.types import Metric, MetricFilters
from app.api.window import TimeWindow
from app.insights import queries
from app.insights.health import HealthInputs, HealthScore, health_score
from app.insights.schemas import Severity


@dataclass(frozen=True, slots=True)
class ProjectHealth:
    """The score (`None` when the window has no LLM calls) and what it was computed from."""

    score: HealthScore | None
    open_critical: int
    open_warning: int
    approximate: bool


async def project_health(
    db: AsyncSession, project_id: uuid.UUID, window: TimeWindow, environment: str | None
) -> ProjectHealth:
    """Open counts include `open` and `acknowledged` insights; the baseline is the window before.

    With no LLM call in the window there is nothing to judge, so there is no score (never 0).
    """
    counts = await queries.count_active_by_severity(db, project_id)
    open_critical = counts.get(Severity.CRITICAL, 0)
    open_warning = counts.get(Severity.WARNING, 0)
    filters = MetricFilters(environment=environment)
    previous = window.previous()

    calls = await metric_value(db, project_id, Metric.LLM_CALLS, window, filters)
    if not calls.value:
        return ProjectHealth(None, open_critical, open_warning, calls.approximate)
    error_rate = await metric_value(db, project_id, Metric.ERROR_RATE, window, filters)
    p95 = await metric_value(db, project_id, Metric.P95_MS, window, filters)
    p95_before = await metric_value(db, project_id, Metric.P95_MS, previous, filters)
    spend = await metric_value(db, project_id, Metric.SPEND, window, filters)
    spend_before = await metric_value(db, project_id, Metric.SPEND, previous, filters)

    reads = (calls, error_rate, p95, p95_before, spend, spend_before)
    score = health_score(
        HealthInputs(
            open_critical=open_critical,
            open_warning=open_warning,
            error_rate=error_rate.value,
            p95_ms=p95.value,
            p95_baseline_ms=p95_before.value,
            spend_usd=spend.value,
            spend_baseline_usd=spend_before.value,
        )
    )
    return ProjectHealth(score, open_critical, open_warning, _any_approximate(reads))


def _any_approximate(reads: tuple[MetricValue, ...]) -> bool:
    return any(read.approximate for read in reads)
