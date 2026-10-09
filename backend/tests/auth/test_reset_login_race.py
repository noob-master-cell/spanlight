"""A sign-in racing a password change must not keep a session the change was meant to end.

Each race is driven by hand, not by timing. The test holds one side inside its transaction,
starts the other, waits until Postgres reports that the other is blocked on a lock, and only then
lets the first commit. Both orders are covered: the sign-in gets the user row first, or the
reset does.
"""

import asyncio
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import event, func, select, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from typer.testing import CliRunner

from app import cli
from app.api.deps import utcnow
from app.api.v1 import auth as auth_routes
from app.auth.email_tokens import issue_token
from app.auth.password_reset import complete_password_reset
from app.config import get_settings
from app.core.security import hash_password, verify_password
from app.db.models import EmailTokenKind, LoginAttempt, Session, User
from app.services.credentials import LockedUser, lock_user_for_sign_in, replace_password
from app.services.sessions import create_session
from tests.conftest import BrowserFactory

SessionFactory = async_sessionmaker[AsyncSession]

LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"
OLD_PASSWORD = "correct horse battery"  # what the browser factory signs users up with
NEW_PASSWORD = "a brand new passphrase"
WAIT_LIMIT_SECONDS = 10

SignInLock = Callable[[AsyncSession, uuid.UUID], Awaitable[LockedUser | None]]


async def _wait_until_a_query_waits_for_a_lock(factory: SessionFactory) -> None:
    """Return once some backend is blocked on a lock; fail if none ever is.

    Each look uses a fresh transaction, because `pg_stat_activity` is read as one snapshot per
    transaction and a long-lived one would never see the change.
    """
    deadline = time.monotonic() + WAIT_LIMIT_SECONDS
    while time.monotonic() < deadline:
        async with factory() as db:
            waiting = await db.scalar(
                text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE wait_event_type = 'Lock' AND datname = current_database()"
                )
            )
        if waiting:
            return
        await asyncio.sleep(0.01)
    pytest.fail("nothing waited for a lock: the two sides do not meet on the user row")


async def _session_count(factory: SessionFactory, user_id: uuid.UUID) -> int:
    async with factory() as db:
        count = await db.scalar(
            select(func.count()).select_from(Session).where(Session.user_id == user_id)
        )
    return int(count or 0)


async def _reset_token(factory: SessionFactory, user_id: uuid.UUID) -> str:
    async with factory() as db:
        raw = await issue_token(db, user_id, EmailTokenKind.RESET, timedelta(hours=1))
        await db.commit()
    return raw


def _patch_sign_in_lock(monkeypatch: pytest.MonkeyPatch, wrapper: SignInLock) -> None:
    """Run `wrapper` where the sign-in route locks the user row after the password verified."""
    monkeypatch.setattr(auth_routes, "lock_user_for_sign_in", wrapper)


# --- the sign-in gets the user row first ----------------------------------------------------


async def test_a_sign_in_that_locks_the_user_first_has_its_session_ended_by_the_reset(
    browser_factory: BrowserFactory,
    client: httpx.AsyncClient,
    session_factory: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    browser = await browser_factory("ada@example.com")
    user_id = uuid.UUID(browser.user["id"])
    raw = await _reset_token(session_factory, user_id)
    real_lock = auth_routes.lock_user_for_sign_in
    reset_task: asyncio.Task[bool] | None = None

    async with session_factory() as reset_db:

        async def start_the_reset_once_the_sign_in_holds_the_row(
            db: AsyncSession, uid: uuid.UUID
        ) -> LockedUser | None:
            nonlocal reset_task
            locked = await real_lock(db, uid)  # the sign-in now holds the row
            reset_task = asyncio.create_task(
                complete_password_reset(reset_db, raw, NEW_PASSWORD, ip=None)
            )
            await _wait_until_a_query_waits_for_a_lock(session_factory)  # the reset is stuck
            return locked

        _patch_sign_in_lock(monkeypatch, start_the_reset_once_the_sign_in_holds_the_row)

        response = await client.post(
            LOGIN, json={"email": "ada@example.com", "password": OLD_PASSWORD}
        )

        # The sign-in won: it was valid when it took the row and it committed its session.
        assert response.status_code == 200
        assert reset_task is not None and await reset_task is True
        await reset_db.commit()

    assert await _session_count(session_factory, user_id) == 0
    assert (await client.get(ME)).status_code == 401  # the cookie it was just given is dead


# --- the reset gets the user row first ------------------------------------------------------


async def test_a_sign_in_that_verified_the_old_password_is_refused_once_a_reset_commits(
    browser_factory: BrowserFactory,
    client: httpx.AsyncClient,
    session_factory: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    browser = await browser_factory("ada@example.com")
    user_id = uuid.UUID(browser.user["id"])
    raw = await _reset_token(session_factory, user_id)
    real_lock = auth_routes.lock_user_for_sign_in

    async with session_factory() as reset_db:

        async def reset_holds_the_row_then_commits(
            db: AsyncSession, uid: uuid.UUID
        ) -> LockedUser | None:
            # The sign-in has already read the old hash and verified the old password. The reset
            # now changes it, but has not committed.
            assert await complete_password_reset(reset_db, raw, NEW_PASSWORD, ip=None)
            check = asyncio.create_task(real_lock(db, uid))
            await _wait_until_a_query_waits_for_a_lock(session_factory)  # the sign-in is stuck
            await reset_db.commit()
            return await check

        _patch_sign_in_lock(monkeypatch, reset_holds_the_row_then_commits)

        response = await client.post(
            LOGIN, json={"email": "ada@example.com", "password": OLD_PASSWORD}
        )

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"
    assert "set-cookie" not in response.headers
    assert await _session_count(session_factory, user_id) == 0
    async with session_factory() as db:
        attempt = (await db.scalars(select(LoginAttempt))).one()
    assert attempt.succeeded is False  # counted against the throttle like any wrong password


async def test_a_sign_in_after_a_reset_has_committed_needs_the_new_password(
    browser_factory: BrowserFactory,
    client: httpx.AsyncClient,
    session_factory: SessionFactory,
) -> None:
    browser = await browser_factory("ada@example.com")
    raw = await _reset_token(session_factory, uuid.UUID(browser.user["id"]))
    async with session_factory() as db:
        assert await complete_password_reset(db, raw, NEW_PASSWORD, ip=None)
        await db.commit()

    old = await client.post(LOGIN, json={"email": "ada@example.com", "password": OLD_PASSWORD})
    new = await client.post(LOGIN, json={"email": "ada@example.com", "password": NEW_PASSWORD})

    assert (old.status_code, new.status_code) == (401, 200)


# --- the same two orders for the operator's CLI ---------------------------------------------


async def test_the_cli_reset_ends_a_session_a_sign_in_is_creating(
    browser_factory: BrowserFactory,
    session_factory: SessionFactory,
    app_database_url: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    browser = await browser_factory("ada@example.com")
    user_id = uuid.UUID(browser.user["id"])
    monkeypatch.setenv("DATABASE_URL", app_database_url)
    get_settings.cache_clear()
    try:
        async with session_factory() as login_db:
            # A sign-in as the route does it, stopped before its commit.
            user = await login_db.scalar(select(User).where(User.email == "ada@example.com"))
            assert user is not None
            assert verify_password(user.password_hash, OLD_PASSWORD)
            locked = await lock_user_for_sign_in(login_db, user.id)
            assert locked is not None and locked.has_password_hash(user.password_hash)
            await create_session(login_db, user.id, now=utcnow(), ip=None, user_agent=None)

            cli_run = asyncio.create_task(
                asyncio.to_thread(
                    CliRunner().invoke,
                    cli.app,
                    ["reset-password", "--email", "ada@example.com"],
                    input=f"{NEW_PASSWORD}\n{NEW_PASSWORD}\n",
                )
            )
            await _wait_until_a_query_waits_for_a_lock(session_factory)  # the CLI is stuck
            await login_db.commit()
            result = await cli_run
    finally:
        get_settings.cache_clear()

    assert result.exit_code == 0, result.output
    assert await _session_count(session_factory, user_id) == 0


async def test_a_sign_in_check_waits_for_a_pending_password_change_and_then_fails(
    browser_factory: BrowserFactory, session_factory: SessionFactory
) -> None:
    # `replace_password` is the step the CLI and the email reset share. Here it is left
    # uncommitted, which is where a sign-in that verified the old hash arrives.
    browser = await browser_factory("ada@example.com")
    user_id = uuid.UUID(browser.user["id"])
    async with session_factory() as db:
        old_hash = (await db.scalars(select(User.password_hash))).one()

    async with session_factory() as cli_db:
        user = await cli_db.get(User, user_id)
        assert user is not None
        await replace_password(cli_db, user, hash_password(NEW_PASSWORD))
        async with session_factory() as login_db:
            check = asyncio.create_task(lock_user_for_sign_in(login_db, user_id))
            await _wait_until_a_query_waits_for_a_lock(session_factory)  # the sign-in is stuck
            await cli_db.commit()
            locked = await check
            assert locked is not None and not locked.has_password_hash(old_hash)

    assert await _session_count(session_factory, user_id) == 0


# --- the order that makes it work -----------------------------------------------------------


async def test_the_new_hash_is_written_before_the_sessions_are_deleted(
    browser_factory: BrowserFactory, engine: AsyncEngine, session_factory: SessionFactory
) -> None:
    browser = await browser_factory("ada@example.com")
    raw = await _reset_token(session_factory, uuid.UUID(browser.user["id"]))
    statements: list[str] = []

    def record(_conn: Connection, _cursor: Any, statement: str, *_rest: Any) -> None:
        statements.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", record)
    try:
        async with session_factory() as db:
            assert await complete_password_reset(db, raw, NEW_PASSWORD, ip=None)
            await db.commit()
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", record)

    new_hash_written = next(
        i
        for i, sql in enumerate(statements)
        if sql.startswith("UPDATE users") and "password_hash" in sql
    )
    delete_sessions = next(
        i for i, sql in enumerate(statements) if sql.startswith("DELETE FROM sessions")
    )
    assert new_hash_written < delete_sessions
