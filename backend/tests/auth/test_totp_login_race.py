"""A sign-in racing a two-factor enable must not get a session without the second step.

Both sign-in paths read the user once without a lock (the password route to verify against, the
OAuth callback to find or create the account) and decide afterwards whether two-factor
authentication is on. An `enable` that commits in between must be seen. Each race is driven by
hand: the test runs the whole enrolment at the point where the sign-in has read the user and not
yet locked it, so the order does not depend on timing.
"""

import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.v1 import auth as auth_routes
from app.api.v1 import oauth as oauth_routes
from app.auth.oauth_providers import OAuthProfile
from app.db.models import Session, User
from app.services.credentials import LockedUser
from tests.auth.conftest import FakeClock
from tests.auth.oauth_fakes import FakeProviders
from tests.auth.test_oauth_totp import _sign_in
from tests.auth.test_totp_routes import enroll, has_session_cookies, verify_email
from tests.conftest import BrowserFactory, _make_client

SessionFactory = async_sessionmaker[AsyncSession]

LOGIN = "/api/v1/auth/login"
PASSWORD = "correct horse battery"  # what the browser factory signs users up with


async def _session_count(factory: SessionFactory) -> int:
    async with factory() as db:
        return int(await db.scalar(select(func.count()).select_from(Session)) or 0)


async def test_a_password_sign_in_sees_a_two_factor_enable_that_committed_while_it_hashed(
    totp_browser_factory: BrowserFactory,
    totp_client: httpx.AsyncClient,
    session_factory: SessionFactory,
    clock: FakeClock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ada = await totp_browser_factory("ada@example.com")
    sessions_before = await _session_count(session_factory)
    real_lock = auth_routes.lock_user_for_sign_in
    enrolled = False

    async def enable_two_factor_then_lock_the_row(
        db: AsyncSession, user_id: uuid.UUID
    ) -> LockedUser | None:
        nonlocal enrolled
        # The sign-in has read the user (two-factor off) and verified the password. Ada now
        # turns two-factor on in her signed-in browser, and that commits before the row is locked.
        await enroll(ada, clock)
        enrolled = True
        return await real_lock(db, user_id)

    monkeypatch.setattr(auth_routes, "lock_user_for_sign_in", enable_two_factor_then_lock_the_row)

    response = await totp_client.post(
        LOGIN, json={"email": "ada@example.com", "password": PASSWORD}
    )

    assert enrolled
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "totp_required"
    assert response.json()["challenge"]
    assert not has_session_cookies(totp_client)
    assert "set-cookie" not in response.headers
    assert await _session_count(session_factory) == sessions_before


async def test_an_oauth_sign_in_sees_a_two_factor_enable_that_committed_after_it_read_the_user(
    totp_oauth_browser_factory: BrowserFactory,
    totp_oauth_client: httpx.AsyncClient,
    totp_oauth_app: Any,
    session_factory: SessionFactory,
    providers: FakeProviders,
    clock: FakeClock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ada = await totp_oauth_browser_factory("ada@example.com")
    await verify_email(session_factory, "ada@example.com")
    providers.set_github_email("ada@example.com")
    # The first sign-in links GitHub to Ada, so the next one finds the identity and leaves her
    # user row alone (a link would hold it, and the enrolment below would wait for the callback).
    assert (await _sign_in(totp_oauth_client)).headers["location"] == "http://testserver/"
    sessions_before = await _session_count(session_factory)
    real_sign_in = oauth_routes.sign_in_with_profile
    enrolled = False

    async def enable_two_factor_after_the_user_is_read(
        db: AsyncSession, profile: OAuthProfile, *, ip: str | None = None
    ) -> User:
        nonlocal enrolled
        user = await real_sign_in(db, profile, ip=ip)  # two-factor is off in what it read
        await enroll(ada, clock)  # Ada turns it on; that commits before the callback decides
        enrolled = True
        return user

    monkeypatch.setattr(
        oauth_routes, "sign_in_with_profile", enable_two_factor_after_the_user_is_read
    )

    async with _make_client(totp_oauth_app) as second_browser:
        response = await _sign_in(second_browser)

        assert enrolled
        assert response.status_code == 302
        assert response.headers["location"].startswith(
            "http://testserver/login/two-factor#challenge="
        )
        assert not has_session_cookies(second_browser)
    assert await _session_count(session_factory) == sessions_before
