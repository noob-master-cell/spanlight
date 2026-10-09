"""W3C Trace Context compatible identifier generation.

Trace ids are 16 random bytes rendered as 32 lowercase hex characters and span
ids are 8 random bytes rendered as 16 lowercase hex characters. The all-zero
value is invalid in W3C Trace Context, so it is never returned.
"""

from __future__ import annotations

import secrets

_TRACE_ID_BYTES = 16
_SPAN_ID_BYTES = 8


def _random_hex(num_bytes: int) -> str:
    while True:
        value = secrets.token_hex(num_bytes)
        if value.strip("0"):
            return value


def new_trace_id() -> str:
    """Return a new random 32-hex-character trace id."""
    return _random_hex(_TRACE_ID_BYTES)


def new_span_id() -> str:
    """Return a new random 16-hex-character span id."""
    return _random_hex(_SPAN_ID_BYTES)
