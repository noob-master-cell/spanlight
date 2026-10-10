"""Doctor detector: the client gives up at a fixed time that is shorter than the model needs.

Reads: llm spans of the last 24 hours, fault-injected ones included (it judges client behaviour),
grouped by model.
Rule: a client abort is a `timeout` span with no gateway attributes (the SDK's own timeout) or
with `gateway.client_disconnected`; a gateway 504 never counts. Aborts are bucketed by whole
seconds, `T` is the median duration of the busiest bucket (the lower bucket wins a tie), and the
aborts within 10 % of `T` are the cluster. Fires when the cluster is at least 80 % of the aborts
and either the model has no successful call with a duration in the window, in the environments
of the clustered aborts, or `T` is below the p95 of those durations (nearest rank). Successes
that were fault-injected (a lab `malformed_json` or `truncated_stream` answers fast) or served
from the gateway cache are not model latency and do not count; nor do successes in another
environment, which may be another client with another timeout.
Guards: a model needs 10 aborts with a known duration. Warning. Key: the model.
Evidence: traces of the clustered aborts, most recent first; metrics `aborts`, `clustered_at_ms`,
`success_p95_ms` (`None` when there is no success).
"""

from collections import Counter, defaultdict
from collections.abc import Sequence
from datetime import timedelta
from decimal import Decimal

from app.insights.context import DetectorContext, LlmSpanRow
from app.insights.detectors._evidence import by_key, key_part, span_trace_ids
from app.insights.detectors.baselines import percentile_nearest_rank
from app.insights.format import count, duration_ms, round_ms, text
from app.insights.schemas import Evidence, Finding, Severity

KIND = "client_timeout_misconfigured"
WINDOW = timedelta(hours=24)
MIN_ABORTS = 10
BUCKET_MS = 1000
CLUSTER_TOLERANCE = Decimal("0.1")
CLUSTER_SHARE_PERCENT = 80
TIMEOUT = "timeout"
OK = "ok"
P95 = Decimal(95)


# Successful call durations per (environment, model).
_Successes = dict[tuple[str | None, str | None], list[int]]


def _is_model_success(span: LlmSpanRow) -> bool:
    """A success whose duration is the model's: not fault-injected, not a cache hit."""
    return span.status == OK and span.fault_scenario is None and not span.is_cache_hit


def is_client_abort(span: LlmSpanRow) -> bool:
    if span.error_class != TIMEOUT or span.duration_ms is None:
        return False
    return span.gateway is None or span.gateway.client_disconnected


def _median(values: Sequence[int]) -> Decimal:
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return Decimal(ordered[mid])
    return (Decimal(ordered[mid - 1]) + Decimal(ordered[mid])) / 2


def _modal_median(aborts: Sequence[LlmSpanRow]) -> Decimal:
    """Median duration of the busiest whole-second bucket (the lowest bucket on a tie)."""
    buckets = Counter((s.duration_ms or 0) // BUCKET_MS for s in aborts)
    modal = min(buckets, key=lambda b: (-buckets[b], b))
    return _median(
        [s.duration_ms or 0 for s in aborts if (s.duration_ms or 0) // BUCKET_MS == modal]
    )


class ClientTimeoutMisconfigured:
    kind = KIND
    window = WINDOW
    min_samples = MIN_ABORTS

    def run(self, ctx: DetectorContext) -> list[Finding]:
        aborts: dict[str | None, list[LlmSpanRow]] = defaultdict(list)
        successes: _Successes = defaultdict(list)
        for span in ctx.llm_spans:
            if is_client_abort(span):
                aborts[span.model].append(span)
            elif _is_model_success(span) and span.duration_ms is not None:
                successes[(span.environment, span.model)].append(span.duration_ms)
        findings = (
            self._finding(ctx, model, spans, successes)
            for model, spans in aborts.items()
            if len(spans) >= MIN_ABORTS
        )
        return by_key(f for f in findings if f is not None)

    def _finding(
        self,
        ctx: DetectorContext,
        model: str | None,
        aborts: Sequence[LlmSpanRow],
        successes: "_Successes",
    ) -> Finding | None:
        centre = _modal_median(aborts)
        clustered = [
            s
            for s in aborts
            if abs(Decimal(s.duration_ms or 0) - centre) <= centre * CLUSTER_TOLERANCE
        ]
        if len(clustered) * 100 < len(aborts) * CLUSTER_SHARE_PERCENT:
            return None
        environments = {s.environment for s in clustered}
        durations = [d for env in environments for d in successes.get((env, model), [])]
        success_p95 = percentile_nearest_rank(durations, P95) if durations else None
        if success_p95 is not None and centre >= success_p95:
            return None
        return Finding(
            kind=KIND,
            severity=Severity.WARNING,
            fingerprint_key=key_part(model),
            evidence=Evidence(
                trace_ids=span_trace_ids(clustered),
                metrics={
                    "aborts": len(aborts),
                    "clustered_at_ms": round_ms(centre),
                    "success_p95_ms": None if success_p95 is None else round_ms(success_p95),
                },
                window=ctx.window,
            ),
            params={
                "clustered_at": duration_ms(centre),
                "model": text(model),
                "aborts": count(len(aborts)),
                "success_p95": duration_ms(success_p95),
            },
        )


detector = ClientTimeoutMisconfigured()
