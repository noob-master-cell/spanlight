"""A stable hash of what a model was asked, used to find identical calls. Pure.

The algorithm is shared with the Python SDK, which computes the same hash client side, and the
two must stay byte-for-byte identical: the first 32 hex characters of the SHA-256 of the
canonical JSON (sorted keys, `,` and `:` separators, non-ASCII kept) of
`{"model": model, "input": cleaned}`. `cleaned` is `input` without the top-level keys that change
from call to call but not the prompt (streaming flags, identifiers, transport options); an input
that is not a JSON object (a string, a list) is hashed as it is.

The hash is computed from the span's input as received, before the project's payload capture
setting drops it, so detectors can group calls of projects that store no payloads.
"""

import hashlib
import json
import re
from typing import Any

REQUEST_HASH = re.compile(r"[0-9a-f]{32}")
"""The shape of a hash (use with `fullmatch`)."""

IGNORED_INPUT_KEYS = frozenset(
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
"""Top-level request keys that never change what the model is asked."""


def request_hash(model: str | None, payload: Any) -> str | None:
    """The 32-hex request hash of a span's `input`, or None when there is no input."""
    if payload is None:
        return None
    cleaned = (
        {key: value for key, value in payload.items() if key not in IGNORED_INPUT_KEYS}
        if isinstance(payload, dict)
        else payload
    )
    canonical = json.dumps(
        {"model": model, "input": cleaned},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    # `surrogatepass` keeps a lone surrogate (valid JSON escape, invalid UTF-8) from raising; every
    # other string encodes exactly as plain UTF-8, as the SDK encodes it.
    return hashlib.sha256(canonical.encode("utf-8", "surrogatepass")).hexdigest()[:32]
