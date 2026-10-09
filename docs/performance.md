# Performance

How fast Spanlight ingests and serves traces, how that is measured, and how to repeat the measurement. The numbers come from a load test that anyone can run against the Compose stack; this page records the method and, once a run has produced them, the results.

## Targets

| Path | Load | Target |
|---|---|---|
| Ingestion | `POST /v1/traces`: 500 spans a second, as 5 requests a second of 100 spans | p95 below 200 ms |
| Dashboard overview | `GET /api/v1/projects/{id}/metrics/overview`: 20 requests a second over four time windows, with 10 million spans stored | p95 below 300 ms |
| Trace list | `GET /api/v1/projects/{id}/traces`: 20 requests a second, with 10 million spans stored | p95 below 300 ms |

These are the same figures as the service level objectives in the [SLO runbook](runbooks/slo.md). Beside the latency each scenario has to meet three more conditions:

- fewer than 1 % of the requests fail, and a `429` counts as a failure;
- more than 99 % of the response checks pass (the status, and for each script that the body has what it should);
- the arrival rate is held, which is the threshold `dropped_iterations` equal to 0: k6 drops an iteration when it has no free virtual user left, and a server that cannot keep up would otherwise look fast.

A script that misses any of them exits non-zero.

## Method

- **Tool.** [k6](https://k6.io), from the official `grafana/k6` image at a pinned release. Every scenario uses the `constant-arrival-rate` executor, which sends requests at a fixed rate whatever the response time. A closed-loop test would slow down when the server slows down and hide the problem.
- **Request path.** Through the `web` service (Caddy) on port 8080, to the API and on to Postgres: the path of every self-hosted request, including authentication and the rate-limit check.
- **Stack.** `deploy/compose.yaml` as shipped: one `api`, one `worker`, `web` and Postgres 17 (its stock settings plus `jit=off`; see [Tuning Postgres](../docs-site/src/content/docs/self-hosting.md) for the ones a larger host should change). The only change is an override file ([`backend/load/compose.load.yaml`](../backend/load/compose.load.yaml)) that publishes Postgres on `127.0.0.1` for the seeder and turns the demo traffic job off. It changes no limit, pool size or code path.
- **Credentials.** Ingestion uses one API key with `ingest:write`. A key is limited to 50 requests a second, and the test sends 5. The read routes accept API keys with `traces:read`, and a key is limited to 20 reads a second (bursts of 40), which is the same as the target rate. The read scripts therefore spread their requests over ten keys, one per virtual user, so the limit never caps the test.
- **Overview.** The window rotates through 1 hour, 24 hours, 7 days and 30 days. The first two read the raw spans and give exact percentiles. The other two read the hourly rollups and say `"approximate": true`. Two checks in the script confirm that each response reports the source its window length calls for (`approximate`), and that the window has data, which for the 7-day and 30-day windows means the rollups hold rows. The p95 of each window is shown in the results but is not a threshold; the threshold is the p95 over all requests.
- **Between scripts.** Before each k6 script the workflow waits for the database to settle ([`settle.sh`](../backend/load/settle.sh)): it polls `pg_stat_activity` until no query of the application role is executing and no job is running, for at most 2 minutes, and carries on either way. k6 gives up on a slow request after its timeout, but the server keeps running the query, and the worker may still be rolling up hours, so without the pause one scenario would start on the leftovers of the one before.
- **Trace list.** Half of the requests are the first page the dashboard opens with (last 24 hours, no filter). The rest filter by one model, or to traces with errors.

## Data

[`backend/load/seed.py`](../backend/load/seed.py) fills the database before any request. It creates an organization, a project, one ingest key and ten read keys, and stores the spans through the same pipeline that handles `POST /v1/traces` (validation, normalization, pricing and the upsert), called in process because the ingest limit would turn 10 million spans into hours of waiting. Then it builds the rollups and runs `VACUUM ANALYZE`, so the first request sees what a settled system looks like.

| Property | Value |
|---|---|
| Traces | 1 to 6 spans each (3.5 on average): a single LLM call, or a root span with children |
| Kinds | `llm` calls, `tool` and `retrieval` spans under a `chain` root |
| Models | five with a published price and one without, so some costs are unknown, as in production |
| Failures | about 2 % of the spans have status `error` |
| Payloads | input and output of 200 to 800 bytes |
| Time | start times spread over the 28 days before the seeder started, inside the default retention of 30 days so the retention job leaves them alone. The batches are stored oldest to newest, each holding the traces that start in its slice of the 28 days, and about 2 % of the traces land up to an hour late, like a retry or a batching client. Rows that started close together therefore sit close together in the table, as after real traffic; stored in random order, one day of spans would be scattered over a fifth of the table, which no real system produces. The overview and trace list scripts ask for windows that end where the data ends, not at the wall clock, so every window is full however long the seeding took |

## Node

Both profiles run on a GitHub-hosted standard `ubuntu-latest` runner: 4 vCPU and 16 GB of memory. The stack and the load generator share those four cores, so the load generator takes some of the CPU the stack could have used. The runner is shared hardware, so repeated runs differ a little; compare runs of the same profile on the same kind of runner.

## Run it

**On GitHub.** Open the Actions tab, choose **Load test** ([`load-smoke.yml`](../.github/workflows/load-smoke.yml)) and **Run workflow**. The profile `smoke` seeds 100 000 spans and runs every scenario for 30 seconds, to check the setup. The profile `full` seeds 10 million spans and runs each scenario for 2 minutes (ingestion for 3), and takes several hours, almost all of it seeding; the seeder prints its rate and stops early if it projects the seeding to overrun its time budget. The run's summary page shows the environment (date, runner, versions, number of spans seeded) and a table for each script, the raw k6 summaries are attached as an artifact, and the job is red if any threshold was missed.

**On your machine.** See [`backend/load/README.md`](../backend/load/README.md): start the stack with the override file, seed it, and run the scripts with k6.

## Results

No run is recorded here yet. This section will hold the date, the node, the versions and the p95 of each scenario for a `full` run once one has completed, copied from its summary page. Until then this page has no figures, and the targets above are goals, not measurements.

## Known slower paths

These are real requests that the scripts do not send yet, so no threshold covers them.

- **Overview, time series or model table with an `environment` filter, for a window of 24 hours or less.** The environment belongs to the trace, so the query joins `traces` to the spans of the window and reads every trace of the project to do it. Without the filter the query reads the spans alone, from the index. In a test database of 2 million spans the filtered 24-hour overview took about four times as long as the unfiltered one, and the gap grows with the number of traces. Windows over 24 hours read the hourly rollups and are not affected. The overview script never sends `environment`, and there is no threshold for this path yet.

## Reading the numbers

- The seeded data is one project, so the figures say nothing about many busy projects at once.
- The seeder ends with `VACUUM ANALYZE`, so every page of the table is marked all-visible and the dashboard's index-only scans never visit the table. A live system gets there through autovacuum, and the migration that added the covering index also makes autovacuum visit `spans` after every 1 % of new rows, so recent pages are marked soon after they are written. A project that ingests faster than autovacuum keeps up will read the table for the newest rows.
- Ingestion is measured at a steady rate. A burst above 50 requests a second per key is limited by design and answered with `429` and `Retry-After`; see the [ingestion spike runbook](runbooks/ingestion-spike.md).
- Percentiles of the 7-day and 30-day windows are estimated from histograms and can be off by up to a quarter of the value; the latency of the request is exact either way.
- For capacity beyond what one stack handles, see [Scale Spanlight](runbooks/scale.md).
