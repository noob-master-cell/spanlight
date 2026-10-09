"""Signed, URL-safe tokens: a JSON payload and an HMAC-SHA256 over it, keyed by `SECRET_KEY`.

Used for values the server hands to the browser and must be able to trust when they come back
without storing them: the OAuth state cookie and the two-factor login challenge. The token is
signed, not encrypted, so a payload must hold nothing that is secret from the browser holding it.

Each use passes its own `context`, bytes mixed into the signed message, so a token made for one
purpose can never validate as another even though they share one key.
"""

import base64
import binascii
import hashlib
import hmac
import json
from typing import Any


def seal(secret_key: str, context: bytes, payload: Any) -> str:
    """`<base64url payload>.<base64url signature>`, both without padding."""
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode())
    encoded = body.rstrip(b"=").decode()
    return f"{encoded}.{_encode(_signature(secret_key, context, encoded))}"


def unseal(secret_key: str, context: bytes, raw: str) -> dict[str, Any] | None:
    """The payload of a token made by `seal` with the same key and context, or None.

    None for anything else: a wrong key or context, a changed byte, a missing part, or a payload
    that is not a JSON object. The signature is compared in constant time.
    """
    encoded, separator, signature = raw.partition(".")
    if not separator or not encoded or not signature or "." in signature:
        return None
    expected = _encode(_signature(secret_key, context, encoded))
    if not hmac.compare_digest(expected.encode(), signature.encode()):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
    except (binascii.Error, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def _encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _signature(secret_key: str, context: bytes, encoded_payload: str) -> bytes:
    message = context + encoded_payload.encode()
    return hmac.new(secret_key.encode(), message, hashlib.sha256).digest()
