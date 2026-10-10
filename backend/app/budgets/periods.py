"""A budget's period: the UTC day or month its spend is summed over. Pure: no I/O.

A daily budget starts again at 00:00 UTC, a monthly one at 00:00 UTC on the first of the month.
"""

from datetime import UTC, datetime, timedelta

from app.api.window import TimeWindow
from app.budgets.types import BudgetPeriod


def _utc(now: datetime) -> datetime:
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    return now.astimezone(UTC)


def period_start(period: BudgetPeriod, now: datetime) -> datetime:
    """When the period containing `now` began."""
    day = _utc(now).replace(hour=0, minute=0, second=0, microsecond=0)
    return day if period is BudgetPeriod.DAILY else day.replace(day=1)


def period_window(period: BudgetPeriod, now: datetime) -> TimeWindow:
    """The period so far: from its start to `now`. Empty at the very instant it starts."""
    return TimeWindow(start=period_start(period, now), end=_utc(now))


def next_reset(period: BudgetPeriod, now: datetime) -> datetime:
    """When the period containing `now` ends and the next one starts."""
    start = period_start(period, now)
    if period is BudgetPeriod.DAILY:
        return start + timedelta(days=1)
    if start.month == 12:
        return start.replace(year=start.year + 1, month=1)
    return start.replace(month=start.month + 1)
