"""Request body size limit for the dashboard API (`/api/v1`).

Every `/api/v1` body is a small JSON document, and Starlette reads a JSON body into memory in
one piece, so without a cap anyone able to reach an unauthenticated route (login, signup,
password reset) could make the process buffer as much as they care to send. Ingestion
(`/v1/traces`, `/v1/otlp/traces`) is not covered: it has its own, larger limit
(`app.ingest.schemas.MAX_BODY_BYTES`) enforced while it reads, and also applied to the
decompressed size.

Two checks, both before the body is buffered. A request that declares a `Content-Length` over
the limit is refused without reading anything. A request that does not (chunked) or that lies
is cut off while it is read: the wrapped `receive` raises as soon as the running total passes
the limit. The exception is a Starlette `HTTPException`, which FastAPI re-raises untouched when
it comes out of body parsing and the application's handler turns into the same 413
problem+json (`PAYLOAD_TOO_LARGE`) as every other error. Because the wrapper sits outside the
application, the idempotency middleware, which reads the body to fingerprint it, is bound by it
too.
"""

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import problem_response

MAX_API_BODY_BYTES = 1024 * 1024
API_PREFIX = "/api/v1/"


def _detail(limit: int) -> str:
    return f"Request bodies are limited to {limit} bytes."


class BodyLimitMiddleware:
    """Refuses (413) request bodies over `max_bytes` on paths under `prefix`."""

    def __init__(
        self, app: ASGIApp, max_bytes: int = MAX_API_BODY_BYTES, prefix: str = API_PREFIX
    ) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith(self.prefix):
            await self.app(scope, receive, send)
            return

        declared = _content_length(scope)
        if declared is not None and declared > self.max_bytes:
            response = problem_response(413, "PAYLOAD_TOO_LARGE", _detail(self.max_bytes))
            await response(scope, receive, send)
            return

        received = 0

        async def counting_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(status_code=413, detail=_detail(self.max_bytes))
            return message

        await self.app(scope, counting_receive, send)


def _content_length(scope: Scope) -> int | None:
    for name, value in scope.get("headers", []):
        if name == b"content-length":
            text = bytes(value).decode("latin-1").strip()
            return int(text) if text.isascii() and text.isdigit() else None
    return None
