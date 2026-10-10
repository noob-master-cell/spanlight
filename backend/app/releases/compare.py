"""Release comparison arithmetic. Pure: no database, no clock."""

from collections.abc import Sequence
from decimal import ROUND_HALF_EVEN, Decimal

from app.api.schemas.releases import (
    Comparison,
    Delta,
    ErrorClassChange,
    ModelShare,
    NewError,
    ReleaseStats,
)
from app.releases.schemas import ErrorClassCount, ModelCount

# The headline figures `deltas` reports, in display order.
DELTA_METRICS = (
    "traces",
    "llm_calls",
    "error_rate",
    "p50_ms",
    "p95_ms",
    "cost_usd",
    "input_tokens",
    "output_tokens",
)

_RELATIVE_STEP = Decimal("0.0001")


def delta(a: Decimal | None, b: Decimal | None) -> Delta | None:
    """The change from `a` to `b`; `None` when either is unknown, no relative change from 0.

    `relative` is rounded to four places (0.1234 is 12.34 %) so the wire value is stable.
    """
    if a is None or b is None:
        return None
    absolute = b - a
    relative = None if a == 0 else (absolute / a).quantize(_RELATIVE_STEP, ROUND_HALF_EVEN)
    return Delta(absolute=absolute, relative=relative)


def _decimal(value: float | int | Decimal | None) -> Decimal | None:
    # str() first: Decimal(0.1) would carry the binary expansion of the float.
    return None if value is None else Decimal(str(value))


def _deltas(a: ReleaseStats, b: ReleaseStats) -> dict[str, Delta | None]:
    return {
        metric: delta(_decimal(getattr(a, metric)), _decimal(getattr(b, metric)))
        for metric in DELTA_METRICS
    }


def _shares(counts: Sequence[ModelCount], llm_calls: int) -> dict[str | None, float]:
    """Each model's share of all the release's calls (the counts may list only the busiest)."""
    return {item.model: item.calls / llm_calls for item in counts} if llm_calls else {}


def _model_mix(
    a: Sequence[ModelCount], b: Sequence[ModelCount], a_calls: int, b_calls: int
) -> list[ModelShare]:
    """Each model's share of each side's calls; a side with no calls has `None` shares."""
    a_shares, b_shares = _shares(a, a_calls), _shares(b, b_calls)
    mix = [
        ModelShare(
            model=model,
            a_share=a_shares.get(model, 0.0) if a_calls else None,
            b_share=b_shares.get(model, 0.0) if b_calls else None,
        )
        for model in sorted(a_shares.keys() | b_shares.keys(), key=lambda m: (m is None, m or ""))
    ]
    return sorted(mix, key=lambda item: -max(item.a_share or 0.0, item.b_share or 0.0))


def _error_classes(
    a: Sequence[ErrorClassCount], b: Sequence[ErrorClassCount]
) -> list[ErrorClassChange]:
    a_counts = {item.error_class: item.count for item in a}
    b_counts = {item.error_class: item.count for item in b}
    changes = [
        ErrorClassChange(
            error_class=error_class,
            a_count=a_counts.get(error_class, 0),
            b_count=b_counts.get(error_class, 0),
        )
        for error_class in sorted(
            a_counts.keys() | b_counts.keys(), key=lambda c: (c is None, c or "")
        )
    ]
    return sorted(changes, key=lambda item: -(item.a_count + item.b_count))


def compare(
    a: ReleaseStats,
    b: ReleaseStats,
    a_models: Sequence[ModelCount],
    b_models: Sequence[ModelCount],
    a_classes: Sequence[ErrorClassCount],
    b_classes: Sequence[ErrorClassCount],
    new_errors: Sequence[NewError],
) -> Comparison:
    """Everything the comparison screen shows about `b` against the baseline `a`."""
    return Comparison(
        a=a,
        b=b,
        deltas=_deltas(a, b),
        model_mix=_model_mix(a_models, b_models, a.llm_calls, b.llm_calls),
        error_classes=_error_classes(a_classes, b_classes),
        new_errors=list(new_errors),
    )
