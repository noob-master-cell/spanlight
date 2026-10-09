"""Email verification: single-use tokens, the request and confirm routes, and the signup email."""

import asyncio
import hashlib
import re
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.email_tokens import consume_token, issue_token
from app.auth.verification import verification_url
from app.config import Settings
from app.db.models import EmailToken, EmailTokenKind, NotificationOutbox, User
from tests.conftest import BrowserFactory
from tests.helpers import Browser

SessionFactory = async_sessionmaker[AsyncSession]

REQUEST = "/api/v1/auth/email/verify/request"
CONFIRM = "/api/v1/auth/email/verify/confirm"
TOKEN_IN_TEXT = re.compile(r"/verify-email#token=([A-Za-z0-9_-]+)")
DAY = timedelta(hours=24)


async def _outbox(factory: SessionFactory) -> list[NotificationOutbox]:
    async with factory() as db:
        return list(
            (await db.scalars(select(NotificationOutbox).order_by(NotificationOutbox.id))).all()
        )


def _token_in(row: NotificationOutbox) -> str:
    match = TOKEN_IN_TEXT.search(row.payload["text"])
    assert match, row.payload["text"]
    return match.group(1)


async def _issue(factory: SessionFactory, user_id: uuid.UUID, kind: EmailTokenKind) -> str:
    async with factory() as db:
        raw = await issue_token(db, user_id, kind, DAY)
        await db.commit()
    return raw


async def _verified_at(factory: SessionFactory, user_id: str) -> datetime | None:
    async with factory() as db:
        user = await db.get(User, uuid.UUID(user_id))
        assert user is not None
        return user.email_verified_at


async def _execute(factory: SessionFactory, statement: str) -> None:
    async with factory() as db:
        await db.execute(text(statement))
        await db.commit()


# --- tokens ---------------------------------------------------------------------------------


async def _new_user(factory: SessionFactory, email: str = "ada@example.com") -> uuid.UUID:
    async with factory() as db:
        user = User(email=email, password_hash="!unusable", name="Ada")
        db.add(user)
        await db.commit()
        return user.id


async def test_issue_token_stores_only_the_hash_and_the_expiry(
    session_factory: SessionFactory,
) -> None:
    user_id = await _new_user(session_factory)
    before = datetime.now(UTC)

    raw = await _issue(session_factory, user_id, EmailTokenKind.VERIFY)

    after = datetime.now(UTC)
    async with session_factory() as db:
        row = (await db.scalars(select(EmailToken))).one()
    assert len(raw) == 43  # 32 random bytes, URL-safe base64 without padding
    assert row.token_hash == hashlib.sha256(raw.encode()).digest()
    assert row.kind is EmailTokenKind.VERIFY
    assert row.used_at is None
    assert before + DAY <= row.expires_at <= after + DAY


async def test_consume_token_marks_it_used_and_returns_the_user(
    session_factory: SessionFactory,
) -> None:
    user_id = await _new_user(session_factory)
    raw = await _issue(session_factory, user_id, EmailTokenKind.VERIFY)

    async with session_factory() as db:
        user = await consume_token(db, raw, EmailTokenKind.VERIFY)
        await db.commit()

    assert user is not None and user.id == user_id
    async with session_factory() as db:
        assert (await db.scalars(select(EmailToken))).one().used_at is not None


async def test_a_used_token_is_rejected(session_factory: SessionFactory) -> None:
    user_id = await _new_user(session_factory)
    raw = await _issue(session_factory, user_id, EmailTokenKind.VERIFY)
    async with session_factory() as db:
        assert await consume_token(db, raw, EmailTokenKind.VERIFY) is not None
        await db.commit()

    async with session_factory() as db:
        assert await consume_token(db, raw, EmailTokenKind.VERIFY) is None


async def test_an_expired_token_is_rejected_and_stays_unused(
    session_factory: SessionFactory,
) -> None:
    user_id = await _new_user(session_factory)
    raw = await _issue(session_factory, user_id, EmailTokenKind.VERIFY)
    await _execute(
        session_factory, "UPDATE email_tokens SET expires_at = now() - interval '1 second'"
    )

    async with session_factory() as db:
        assert await consume_token(db, raw, EmailTokenKind.VERIFY) is None
        await db.commit()

    async with session_factory() as db:
        assert (await db.scalars(select(EmailToken))).one().used_at is None


async def test_an_unknown_token_is_rejected(session_factory: SessionFactory) -> None:
    await _new_user(session_factory)

    async with session_factory() as db:
        assert await consume_token(db, "not-a-token", EmailTokenKind.VERIFY) is None


async def test_a_token_of_the_other_kind_is_rejected_and_not_burned(
    session_factory: SessionFactory,
) -> None:
    user_id = await _new_user(session_factory)
    raw = await _issue(session_factory, user_id, EmailTokenKind.RESET)

    async with session_factory() as db:
        assert await consume_token(db, raw, EmailTokenKind.VERIFY) is None
        await db.commit()

    # Presenting it in the wrong place must not spend it: the right place still accepts it.
    async with session_factory() as db:
        user = await consume_token(db, raw, EmailTokenKind.RESET)
        assert user is not None and user.id == user_id


async def test_concurrent_consumption_succeeds_exactly_once(
    session_factory: SessionFactory,
) -> None:
    user_id = await _new_user(session_factory)
    raw = await _issue(session_factory, user_id, EmailTokenKind.VERIFY)

    async def consume() -> bool:
        async with session_factory() as db:
            user = await consume_token(db, raw, EmailTokenKind.VERIFY)
            await db.commit()
            return user is not None

    results = await asyncio.gather(*(consume() for _ in range(4)))

    assert results.count(True) == 1


def test_verification_url_puts_the_token_in_the_fragment(settings: Settings) -> None:
    # A fragment is never sent to a server or in a Referer header, so the token stays out of logs.
    assert verification_url(settings, "abc_-123") == "http://testserver/verify-email#token=abc_-123"


# --- signup ---------------------------------------------------------------------------------


async def test_signup_with_email_configured_enqueues_one_verification_email(
    email_browser_factory: BrowserFactory, session_factory: SessionFactory
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com", "Ada")

    assert browser.user["email_verified"] is False
    (row,) = await _outbox(session_factory)
    assert row.kind == "email"
    assert row.target == {"to": "ada@example.com"}
    assert row.payload["subject"] == "Verify your email for Spanlight"
    assert "http://testserver/verify-email#token=" in row.payload["text"]
    assert "Hi Ada," in row.payload["text"]
    assert "/verify-email#token=" in row.payload["html"]


async def test_the_emailed_token_verifies_the_account(
    email_browser_factory: BrowserFactory,
    email_client: httpx.AsyncClient,
    session_factory: SessionFactory,
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")
    (row,) = await _outbox(session_factory)

    confirmed = await email_client.post(CONFIRM, json={"token": _token_in(row)})

    assert confirmed.status_code == 200
    assert confirmed.json()["id"] == browser.user["id"]
    assert (await browser.get("/api/v1/auth/me")).json()["user"]["email_verified"] is True


async def test_signup_without_email_configured_sends_nothing(
    browser_factory: BrowserFactory, session_factory: SessionFactory
) -> None:
    browser: Browser = await browser_factory("ada@example.com")

    assert browser.user["email_verified"] is False
    assert await _outbox(session_factory) == []
    async with session_factory() as db:
        assert (await db.scalars(select(EmailToken))).all() == []


# --- confirm --------------------------------------------------------------------------------


async def test_confirm_verifies_the_email_without_a_session(
    email_browser_factory: BrowserFactory,
    email_client: httpx.AsyncClient,
    session_factory: SessionFactory,
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")
    raw = await _issue(session_factory, uuid.UUID(browser.user["id"]), EmailTokenKind.VERIFY)
    assert not email_client.cookies  # the link is opened in a browser that may not be signed in

    response = await email_client.post(CONFIRM, json={"token": raw})

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "ada@example.com"
    assert body["email_verified"] is True
    assert await _verified_at(session_factory, browser.user["id"]) is not None
    me = (await browser.get("/api/v1/auth/me")).json()
    assert me["user"]["email_verified"] is True


async def test_a_second_use_of_the_link_is_not_found(
    email_browser_factory: BrowserFactory,
    email_client: httpx.AsyncClient,
    session_factory: SessionFactory,
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")
    raw = await _issue(session_factory, uuid.UUID(browser.user["id"]), EmailTokenKind.VERIFY)
    assert (await email_client.post(CONFIRM, json={"token": raw})).status_code == 200

    again = await email_client.post(CONFIRM, json={"token": raw})

    assert again.status_code == 404
    assert again.json()["code"] == "NOT_FOUND"


async def test_an_expired_link_is_not_found_and_verifies_nothing(
    email_browser_factory: BrowserFactory,
    email_client: httpx.AsyncClient,
    session_factory: SessionFactory,
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")
    raw = await _issue(session_factory, uuid.UUID(browser.user["id"]), EmailTokenKind.VERIFY)
    await _execute(
        session_factory, "UPDATE email_tokens SET expires_at = now() - interval '1 second'"
    )

    response = await email_client.post(CONFIRM, json={"token": raw})

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert await _verified_at(session_factory, browser.user["id"]) is None


async def test_a_reset_token_cannot_verify_an_email(
    email_browser_factory: BrowserFactory,
    email_client: httpx.AsyncClient,
    session_factory: SessionFactory,
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")
    raw = await _issue(session_factory, uuid.UUID(browser.user["id"]), EmailTokenKind.RESET)

    response = await email_client.post(CONFIRM, json={"token": raw})

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert await _verified_at(session_factory, browser.user["id"]) is None


async def test_every_rejected_token_gets_the_same_answer(
    email_browser_factory: BrowserFactory,
    email_client: httpx.AsyncClient,
    session_factory: SessionFactory,
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")
    user_id = uuid.UUID(browser.user["id"])
    used = await _issue(session_factory, user_id, EmailTokenKind.VERIFY)
    await email_client.post(CONFIRM, json={"token": used})
    reset = await _issue(session_factory, user_id, EmailTokenKind.RESET)

    answers = []
    for token in ("unknown-token", used, reset):
        response = await email_client.post(CONFIRM, json={"token": token})
        body = response.json()
        body.pop("request_id")
        answers.append((response.status_code, body))

    assert len(set(map(repr, answers))) == 1  # nothing tells an attacker why a token failed


async def test_confirm_keeps_the_first_verification_time(
    email_browser_factory: BrowserFactory,
    email_client: httpx.AsyncClient,
    session_factory: SessionFactory,
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")
    user_id = uuid.UUID(browser.user["id"])
    first = await _issue(session_factory, user_id, EmailTokenKind.VERIFY)
    second = await _issue(session_factory, user_id, EmailTokenKind.VERIFY)
    assert (await email_client.post(CONFIRM, json={"token": first})).status_code == 200
    verified_at = await _verified_at(session_factory, browser.user["id"])

    again = await email_client.post(CONFIRM, json={"token": second})

    assert again.status_code == 200
    assert await _verified_at(session_factory, browser.user["id"]) == verified_at


async def test_confirm_still_applies_the_origin_check(email_client: httpx.AsyncClient) -> None:
    response = await email_client.post(
        CONFIRM, json={"token": "whatever"}, headers={"Origin": "https://evil.example"}
    )

    assert response.status_code == 403
    assert response.json()["code"] == "ORIGIN_NOT_ALLOWED"


@pytest.mark.parametrize("body", [{}, {"token": ""}, {"token": 5}])
async def test_confirm_validates_the_body(
    email_client: httpx.AsyncClient, body: dict[str, object]
) -> None:
    response = await email_client.post(CONFIRM, json=body)

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


# --- request --------------------------------------------------------------------------------


async def test_request_sends_a_fresh_verification_email(
    email_browser_factory: BrowserFactory,
    email_client: httpx.AsyncClient,
    session_factory: SessionFactory,
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")

    response = await browser.post(REQUEST)

    assert response.status_code == 202
    assert response.json() == {"status": "accepted"}
    signup_row, request_row = await _outbox(session_factory)
    assert request_row.target == {"to": "ada@example.com"}
    assert _token_in(request_row) != _token_in(signup_row)
    confirmed = await email_client.post(CONFIRM, json={"token": _token_in(request_row)})
    assert confirmed.status_code == 200


async def test_request_needs_a_session(email_client: httpx.AsyncClient) -> None:
    response = await email_client.post(REQUEST)

    assert response.status_code == 401


async def test_request_needs_the_csrf_header(email_browser_factory: BrowserFactory) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")

    response = await browser.http.post(REQUEST)  # cookies, but no X-CSRF-Token

    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_FAILED"


async def test_request_for_a_verified_user_is_a_conflict(
    email_browser_factory: BrowserFactory, session_factory: SessionFactory
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")
    await _execute(session_factory, "UPDATE users SET email_verified_at = now()")

    response = await browser.post(REQUEST)

    assert response.status_code == 409
    assert response.json()["code"] == "EMAIL_ALREADY_VERIFIED"
    assert len(await _outbox(session_factory)) == 1  # only the signup email


async def test_request_for_the_demo_user_is_forbidden(
    email_client: httpx.AsyncClient, session_factory: SessionFactory
) -> None:
    # The demo account is shared and anonymous: nobody may make the server mail its address.
    signed_in = await email_client.post("/api/v1/demo/session")
    assert signed_in.status_code == 200
    demo = Browser(http=email_client, user=signed_in.json())

    response = await demo.post(REQUEST)

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"
    assert await _outbox(session_factory) == []
    async with session_factory() as db:
        assert (await db.scalars(select(EmailToken))).all() == []


async def test_request_without_email_configured_names_the_missing_setting(
    browser_factory: BrowserFactory, session_factory: SessionFactory
) -> None:
    browser: Browser = await browser_factory("ada@example.com")

    response = await browser.post(REQUEST)

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "NOT_CONFIGURED"
    assert "EMAIL_PROVIDER" in body["detail"] and "EMAIL_CONSOLE_FILE" in body["detail"]
    assert await _outbox(session_factory) == []


async def test_not_configured_is_reported_before_already_verified(
    browser_factory: BrowserFactory, session_factory: SessionFactory
) -> None:
    browser: Browser = await browser_factory("ada@example.com")
    await _execute(session_factory, "UPDATE users SET email_verified_at = now()")

    response = await browser.post(REQUEST)

    assert response.json()["code"] == "NOT_CONFIGURED"


async def test_the_fourth_request_in_an_hour_is_rate_limited(
    email_browser_factory: BrowserFactory, session_factory: SessionFactory
) -> None:
    browser: Browser = await email_browser_factory("ada@example.com")

    statuses = [(await browser.post(REQUEST)).status_code for _ in range(3)]
    fourth = await browser.post(REQUEST)

    assert statuses == [202, 202, 202]
    assert fourth.status_code == 429
    assert fourth.json()["code"] == "RATE_LIMITED"
    assert 0 < int(fourth.headers["Retry-After"]) <= 3600
    assert len(await _outbox(session_factory)) == 4  # the signup email and three requests


async def test_the_request_limit_is_per_user(email_browser_factory: BrowserFactory) -> None:
    ada: Browser = await email_browser_factory("ada@example.com")
    bob: Browser = await email_browser_factory("bob@example.com")
    for _ in range(4):
        await ada.post(REQUEST)

    assert (await bob.post(REQUEST)).status_code == 202


async def test_a_token_only_ever_verifies_its_own_user(
    email_browser_factory: BrowserFactory,
    email_client: httpx.AsyncClient,
    session_factory: SessionFactory,
) -> None:
    ada: Browser = await email_browser_factory("ada@example.com")
    bob: Browser = await email_browser_factory("bob@example.com")
    raw = await _issue(session_factory, uuid.UUID(ada.user["id"]), EmailTokenKind.VERIFY)

    await email_client.post(CONFIRM, json={"token": raw})

    assert await _verified_at(session_factory, ada.user["id"]) is not None
    assert await _verified_at(session_factory, bob.user["id"]) is None
