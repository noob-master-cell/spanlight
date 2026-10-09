# 4. Ingestion writes synchronously and idempotently

Date: 2026-10-07 · Status: accepted

## Context

SDKs retry failed exports, OTLP collectors resend batches, and networks drop responses after the server has committed. Duplicated spans would inflate costs and token counts.

## Decision

Each batch is validated, normalized, redacted and priced, then written in one transaction:

- Spans are upserted on their natural key `(project_id, trace_id, span_id)`.
- Trace totals (span count, errors, tokens, cost) are **recomputed from the stored spans**, never incremented.

Replaying any batch therefore yields identical totals. The endpoint returns per-span results, so one invalid span does not reject its whole batch.

We write synchronously instead of putting a queue in front. At the expected volume a 100-span batch commits well within the 200 ms p95 target, and a synchronous write means a `200` response is a durable acknowledgment.

## Consequences

Ingestion throughput is bounded by Postgres write capacity. If the latency target is missed, the next step is a durable staging table drained by the worker, which keeps the same idempotent upsert.
