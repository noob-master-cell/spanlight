"""Fixtures for the OAuth and TOTP tests.

OAuth: the app with GitHub and Google configured, talking to fakes. TOTP: the app with
`CREDENTIALS_KEYS` set and a clock the test moves by hand, so a code is only ever valid when the
test says it is.
"""

import base64
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.totp import STEP_SECONDS, code_for_step, step_at
from app.config import Settings
from app.main import create_app
from tests.auth.oauth_fakes import FakeProviders
from tests.conftest import BrowserFactory, _browsers, _make_client
from tests.helpers import Browser

GITHUB_FIELDS = {
    "oauth_github_client_id": "github-client-id",
    "oauth_github_client_secret": SecretStr("github-client-secret"),
}
GOOGLE_FIELDS = {
    "oauth_google_client_id": "google-client-id",
    "oauth_google_client_secret": SecretStr("google-client-secret"),
}


@dataclass
class FakeClock:
    """The time the app uses for TOTP codes and login challenges; tests move it by hand."""

    current: datetime

    def __call__(self) -> datetime:
        return self.current

    def advance(self, **delta: float) -> None:
        self.current += timedelta(**delta)

    def code_for(self, secret: str, *, steps_ahead: int = 0) -> str:
        """The code an authenticator app shows now (or `steps_ahead` steps later)."""
        return code_for_step(secret, step_at(self.current) + steps_ahead)

    def next_code(self, secret: str) -> str:
        """Wait for the next 30-second step and return its code.

        Enabling uses the code of the current step, and a step is only accepted once, so the next
        sign-in needs a code from a later step: what a person gets by waiting for the app to roll
        over.
        """
        self.advance(seconds=STEP_SECONDS)
        return self.code_for(secret)


@asynccontextmanager
async def running_app(
    settings: Settings, providers: FakeProviders, *, clock: FakeClock | None = None
) -> AsyncIterator[Any]:
    """An app whose provider calls go to `providers` instead of the internet."""
    application = create_app(settings, oauth_transport=providers.transport, clock=clock)
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
def providers() -> FakeProviders:
    return FakeProviders()


@pytest.fixture
def oauth_settings(settings: Settings, tmp_path: Path) -> Settings:
    """Both providers configured, and email too (the console provider writing to a file).

    Email is on by default because that is how a real deployment signs people in: it is what
    makes "verified" mean something, and what lets an account be linked only once verified.
    """
    return settings.model_copy(
        update={**GITHUB_FIELDS, **GOOGLE_FIELDS, "email_console_file": tmp_path / "outbox.jsonl"}
    )


@pytest.fixture
def oauth_settings_without_email(settings: Settings) -> Settings:
    """Both providers configured, email not."""
    return settings.model_copy(update={**GITHUB_FIELDS, **GOOGLE_FIELDS})


@pytest.fixture
async def oauth_app(oauth_settings: Settings, providers: FakeProviders) -> AsyncIterator[Any]:
    async with running_app(oauth_settings, providers) as application:
        yield application


@pytest.fixture
async def oauth_client(oauth_app: Any) -> AsyncIterator[httpx.AsyncClient]:
    async with _make_client(oauth_app) as http:
        yield http


@pytest.fixture
async def oauth_browser_factory(oauth_app: Any) -> AsyncIterator[BrowserFactory]:
    """`await oauth_browser_factory("ada@example.com")` → a signed-up, signed-in Browser."""
    async with _browsers(oauth_app) as factory:
        yield factory


@pytest.fixture
async def verified_browser_factory(
    oauth_browser_factory: BrowserFactory, session_factory: async_sessionmaker[AsyncSession]
) -> BrowserFactory:
    """Like `oauth_browser_factory`, but the new user has proved their email address."""

    async def factory(email: str, name: str = "Test User") -> Browser:
        browser = await oauth_browser_factory(email, name)
        async with session_factory() as db:
            await db.execute(
                text("UPDATE users SET email_verified_at = now() WHERE email = :email"),
                {"email": email},
            )
            await db.commit()
        return browser

    return factory


@pytest.fixture
async def no_email_app(
    oauth_settings_without_email: Settings, providers: FakeProviders
) -> AsyncIterator[Any]:
    """The app with both providers but no email, so nobody can verify an address."""
    async with running_app(oauth_settings_without_email, providers) as application:
        yield application


@pytest.fixture
async def no_email_client(no_email_app: Any) -> AsyncIterator[httpx.AsyncClient]:
    async with _make_client(no_email_app) as http:
        yield http


@pytest.fixture
async def no_email_browser_factory(no_email_app: Any) -> AsyncIterator[BrowserFactory]:
    async with _browsers(no_email_app) as factory:
        yield factory


@pytest.fixture
async def github_only_client(
    settings: Settings, providers: FakeProviders
) -> AsyncIterator[httpx.AsyncClient]:
    """A client of an app with only GitHub configured."""
    only_github = settings.model_copy(update=GITHUB_FIELDS)
    async with (
        running_app(only_github, providers) as application,
        _make_client(application) as http,
    ):
        yield http


# --- TOTP --------------------------------------------------------------------------------------

CREDENTIALS_KEYS = "test-key:" + base64.b64encode(bytes(range(32))).decode()


@pytest.fixture
def clock() -> FakeClock:
    # Mid-step on purpose: nothing here sits on a boundary by accident.
    return FakeClock(datetime(2026, 10, 8, 12, 0, 10, tzinfo=UTC))


@pytest.fixture
def totp_settings(settings: Settings) -> Settings:
    """Settings with `CREDENTIALS_KEYS` set, so two-factor authentication can be turned on."""
    return settings.model_copy(update={"credentials_keys": SecretStr(CREDENTIALS_KEYS)})


@pytest.fixture
def totp_email_settings(totp_settings: Settings, tmp_path: Path) -> Settings:
    """`totp_settings` plus email, so an unverified address means something."""
    return totp_settings.model_copy(update={"email_console_file": tmp_path / "outbox.jsonl"})


@asynccontextmanager
async def _totp_running(settings: Settings, clock: FakeClock) -> AsyncIterator[Any]:
    application = create_app(settings, clock=clock)
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def totp_app(totp_settings: Settings, clock: FakeClock) -> AsyncIterator[Any]:
    async with _totp_running(totp_settings, clock) as application:
        yield application


@pytest.fixture
async def totp_client(totp_app: Any) -> AsyncIterator[httpx.AsyncClient]:
    async with _make_client(totp_app) as http:
        yield http


@pytest.fixture
async def totp_browser_factory(totp_app: Any) -> AsyncIterator[BrowserFactory]:
    """`await totp_browser_factory("ada@example.com")` -> a signed-in Browser, 2FA available."""
    async with _browsers(totp_app) as factory:
        yield factory


@pytest.fixture
async def totp_email_app(totp_email_settings: Settings, clock: FakeClock) -> AsyncIterator[Any]:
    async with _totp_running(totp_email_settings, clock) as application:
        yield application


@pytest.fixture
async def totp_email_browser_factory(totp_email_app: Any) -> AsyncIterator[BrowserFactory]:
    async with _browsers(totp_email_app) as factory:
        yield factory


@pytest.fixture
async def totp_oauth_app(
    oauth_settings: Settings, providers: FakeProviders, clock: FakeClock
) -> AsyncIterator[Any]:
    """GitHub and Google (against fakes), email and `CREDENTIALS_KEYS` all configured."""
    keyed = oauth_settings.model_copy(update={"credentials_keys": SecretStr(CREDENTIALS_KEYS)})
    async with running_app(keyed, providers, clock=clock) as application:
        yield application


@pytest.fixture
async def totp_oauth_client(totp_oauth_app: Any) -> AsyncIterator[httpx.AsyncClient]:
    async with _make_client(totp_oauth_app) as http:
        yield http


@pytest.fixture
async def totp_oauth_browser_factory(totp_oauth_app: Any) -> AsyncIterator[BrowserFactory]:
    async with _browsers(totp_oauth_app) as factory:
        yield factory
