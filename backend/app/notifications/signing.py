"""Signing of outgoing webhook bodies, and the check a receiver (or a test) runs on them.

The signature covers the timestamp as well as the body: `HMAC-SHA256(secret, "<timestamp>." +
body)`, sent as `sha256=<hex>`. A receiver that rejects timestamps further than five minutes from
its clock cannot be fed a captured request later. Pure functions, no I/O: webhook alerts use them
today, and every other signed delivery of the product shares them.
"""

import hashlib
import hmac

SCHEME = "sha256"
DEFAULT_TOLERANCE_SECONDS = 300


def sign(secret: bytes, timestamp: int, body: bytes) -> str:
    """The `X-Spanlight-Signature` value for `body` sent at unix time `timestamp`."""
    mac = hmac.new(secret, f"{timestamp}.".encode() + body, hashlib.sha256)
    return f"{SCHEME}={mac.hexdigest()}"


def verify(
    secret: bytes,
    timestamp: int,
    body: bytes,
    header: str,
    now: int,
    tolerance_s: int = DEFAULT_TOLERANCE_SECONDS,
) -> bool:
    """True when `header` signs `body` and `timestamp` is within `tolerance_s` seconds of `now`.

    A timestamp too far in the past or in the future is refused. The comparison takes the same
    time wherever the two values differ.
    """
    if abs(now - timestamp) > tolerance_s:
        return False
    return hmac.compare_digest(sign(secret, timestamp, body).encode(), header.encode())
