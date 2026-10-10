"""Stable hash of a model request, used to group identical calls.

The algorithm is shared with the server and must stay byte-for-byte identical
to it: the first 32 hex characters of the SHA-256 of the canonical JSON
(sorted keys, ``,`` and ``:`` separators, non-ASCII kept) of
``{"model": model, "input": cleaned}``. ``cleaned`` is ``input`` without the
top-level keys that change per call but not the prompt (streaming flags,
identifiers, transport options); non-dict inputs are hashed as they are.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

# Top-level request keys that never change what the model is asked.
_IGNORED_INPUT_KEYS = frozenset(
    {
        "stream",
        "stream_options",
        "user",
        "metadata",
        "idempotency_key",
        "extra_headers",
        "extra_query",
        "extra_body",
        "timeout",
        "api_key",
        "http_client",
    }
)


def request_hash(model: str | None, value: Any) -> str | None:
    """Return the 32-hex request hash, or ``None`` when ``value`` is ``None``.

    Args:
        model: The requested model name, or ``None`` when unknown.
        value: The JSON-compatible request input (a dict of call parameters,
            a string or a list).
    """
    if value is None:
        return None
    cleaned = (
        {key: item for key, item in value.items() if key not in _IGNORED_INPUT_KEYS}
        if isinstance(value, dict)
        else value
    )
    canonical = json.dumps(
        {"model": model, "input": cleaned},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    # ``surrogatepass``, as on the server: a lone surrogate (a valid JSON escape, invalid
    # UTF-8) is hashed instead of raising; every other string encodes exactly as UTF-8.
    return hashlib.sha256(canonical.encode("utf-8", "surrogatepass")).hexdigest()[:32]
