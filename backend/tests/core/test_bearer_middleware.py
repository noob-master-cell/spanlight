"""A request with an `Authorization: Bearer` header is authenticated by that header alone."""

from typing import Any

import pytest
from starlette.types import Message, Receive, Scope, Send

from app.core.middleware import BearerRequestMiddleware, OriginCheckMiddleware

ALLOWED = {"https://app.example.com"}


def _scope(path: str, headers: list[tuple[bytes, bytes]], method: str = "POST") -> Scope:
    return {"type": "http", "method": method, "path": path, "headers": headers}


async def _receive() -> Message:
    return {"type": "http.request", "body": b"", "more_body": False}


class Recorder:
    """A downstream app that records the scope it was called with."""

    def __init__(self) -> None:
        self.scope: Scope | None = None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        self.scope = scope
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})


async def _run(app: Any, scope: Scope) -> int:
    status: list[int] = []

    async def send(message: Message) -> None:
        if message["type"] == "http.response.start":
            status.append(message["status"])

    await app(scope, _receive, send)
    return status[0]


@pytest.mark.parametrize("path", ["/api/v1/auth/me", "/api/v1/projects/x/traces"])
@pytest.mark.parametrize("scheme", ["Bearer", "bearer", "BEARER"])
async def test_cookies_are_removed_when_a_bearer_is_present(path: str, scheme: str) -> None:
    downstream = Recorder()
    authorization = f"{scheme} whatever".encode()
    headers = [
        (b"cookie", b"spl_session=abc; spl_csrf=def"),
        (b"authorization", authorization),
        (b"cookie", b"second=1"),
        (b"x-other", b"kept"),
    ]

    status = await _run(BearerRequestMiddleware(downstream), _scope(path, headers, "GET"))

    assert status == 204
    assert downstream.scope is not None
    assert downstream.scope["headers"] == [
        (b"authorization", authorization),
        (b"x-other", b"kept"),
    ]


async def test_cookies_are_kept_without_authorization() -> None:
    downstream = Recorder()
    headers = [(b"cookie", b"spl_session=abc")]

    await _run(BearerRequestMiddleware(downstream), _scope("/api/v1/auth/me", headers, "GET"))

    assert downstream.scope is not None
    assert downstream.scope["headers"] == headers


async def test_a_bearer_with_no_credentials_still_counts_as_present() -> None:
    downstream = Recorder()
    headers = [(b"cookie", b"spl_session=abc"), (b"authorization", b"Bearer")]

    await _run(BearerRequestMiddleware(downstream), _scope("/api/v1/auth/me", headers, "GET"))

    assert downstream.scope is not None
    assert downstream.scope["headers"] == [(b"authorization", b"Bearer")]


@pytest.mark.parametrize(
    "authorization",
    [b"Basic dXNlcjpwYXNz", b"Negotiate YIIBsg==", b"Digest u=1", b"Bearerx y", b""],
)
async def test_another_authorization_scheme_keeps_the_cookies(authorization: bytes) -> None:
    """Browsers attach Basic and Negotiate by themselves: no reason to drop the session."""
    downstream = Recorder()
    headers = [(b"cookie", b"spl_session=abc"), (b"authorization", authorization)]

    await _run(BearerRequestMiddleware(downstream), _scope("/api/v1/auth/me", headers, "GET"))

    assert downstream.scope is not None
    assert downstream.scope["headers"] == headers


async def test_only_api_requests_lose_their_cookies() -> None:
    downstream = Recorder()
    headers = [(b"cookie", b"a=b"), (b"authorization", b"Bearer spl_live_x")]

    await _run(BearerRequestMiddleware(downstream), _scope("/v1/traces", headers))

    assert downstream.scope is not None
    assert downstream.scope["headers"] == headers


async def test_the_scope_is_changed_in_place_so_outer_middleware_still_sees_the_route() -> None:
    """The request-context middleware reads the matched route from the scope it passed in."""
    downstream = Recorder()
    scope = _scope("/api/v1/auth/me", [(b"authorization", b"Bearer x"), (b"cookie", b"a=b")], "GET")

    await _run(BearerRequestMiddleware(downstream), scope)

    assert downstream.scope is scope


@pytest.mark.parametrize("origin", [None, b"https://evil.example"])
@pytest.mark.parametrize("scheme", [b"Bearer", b"bearer"])
async def test_the_origin_check_is_skipped_for_a_bearer(
    origin: bytes | None, scheme: bytes
) -> None:
    downstream = Recorder()
    headers = [(b"authorization", scheme + b" x")]
    if origin is not None:
        headers.append((b"origin", origin))

    status = await _run(
        OriginCheckMiddleware(downstream, ALLOWED), _scope("/api/v1/projects/x/keys", headers)
    )

    assert status == 204


@pytest.mark.parametrize("authorization", [None, b"Basic dXNlcjpwYXNz", b"Negotiate YIIBsg==", b""])
async def test_the_origin_check_still_applies_without_a_bearer(authorization: bytes | None) -> None:
    downstream = Recorder()
    extra = [] if authorization is None else [(b"authorization", authorization)]

    missing = await _run(
        OriginCheckMiddleware(downstream, ALLOWED), _scope("/api/v1/projects/x/keys", extra)
    )
    foreign = await _run(
        OriginCheckMiddleware(downstream, ALLOWED),
        _scope("/api/v1/projects/x/keys", [*extra, (b"origin", b"https://evil.example")]),
    )
    allowed = await _run(
        OriginCheckMiddleware(downstream, ALLOWED),
        _scope("/api/v1/projects/x/keys", [*extra, (b"origin", b"https://app.example.com")]),
    )

    assert (missing, foreign, allowed) == (403, 403, 204)
