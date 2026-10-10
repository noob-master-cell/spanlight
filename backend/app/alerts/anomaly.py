"""Anomaly baseline from previous windows. Pure `Decimal` arithmetic."""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from app.alerts.types import Comparator

MIN_BASELINE_VALUES = 3
_STDEV_FLOOR_RATIO = Decimal("0.1")
# The band edge is a mean plus a multiple of a square root: 28 significant digits. Six decimal
# places are more than any metric needs, and the preview and the stored event share them.
THRESHOLD_QUANTUM = Decimal("0.000001")


@dataclass(frozen=True, slots=True)
class Baseline:
    mean: Decimal
    stdev: Decimal
    n: int


def baseline_of(values: Sequence[Decimal | None]) -> Baseline | None:
    """Mean and sample standard deviation (divisor n - 1) of the non-null values.

    Returns `None` with fewer than `MIN_BASELINE_VALUES` known values: too little
    history to call anything anomalous.
    """
    known = [v for v in values if v is not None]
    n = len(known)
    if n < MIN_BASELINE_VALUES:
        return None
    mean = sum(known, Decimal(0)) / n
    variance = sum(((v - mean) ** 2 for v in known), Decimal(0)) / (n - 1)
    return Baseline(mean=mean, stdev=variance.sqrt(), n=n)


def anomaly_threshold(baseline: Baseline, comparator: Comparator, sensitivity: Decimal) -> Decimal:
    """Band edge `sensitivity` spreads from the mean.

    The spread is the stdev, floored at 10% of the mean so a flat baseline still
    leaves room. Upper rules (`gt`, `gte`) get `mean + band`; lower rules
    (`lt`, `lte`) get `mean - band`, never below 0. Rounded to 6 decimal places.
    """
    spread = max(baseline.stdev, _STDEV_FLOOR_RATIO * baseline.mean)
    band = sensitivity * spread
    if comparator in (Comparator.GT, Comparator.GTE):
        return _rounded(baseline.mean + band)
    return _rounded(max(baseline.mean - band, Decimal(0)))


def _rounded(threshold: Decimal) -> Decimal:
    try:
        return threshold.quantize(THRESHOLD_QUANTUM)
    except InvalidOperation:
        # Too many integer digits to keep six decimals within the context's precision.
        return threshold
