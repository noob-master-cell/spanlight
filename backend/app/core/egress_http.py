"""The HTTP transports under every client that calls a URL somebody else chose.

Shared by the LLM gateway's upstream client and the alert channels' delivery client, so a fix to
the egress boundary lands in both:

- `VettedTransport`, the real network: an httpcore connection pool whose network backend is
  `app.core.egress.VettedNetworkBackend`, so every connection is checked when it is opened.
  httpx 0.28 has no public way to give its own `AsyncHTTPTransport` a network backend, so this
  is a small transport of its own on httpcore's public API, translating errors to httpx's types
  as `AsyncHTTPTransport` does. Being a different class, it is also not patched by the
  OpenTelemetry httpx instrumentation, which would add a `traceparent` header to these calls.
- `EgressPolicyTransport`, around whichever transport is used: refuses `http://` unless
  `allow_insecure` and, around an injected test transport (which has no network backend), runs
  the address check before the request instead.
"""

from collections.abc import AsyncIterable, AsyncIterator, Iterator
from contextlib import contextmanager
from typing import cast

import httpcore
import httpx

from app.core.egress import (
    InsecureUrl,
    Resolver,
    UnresolvableHost,
    VettedNetworkBackend,
    default_port,
    resolve_checked,
    scheme_allowed,
)

# httpcore errors and the httpx errors they become, most specific first.
HTTPCORE_ERRORS: tuple[tuple[type[Exception], type[httpx.TransportError]], ...] = (
    (httpcore.ConnectTimeout, httpx.ConnectTimeout),
    (httpcore.ReadTimeout, httpx.ReadTimeout),
    (httpcore.WriteTimeout, httpx.WriteTimeout),
    (httpcore.PoolTimeout, httpx.PoolTimeout),
    (httpcore.TimeoutException, httpx.TimeoutException),
    (httpcore.ConnectError, httpx.ConnectError),
    (httpcore.ReadError, httpx.ReadError),
    (httpcore.WriteError, httpx.WriteError),
    (httpcore.NetworkError, httpx.NetworkError),
    (httpcore.ProxyError, httpx.ProxyError),
    (httpcore.RemoteProtocolError, httpx.RemoteProtocolError),
    (httpcore.LocalProtocolError, httpx.LocalProtocolError),
    (httpcore.ProtocolError, httpx.ProtocolError),
    (httpcore.UnsupportedProtocol, httpx.UnsupportedProtocol),
)


class EgressPolicyTransport(httpx.AsyncBaseTransport):
    """Applies the URL rules to every request before handing it to `inner`.

    Raises `InsecureUrl` for `http://` while plain HTTP is not allowed. With `check_addresses`
    (an injected transport) it also resolves and vets the host, raising `BlockedAddress`, or
    `httpx.ConnectError` when the host does not resolve, as the real network backend would.
    """

    def __init__(
        self,
        inner: httpx.AsyncBaseTransport,
        *,
        allow_insecure: bool,
        check_addresses: bool,
        resolver: Resolver | None = None,
    ) -> None:
        self._inner = inner
        self._allow_insecure = allow_insecure
        self._check_addresses = check_addresses
        self._resolver = resolver

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if not scheme_allowed(request.url.scheme, allow_insecure=self._allow_insecure):
            raise InsecureUrl(f"{request.url.host} is not reached over https")
        if self._check_addresses:
            await self._check_address(request)
        return await self._inner.handle_async_request(request)

    async def _check_address(self, request: httpx.Request) -> None:
        url = request.url
        port = url.port or default_port(url.scheme)
        timeouts = request.extensions.get("timeout", {})
        try:
            await resolve_checked(
                url.raw_host.decode("ascii"),
                port,
                allow_private=self._allow_insecure,
                resolver=self._resolver,
                dns_timeout_s=timeouts.get("connect"),
            )
        except UnresolvableHost as error:
            raise httpx.ConnectError(str(error), request=request) from error

    async def aclose(self) -> None:
        await self._inner.aclose()


class VettedTransport(httpx.AsyncBaseTransport):
    """The real network, through an httpcore pool that only connects to vetted addresses."""

    def __init__(
        self,
        *,
        allow_private: bool,
        resolver: Resolver | None = None,
        max_connections: int,
        max_keepalive_connections: int,
        keepalive_expiry: float,
    ) -> None:
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=httpx.create_ssl_context(),
            max_connections=max_connections,
            max_keepalive_connections=max_keepalive_connections,
            keepalive_expiry=keepalive_expiry,
            http1=True,
            http2=False,
            network_backend=VettedNetworkBackend(allow_private=allow_private, resolver=resolver),
        )

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        core_request = httpcore.Request(
            method=request.method,
            url=httpcore.URL(
                scheme=request.url.raw_scheme,
                host=request.url.raw_host,
                port=request.url.port,
                target=request.url.raw_path,
            ),
            headers=request.headers.raw,
            content=cast("AsyncIterable[bytes]", request.stream),
            extensions=request.extensions,
        )
        with httpx_errors(request):
            response = await self._pool.handle_async_request(core_request)
        return httpx.Response(
            status_code=response.status,
            headers=response.headers,
            stream=ResponseStream(cast("AsyncIterable[bytes]", response.stream), request),
            extensions=response.extensions,
        )

    async def aclose(self) -> None:
        await self._pool.aclose()


class ResponseStream(httpx.AsyncByteStream):
    def __init__(self, stream: AsyncIterable[bytes], request: httpx.Request) -> None:
        self._stream = stream
        self._request = request

    async def __aiter__(self) -> AsyncIterator[bytes]:
        with httpx_errors(self._request):
            async for chunk in self._stream:
                yield chunk

    async def aclose(self) -> None:
        close = getattr(self._stream, "aclose", None)
        if close is not None:
            with httpx_errors(self._request):
                await close()


@contextmanager
def httpx_errors(request: httpx.Request) -> Iterator[None]:
    """Re-raise httpcore errors as their httpx type; anything else (`BlockedAddress`) as it is."""
    try:
        yield
    except Exception as error:
        for core_type, httpx_type in HTTPCORE_ERRORS:
            if isinstance(error, core_type):
                raise httpx_type(str(error), request=request) from error
        raise
