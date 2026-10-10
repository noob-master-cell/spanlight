"""The HTTP client alert deliverers send with, and the rules for reading its answers.

Slack, webhook and PagerDuty channels make the worker call a URL an organization chose, so the
client is locked down: every connection goes through `app.core.egress.VettedNetworkBackend` (which
refuses private, loopback and reserved addresses unless `allow_private`), redirects are never
followed, no proxy or `.netrc` is read from the environment, no cookie is kept, and a request
takes at most 10 seconds. `SharedClient` builds one such client on first use, so a process that
never delivers an alert opens nothing.

`post_checked` is the one way to send: it turns the result into a return value or a
`DeliveryError` whose message is safe to store (status, reason and the start of the body; never
the URL, a header or a secret).

The transports are the shared ones in `app.core.egress_http`, the same the gateway uses.
"""

import re
from collections.abc import Mapping
from http.cookiejar import CookieJar, DefaultCookiePolicy

import httpx

from app.core.egress import BlockedAddress, InsecureUrl, Resolver
from app.core.egress_http import EgressPolicyTransport, VettedTransport
from app.jobs.worker_heartbeat import backend_version
from app.notifications.registry import PermanentDeliveryError, RetryableDeliveryError

TIMEOUT_SECONDS = 10.0
POOL_SIZE = 20
KEEPALIVE_CONNECTIONS = 5
KEEPALIVE_EXPIRY_SECONDS = 5.0
MAX_BODY_CHARS = 400
# Enough bytes to hold MAX_BODY_CHARS characters of UTF-8.
MAX_BODY_BYTES = MAX_BODY_CHARS * 4
BLOCKED_MESSAGE = "Blocked: the target resolves to a private or reserved address"
NOT_HTTPS_MESSAGE = "Blocked: the URL does not use https"

# Retryable statuses besides 5xx: a request timeout and "slow down".
_RETRYABLE_STATUSES = frozenset({408, 429})


def build_alert_client(
    *,
    allow_private: bool,
    transport: httpx.AsyncBaseTransport | None = None,
    resolver: Resolver | None = None,
) -> httpx.AsyncClient:
    """The delivery client. `allow_private` lifts the address and https rules (webhooks only).

    `transport` replaces the network (tests pass an `httpx.MockTransport`); the address check
    then runs before the request, through `resolver` when one is given.
    """
    inner = (
        transport
        if transport is not None
        else VettedTransport(
            allow_private=allow_private,
            resolver=resolver,
            max_connections=POOL_SIZE,
            max_keepalive_connections=KEEPALIVE_CONNECTIONS,
            keepalive_expiry=KEEPALIVE_EXPIRY_SECONDS,
        )
    )
    policy = EgressPolicyTransport(
        inner,
        allow_insecure=allow_private,
        check_addresses=transport is not None,
        resolver=resolver,
    )
    return httpx.AsyncClient(
        transport=policy,
        follow_redirects=False,
        timeout=TIMEOUT_SECONDS,
        trust_env=False,
        cookies=CookieJar(policy=DefaultCookiePolicy(allowed_domains=[])),
        # `identity` asks receivers not to compress, and `_error_message` reads the raw bytes, so
        # a compression bomb cannot expand in memory.
        headers={
            "user-agent": f"spanlight/{backend_version()}",
            "accept-encoding": "identity",
        },
    )


class SharedClient:
    """A delivery client built on first use. Deliverers of one process share it."""

    def __init__(
        self,
        *,
        allow_private: bool,
        transport: httpx.AsyncBaseTransport | None = None,
        resolver: Resolver | None = None,
    ) -> None:
        self._allow_private = allow_private
        self._transport = transport
        self._resolver = resolver
        self._client: httpx.AsyncClient | None = None

    def get(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = build_alert_client(
                allow_private=self._allow_private,
                transport=self._transport,
                resolver=self._resolver,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


async def post_checked(
    client: httpx.AsyncClient,
    url: str,
    *,
    body: bytes,
    headers: Mapping[str, str] | None = None,
) -> int:
    """POST `body` as JSON and return the status code when it is 2xx.

    Raises `RetryableDeliveryError` for a timeout, a connection error, 408, 429 and 5xx, and
    `PermanentDeliveryError` for an egress block, 1xx/3xx and every other 4xx. Messages never
    contain `url`. The response is streamed: a success is not read at all, and a failure's body
    is read only as far as its message needs, so a receiver cannot make the worker buffer it.
    """
    request_headers = {"content-type": "application/json", **(headers or {})}
    try:
        async with client.stream("POST", url, content=body, headers=request_headers) as response:
            if response.is_success:
                return response.status_code
            message = await _error_message(response)
            status = response.status_code
    except InsecureUrl:
        raise PermanentDeliveryError(NOT_HTTPS_MESSAGE) from None
    except BlockedAddress:
        raise PermanentDeliveryError(BLOCKED_MESSAGE) from None
    except httpx.InvalidURL:
        raise PermanentDeliveryError("The channel's URL is not valid") from None
    except httpx.TimeoutException:
        raise RetryableDeliveryError("Timed out waiting for the receiver") from None
    except httpx.TransportError as error:
        raise RetryableDeliveryError(f"Could not connect: {type(error).__name__}") from None
    if status in _RETRYABLE_STATUSES or status >= 500:
        raise RetryableDeliveryError(message)
    raise PermanentDeliveryError(message)


async def _error_message(response: httpx.Response) -> str:
    """`status_message` from at most `MAX_BODY_BYTES` of the raw body (none if reading it fails).

    The bytes are read undecoded: a receiver that compresses its answer anyway cannot make the
    worker expand it. A compressed error body then shows as replacement characters, which is
    harmless: the status line carries the diagnosis.
    """
    chunks: list[bytes] = []
    size = 0
    try:
        async for chunk in response.aiter_raw():
            chunks.append(chunk)
            size += len(chunk)
            if size >= MAX_BODY_BYTES:
                break
    except httpx.TransportError:
        pass  # the status alone still classifies the failure
    return status_message(response, b"".join(chunks)[:MAX_BODY_BYTES])


def status_message(response: httpx.Response, body: bytes) -> str:
    """`"<status> <reason>: <first 400 characters of the body>"`, whitespace collapsed."""
    head = f"{response.status_code} {response.reason_phrase}".strip()
    text = re.sub(r"\s+", " ", body.decode("utf-8", "replace")).strip()[:MAX_BODY_CHARS]
    return f"{head}: {text}" if text else head
