"""The Postgres throttle: allow `limit` calls per window, then say how long to wait."""

import asyncio
from datetime import timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.throttle import check_and_record
from app.db.models import ThrottleEvent

SessionFactory = async_sessionmaker[AsyncSession]
HOUR = timedelta(hours=1)


async def _call(
    factory: SessionFactory,
    *,
    scope: str = "email_verify",
    key: str = "user-1",
    limit: int = 3,
    window: timedelta = HOUR,
) -> float | None:
    """One request: check, then commit as a route would."""
    async with factory() as db:
        retry_after = await check_and_record(db, scope, key, limit, window)
        await db.commit()
    return retry_after


async def _count(
    factory: SessionFactory, *, scope: str = "email_verify", key: str = "user-1"
) -> int:
    async with factory() as db:
        return int(
            await db.scalar(
                select(func.count())
                .select_from(ThrottleEvent)
                .where(ThrottleEvent.scope == scope, ThrottleEvent.key == key)
            )
            or 0
        )


async def _age(factory: SessionFactory, interval: str, *, oldest_only: bool = False) -> None:
    """Move recorded calls into the past, so a test never has to sleep through a window."""
    statement = "UPDATE throttle_events SET created_at = created_at - CAST(:age AS interval)"
    if oldest_only:
        statement += " WHERE id = (SELECT min(id) FROM throttle_events)"
    async with factory() as db:
        await db.execute(text(statement), {"age": interval})
        await db.commit()


async def test_allows_the_limit_then_returns_a_positive_retry_after(
    session_factory: SessionFactory,
) -> None:
    results = [await _call(session_factory, limit=3) for _ in range(5)]

    assert results[:3] == [None, None, None]
    for retry_after in results[3:]:
        assert retry_after is not None
        assert 0 < retry_after <= HOUR.total_seconds()


async def test_a_refused_call_is_not_recorded(session_factory: SessionFactory) -> None:
    for _ in range(5):
        await _call(session_factory, limit=3)

    # Recording refusals would keep an attacker locked out for as long as they keep trying.
    assert await _count(session_factory) == 3


async def test_retry_after_is_when_the_oldest_call_leaves_the_window(
    session_factory: SessionFactory,
) -> None:
    await _call(session_factory, limit=2)
    await _call(session_factory, limit=2)
    await _age(session_factory, "50 minutes", oldest_only=True)

    retry_after = await _call(session_factory, limit=2)

    assert retry_after is not None
    assert 590 < retry_after <= 600  # the oldest call is 50 of the 60 minutes old


async def test_allows_again_once_the_window_has_passed(session_factory: SessionFactory) -> None:
    for _ in range(3):
        assert await _call(session_factory, limit=3) is None
    assert await _call(session_factory, limit=3) is not None

    await _age(session_factory, "2 hours")

    assert await _call(session_factory, limit=3) is None


async def test_scopes_and_keys_are_counted_separately(session_factory: SessionFactory) -> None:
    for _ in range(3):
        await _call(session_factory, scope="a", key="x", limit=3)
    assert await _call(session_factory, scope="a", key="x", limit=3) is not None

    assert await _call(session_factory, scope="a", key="y", limit=3) is None
    assert await _call(session_factory, scope="b", key="x", limit=3) is None


async def test_the_call_is_recorded_in_the_callers_transaction(
    session_factory: SessionFactory,
) -> None:
    async with session_factory() as db:
        assert await check_and_record(db, "email_verify", "user-1", 3, HOUR) is None
        await db.rollback()

    # A request that fails after passing the check must not use up an attempt.
    assert await _count(session_factory) == 0


async def test_concurrent_calls_never_exceed_the_limit(session_factory: SessionFactory) -> None:
    limit, callers = 4, 8

    results = await asyncio.gather(*(_call(session_factory, limit=limit) for _ in range(callers)))

    assert sum(result is None for result in results) == limit
    assert await _count(session_factory) == limit
