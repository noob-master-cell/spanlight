"""The alert rules and budgets every project of the alert-evaluation load test gets. Pure: no
database, no clock, no files.

A project gets `RULES_PER_PROJECT` rules and `BUDGETS_PER_PROJECT` budgets, 20 evaluations in
all (a budget is evaluated by a hidden rule of its own), so 50 projects make the 1 000 rules the
exit criterion names. The mix is chosen to exercise the evaluation job the way a real project
would, not to be uniform:

- threshold and anomaly rules over every metric a rule may use, with windows from 15 minutes to a
  day and with and without environment, provider and model filters;
- several rules that share `(metric, window, filters)`, so the per-pass `MetricCache` collapses
  their reads. These pairs are marked below; a cache that stopped working would show as time;
- one rule that breaches on the first pass, so the run also covers a state change;
- two budgets, one that only notifies and one that blocks.

No rule names a channel, so a transition writes its event but queues no notification: the load
test measures evaluation, not delivery.
"""

from decimal import Decimal

from app.alerts.rule_spec import RuleSpec
from app.alerts.types import Comparator
from app.budgets.schemas import BudgetSpec
from app.budgets.types import BudgetAction, BudgetPeriod, BudgetScope

# Keep in step with the lists below; the workflow checks the total against this.
RULES_PER_PROJECT = 18
BUDGETS_PER_PROJECT = 2
EVALUATIONS_PER_PROJECT = RULES_PER_PROJECT + BUDGETS_PER_PROJECT


def _threshold(
    name: str,
    metric: str,
    comparator: Comparator,
    threshold: str,
    window_minutes: int,
    **filters: str,
) -> RuleSpec:
    return RuleSpec.model_validate(
        {
            "name": name,
            "kind": "threshold",
            "metric": metric,
            "comparator": comparator.value,
            "threshold": threshold,
            "window_minutes": window_minutes,
            "filters": filters,
        }
    )


def _anomaly(
    name: str,
    metric: str,
    comparator: Comparator,
    window_minutes: int,
    baseline_windows: int,
    sensitivity: str = "3.0",
    **filters: str,
) -> RuleSpec:
    return RuleSpec.model_validate(
        {
            "name": name,
            "kind": "anomaly",
            "metric": metric,
            "comparator": comparator.value,
            "window_minutes": window_minutes,
            "baseline_windows": baseline_windows,
            "sensitivity": sensitivity,
            "filters": filters,
        }
    )


def rule_specs() -> list[RuleSpec]:
    """The threshold and anomaly rules of one project; names are unique within it."""
    gt, lt = Comparator.GT, Comparator.LT
    specs = [
        # An hour of error rate, twice: one MetricCache entry for both.
        _threshold("Error rate above 5 %", "error_rate", gt, "0.05", 60),
        _threshold("Error rate above 15 %", "error_rate", gt, "0.15", 60),
        # An hour of p95 latency, twice.
        _threshold("p95 latency above 8 s", "p95_ms", gt, "8000", 60),
        _threshold("p95 latency above 15 s", "p95_ms", gt, "15000", 60),
        _threshold("Production p95 above 8 s", "p95_ms", gt, "8000", 15, environment="production"),
        _threshold("Time to first token above 3 s", "ttft_p95_ms", gt, "3000", 60),
        # A day of cost, twice.
        _threshold("Daily cost above $5", "cost_usd", gt, "5", 1440),
        _threshold("Daily cost above $20", "cost_usd", gt, "20", 1440),
        _threshold("Traffic stopped", "llm_calls", lt, "1", 60),
        # Breaches on the first pass: the seeded data has calls in the last hour.
        _threshold("Traffic present", "llm_calls", Comparator.GTE, "1", 60),
        _threshold("Daily tokens above 2 M", "tokens", gt, "2000000", 1440),
        _threshold(
            "gpt-4o-mini errors above 10 %", "error_rate", gt, "0.1", 30, model="gpt-4o-mini"
        ),
        _threshold("Anthropic p95 above 10 s", "p95_ms", gt, "10000", 120, provider="anthropic"),
        # Anomaly rules. The first two read the same hourly windows, with baselines of different
        # length: the cache holds each window once, so the second rule reads only the older
        # windows the first did not need.
        _anomaly("Error rate anomaly", "error_rate", gt, 60, 12),
        _anomaly("Error rate anomaly, sensitive", "error_rate", gt, 60, 24, "2.0"),
        _anomaly("Latency anomaly", "p95_ms", gt, 60, 12),
        _anomaly("Call volume drop", "llm_calls", lt, 60, 12),
        # Daily windows against the previous six days: the whole seeded week.
        _anomaly("Daily cost anomaly", "cost_usd", gt, 1440, 6),
    ]
    if len(specs) != RULES_PER_PROJECT:
        raise AssertionError(f"{len(specs)} rules, expected {RULES_PER_PROJECT}")
    return specs


def budget_specs() -> list[BudgetSpec]:
    """The two budgets of one project: a daily one that notifies, a monthly one that blocks."""
    specs = [
        BudgetSpec(
            name="Daily project budget",
            scope=BudgetScope.PROJECT,
            period=BudgetPeriod.DAILY,
            amount_usd=Decimal("25"),
            action=BudgetAction.NOTIFY,
        ),
        BudgetSpec(
            name="Monthly gpt-4o-mini budget",
            scope=BudgetScope.MODEL,
            scope_id="gpt-4o-mini",
            period=BudgetPeriod.MONTHLY,
            amount_usd=Decimal("400"),
            action=BudgetAction.BLOCK,
        ),
    ]
    if len(specs) != BUDGETS_PER_PROJECT:
        raise AssertionError(f"{len(specs)} budgets, expected {BUDGETS_PER_PROJECT}")
    return specs
