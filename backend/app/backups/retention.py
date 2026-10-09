"""Which backups to keep. A pure function over a listing, so it needs no store to reason about.

The policy: the newest backup of each of the last 14 UTC days (today included), plus the newest
backup made on a Sunday of each of the last 8 Sundays (today included when it is one). Everything
else under `backups/` that this code created is deleted. Anything it does not recognise is left
alone, and so is the newest backup overall, so a long run of failed backups can never leave the
bucket empty.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from app.storage.object_store import ObjectInfo

BACKUP_PREFIX = "backups/"
DAILY_KEEP_DAYS = 14
WEEKLY_KEEP_WEEKS = 8

_SUNDAY = 6  # date.weekday(): Monday is 0
_KEY_PATTERN = re.compile(
    r"^backups/(?P<year>\d{4})/(?P<month>\d{2})/(?P<day>\d{2})/"
    r"spanlight-(?P<stamp>\d{8}T\d{6}Z)\.dump$"
)
_STAMP_FORMAT = "%Y%m%dT%H%M%SZ"


@dataclass(frozen=True, slots=True)
class _Backup:
    key: str
    taken_at: datetime


def backup_key(taken_at: datetime) -> str:
    """The key for a backup taken at `taken_at`: `backups/YYYY/MM/DD/spanlight-<stamp>.dump`."""
    moment = taken_at.astimezone(UTC)
    return f"{BACKUP_PREFIX}{moment:%Y/%m/%d}/spanlight-{moment.strftime(_STAMP_FORMAT)}.dump"


def parse_backup_key(key: str) -> datetime | None:
    """When the backup under `key` was taken, or None if `key` is not one this code wrote.

    The directory date must agree with the timestamp in the name; a key where they differ was
    not produced by `backup_key` and is treated as unknown.
    """
    match = _KEY_PATTERN.fullmatch(key)
    if match is None:
        return None
    try:
        taken_at = datetime.strptime(match["stamp"], _STAMP_FORMAT).replace(tzinfo=UTC)
    except ValueError:
        return None
    directory = (int(match["year"]), int(match["month"]), int(match["day"]))
    if directory != (taken_at.year, taken_at.month, taken_at.day):
        return None
    return taken_at


def prune_backups(objects: Iterable[ObjectInfo], now: datetime) -> list[str]:
    """The keys to delete, sorted. Keys that are not backups are never returned."""
    today = now.astimezone(UTC).date()
    backups = [
        _Backup(info.key, taken_at)
        for info in objects
        if (taken_at := parse_backup_key(info.key)) is not None
    ]
    if not backups:
        return []

    keep = {max(backups, key=_newest_first).key}
    keep |= _newest_per_day(backups, _daily_window(today))
    keep |= _newest_per_day(
        [backup for backup in backups if backup.taken_at.weekday() == _SUNDAY],
        _sunday_window(today),
    )
    # A timestamp ahead of the clock (skew between hosts) is kept rather than guessed about.
    return sorted(
        backup.key
        for backup in backups
        if backup.key not in keep and backup.taken_at.date() <= today
    )


def _newest_first(backup: _Backup) -> tuple[datetime, str]:
    return backup.taken_at, backup.key


def _daily_window(today: date) -> frozenset[date]:
    return frozenset(today - timedelta(days=offset) for offset in range(DAILY_KEEP_DAYS))


def _sunday_window(today: date) -> frozenset[date]:
    since_sunday = (today.weekday() - _SUNDAY) % 7
    latest = today - timedelta(days=since_sunday)
    return frozenset(latest - timedelta(weeks=offset) for offset in range(WEEKLY_KEEP_WEEKS))


def _newest_per_day(backups: Iterable[_Backup], days: frozenset[date]) -> set[str]:
    newest: dict[date, _Backup] = {}
    for backup in backups:
        day = backup.taken_at.date()
        if day in days and (
            day not in newest or _newest_first(backup) > _newest_first(newest[day])
        ):
            newest[day] = backup
    return {backup.key for backup in newest.values()}
