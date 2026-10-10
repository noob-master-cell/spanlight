"""Which kind of failure a span is. Pure: no database, no I/O.

`classify_error` gives every failed span one `ErrorClass`, so the explorer can filter on it and
the insight detectors can count failures by cause instead of matching messages themselves.

The rules, in order:

1. A span that did not fail has no class (`None`).
2. A numeric status decides first. It is read from `spanlight.gateway.upstream_status`, then
   `http.status_code`, then `error.status`, the first one present: 401 and 403 are `auth`, 429
   is `rate_limit`, 408, 499 and 504 are `timeout`, 413 is `context_length`, any 5xx (529
   included) is `provider_5xx`, and any other 4xx is `client` unless the message says the
   context was too long or the content was filtered, which is more specific.
3. Otherwise the message decides: the first group of patterns it contains, case-insensitively,
   in the order of `_MESSAGE_PATTERNS`.
4. Anything else is `unknown`.
"""

import enum
from collections.abc import Mapping
from typing import Any

from app.db.models import SpanStatus


class ErrorClass(enum.StrEnum):
    AUTH = "auth"
    RATE_LIMIT = "rate_limit"
    TIMEOUT = "timeout"
    CONTEXT_LENGTH = "context_length"
    CONTENT_FILTER = "content_filter"
    PROVIDER_5XX = "provider_5xx"
    NETWORK = "network"
    CLIENT = "client"
    UNKNOWN = "unknown"


STATUS_ATTRIBUTES = ("spanlight.gateway.upstream_status", "http.status_code", "error.status")

_STATUS_CLASSES: dict[int, ErrorClass] = {
    401: ErrorClass.AUTH,
    403: ErrorClass.AUTH,
    429: ErrorClass.RATE_LIMIT,
    408: ErrorClass.TIMEOUT,
    499: ErrorClass.TIMEOUT,
    504: ErrorClass.TIMEOUT,
    413: ErrorClass.CONTEXT_LENGTH,
}

# First match wins, so the order matters: "rate limit exceeded: request timed out" is a rate
# limit, and a disconnect or abort is a timeout before it is a network error.
_MESSAGE_PATTERNS: tuple[tuple[ErrorClass, tuple[str, ...]], ...] = (
    (
        ErrorClass.AUTH,
        ("unauthorized", "invalid api key", "authentication", "permission denied", "forbidden"),
    ),
    (ErrorClass.RATE_LIMIT, ("rate limit", "too many requests", "quota")),
    (
        ErrorClass.TIMEOUT,
        ("timed out", "timeout", "deadline exceeded", "client disconnected", "aborted"),
    ),
    (
        ErrorClass.CONTEXT_LENGTH,
        (
            "context length",
            "context window",
            "maximum context",
            "too many tokens",
            "prompt is too long",
        ),
    ),
    (ErrorClass.CONTENT_FILTER, ("content filter", "content_policy", "safety", "refusal")),
    (ErrorClass.NETWORK, ("connection", "dns", "ssl", "reset by peer", "econnrefused")),
    (
        ErrorClass.PROVIDER_5XX,
        ("overloaded", "internal server error", "service unavailable", "bad gateway", "upstream"),
    ),
)

# A 4xx whose message names one of these is that class rather than `client`.
_REFINES_CLIENT = frozenset({ErrorClass.CONTEXT_LENGTH, ErrorClass.CONTENT_FILTER})


def classify_error(
    status: SpanStatus, status_message: str | None, attributes: Mapping[str, Any]
) -> ErrorClass | None:
    """The span's error class, or None when the span did not fail (see the module docstring)."""
    if status != SpanStatus.ERROR:
        return None
    from_message = _class_from_message(status_message)
    code = _numeric_status(attributes)
    if code is not None:
        from_status = _class_from_status(code)
        if from_status == ErrorClass.CLIENT and from_message in _REFINES_CLIENT:
            return from_message
        if from_status is not None:
            return from_status
    return from_message or ErrorClass.UNKNOWN


def _numeric_status(attributes: Mapping[str, Any]) -> int | None:
    """The first status attribute holding a whole number (or a string of 1-3 ASCII digits)."""
    for key in STATUS_ATTRIBUTES:
        value = attributes.get(key)
        if isinstance(value, bool) or value is None:
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, float) and value.is_integer():
            return int(value)
        if isinstance(value, str):
            digits = value.strip()
            # ASCII only and at most 3 digits: str.isdigit() also accepts "²" and "①", which
            # int() rejects, and a client value must never fail the ingest batch.
            if digits.isascii() and digits.isdigit() and len(digits) <= 3:
                return int(digits)
    return None


def _class_from_status(code: int) -> ErrorClass | None:
    known = _STATUS_CLASSES.get(code)
    if known is not None:
        return known
    if 500 <= code <= 599:
        return ErrorClass.PROVIDER_5XX
    if 400 <= code <= 499:
        return ErrorClass.CLIENT
    return None  # not an error status; the message decides


def _class_from_message(message: str | None) -> ErrorClass | None:
    if not message:
        return None
    lowered = message.lower()
    for error_class, patterns in _MESSAGE_PATTERNS:
        if any(pattern in lowered for pattern in patterns):
            return error_class
    return None
