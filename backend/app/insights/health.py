"""The project health score: 100 minus penalties for open findings, errors, latency and cost.

Pure: the caller reads the numbers (open insight counts and the metrics over the window and the
window before it); this module only turns them into a score. An unknown input (`None`) penalises
nothing, so the score never drops on data that is not there.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

FINDINGS_CAP = 40
ERRORS_CAP = 30
LATENCY_CAP = 15
COST_CAP = 15

CRITICAL_POINTS = 15
WARNING_POINTS = 5
ERROR_RATE_POINTS = 300

_ZERO = Decimal(0)


@dataclass(frozen=True, slots=True)
class HealthInputs:
    """What the score reads. `error_rate` is a fraction (0.1 is 10 %); baselines are the previous
    window of equal length."""

    open_critical: int
    open_warning: int
    error_rate: Decimal | None
    p95_ms: Decimal | None
    p95_baseline_ms: Decimal | None
    spend_usd: Decimal | None
    spend_baseline_usd: Decimal | None


@dataclass(frozen=True, slots=True)
class Component:
    """One source of penalty: points taken off, what was observed and what it was compared to."""

    name: str
    penalty: int
    observed: Decimal | None
    baseline: Decimal | None


@dataclass(frozen=True, slots=True)
class HealthScore:
    value: int
    components: list[Component]


def health_score(inputs: HealthInputs) -> HealthScore:
    components = [
        _findings(inputs),
        _errors(inputs),
        _latency(inputs),
        _cost(inputs),
    ]
    value = 100 - sum(component.penalty for component in components)
    return HealthScore(value=max(0, min(100, value)), components=components)


def _findings(inputs: HealthInputs) -> Component:
    points = CRITICAL_POINTS * inputs.open_critical + WARNING_POINTS * inputs.open_warning
    observed = Decimal(inputs.open_critical + inputs.open_warning)
    return Component(
        "findings", _round(min(Decimal(FINDINGS_CAP), Decimal(points))), observed, None
    )


def _errors(inputs: HealthInputs) -> Component:
    rate = inputs.error_rate
    penalty = 0 if rate is None else _round(min(Decimal(ERRORS_CAP), ERROR_RATE_POINTS * rate))
    return Component("errors", penalty, rate, None)


def _latency(inputs: HealthInputs) -> Component:
    observed, baseline = inputs.p95_ms, inputs.p95_baseline_ms
    penalty = 0
    if observed is not None and baseline is not None and baseline > _ZERO and observed > baseline:
        penalty = _round(min(Decimal(LATENCY_CAP), LATENCY_CAP * (observed / baseline - 1)))
    return Component("latency", penalty, observed, baseline)


def _cost(inputs: HealthInputs) -> Component:
    observed, baseline = inputs.spend_usd, inputs.spend_baseline_usd
    penalty = 0
    if observed is not None and baseline is not None and observed > baseline > _ZERO:
        penalty = _round(min(Decimal(COST_CAP), COST_CAP * (observed / baseline - 1)))
    return Component("cost", penalty, observed, baseline)


def _round(points: Decimal) -> int:
    """Whole points, halves up."""
    return int(points.quantize(Decimal(1), rounding=ROUND_HALF_UP))
