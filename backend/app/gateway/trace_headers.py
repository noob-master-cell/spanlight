"""The `x-spanlight-*` request headers that join a gateway call to a trace the caller started.

Pure. `TraceHeaders.from_headers` reads them, dropping what is invalid.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass, field

TRACE_ID_HEADER = "x-spanlight-trace-id"
PARENT_SPAN_ID_HEADER = "x-spanlight-parent-span-id"
SESSION_HEADER = "x-spanlight-session"
USER_HEADER = "x-spanlight-user"
TAGS_HEADER = "x-spanlight-tags"

MAX_TAGS = 20
MAX_TAG_LENGTH = 64
MAX_TRACE_TEXT = 256  # user and session ids, as in native ingestion

_TRACE_ID = re.compile(r"[0-9a-f]{32}")
_SPAN_ID = re.compile(r"[0-9a-f]{16}")


def _valid_id(value: str | None, pattern: re.Pattern[str]) -> str | None:
    if value is None:
        return None
    lowered = value.strip().lower()
    if not pattern.fullmatch(lowered) or not lowered.strip("0"):
        return None
    return lowered


def _bounded_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped if 0 < len(stripped) <= MAX_TRACE_TEXT else None


def _tags(value: str | None) -> list[str]:
    if not value:
        return []
    kept: list[str] = []
    for raw in value.split(","):
        tag = raw.strip()
        if tag and len(tag) <= MAX_TAG_LENGTH and tag not in kept:
            kept.append(tag)
    return kept[:MAX_TAGS]


@dataclass(frozen=True)
class TraceHeaders:
    """The trace a gateway call joins, read from the `x-spanlight-*` request headers."""

    trace_id: str | None = None
    parent_span_id: str | None = None
    session_id: str | None = None
    user_id: str | None = None
    tags: list[str] = field(default_factory=list)

    @classmethod
    def from_headers(cls, headers: Mapping[str, str]) -> "TraceHeaders":
        """Read the headers, dropping what is invalid.

        If either id is present but invalid, both are dropped and the call starts a new trace; a
        parent id without a trace id is dropped as well. User and session ids are 1 to 256
        characters, tags are comma-separated, at most 20 of at most 64 characters each (longer
        ones are dropped, repeats ignored).
        """
        lowered = {name.lower(): value for name, value in headers.items()}
        raw_trace, raw_parent = lowered.get(TRACE_ID_HEADER), lowered.get(PARENT_SPAN_ID_HEADER)
        trace_id = _valid_id(raw_trace, _TRACE_ID)
        parent = _valid_id(raw_parent, _SPAN_ID)
        invalid = (raw_trace is not None and trace_id is None) or (
            raw_parent is not None and parent is None
        )
        if invalid or trace_id is None:
            trace_id, parent = None, None
        return cls(
            trace_id=trace_id,
            parent_span_id=parent,
            session_id=_bounded_text(lowered.get(SESSION_HEADER)),
            user_id=_bounded_text(lowered.get(USER_HEADER)),
            tags=_tags(lowered.get(TAGS_HEADER)),
        )
