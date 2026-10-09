"""The gateway's rate limits as arithmetic. Pure: no database, no I/O.

Requests per minute (a key's `rpm_limit`, and the organization ceiling) are token buckets that
refill continuously: `limit` tokens a minute, bursts of up to `limit`. Tokens per minute (a key's
`tpm_limit`) is a fixed window per clock minute in UTC: once the minute's recorded tokens reach
the limit, calls are refused until the next minute starts. A call is admitted while the minute
is under the limit, so the call that crosses it is let through and its tokens still count; the
limit is not known to be crossed until the provider reports the usage.
"""

import math
import uuid
from datetime import UTC, datetime, timedelta

from app.core.ratelimit import PostgresTokenBucket

WINDOW = timedelta(minutes=1)


def per_minute_bucket(limit: int) -> PostgresTokenBucket:
    """A bucket that admits `limit` requests a minute on average, `limit` at once at most."""
    return PostgresTokenBucket(rate=limit / 60, burst=limit)


def org_bucket_key(org_id: uuid.UUID) -> str:
    return f"gw:org:{org_id}"


def key_bucket_key(key_id: uuid.UUID) -> str:
    return f"gw:{key_id}"


def minute_start(now: datetime) -> datetime:
    """The start of the UTC clock minute that `now` falls in."""
    return now.astimezone(UTC).replace(second=0, microsecond=0)


def seconds_until_next_minute(now: datetime) -> int:
    """Whole seconds until the next minute starts, rounded up, and at least 1."""
    remaining = (minute_start(now) + WINDOW - now).total_seconds()
    return max(1, math.ceil(remaining))


def tpm_retry_after(used: int | None, limit: int, now: datetime) -> int | None:
    """Seconds to wait when the minute's `used` tokens have reached `limit`, else None.

    `used` is None when nothing was recorded in the minute yet.
    """
    if used is None or used < limit:
        return None
    return seconds_until_next_minute(now)
