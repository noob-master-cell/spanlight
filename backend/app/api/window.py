"""The `from`/`to` query window shared by trace and metrics endpoints."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Query

from app.core.errors import FieldError, ProblemError

DEFAULT_WINDOW = timedelta(hours=24)
MAX_WINDOW = timedelta(days=90)


@dataclass(frozen=True)
class TimeWindow:
    start: datetime
    end: datetime

    @property
    def length(self) -> timedelta:
        return self.end - self.start

    def previous(self) -> "TimeWindow":
        """The window of equal length immediately before this one.

        A window that starts within one window length of the earliest representable date has no
        previous window; that is the client's input, so it is a 422 rather than a 500.
        """
        try:
            return TimeWindow(start=self.start - self.length, end=self.start)
        except OverflowError:
            raise _out_of_range() from None


def _out_of_range() -> ProblemError:
    return ProblemError(
        422,
        "VALIDATION_ERROR",
        "The time window is outside the supported date range.",
        errors=[FieldError(field="from", message="outside the supported date range")],
    )


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def time_window(
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: Annotated[datetime | None, Query()] = None,
) -> TimeWindow:
    try:
        # Converting an offset near the ends of the calendar, or subtracting the default window
        # from a `to` near its start, leaves the representable range.
        end = _as_utc(to) if to else datetime.now(UTC)
        start = _as_utc(from_) if from_ else end - DEFAULT_WINDOW
    except OverflowError:
        raise _out_of_range() from None
    if start >= end:
        raise ProblemError(
            422,
            "VALIDATION_ERROR",
            "`from` must be earlier than `to`.",
            errors=[FieldError(field="from", message="must be earlier than `to`")],
        )
    if end - start > MAX_WINDOW:
        raise ProblemError(
            422,
            "VALIDATION_ERROR",
            "The time window may span at most 90 days.",
            errors=[FieldError(field="from", message="window exceeds 90 days")],
        )
    return TimeWindow(start=start, end=end)


Window = Annotated[TimeWindow, Depends(time_window)]
