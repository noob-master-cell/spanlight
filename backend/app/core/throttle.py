"""A throttle that lives in Postgres, so a limit holds across API replicas and restarts.

`check_and_record` is called inside the request's transaction: it either records the call and
returns `None`, or refuses and says how long the caller must wait. The events are plain rows in
`throttle_events`; the cleanup job removes the old ones.
"""

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ThrottleEvent


async def check_and_record(
    db: AsyncSession, scope: str, key: str, limit: int, window: timedelta
) -> float | None:
    """Allow at most `limit` calls per `window` for one `key` within a `scope`.

    Returns `None` and records the call when it is allowed. When the limit is reached it
    records nothing and returns the seconds (always greater than zero) until the oldest counted
    call leaves the window and a slot frees up. Refusals are not recorded, so hammering an
    endpoint never extends its own lockout.

    The call is recorded in the caller's transaction and only counts once the caller commits;
    a request that fails after passing the check and rolls back does not use up an attempt.
    All times come from the database clock, so replicas with skewed clocks agree.
    """
    # Without serialization, concurrent requests all count the same rows, all see room, and all
    # insert: the limit is overshot by the number of requests that raced. The transaction-level
    # advisory lock queues them per (scope, key) until the previous one commits; the next
    # statement then sees its rows (READ COMMITTED takes a fresh snapshot per statement), and
    # the lock is released with the transaction. Unrelated keys do not wait for each other.
    await db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(f"{scope}:{key}", 0))))

    now = (await db.execute(select(func.clock_timestamp()))).scalar_one()
    in_window = (
        ThrottleEvent.scope == scope,
        ThrottleEvent.key == key,
        ThrottleEvent.created_at > now - window,
    )
    count, oldest = (
        await db.execute(select(func.count(), func.min(ThrottleEvent.created_at)).where(*in_window))
    ).one()

    if count >= limit:
        # `oldest` is inside the window, so this is positive.
        return float((oldest + window - now).total_seconds())

    db.add(ThrottleEvent(scope=scope, key=key, created_at=now))
    await db.flush()
    return None
