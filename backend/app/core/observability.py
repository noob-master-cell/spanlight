"""Prometheus metrics shared across the API."""

from prometheus_client import Counter, Gauge, Histogram

HTTP_REQUESTS = Counter(
    "spanlight_http_requests_total",
    "HTTP requests handled, by route template and status code.",
    ["method", "route", "status"],
)
HTTP_LATENCY = Histogram(
    "spanlight_http_request_duration_seconds",
    "HTTP request latency, by route template.",
    ["method", "route"],
)
INGESTED_SPANS = Counter(
    "spanlight_ingested_spans_total",
    "Spans accepted by the ingestion pipeline.",
    ["source"],
)
REJECTED_SPANS = Counter(
    "spanlight_rejected_spans_total",
    "Spans rejected by the ingestion pipeline.",
    ["source"],
)
JOBS_FINISHED = Counter(
    "spanlight_jobs_finished_total",
    "Background jobs finished, by kind and outcome.",
    ["kind", "outcome"],
)
OUTBOX_PENDING = Gauge(
    "spanlight_outbox_pending",
    "Notifications waiting in the outbox, set at the end of each delivery run.",
)
NOTIFICATIONS_DELIVERED = Counter(
    "spanlight_notifications_delivered_total",
    "Notification delivery attempts, by kind and outcome (sent, retry, failed).",
    ["kind", "outcome"],
)
IDEMPOTENCY_REQUESTS = Counter(
    "spanlight_idempotency_requests_total",
    "Requests carrying an Idempotency-Key, by outcome "
    "(reserved, replayed, mismatch, in_progress, taken_over).",
    ["outcome"],
)
ROLLUP_DURATION = Histogram(
    "spanlight_rollup_duration_seconds",
    "Time one rollup_hourly run took, including any first-run backfill.",
)
RATE_LIMIT_UNAVAILABLE = Counter(
    "spanlight_rate_limit_unavailable_total",
    "Rate-limit checks skipped because the limiter could not run, by scope (ingest, demo, api).",
    ["scope"],
)
RATE_LIMIT_REJECTIONS = Counter(
    "spanlight_rate_limit_rejections_total",
    "Requests refused with 429 by a rate limit, by scope (ingest, demo, api).",
    ["scope"],
)
