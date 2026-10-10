"""Values as the catalogue templates want them, and rounding for evidence metrics.

Counts, rates and money reuse `app.alerts.formatting`, so an insight and an alert read the same.
Every formatter takes `None` and returns "—": an unknown value is never shown as 0.
"""

from decimal import ROUND_HALF_UP, Decimal
from typing import TypeGuard

from app.alerts import formatting

UNKNOWN = "—"

_ONE_SECOND_MS = Decimal(1000)


def _known(value: Decimal | int | None) -> TypeGuard[Decimal | int]:
    """A real, finite number; `None`, NaN and infinity are unknown."""
    return value is not None and Decimal(value).is_finite()


def text(value: str | None) -> str:
    return UNKNOWN if value is None or value == "" else value


def count(value: int | Decimal | None) -> str:
    """`1 234 567` (thin-space thousands)."""
    return formatting.format_count(Decimal(value)) if _known(value) else UNKNOWN


def count_noun(value: int, singular: str, plural: str | None = None) -> str:
    """A count with its noun, plural-safe: `1 burst`, `3 bursts`, `1 234 sessions`."""
    noun = singular if value == 1 else (plural or f"{singular}s")
    return f"{count(value)} {noun}"


def rate(value: Decimal | None) -> str:
    """A 0..1 share as a percent: `12.5 %`."""
    return formatting.format_rate(Decimal(value)) if _known(value) else UNKNOWN


def money(value: Decimal | None) -> str:
    """`$4.50`, or four decimals under a cent."""
    return formatting.format_money(Decimal(value)) if _known(value) else UNKNOWN


def duration_ms(value: Decimal | int | None) -> str:
    """Milliseconds below one second, seconds with one decimal from there: `850 ms`, `2.0 s`."""
    if not _known(value):
        return UNKNOWN
    millis = Decimal(value).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    if abs(millis) < _ONE_SECOND_MS:
        return f"{formatting.format_count(millis)} ms"
    return f"{round_seconds(millis / _ONE_SECOND_MS)} s"


def ratio(value: Decimal | None) -> str:
    """A multiple with one decimal and no unit: `3.2`."""
    return f"{round_seconds(Decimal(value))}" if _known(value) else UNKNOWN


def round_share(value: Decimal) -> Decimal:
    """Rates and shares: 4 places, half up."""
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def round_ms(value: Decimal) -> Decimal:
    """Milliseconds: 1 place, half up."""
    return value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def round_seconds(value: Decimal) -> Decimal:
    """Seconds (and other one-decimal quantities): 1 place, half up."""
    return value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def round_money(value: Decimal) -> Decimal:
    """Money: 6 places, half up."""
    return value.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
