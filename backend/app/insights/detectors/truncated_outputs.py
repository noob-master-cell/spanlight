"""Doctor detector: responses that stop at the token limit.

Reads: llm spans of the last hour with a known `finish_reason`, grouped by model.
Rule: the share of those calls whose `finish_reason` is `length` is at least 10 %.
Guards: a model needs 50 calls with a known finish reason; calls with a null finish reason are
not counted at all (unknown is not "stop"). Warning. Key: the model.
Evidence: traces of the `length` calls, most recent first; metrics `share`, `truncated`, `calls`.
"""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from app.insights.context import DetectorContext, LlmSpanRow
from app.insights.detectors._evidence import by_key, key_part, span_trace_ids
from app.insights.format import count, rate, round_share, text
from app.insights.schemas import Evidence, Finding, Severity

KIND = "truncated_outputs"
WINDOW = timedelta(hours=1)
MIN_CALLS = 50
MIN_SHARE = Decimal("0.10")
LENGTH = "length"


class TruncatedOutputs:
    kind = KIND
    window = WINDOW
    min_samples = MIN_CALLS

    def run(self, ctx: DetectorContext) -> list[Finding]:
        by_model: dict[str | None, list[LlmSpanRow]] = defaultdict(list)
        for span in ctx.llm_spans:
            if span.finish_reason is not None:
                by_model[span.model].append(span)
        findings = (
            self._finding(ctx, model, spans)
            for model, spans in by_model.items()
            if len(spans) >= MIN_CALLS
        )
        return by_key(f for f in findings if f is not None)

    def _finding(
        self, ctx: DetectorContext, model: str | None, spans: list[LlmSpanRow]
    ) -> Finding | None:
        truncated = [s for s in spans if s.finish_reason == LENGTH]
        share = Decimal(len(truncated)) / Decimal(len(spans))
        if share < MIN_SHARE:
            return None
        return Finding(
            kind=KIND,
            severity=Severity.WARNING,
            fingerprint_key=key_part(model),
            evidence=Evidence(
                trace_ids=span_trace_ids(truncated),
                metrics={
                    "share": round_share(share),
                    "truncated": len(truncated),
                    "calls": len(spans),
                },
                window=ctx.window,
            ),
            params={
                "share": rate(share),
                "model": text(model),
                "truncated": count(len(truncated)),
                "calls": count(len(spans)),
            },
        )


detector = TruncatedOutputs()
