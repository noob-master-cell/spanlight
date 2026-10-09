"""Which store a metrics read comes from: raw spans or hourly rollups."""

from datetime import timedelta
from typing import Literal

from app.api.window import TimeWindow

MetricsSource = Literal["raw", "rollups"]

RAW_MAX_WINDOW = timedelta(hours=24)
"""The longest window read from the raw spans, where percentiles are exact."""


def choose_source(window: TimeWindow) -> MetricsSource:
    """Windows of 24 hours or less read raw spans; longer windows read the hourly rollups.

    The previous period of an overview has the same length as the current one, so it picks the
    same source and both sides of a comparison are computed the same way.
    """
    return "raw" if window.length <= RAW_MAX_WINDOW else "rollups"
