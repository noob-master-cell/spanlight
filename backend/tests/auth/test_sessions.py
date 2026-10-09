"""Signing out of every other session: `DELETE /api/v1/auth/sessions`."""

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any
from uuid import UUID

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import Session
from tests.conftest import BrowserFactory, _make_client
from tests.helpers import Browser

SessionFactory = async_sessionmaker[AsyncSession]

LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"
SESSIONS = "/api/v1/auth/sessions"
PASSWORD = "correct horse battery"  # what the browser factory signs users up with

SignIn = Callable[[str], Awaitable[Browser]]
NewVisitor = Callable[[], Awaitable[Browser]]


@pytest.fixture
async def sign_in(app: Any) -> AsyncIterator[SignIn]:
    """`await sign_in("ada@example.com")` -> another browser, signed in with the password."""
    clients: list[httpx.AsyncClient] = []

    async def factory(email: str) -> Browser:
        http = _make_client(app)
        clients.append(http)
        response = await http.post(LOGIN, json={"email": email, "password": PASSWORD})
        assert response.status_code == 200, response.text
        return Browser(http=http, user=response.json()["user"])

    try:
        yield factory
    finally:
        for http in clients:
            await http.aclose()


@pytest.fixture
async def demo_visitor(app: Any) -> AsyncIterator[NewVisitor]:
    """`await demo_visitor()` -> another visitor of the live demo, who shares the demo user."""
    clients: list[httpx.AsyncClient] = []

    async def factory() -> Browser:
        http = _make_client(app)
        clients.append(http)
        response = await http.post("/api/v1/demo/session")
        assert response.status_code == 200, response.text
        return Browser(http=http, user=response.json())

    try:
        yield factory
    finally:
        for http in clients:
            await http.aclose()


async def _session_count(factory: SessionFactory, user_id: str) -> int:
    async with factory() as db:
        count = await db.scalar(
            select(func.count()).select_from(Session).where(Session.user_id == UUID(user_id))
        )
    return int(count or 0)


async def test_it_ends_every_session_but_the_callers(
    browser_factory: BrowserFactory, sign_in: SignIn, session_factory: SessionFactory
) -> None:
    ada = await browser_factory("ada@example.com")
    phone = await sign_in("ada@example.com")
    tablet = await sign_in("ada@example.com")
    assert await _session_count(session_factory, ada.user["id"]) == 3

    response = await ada.delete(SESSIONS)

    assert response.status_code == 204
    assert response.content == b""
    assert (await ada.get(ME)).status_code == 200
    assert (await phone.get(ME)).status_code == 401
    assert (await tablet.get(ME)).status_code == 401
    assert await _session_count(session_factory, ada.user["id"]) == 1


async def test_the_session_list_then_shows_only_the_current_one(
    browser_factory: BrowserFactory, sign_in: SignIn
) -> None:
    ada = await browser_factory("ada@example.com")
    await sign_in("ada@example.com")
    assert len((await ada.get(SESSIONS)).json()) == 2

    await ada.delete(SESSIONS)

    remaining = (await ada.get(SESSIONS)).json()
    assert [session["current"] for session in remaining] == [True]


async def test_it_works_from_whichever_session_calls_it(
    browser_factory: BrowserFactory, sign_in: SignIn
) -> None:
    ada = await browser_factory("ada@example.com")
    phone = await sign_in("ada@example.com")

    assert (await phone.delete(SESSIONS)).status_code == 204

    assert (await phone.get(ME)).status_code == 200
    assert (await ada.get(ME)).status_code == 401


async def test_it_leaves_other_users_sessions_alone(
    browser_factory: BrowserFactory, sign_in: SignIn
) -> None:
    ada = await browser_factory("ada@example.com")
    await sign_in("ada@example.com")
    bob = await browser_factory("bob@example.com")
    bob_phone = await sign_in("bob@example.com")

    assert (await ada.delete(SESSIONS)).status_code == 204

    assert (await bob.get(ME)).status_code == 200
    assert (await bob_phone.get(ME)).status_code == 200
    assert len((await bob.get(SESSIONS)).json()) == 2


async def test_with_no_other_session_it_is_a_no_op(browser_factory: BrowserFactory) -> None:
    ada = await browser_factory("ada@example.com")

    assert (await ada.delete(SESSIONS)).status_code == 204
    assert (await ada.delete(SESSIONS)).status_code == 204

    assert (await ada.get(ME)).status_code == 200


async def test_without_a_csrf_header_it_is_refused_and_ends_nothing(
    browser_factory: BrowserFactory, sign_in: SignIn
) -> None:
    ada = await browser_factory("ada@example.com")
    phone = await sign_in("ada@example.com")

    response = await ada.http.delete(SESSIONS)  # no X-CSRF-Token

    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_FAILED"
    assert (await phone.get(ME)).status_code == 200


async def test_without_a_session_it_is_401(client: httpx.AsyncClient) -> None:
    response = await client.delete(SESSIONS)

    assert response.status_code == 401


async def test_it_logs_how_many_sessions_it_ended_and_no_tokens(
    browser_factory: BrowserFactory, sign_in: SignIn, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    ada = await browser_factory("ada@example.com")
    phone = await sign_in("ada@example.com")
    await sign_in("ada@example.com")
    tokens = [ada.http.cookies["spl_session"], phone.http.cookies["spl_session"]]

    await ada.delete(SESSIONS)

    # Structlog hands the stdlib handler the event dict itself as the record's message.
    events = [
        record.msg
        for record in caplog.records
        if isinstance(record.msg, dict) and record.msg.get("event") == "sessions_revoked_others"
    ]
    assert len(events) == 1
    assert events[0]["user_id"] == ada.user["id"]
    assert events[0]["count"] == 2
    assert not any(token in caplog.text for token in tokens)


# --- the shared demo account -------------------------------------------------------------------
# Every demo visitor is the same user, so their sessions are not theirs to list or end.


async def _session_ids(factory: SessionFactory, user_id: str) -> list[UUID]:
    async with factory() as db:
        rows = await db.scalars(select(Session.id).where(Session.user_id == UUID(user_id)))
        return list(rows.all())


async def test_a_demo_visitor_cannot_sign_the_other_visitors_out(
    demo_visitor: NewVisitor, session_factory: SessionFactory
) -> None:
    first = await demo_visitor()
    second = await demo_visitor()

    response = await first.delete(SESSIONS)

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"
    assert (await first.get(ME)).status_code == 200
    assert (await second.get(ME)).status_code == 200
    assert len(await _session_ids(session_factory, first.user["id"])) == 2


async def test_a_demo_visitor_cannot_end_any_demo_session_by_id(
    demo_visitor: NewVisitor, session_factory: SessionFactory
) -> None:
    first = await demo_visitor()
    second = await demo_visitor()
    ids = await _session_ids(session_factory, first.user["id"])

    responses = [await first.delete(f"{SESSIONS}/{session_id}") for session_id in ids]

    assert [response.status_code for response in responses] == [403, 403]
    assert {response.json()["code"] for response in responses} == {"FORBIDDEN"}
    assert (await first.get(ME)).status_code == 200
    assert (await second.get(ME)).status_code == 200
    assert len(await _session_ids(session_factory, first.user["id"])) == 2


async def test_a_demo_visitor_lists_only_their_own_session(demo_visitor: NewVisitor) -> None:
    first = await demo_visitor()
    second = await demo_visitor()

    listed_by_first = (await first.get(SESSIONS)).json()
    listed_by_second = (await second.get(SESSIONS)).json()

    assert [session["current"] for session in listed_by_first] == [True]
    assert [session["current"] for session in listed_by_second] == [True]
    assert listed_by_first[0]["id"] != listed_by_second[0]["id"]
