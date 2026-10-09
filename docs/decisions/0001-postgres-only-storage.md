# 1. Postgres is the only datastore

Date: 2026-10-07 · Status: accepted

## Context

LLM observability tools store many small, append-heavy span rows and run time-windowed aggregations over them (p95 latency, cost per model). Langfuse moved its trace storage to ClickHouse for this reason. Spanlight targets small teams and a single Railway Hobby deployment.

## Decision

Store everything (accounts, traces, spans, jobs) in a single Postgres 17 database. Use composite indexes on `(project_id, started_at)` and compute percentiles with `percentile_cont` over the indexed window. Run the job queue in Postgres as well (`FOR UPDATE SKIP LOCKED`), so there is no Redis.

## Consequences

- One stateful service to run, back up and reason about. Transactions span ingestion writes and trace rollups, which keeps them consistent.
- Aggregations over raw spans slow down at high volume. The planned next steps, in order: hourly rollup tables maintained by the worker, then time partitioning of `spans` so retention is a partition drop. A columnar store is considered only after both are measured as insufficient.
- The in-process ingestion rate limiter assumes one API instance. Horizontal scaling would move it to Postgres or Redis.
