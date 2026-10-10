"""retry_storm: the client repeats an identical failing request in a tight burst.

Reads: llm spans of the last 15 minutes that carry a `request_hash`. Cache hits are excluded
(they never reached a provider) and so are spans without a hash. Fault-injected spans are kept:
this detector judges client behaviour.

Rule: per (environment, model), spans are grouped by `request_hash`, then split into flows: a
flow is the spans of one trace, joined with every trace that shares a non-null `session_id` with
it. Within a flow, spans are sorted by start time. A storm is a maximal run of at least
`STORM_MIN_SPANS` spans in which every span starts within `STORM_WINDOW` of the run's first span
and the first span has status `error`. Runs are found greedily from the earliest eligible span,
so overlapping windows count once. The finding fires on at least one storm and is critical when
the largest storm reaches `CRITICAL_STORM_SPANS`.

Only one flow can retry its own request: identical prompts from unrelated traces and sessions
(parallel users of a fixed prompt, a fan-out, a hash collision) are not a storm.

Guards: fewer than `MIN_SPANS_WITH_HASH` hashed spans in a (environment, model) group returns
nothing for that group. The brief says "20 spans with a hash"; it is counted per group, the
same slice the finding is keyed by.
"""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.insights import format as fmt
from app.insights.context import DetectorContext, LlmSpanRow
from app.insights.detectors._evidence import by_key, key_part, recent_trace_ids
from app.insights.schemas import Evidence, Finding, Severity

KIND = "retry_storm"
WINDOW = timedelta(minutes=15)
MIN_SPANS_WITH_HASH = 20
STORM_MIN_SPANS = 5
STORM_WINDOW = timedelta(seconds=60)
CRITICAL_STORM_SPANS = 20


def find_storms(spans: Sequence[LlmSpanRow]) -> list[list[LlmSpanRow]]:
    """Storms among spans that share one request hash, in start order."""
    ordered = sorted(spans, key=lambda s: (s.started_at, s.span_id))
    storms: list[list[LlmSpanRow]] = []
    i = 0
    while i < len(ordered):
        first = ordered[i]
        if first.status != "error":
            i += 1
            continue
        end = i + 1
        while end < len(ordered) and ordered[end].started_at - first.started_at <= STORM_WINDOW:
            end += 1
        if end - i >= STORM_MIN_SPANS:
            storms.append(ordered[i:end])
            i = end
        else:
            i += 1
    return storms


def flows(spans: Sequence[LlmSpanRow]) -> list[list[LlmSpanRow]]:
    """`spans` split by flow: same trace, or traces linked by a shared non-null session."""
    parent: dict[str, str] = {}

    def root(node: str) -> str:
        while parent.setdefault(node, node) != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    for span in spans:
        trace_root = root(f"trace:{span.trace_id}")
        if span.session_id is not None:
            parent[trace_root] = root(f"session:{span.session_id}")
    grouped: dict[str, list[LlmSpanRow]] = defaultdict(list)
    for span in spans:
        grouped[root(f"trace:{span.trace_id}")].append(span)
    return list(grouped.values())


def _group_finding(
    environment: str | None,
    model: str | None,
    storms: list[list[LlmSpanRow]],
    ctx: DetectorContext,
) -> Finding:
    largest = max(len(storm) for storm in storms)
    hashes = {storm[0].request_hash for storm in storms}
    contributions: list[tuple[datetime, str]] = [
        (span.started_at, span.trace_id) for storm in storms for span in storm
    ]
    return Finding(
        kind=KIND,
        severity=Severity.CRITICAL if largest >= CRITICAL_STORM_SPANS else Severity.WARNING,
        fingerprint_key=f"{key_part(environment)}:{key_part(model)}",
        evidence=Evidence(
            trace_ids=recent_trace_ids(contributions),
            metrics={"storms": len(storms), "largest_storm": largest, "hashes": len(hashes)},
            window=ctx.window,
        ),
        params={
            "storms": fmt.count_noun(len(storms), "burst"),
            "largest_storm": fmt.count(largest),
            "hashes": fmt.count_noun(len(hashes), "distinct request"),
        },
    )


@dataclass(frozen=True, slots=True)
class RetryStormDetector:
    kind: str = KIND
    window: timedelta = WINDOW
    min_samples: int = MIN_SPANS_WITH_HASH

    def run(self, ctx: DetectorContext) -> list[Finding]:
        groups: dict[tuple[str | None, str | None], list[LlmSpanRow]] = defaultdict(list)
        for span in ctx.llm_spans:
            if span.request_hash is not None and not span.is_cache_hit:
                groups[(span.environment, span.model)].append(span)

        findings: list[Finding] = []
        for (environment, model), spans in groups.items():
            if len(spans) < self.min_samples:
                continue
            by_hash: dict[str, list[LlmSpanRow]] = defaultdict(list)
            for span in spans:
                if span.request_hash is not None:
                    by_hash[span.request_hash].append(span)
            storms = [
                storm
                for same in by_hash.values()
                for flow in flows(same)
                for storm in find_storms(flow)
            ]
            if storms:
                findings.append(_group_finding(environment, model, storms, ctx))
        return by_key(findings)


detector = RetryStormDetector()
