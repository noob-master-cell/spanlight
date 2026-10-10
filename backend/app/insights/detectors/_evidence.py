"""What every detector shares when it builds findings: fingerprint key parts, evidence trace ids
and the order findings come out in. Pure."""

from collections.abc import Iterable
from datetime import datetime
from typing import Protocol

from app.insights.schemas import MAX_EVIDENCE_TRACES, Finding

NO_VALUE = "-"
"""How a missing environment, model or provider is written inside a fingerprint key."""


class Traced(Protocol):
    """A span row: anything with a trace id and a start time."""

    @property
    def trace_id(self) -> str: ...

    @property
    def started_at(self) -> datetime: ...


def key_part(value: str | None) -> str:
    """A fingerprint key segment: the value, or `-` when it is missing (NULL or empty)."""
    return value if value else NO_VALUE


def recent_trace_ids(contributions: Iterable[tuple[datetime, str]]) -> list[str]:
    """Distinct trace ids, most recent first, at most `MAX_EVIDENCE_TRACES`.

    Each item is `(started_at, trace_id)` of a span that contributed to the finding. A trace
    is ranked by its latest contributing span; ties break on the trace id, so the order does not
    depend on the order the spans were read in.
    """
    latest: dict[str, datetime] = {}
    for started_at, trace_id in contributions:
        if trace_id not in latest or started_at > latest[trace_id]:
            latest[trace_id] = started_at
    ranked = sorted(latest.items(), key=lambda item: (item[1], item[0]), reverse=True)
    return [trace_id for trace_id, _ in ranked[:MAX_EVIDENCE_TRACES]]


def span_trace_ids(spans: Iterable[Traced]) -> list[str]:
    """`recent_trace_ids` of spans that each contributed to the finding."""
    return recent_trace_ids((span.started_at, span.trace_id) for span in spans)


def by_key(findings: Iterable[Finding]) -> list[Finding]:
    """Findings in fingerprint key order, so a run's output never depends on the read order."""
    return sorted(findings, key=lambda finding: finding.fingerprint_key)
