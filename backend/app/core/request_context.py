"""Per-request context shared by logging, errors and middleware."""

from contextvars import ContextVar

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def current_request_id() -> str | None:
    return _request_id.get()


def set_request_id(request_id: str | None) -> None:
    _request_id.set(request_id)
