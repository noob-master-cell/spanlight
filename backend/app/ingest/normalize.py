"""Turn validated spans into storage-ready rows.

Normalization covers semantic checks that a schema cannot express (time
ordering, plausible timestamps), payload redaction and truncation, the
per-project payload capture toggle, and cost calculation.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from app.core.redact import redact_json, redact_text
from app.db.models import SpanKind, SpanStatus
from app.ingest.schemas import SpanIn
from app.pricing.cost import PriceBook

MAX_PAYLOAD_BYTES = 32 * 1024
MAX_ATTRIBUTES_BYTES = 64 * 1024
MAX_SPAN_AGE = timedelta(days=90)  # the longest retention a project can configure
MAX_CLOCK_SKEW = timedelta(minutes=10)


class SpanRejectedError(Exception):
    """A span failed a semantic check; the message is reported to the client."""


@dataclass(frozen=True)
class TraceFields:
    name: str | None
    environment: str | None
    release: str | None
    external_user_id: str | None
    session_id: str | None
    tags: tuple[str, ...]


@dataclass(frozen=True)
class NormalizedSpan:
    trace_id: str
    span_id: str
    parent_span_id: str | None
    kind: SpanKind
    name: str
    status: SpanStatus
    status_message: str | None
    started_at: datetime
    ended_at: datetime
    provider: str | None
    model: str | None
    input_tokens: int | None
    output_tokens: int | None
    cached_tokens: int | None
    cost_usd: Decimal | None
    pricing_version: str | None
    time_to_first_token_ms: float | None
    input: Any
    output: Any
    attributes: dict[str, Any]
    truncated: bool
    trace: TraceFields


def normalize_span(
    span: SpanIn, *, capture_payloads: bool, prices: PriceBook, now: datetime
) -> NormalizedSpan:
    _check_timing(span, now)
    if span.parent_span_id == span.span_id:
        raise SpanRejectedError("parent_span_id: a span cannot be its own parent")

    usage = span.usage
    input_tokens = usage.input_tokens if usage else None
    output_tokens = usage.output_tokens if usage else None
    cached_tokens = usage.cached_tokens if usage else None
    if cached_tokens is not None and input_tokens is not None and cached_tokens > input_tokens:
        raise SpanRejectedError("usage.cached_tokens: cannot exceed usage.input_tokens")

    attributes = redact_json(span.attributes)
    if _json_size(attributes) > MAX_ATTRIBUTES_BYTES:
        raise SpanRejectedError(f"attributes: exceed {MAX_ATTRIBUTES_BYTES} bytes")

    if capture_payloads:
        stored_input, input_truncated = _prepare_payload(span.input)
        stored_output, output_truncated = _prepare_payload(span.output)
    else:
        stored_input, input_truncated = None, False
        stored_output, output_truncated = None, False

    cost = prices.cost(
        provider=span.provider,
        model=span.model,
        at=span.start_time,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_tokens=cached_tokens,
    )

    return NormalizedSpan(
        trace_id=span.trace_id,
        span_id=span.span_id,
        parent_span_id=span.parent_span_id,
        kind=span.kind,
        name=span.name,
        status=span.status,
        status_message=redact_text(span.status_message) if span.status_message else None,
        started_at=span.start_time,
        ended_at=span.end_time,
        provider=span.provider,
        model=span.model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_tokens=cached_tokens,
        cost_usd=cost.cost_usd if cost else None,
        pricing_version=cost.pricing_version if cost else None,
        time_to_first_token_ms=(
            float(span.time_to_first_token_ms) if span.time_to_first_token_ms is not None else None
        ),
        input=stored_input,
        output=stored_output,
        attributes=attributes,
        truncated=input_truncated or output_truncated,
        trace=_trace_fields(span),
    )


def _check_timing(span: SpanIn, now: datetime) -> None:
    if span.end_time < span.start_time:
        raise SpanRejectedError("end_time: must not be before start_time")
    if span.start_time < now - MAX_SPAN_AGE:
        raise SpanRejectedError("start_time: older than the maximum retention of 90 days")
    if span.end_time > now + MAX_CLOCK_SKEW:
        raise SpanRejectedError("end_time: is in the future")


def _trace_fields(span: SpanIn) -> TraceFields:
    trace = span.trace
    if trace is None:
        return TraceFields(None, None, None, None, None, ())
    return TraceFields(
        name=trace.name,
        environment=trace.environment,
        release=trace.release,
        external_user_id=trace.user_id,
        session_id=trace.session_id,
        tags=tuple(trace.tags or ()),
    )


def _json_size(value: Any) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())


def _prepare_payload(value: Any) -> tuple[Any, bool]:
    """Redact, then truncate to MAX_PAYLOAD_BYTES.

    Redaction runs first so a secret straddling the cut can never survive in
    partial form. An oversized payload is replaced by a string holding the
    start of its JSON text, and the span is flagged `truncated`.
    """
    if value is None:
        return None, False
    redacted = redact_json(value)
    serialized = json.dumps(redacted, ensure_ascii=False, separators=(",", ":"))
    encoded = serialized.encode()
    if len(encoded) <= MAX_PAYLOAD_BYTES:
        return redacted, False
    preview = encoded[:MAX_PAYLOAD_BYTES].decode(errors="ignore")
    return preview, True
