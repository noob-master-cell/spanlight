"""latency_regression: the p95 latency of one model rose well past its 7-day baseline.

Reads: llm spans of the last hour, after dropping fault-injected spans, keeping successful calls
(`status == "ok"`) with a known duration, and the baseline `p95_ms` for the model (any
environment, any provider).
Rule: per model with at least 100 such calls, `p95 >= max(1.5 x baseline, baseline + 500 ms)`,
i.e. at least 1.5 x the baseline and at least 500 ms above it. Warning. The p95 is exact, by
nearest rank over the observed durations (no interpolation).
Guards: fault exclusion before counting (min_samples included), failed calls never count (a fast
error would hide a slow tail), no baseline means no finding.
Key: `{model}`.
"""

from datetime import timedelta
from decimal import Decimal

from app.insights import format as fmt
from app.insights.context import DetectorContext, LlmSpanRow
from app.insights.detectors._evidence import by_key, key_part, span_trace_ids
from app.insights.detectors.baselines import (
    exceeds,
    group_spans,
    percentile_nearest_rank,
    without_faults,
)
from app.insights.schemas import Evidence, Finding, Severity

KIND = "latency_regression"
WINDOW = timedelta(hours=1)
MIN_CALLS = 100
BASELINE_MULTIPLE = Decimal("1.5")
BASELINE_FLOOR_MS = Decimal(500)
PERCENTILE = Decimal(95)
OK_STATUS = "ok"


class LatencyRegressionDetector:
    kind = KIND
    window = WINDOW
    min_samples = MIN_CALLS

    def run(self, ctx: DetectorContext) -> list[Finding]:
        spans = [
            span
            for span in without_faults(ctx.llm_spans)
            if span.status == OK_STATUS and span.duration_ms is not None
        ]
        findings: list[Finding] = []
        for model, calls in group_spans(spans, lambda s: s.model).items():
            if len(calls) < MIN_CALLS:
                continue
            baseline = ctx.baselines.get("p95_ms", model=model)
            if baseline is None:
                continue
            p95 = percentile_nearest_rank([s.duration_ms or 0 for s in calls], PERCENTILE)
            if exceeds(p95, baseline, BASELINE_MULTIPLE, BASELINE_FLOOR_MS):
                findings.append(_finding(ctx, model, calls, p95, baseline))
        return by_key(findings)


def _finding(
    ctx: DetectorContext,
    model: str | None,
    calls: list[LlmSpanRow],
    p95: Decimal,
    baseline: Decimal,
) -> Finding:
    slow = [span for span in calls if Decimal(span.duration_ms or 0) >= p95]
    return Finding(
        kind=KIND,
        severity=Severity.WARNING,
        fingerprint_key=key_part(model),
        evidence=Evidence(
            trace_ids=span_trace_ids(slow),
            metrics={
                "p95_ms": fmt.round_ms(p95),
                "baseline_p95_ms": fmt.round_ms(baseline),
                "calls": len(calls),
            },
            window=ctx.window,
        ),
        params={
            "p95": fmt.duration_ms(p95),
            "model": fmt.text(model),
            "calls": fmt.count(len(calls)),
            "baseline_p95": fmt.duration_ms(baseline),
        },
    )


detector = LatencyRegressionDetector()
