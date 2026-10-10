"""cost_spike: the last hour's spend in one environment is far above its 7-day hourly rate.

Reads: llm spans of the last hour, after dropping fault-injected spans, keeping priced calls
(`cost_usd` not null), and the baseline `cost_usd_per_hour` for the environment (any provider,
any model).
Rule: per environment with at least 20 priced calls and spend of at least $1,
`spend >= max(3 x baseline_hourly, baseline_hourly + $1)`. Warning; critical when
`spend >= 10 x baseline_hourly`.
Guards: fault exclusion before counting (min_samples included), unpriced calls never count (an
unknown cost is not 0), no baseline means no finding. When the baseline is 0 the ratio is unknown
(`None` in evidence, "—" in the title) and the finding stays a warning, since "10 x nothing" says
nothing about size.
Key: `{environment}`.
"""

from datetime import timedelta
from decimal import Decimal

from app.insights import format as fmt
from app.insights.context import DetectorContext, LlmSpanRow
from app.insights.detectors._evidence import by_key, key_part, span_trace_ids
from app.insights.detectors.baselines import (
    exceeds,
    group_spans,
    without_faults,
)
from app.insights.schemas import Evidence, Finding, Severity

KIND = "cost_spike"
WINDOW = timedelta(hours=1)
MIN_PRICED_CALLS = 20
MIN_SPEND_USD = Decimal(1)
BASELINE_MULTIPLE = Decimal(3)
BASELINE_FLOOR_USD = Decimal(1)
CRITICAL_MULTIPLE = Decimal(10)


class CostSpikeDetector:
    kind = KIND
    window = WINDOW
    min_samples = MIN_PRICED_CALLS

    def run(self, ctx: DetectorContext) -> list[Finding]:
        priced = [s for s in without_faults(ctx.llm_spans) if s.cost_usd is not None]
        findings: list[Finding] = []
        for environment, calls in group_spans(priced, lambda s: s.environment).items():
            if len(calls) < MIN_PRICED_CALLS:
                continue
            spend = sum((s.cost_usd for s in calls if s.cost_usd is not None), Decimal(0))
            if spend < MIN_SPEND_USD:
                continue
            baseline = ctx.baselines.get("cost_usd_per_hour", environment=environment)
            if baseline is None:
                continue
            if exceeds(spend, baseline, BASELINE_MULTIPLE, BASELINE_FLOOR_USD):
                findings.append(_finding(ctx, environment, calls, spend, baseline))
        return by_key(findings)


def _finding(
    ctx: DetectorContext,
    environment: str | None,
    calls: list[LlmSpanRow],
    spend: Decimal,
    baseline: Decimal,
) -> Finding:
    multiple = spend / baseline if baseline > 0 else None
    shown_ratio = fmt.round_seconds(multiple) if multiple is not None else None
    critical = multiple is not None and multiple >= CRITICAL_MULTIPLE
    return Finding(
        kind=KIND,
        severity=Severity.CRITICAL if critical else Severity.WARNING,
        fingerprint_key=key_part(environment),
        evidence=Evidence(
            trace_ids=span_trace_ids(calls),
            metrics={
                "spend_usd": fmt.round_money(spend),
                "baseline_hourly_usd": fmt.round_money(baseline),
                "ratio": shown_ratio,
                "priced_calls": len(calls),
            },
            window=ctx.window,
        ),
        params={
            "ratio": fmt.ratio(shown_ratio),
            "environment": fmt.text(environment),
            "spend": fmt.money(spend),
            "priced_calls": fmt.count(len(calls)),
            "baseline_hourly": fmt.money(baseline),
        },
    )


detector = CostSpikeDetector()
