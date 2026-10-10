"""What one rule measures now, and the line it is compared with.

A threshold rule reads its metric over its trailing window and compares it with its stored
threshold. An anomaly rule reads the same window plus the `baseline_windows` windows before it
(one series read) and compares with the band edge of that baseline; without a baseline it has no
line and cannot change state. A budget rule reads `spend` over its budget's period so far (the
UTC day or month up to the window's end), filtered by the budget's scope; the reading carries
the budget, whose description goes into the payload.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.anomaly import anomaly_threshold, baseline_of
from app.alerts.metrics import MetricCache
from app.alerts.rules import metric_filters, previous_windows, trailing_window
from app.alerts.types import AlertRuleKind, Metric
from app.budgets.periods import period_window
from app.budgets.queries import budget_for_rule
from app.db.models import AlertRule, Budget


@dataclass(frozen=True, slots=True)
class RuleReading:
    """The metric's value now (None when unknown) and the line it is compared with (None when an
    anomaly rule has no baseline yet). Either None means the rule has no data this pass."""

    value: Decimal | None
    threshold: Decimal | None
    # The budget that owns the rule; None for every other kind.
    budget: Budget | None = None

    @property
    def has_data(self) -> bool:
        return self.value is not None and self.threshold is not None


async def read_rule(
    db: AsyncSession, rule: AlertRule, window_end: datetime, cache: MetricCache
) -> RuleReading | None:
    """The rule's reading for windows ending at `window_end`; None for a budget rule whose budget
    is gone (it goes with it). The transaction must be bound to the rule's project."""
    if rule.kind is AlertRuleKind.THRESHOLD:
        return await _read_threshold(db, rule, window_end, cache)
    if rule.kind is AlertRuleKind.ANOMALY:
        return await _read_anomaly(db, rule, window_end, cache)
    return await _read_budget(db, rule, window_end, cache)


async def _read_budget(
    db: AsyncSession, rule: AlertRule, window_end: datetime, cache: MetricCache
) -> RuleReading | None:
    budget = await budget_for_rule(db, rule)
    if budget is None:
        return None
    window = period_window(budget.period, window_end)
    measured = await cache.value(
        db, rule.project_id, Metric.SPEND, window, metric_filters(rule.filters)
    )
    return RuleReading(value=measured.value, threshold=rule.threshold, budget=budget)


def _window_minutes(rule: AlertRule) -> int:
    if rule.window_minutes is None:
        raise ValueError(f"rule {rule.id} has no window")
    return rule.window_minutes


async def _read_threshold(
    db: AsyncSession, rule: AlertRule, window_end: datetime, cache: MetricCache
) -> RuleReading:
    window = trailing_window(window_end, _window_minutes(rule))
    measured = await cache.value(
        db, rule.project_id, rule.metric, window, metric_filters(rule.filters)
    )
    return RuleReading(value=measured.value, threshold=rule.threshold)


async def _read_anomaly(
    db: AsyncSession, rule: AlertRule, window_end: datetime, cache: MetricCache
) -> RuleReading:
    if rule.baseline_windows is None or rule.sensitivity is None:
        raise ValueError(f"anomaly rule {rule.id} has no baseline settings")
    window = trailing_window(window_end, _window_minutes(rule))
    earlier = previous_windows(window, rule.baseline_windows)
    series = await cache.series(
        db, rule.project_id, rule.metric, [*earlier, window], metric_filters(rule.filters)
    )
    baseline = baseline_of([item.value for item in series[:-1]])
    if baseline is None:
        return RuleReading(value=series[-1].value, threshold=None)
    line = anomaly_threshold(baseline, rule.comparator, rule.sensitivity)
    return RuleReading(value=series[-1].value, threshold=line)
