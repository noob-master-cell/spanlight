"""`unpriced_spend`: calls that report usage but got no price.

Reads the llm spans of the last 24 hours. Fault-injected spans and gateway cache hits are
dropped before counting. A span counts when both token counts are present and `cost_usd` is
null, which means the price book had no match for its model. Spans are grouped by
`(provider, model)`; a group with at least 20 such calls opens an info finding. Key:
`{provider}:{model}` (`-` for a missing value).
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from app.insights import format as fmt
from app.insights.context import DetectorContext, LlmSpanRow
from app.insights.detectors._evidence import by_key, key_part, span_trace_ids
from app.insights.schemas import Evidence, Finding, Severity

KIND = "unpriced_spend"
WINDOW = timedelta(hours=24)
MIN_UNPRICED_CALLS = 20


def _is_unpriced(span: LlmSpanRow) -> bool:
    return (
        span.fault_scenario is None
        and not span.is_cache_hit
        and span.input_tokens is not None
        and span.output_tokens is not None
        and span.cost_usd is None
    )


def _finding(
    ctx: DetectorContext, provider: str | None, model: str | None, spans: list[LlmSpanRow]
) -> Finding:
    input_tokens = sum(span.input_tokens or 0 for span in spans)
    output_tokens = sum(span.output_tokens or 0 for span in spans)
    return Finding(
        kind=KIND,
        severity=Severity.INFO,
        fingerprint_key=f"{key_part(provider)}:{key_part(model)}",
        evidence=Evidence(
            trace_ids=span_trace_ids(spans),
            metrics={
                "calls": len(spans),
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            },
            window=ctx.window,
        ),
        params={
            "provider": fmt.text(provider),
            "model": fmt.text(model),
            "calls": fmt.count(len(spans)),
            "input_tokens": fmt.count(input_tokens),
            "output_tokens": fmt.count(output_tokens),
        },
    )


@dataclass(frozen=True, slots=True)
class _UnpricedSpend:
    kind: str = KIND
    window: timedelta = WINDOW
    min_samples: int = MIN_UNPRICED_CALLS

    def run(self, ctx: DetectorContext) -> list[Finding]:
        groups: dict[tuple[str | None, str | None], list[LlmSpanRow]] = defaultdict(list)
        for span in ctx.llm_spans:
            if _is_unpriced(span):
                groups[(span.provider, span.model)].append(span)
        return by_key(
            _finding(ctx, provider, model, spans)
            for (provider, model), spans in groups.items()
            if len(spans) >= self.min_samples
        )


detector = _UnpricedSpend()
