"""CSRF double-submit, Origin allowlist and login throttling."""

from typing import Any

import httpx

from tests.helpers import Browser

PASSWORD = "correct horse battery"


async def test_state_change_without_csrf_header_is_rejected(browser_factory: Any) -> None:
    browser: Browser = await browser_factory("ada@example.com")
    response = await browser.http.post("/api/v1/orgs", json={"name": "Acme"})  # no X-CSRF-Token
    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_FAILED"


async def test_csrf_header_must_match_cookie(browser_factory: Any) -> None:
    browser: Browser = await browser_factory("ada@example.com")
    response = await browser.http.post(
        "/api/v1/orgs", json={"name": "Acme"}, headers={"X-CSRF-Token": "forged.token"}
    )
    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_FAILED"


async def test_csrf_token_is_bound_to_its_session(browser_factory: Any) -> None:
    ada: Browser = await browser_factory("ada@example.com")
    mallory: Browser = await browser_factory("mallory@example.com")
    # Mallory's own (validly signed) token, planted as both cookie and header for Ada.
    stolen = mallory.http.cookies["spl_csrf"]
    ada.http.cookies.set("spl_csrf", stolen)
    response = await ada.http.post(
        "/api/v1/orgs", json={"name": "Acme"}, headers={"X-CSRF-Token": stolen}
    )
    assert response.status_code == 403


async def test_valid_csrf_passes(browser_factory: Any) -> None:
    browser: Browser = await browser_factory("ada@example.com")
    assert (await browser.post("/api/v1/orgs", json={"name": "Acme"})).status_code == 201


async def test_foreign_origin_is_rejected_even_with_csrf(browser_factory: Any) -> None:
    browser: Browser = await browser_factory("ada@example.com")
    response = await browser.http.post(
        "/api/v1/orgs",
        json={"name": "Acme"},
        headers={
            "X-CSRF-Token": browser.http.cookies["spl_csrf"],
            "Origin": "https://evil.example",
        },
    )
    assert response.status_code == 403
    assert response.json()["code"] == "ORIGIN_NOT_ALLOWED"
    assert response.json()["request_id"] == response.headers["x-request-id"]


async def test_login_requires_allowed_origin(app: Any) -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as no_origin:
        response = await no_origin.post(
            "/api/v1/auth/login", json={"email": "a@example.com", "password": PASSWORD}
        )
    assert response.status_code == 403


async def test_extra_allowed_origin_is_accepted(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/signup",
        json={"email": "dev@example.com", "password": PASSWORD, "name": "Dev"},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 201


async def test_safe_methods_skip_origin_check(app: Any) -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as no_origin:
        assert (await no_origin.get("/health/live")).status_code == 200


async def _fail_login(client: httpx.AsyncClient, email: str) -> int:
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "wrong password!"}
    )
    return response.status_code


async def test_login_throttled_after_five_failures_per_email(
    browser_factory: Any, client: httpx.AsyncClient
) -> None:
    await browser_factory("ada@example.com")
    statuses = [await _fail_login(client, "ada@example.com") for _ in range(5)]
    assert statuses == [401] * 5

    blocked = await client.post(
        "/api/v1/auth/login", json={"email": "ada@example.com", "password": PASSWORD}
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0
    # Another account from the same IP is still allowed (IP limit is 20).
    assert await _fail_login(client, "someone@example.com") == 401


async def test_login_throttled_after_twenty_failures_per_ip(client: httpx.AsyncClient) -> None:
    for index in range(20):
        assert await _fail_login(client, f"user{index}@example.com") == 401
    assert await _fail_login(client, "fresh@example.com") == 429


async def test_successful_logins_do_not_count_toward_throttle(
    browser_factory: Any, client: httpx.AsyncClient
) -> None:
    await browser_factory("ada@example.com")
    for _ in range(8):
        response = await client.post(
            "/api/v1/auth/login", json={"email": "ada@example.com", "password": PASSWORD}
        )
        assert response.status_code == 200


async def test_me_issues_a_new_csrf_cookie_when_the_browser_lost_it(browser_factory: Any) -> None:
    browser: Browser = await browser_factory("ada@example.com")
    browser.http.cookies.delete("spl_csrf")

    response = await browser.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert "spl_csrf=" in response.headers["set-cookie"]
    # The new token is the one the API accepts: the SPA can carry on from here.
    assert (await browser.post("/api/v1/orgs", json={"name": "Acme"})).status_code == 201


async def test_me_replaces_a_stale_csrf_cookie(browser_factory: Any) -> None:
    ada: Browser = await browser_factory("ada@example.com")
    mallory: Browser = await browser_factory("mallory@example.com")
    stale = mallory.http.cookies["spl_csrf"]  # validly signed, but for another session
    ada.http.cookies.delete("spl_csrf")
    ada.http.cookies.set("spl_csrf", stale, domain="testserver.local", path="/")

    response = await ada.get("/api/v1/auth/me")

    assert "spl_csrf=" in response.headers["set-cookie"]
    assert (await ada.post("/api/v1/orgs", json={"name": "Acme"})).status_code == 201


async def test_me_leaves_a_valid_csrf_cookie_alone(browser_factory: Any) -> None:
    browser: Browser = await browser_factory("ada@example.com")

    response = await browser.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert "set-cookie" not in response.headers
