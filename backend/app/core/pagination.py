"""Opaque keyset cursors.

A cursor encodes the sort key of the last item on the previous page. It is
base64url JSON: opaque to clients, but not a secret (it carries no
authorization; every query is still scoped to the caller's org/project).
"""

import base64
import binascii
import json
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import Query

from app.core.errors import FieldError, ProblemError

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200

PageLimit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]


def encode_cursor(sort_value: datetime, tiebreaker: str) -> str:
    payload = json.dumps({"s": sort_value.isoformat(), "t": tiebreaker}, separators=(",", ":"))
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        sort_value = datetime.fromisoformat(payload["s"])
        tiebreaker = payload["t"]
        if not isinstance(tiebreaker, str) or sort_value.tzinfo is None:
            raise ValueError("malformed cursor")
    except (binascii.Error, ValueError, KeyError, TypeError, RecursionError) as exc:
        raise _invalid_cursor() from exc
    return sort_value, tiebreaker


def _invalid_cursor() -> ProblemError:
    return ProblemError(
        422,
        "VALIDATION_ERROR",
        "The pagination cursor is invalid.",
        errors=[FieldError(field="cursor", message="Invalid cursor")],
    )


def decode_uuid_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    sort_value, tiebreaker = decode_cursor(cursor)
    try:
        return sort_value, uuid.UUID(tiebreaker)
    except ValueError as exc:
        raise _invalid_cursor() from exc
