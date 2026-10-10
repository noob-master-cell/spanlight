"""`tool_loop`: an agent calling the same tool with the same arguments again and again.

Reads: `ctx.tool_spans` of the last hour (fault exclusion does not apply).

Rule: within one trace, tool spans ordered by `started_at`; a loop is a maximal run of
consecutive spans with the same `name` and the same non-null `input_hash` (a span whose input
was not stored never joins a run). A tool name fires when any run reaches 4 spans.

Severity: warning; critical when the longest run reaches 10. Key: tool name.
Metrics: `traces` (traces with such a run for that name), `max_repeats` (the longest run).
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import groupby

from app.insights import format as fmt
from app.insights.context import DetectorContext, ToolSpanRow
from app.insights.detectors._evidence import by_key, recent_trace_ids
from app.insights.schemas import Evidence, Finding, Severity

KIND = "tool_loop"
WINDOW = timedelta(hours=1)
MIN_SAMPLES = 1  # one loop

MIN_REPEATS = 4
CRITICAL_REPEATS = 10


def _loops_in_trace(spans: list[ToolSpanRow]) -> list[tuple[str, int, datetime]]:
    """`(name, run length, start of the run's last span)` for each loop in one trace."""
    ordered = sorted(spans, key=lambda s: (s.started_at, s.span_id))
    loops: list[tuple[str, int, datetime]] = []
    for (name, input_hash), run in groupby(ordered, key=lambda s: (s.name, s.input_hash)):
        members = list(run)
        if input_hash is not None and len(members) >= MIN_REPEATS:
            loops.append((name, len(members), members[-1].started_at))
    return loops


def _finding(name: str, loops: list[tuple[str, int, datetime]], ctx: DetectorContext) -> Finding:
    """`loops` holds `(trace_id, run length, last span start)` for one tool name."""
    max_repeats = max(length for _, length, _ in loops)
    traces = {trace_id for trace_id, _, _ in loops}
    severity = Severity.CRITICAL if max_repeats >= CRITICAL_REPEATS else Severity.WARNING
    return Finding(
        kind=KIND,
        severity=severity,
        fingerprint_key=name,
        evidence=Evidence(
            trace_ids=recent_trace_ids((seen, trace_id) for trace_id, _, seen in loops),
            metrics={"traces": len(traces), "max_repeats": max_repeats},
            window=ctx.window,
        ),
        params={
            "name": name,
            "traces": fmt.count_noun(len(traces), "trace"),
            "max_repeats": fmt.count(max_repeats),
        },
    )


@dataclass(frozen=True, slots=True)
class ToolLoopDetector:
    kind: str = KIND
    window: timedelta = WINDOW
    min_samples: int = MIN_SAMPLES

    def run(self, ctx: DetectorContext) -> list[Finding]:
        by_trace: dict[str, list[ToolSpanRow]] = defaultdict(list)
        for span in ctx.tool_spans:
            by_trace[span.trace_id].append(span)
        by_name: dict[str, list[tuple[str, int, datetime]]] = defaultdict(list)
        for trace_id, spans in by_trace.items():
            for name, length, seen in _loops_in_trace(spans):
                by_name[name].append((trace_id, length, seen))
        return by_key(_finding(name, loops, ctx) for name, loops in by_name.items())


detector = ToolLoopDetector()
