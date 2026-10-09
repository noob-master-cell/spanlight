"""Identifier generation.

Public identifiers are UUIDv7: time-ordered (good B-tree locality, sortable by
creation) while still unguessable enough for use in URLs.
"""

import sys
import uuid

if sys.version_info >= (3, 14):
    from uuid import uuid7 as _uuid7
else:
    from uuid6 import uuid7 as _uuid7


def new_id() -> uuid.UUID:
    return uuid.UUID(bytes=_uuid7().bytes)
