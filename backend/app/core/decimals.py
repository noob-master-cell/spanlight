"""One canonical text form for decimals in JSON: normalised, never an exponent."""

from decimal import Decimal


def decimal_to_str(value: Decimal) -> str:
    """`Decimal("0.0500")` -> `"0.05"`, `Decimal("1E+2")` -> `"100"`, any zero -> `"0"`."""
    if value == 0:
        return "0"
    return format(value.normalize(), "f")
