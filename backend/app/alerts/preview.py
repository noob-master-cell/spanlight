"""The rule editor's preview: what a rule definition would have measured over the last 7 days.

Points are spaced by the smallest multiple of the window that is at least an hour (`step_minutes`):
at most 168. Each point is the metric over the rule's own window ending at that point. The newest
point ends at the current minute for windows under an hour, and at the start of the current hour
for longer ones, so that older windows are made mostly of whole rollup hours instead of raw spans;
the job, which runs every minute, read that same window then. Because the step is a multiple of the
window, the points' windows and their baseline windows lie on one grid and are shared.

A threshold rule's line is its threshold at every point. An anomaly rule's line at a point is
computed exactly as the evaluation job computes it: from the metric over the `baseline_windows`
back-to-back windows right before that point's window (`rules.previous_windows`), `None` while
fewer than three of them are known. Every window needed, the points' and their baselines', is
read with one `metric_series` call; windows shared between points are read once.
"""

import math
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.anomaly import anomaly_threshold, baseline_of
from app.alerts.metrics import MetricValue, metric_series
from app.alerts.rule_spec import RuleDefinition
from app.alerts.rules import metric_filters, previous_windows, trailing_window
from app.alerts.types import AlertRuleKind
from app.api.window import TimeWindow
from app.rollups.compute import floor_hour

PREVIEW_SPAN = timedelta(days=7)
MIN_STEP_MINUTES = 60

WindowKey = tuple[datetime, datetime]


@dataclass(frozen=True, slots=True)
class PreviewPoint:
    window_end: datetime
    value: Decimal | None
    threshold: Decimal | None


@dataclass(frozen=True, slots=True)
class Preview:
    points: list[PreviewPoint]
    # Whether any value read is a histogram estimate (a percentile over rollup hours).
    approximate: bool


def step_minutes(window_minutes: int) -> int:
    """The smallest multiple of the window that is at least an hour."""
    return window_minutes * math.ceil(MIN_STEP_MINUTES / window_minutes)


def preview_ends(now: datetime, window_minutes: int) -> list[datetime]:
    """The points' window ends, oldest first.

    The last is `now` to the minute for windows under an hour, else the start of the hour.
    """
    step = timedelta(minutes=step_minutes(window_minutes))
    count = int(PREVIEW_SPAN / step)
    hourly = window_minutes >= MIN_STEP_MINUTES
    last = floor_hour(now) if hourly else now.replace(second=0, microsecond=0)
    return [last - step * index for index in range(count - 1, -1, -1)]


def _key(window: TimeWindow) -> WindowKey:
    return (window.start, window.end)


def windows_to_read(
    point_windows: Sequence[TimeWindow], baseline_windows: int
) -> tuple[list[TimeWindow], dict[TimeWindow, list[TimeWindow]]]:
    """Every distinct window the preview reads, oldest first, and each point's baseline windows.

    `baseline_windows` 0 (a threshold rule) reads the points' windows only.
    """
    baselines = {
        window: previous_windows(window, baseline_windows) if baseline_windows else []
        for window in point_windows
    }
    distinct: dict[WindowKey, TimeWindow] = {}
    for window in point_windows:
        for needed in (*baselines[window], window):
            distinct.setdefault(_key(needed), needed)
    ordered = sorted(distinct.values(), key=_key)
    return ordered, baselines


def anomaly_line(
    baseline_values: Sequence[Decimal | None], definition: RuleDefinition
) -> Decimal | None:
    """The anomaly threshold from a point's baseline values, or `None` without a baseline."""
    if definition.sensitivity is None:
        raise ValueError("an anomaly rule needs a sensitivity")
    baseline = baseline_of(baseline_values)
    if baseline is None:
        return None
    return anomaly_threshold(baseline, definition.comparator, definition.sensitivity)


async def preview_rule(
    db: AsyncSession, project_id: uuid.UUID, definition: RuleDefinition, *, now: datetime
) -> Preview:
    """The 7-day preview of `definition` in the project. The transaction is bound to it."""
    anomaly = definition.rule_kind is AlertRuleKind.ANOMALY
    ends = preview_ends(now, definition.window_minutes)
    point_windows = [trailing_window(end, definition.window_minutes) for end in ends]
    ordered, baselines = windows_to_read(
        point_windows, (definition.baseline_windows or 0) if anomaly else 0
    )
    filters: dict[str, Any] = {key: value for key, value in definition.filters.items()}
    series: list[MetricValue] = await metric_series(
        db, project_id, definition.metric, ordered, metric_filters(filters), now=now
    )
    read = {_key(window): item for window, item in zip(ordered, series, strict=True)}
    points = []
    for end, window in zip(ends, point_windows, strict=True):
        if anomaly:
            line = anomaly_line([read[_key(w)].value for w in baselines[window]], definition)
        else:
            line = definition.threshold
        points.append(PreviewPoint(window_end=end, value=read[_key(window)].value, threshold=line))
    return Preview(points=points, approximate=any(item.approximate for item in series))
