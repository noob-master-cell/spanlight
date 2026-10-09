"""A minimal HTTP listener that serves the worker's Prometheus metrics.

The api serves `/metrics` itself, but the job, outbox, notification and rollup metrics are
recorded in the worker process, so the worker needs an endpoint of its own. It follows the same
rule as the api: no `METRICS_TOKEN` means the endpoint does not exist (404), a missing or wrong
bearer token is refused (401), and the token is compared in constant time.

This is a deliberately small HTTP/1.1 server (one request per connection, no keep-alive) built on
`asyncio.start_server`, so the worker takes no web framework for one route.
"""

import asyncio
import contextlib
import hmac
from collections.abc import AsyncIterator

import structlog
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import SecretStr

logger = structlog.get_logger(__name__)

# Prometheus sends a short GET; anything bigger than this is not a scrape.
MAX_REQUEST_BYTES = 8 * 1024
READ_TIMEOUT_SECONDS = 5.0


def _response(status: str, body: bytes = b"", content_type: str = "text/plain") -> bytes:
    head = (
        f"HTTP/1.1 {status}\r\n"
        f"Content-Type: {content_type}\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Connection: close\r\n"
    )
    if status.startswith("401"):
        head += "WWW-Authenticate: Bearer\r\n"
    return head.encode("latin-1") + b"\r\n" + body


def _bearer_header(lines: list[str]) -> str | None:
    for line in lines:
        name, _, value = line.partition(":")
        if name.strip().lower() == "authorization":
            return value.strip()
    return None


def build_response(request_head: bytes, token: SecretStr | None) -> bytes:
    """The full HTTP response for one request head (the bytes up to the blank line)."""
    lines = request_head.decode("latin-1").split("\r\n")
    parts = lines[0].split(" ")
    if len(parts) != 3 or parts[0] != "GET" or parts[1].split("?", 1)[0] != "/metrics":
        return _response("404 Not Found", b"not found\n")
    if token is None:
        return _response("404 Not Found", b"not found\n")
    expected = f"Bearer {token.get_secret_value()}"
    supplied = _bearer_header(lines[1:])
    # Compare bytes: hmac.compare_digest rejects non-ASCII str, and a header can carry any byte.
    if supplied is None or not hmac.compare_digest(supplied.encode(), expected.encode()):
        return _response("401 Unauthorized", b"a valid metrics bearer token is required\n")
    return _response("200 OK", generate_latest(), CONTENT_TYPE_LATEST)


async def _handle(
    reader: asyncio.StreamReader, writer: asyncio.StreamWriter, token: SecretStr | None
) -> None:
    try:
        try:
            head = await asyncio.wait_for(
                reader.readuntil(b"\r\n\r\n"), timeout=READ_TIMEOUT_SECONDS
            )
        except (TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
            writer.write(_response("400 Bad Request", b"bad request\n"))
        else:
            writer.write(build_response(head, token))
        await asyncio.wait_for(writer.drain(), timeout=READ_TIMEOUT_SECONDS)
    except (OSError, TimeoutError):
        pass  # the scraper went away; nothing to report
    finally:
        writer.close()
        with contextlib.suppress(OSError):
            await writer.wait_closed()


@contextlib.asynccontextmanager
async def serve_metrics(port: int | None, token: SecretStr | None) -> AsyncIterator[None]:
    """Serve `/metrics` on 0.0.0.0:`port` for the duration of the block; do nothing without a port.

    A port that cannot be bound is logged and the worker carries on without the endpoint:
    metrics are not worth stopping the job loop for.
    """
    if port is None:
        yield
        return
    server: asyncio.Server | None = None
    try:
        # All interfaces on purpose: Prometheus reaches the worker over the container network,
        # and the bearer token (when set) is the access control.
        server = await asyncio.start_server(
            lambda r, w: _handle(r, w, token),
            host="0.0.0.0",  # noqa: S104
            port=port,
            limit=MAX_REQUEST_BYTES,
        )
    except OSError as exc:
        logger.error("worker_metrics_unavailable", port=port, error=str(exc))
    else:
        logger.info("worker_metrics_listening", port=port, enabled=token is not None)
    try:
        yield
    finally:
        if server is not None:
            server.close()
            with contextlib.suppress(TimeoutError):
                async with asyncio.timeout(READ_TIMEOUT_SECONDS):
                    await server.wait_closed()
