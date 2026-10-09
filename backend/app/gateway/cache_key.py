"""The cache key of a gateway request. Pure: no I/O.

Two requests share a key when they ask for the same thing on the same surface through the same
version of the same route. The route matters because its model aliases and credentials decide
which model answers: one route's answer is never replayed to another route, and saving a route
makes its earlier entries unreachable. Fields that do
not change what the provider answers (`stream` and `stream_options`, which only shape the
transport, and `user` and `metadata`, which only label the caller) are left out; everything else
is part of the key, so a different model, temperature or message is a different entry.

The project id is not in the hash. Every lookup and every store is scoped by `project_id` (it is
the first column of the table's primary key, under row-level security), so identical requests
from two projects never meet.
"""

import hashlib
import json
import uuid
from typing import Any

from app.gateway.errors import Surface

IGNORED_FIELDS = frozenset({"stream", "stream_options", "user", "metadata"})


def canonical_json(body: dict[str, Any]) -> bytes:
    """The body without the ignored fields as JSON with sorted keys and no whitespace, in UTF-8.

    `surrogatepass` keeps a body that holds a lone surrogate (valid JSON, not valid UTF-8) from
    raising: it gets a key like any other.
    """
    kept = {name: value for name, value in body.items() if name not in IGNORED_FIELDS}
    text = json.dumps(kept, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return text.encode("utf-8", errors="surrogatepass")


def cache_key(
    surface: Surface, body: dict[str, Any], *, route_id: uuid.UUID, route_version: int
) -> bytes:
    """SHA-256 (32 bytes) over the surface, the route id and version and the canonical body.

    The parts are joined by newlines; none of the first three can contain one.
    """
    digest = hashlib.sha256()
    digest.update(surface.encode())
    digest.update(b"\n")
    digest.update(str(route_id).encode())
    digest.update(b"\n")
    digest.update(str(route_version).encode())
    digest.update(b"\n")
    digest.update(canonical_json(body))
    return digest.digest()
