"""Signing in with GitHub or Google as a user who has two-factor authentication on.

The provider vouches for who the person is; it says nothing about the second factor. So the
callback must stop short of a session and send the browser to the second step instead.
"""

import uuid
from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.login_challenge import read_challenge
from app.config import Settings
from app.core.security import hash_password
from app.db.models import AuditEvent, OAuthIdentity, Session, User
from app.services.credentials import replace_password
from tests.auth.conftest import FakeClock
from tests.auth.oauth_fakes import FakeProviders
from tests.auth.test_totp_routes import VERIFY, enroll, verify_email
from tests.conftest import TEST_ORIGIN, BrowserFactory, _make_client
from tests.helpers import Browser, create_workspace

SessionFactory = async_sessionmaker[AsyncSession]

PREFIX = "/api/v1/auth/oauth"
ME = "/api/v1/auth/me"


def _state_of(location: str) -> str:
    return parse_qs(urlsplit(location).query)["state"][0]


async def _sign_in(client: httpx.AsyncClient, *, next: str | None = None) -> httpx.Response:
    params = {"intent": "sign_in", **({"next": next} if next else {})}
    started = await client.get(f"{PREFIX}/github/start", params=params)
    assert started.status_code == 302, started.text
    return await client.get(
        f"{PREFIX}/github/callback",
        params={"code": "the-code", "state": _state_of(started.headers["location"])},
    )


async def _totp_user_with_github(
    browser_factory: BrowserFactory,
    session_factory: SessionFactory,
    providers: FakeProviders,
    clock: FakeClock,
) -> tuple[str, list[str]]:
    """Ada, verified, with 2FA on and GitHub reporting her verified address."""
    ada = await browser_factory("ada@example.com")
    await verify_email(session_factory, "ada@example.com")
    providers.set_github_email("ada@example.com")
    return await enroll(ada, clock)


async def test_the_callback_for_a_totp_user_redirects_to_the_second_step_without_a_session(
    totp_oauth_browser_factory: BrowserFactory,
    totp_oauth_client: httpx.AsyncClient,
    session_factory: SessionFactory,
    providers: FakeProviders,
    clock: FakeClock,
) -> None:
    await _totp_user_with_github(totp_oauth_browser_factory, session_factory, providers, clock)
    sessions_before = len(await _all_sessions(session_factory))

    response = await _sign_in(totp_oauth_client)

    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith(f"{TEST_ORIGIN}/login/two-factor#challenge=")
    assert "spl_session" not in totp_oauth_client.cookies
    assert "spl_csrf" not in totp_oauth_client.cookies
    assert not any(
        header.startswith(("spl_session=", "spl_csrf="))
        for header in response.headers.get_list("set-cookie")
    )
    assert len(await _all_sessions(session_factory)) == sessions_before
    assert response.headers["cache-control"] == "no-store"
    # The one-time state cookie is spent either way.
    assert any(
        header.startswith("spl_oauth=") and "Max-Age=0" in header
        for header in response.headers.get_list("set-cookie")
    )
    assert (await totp_oauth_client.get(ME)).status_code == 401


async def test_the_challenge_in_the_redirect_names_the_user_and_expires_in_five_minutes(
    totp_oauth_browser_factory: BrowserFactory,
    totp_oauth_client: httpx.AsyncClient,
    totp_oauth_app: object,
    session_factory: SessionFactory,
    providers: FakeProviders,
    clock: FakeClock,
) -> None:
    ada = await totp_oauth_browser_factory("ada@example.com")
    await verify_email(session_factory, "ada@example.com")
    providers.set_github_email("ada@example.com")
    await enroll(ada, clock)

    response = await _sign_in(totp_oauth_client)

    challenge = urlsplit(response.headers["location"]).fragment.removeprefix("challenge=")
    settings: Settings = totp_oauth_app.state.settings  # type: ignore[attr-defined]
    claims = read_challenge(settings, challenge, clock())
    assert claims is not None
    assert claims.user_id == uuid.UUID(ada.user["id"])
    assert read_challenge(settings, challenge, clock() + timedelta(minutes=5)) is None


async def test_the_second_step_after_a_provider_sign_in_creates_the_session(
    totp_oauth_browser_factory: BrowserFactory,
    totp_oauth_client: httpx.AsyncClient,
    session_factory: SessionFactory,
    providers: FakeProviders,
    clock: FakeClock,
) -> None:
    secret, _ = await _totp_user_with_github(
        totp_oauth_browser_factory, session_factory, providers, clock
    )
    redirect = await _sign_in(totp_oauth_client)
    challenge = urlsplit(redirect.headers["location"]).fragment.removeprefix("challenge=")

    wrong = await totp_oauth_client.post(VERIFY, json={"challenge": challenge, "code": "000000"})
    right = await totp_oauth_client.post(
        VERIFY, json={"challenge": challenge, "code": clock.next_code(secret)}
    )

    assert wrong.status_code == 401
    assert right.status_code == 200, right.text
    assert right.json()["status"] == "signed_in"
    assert (await totp_oauth_client.get(ME)).status_code == 200


async def test_an_existing_identity_also_stops_at_the_second_step(
    totp_oauth_browser_factory: BrowserFactory,
    totp_oauth_client: httpx.AsyncClient,
    session_factory: SessionFactory,
    providers: FakeProviders,
    clock: FakeClock,
) -> None:
    await _totp_user_with_github(totp_oauth_browser_factory, session_factory, providers, clock)
    await _sign_in(totp_oauth_client)  # links by email
    # The address at the provider changes: sign-in goes by the account id, not the address.
    providers.set_github_email("renamed@example.com")

    response = await _sign_in(totp_oauth_client)

    assert response.headers["location"].startswith(f"{TEST_ORIGIN}/login/two-factor#challenge=")
    assert "spl_session" not in totp_oauth_client.cookies


async def test_a_user_without_two_factor_still_gets_a_session_from_the_callback(
    totp_oauth_browser_factory: BrowserFactory,
    totp_oauth_client: httpx.AsyncClient,
    session_factory: SessionFactory,
    providers: FakeProviders,
) -> None:
    await totp_oauth_browser_factory("ada@example.com")
    await verify_email(session_factory, "ada@example.com")
    providers.set_github_email("ada@example.com")

    response = await _sign_in(totp_oauth_client, next="/projects")

    assert response.headers["location"] == f"{TEST_ORIGIN}/projects"
    assert totp_oauth_client.cookies.get("spl_session")


async def test_the_identity_matched_by_email_is_kept_even_though_the_second_step_is_pending(
    totp_oauth_browser_factory: BrowserFactory,
    totp_oauth_client: httpx.AsyncClient,
    session_factory: SessionFactory,
    providers: FakeProviders,
    clock: FakeClock,
) -> None:
    # Ruling: the link is the user's own verified provider account, and every later sign-in with
    # it still needs the second factor, so it is committed before the redirect.
    ada = await totp_oauth_browser_factory("ada@example.com")
    await create_workspace(ada)
    await verify_email(session_factory, "ada@example.com")
    providers.set_github_email("ada@example.com")
    await enroll(ada, clock)

    await _sign_in(totp_oauth_client)

    async with session_factory() as db:
        identities = (await db.scalars(select(OAuthIdentity))).all()
        link_events = await db.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(AuditEvent.action == "user.oauth_link")
        )
    assert [identity.provider for identity in identities] == ["github"]
    assert link_events == 1


async def test_a_provider_challenge_dies_when_a_password_is_set_before_the_second_step(
    totp_oauth_client: httpx.AsyncClient,
    totp_oauth_app: object,
    session_factory: SessionFactory,
    providers: FakeProviders,
    clock: FakeClock,
) -> None:
    # An account that signs in with a provider has no password. Giving it one (a password reset)
    # is a change of credentials like any other, and a challenge issued before it is dead.
    providers.set_github_email("ada@example.com")
    first = await _sign_in(totp_oauth_client)
    assert first.headers["location"] == f"{TEST_ORIGIN}/"
    me = await totp_oauth_client.get(ME)
    ada = Browser(http=totp_oauth_client, user=me.json()["user"])
    secret, _ = await enroll(ada, clock)
    async with _make_client(totp_oauth_app) as other:
        redirect = await _sign_in(other)
        challenge = urlsplit(redirect.headers["location"]).fragment.removeprefix("challenge=")
        async with session_factory() as db:
            user = (await db.scalars(select(User))).one()
            assert user.password_hash is None
            await replace_password(db, user, hash_password("a brand new passphrase"))
            await db.commit()

        response = await other.post(
            VERIFY, json={"challenge": challenge, "code": clock.next_code(secret)}
        )

    assert response.status_code == 401
    assert response.json()["code"] == "TOTP_CHALLENGE_INVALID"


async def _all_sessions(factory: SessionFactory) -> list[Session]:
    async with factory() as db:
        return list((await db.scalars(select(Session))).all())
