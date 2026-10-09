# Changelog

All notable changes to Spanlight are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project is pre-1.0, so minor versions may change behaviour; breaking changes are called out.

## [0.3.0] - Unreleased

The LLM gateway and the Integration Lab: point the official OpenAI or Anthropic client at Spanlight with one base URL and every call is traced, priced, limited and, if you configure it, routed, retried, cached and fault-injected.

### Added

- **LLM gateway.** `POST /gw/v1/chat/completions`, `POST /gw/v1/responses`, `POST /gw/v1/messages` and `GET /gw/v1/models` accept OpenAI and Anthropic requests, streaming and tool calls included, and forward the provider's answer unchanged. Errors come back in the provider's own shape with a stable `spanlight_code`. Each call becomes one `llm` span with the gateway's route, target, attempts and overhead, and can join a trace you already started with the `x-spanlight-*` headers.
- **Provider credentials.** Organization owners store OpenAI, Anthropic and OpenAI-compatible API keys. Keys are encrypted with `CREDENTIALS_KEYS`, never returned, and can be checked, rotated and re-sealed under a new master key with `spanlight reseal-credentials`. The gateway refuses to connect to private, loopback, link-local and other reserved addresses, on every connection, unless `GATEWAY_ALLOW_INSECURE_BASE_URLS` is set for a local model server.
- **Routes.** Weighted targets, per-target model aliases, retries with backoff and `Retry-After`, fallbacks to the next target, and a time budget for the whole call. Every save is a numbered version with revert, and a stale edit is refused with `409 ROUTE_VERSION_CONFLICT`.
- **Gateway keys and limits.** Project-scoped `spl_gw_…` keys, accepted as a bearer token or `x-api-key`, with a route, an environment, requests and tokens per minute, an allowed-model list and default tags. `GATEWAY_ORG_RPM_CEILING` caps an organization across its keys.
- **Response cache.** Opt-in per key with a time to live. Exact match on the surface, route, route version and request body, for non-streaming `200` answers up to 1 MB. `X-Spanlight-Cache` reports `hit`, `miss`, `off` or `bypass`, and a project's cache can be purged.
- **Budget guard hook.** The gateway asks a budget guard before every provider call and answers `402 BUDGET_EXCEEDED` when it says no. The guard that ships allows every call; budget rules arrive in a later release.
- **Price overrides.** An organization can set its own per-model prices (`/api/v1/orgs/{org_id}/price-overrides`). They win over the built-in table for spans ingested afterwards, and such spans record `pricing_version` `override:<id>`.
- **Integration Lab.** Fault profiles inject nine provider failures into non-production keys: expired or denied keys, rate limits, an unsupported parameter, server errors, a cut-off JSON body, a stream that ends early, a slow first byte and a timeout. Faulted calls are marked by `X-Spanlight-Fault`, a `FAULT_<SCENARIO>` code and a `lab:<scenario>` trace tag.
- **Standalone gateway.** `GATEWAY_MODE=standalone` runs the gateway as its own process (`python -m app.gateway`, same image) behind the `standalone-gateway` Compose profile, so LLM traffic can scale and fail apart from the dashboard API. `disabled` turns it off. There is a new runbook for it.
- **Demo through the gateway.** The demo project's LLM calls now go through the gateway with the demo project's own key, so the demo exercises the same path as a real application.
- **Gateway load test.** The k6 load tests gain a scenario that measures the time a call spends in Spanlight against a fake provider, with a target of under 20 ms at p95, and `docs/performance.md` explains the method.
- **Dashboard screens.** A Gateway section with Overview (traffic, errors, cache hit rate, fallbacks and retries per target), Keys, Routes with a versioned editor, Credentials and Lab. New Prometheus metrics cover gateway requests, overhead, upstream time and attempts; Grafana panels show requests, overhead, attempts, cache hits and spans not recorded.
- **Documentation.** Gateway guides for the quickstart, routing, the cache, the Lab, credentials and error responses.

### Changed

- **`CREDENTIALS_KEYS` now also protects provider credentials.** Rotate it in two phases and run `spanlight reseal-credentials` before dropping an old key (see the rotate-secrets runbook).
- **Audit log.** Gateway configuration changes (credentials, routes, keys, fault profiles, cache purges and price overrides) are recorded as audit events.

### Security

- Provider API keys are write-only: they are never returned by the API, written to a log or kept in an `Idempotency-Key` record, and responses that describe a credential carry `Cache-Control: no-store`.
- Gateway keys are stored as hashes, compared in constant time, and redacted from logs and spans.
- The gateway never forwards the client's `Authorization`, `x-api-key`, cookies or `x-spanlight-*` headers to a provider, does not follow redirects, and sends no CORS headers.
- Fault injection cannot run on a key whose environment is `production`, checked when a profile is attached and again on every call.

## [0.2.0] - Unreleased

Production hardening: accounts and access control, a versioned API, durable background work, backups and exports, observability of Spanlight itself, and documentation.

### Added

- **Accounts.** Email verification and password reset by email (links carry the token in the URL fragment; verification links expire after 24 hours, reset links after 1 hour). Sign in with GitHub and Google. Two-factor authentication with an authenticator app and recovery codes, which an organization owner can require for all members.
- **Access tokens.** Personal access tokens (`spl_pat_…`) for scripts and CI, with a `read` or `write` scope and an optional expiry, revocable at any time.
- **API keys.** Project API keys carry scopes (`ingest:write`, `traces:read`) and an optional expiry. Existing keys keep `ingest:write` and never expire.
- **Idempotency keys.** State-changing API requests accept an `Idempotency-Key` header, so a retried request runs once.
- **Dashboard at scale.** Hourly rollups with bucketed latency histograms back every time window longer than 24 hours; those responses are marked `"approximate": true`. Shorter windows still read the spans directly.
- **Shared rate limits.** Limits for ingestion, the demo and bearer reads are enforced in Postgres, so they hold across replicas and across restarts. A limited request gets `429` with `Retry-After`.
- **Object storage and backups.** Any S3-compatible store (AWS S3, Cloudflare R2, MinIO) can hold nightly `pg_dump` backups, kept for 14 daily and 8 weekly copies, and `spanlight restore` loads one back.
- **Exports.** Export traces as CSV or JSONL, and the audit log as CSV. Download links last one hour and files are deleted after seven days.
- **Price endpoints.** `GET /api/v1/prices` lists the price table, and `GET /api/v1/projects/{project_id}/unpriced-models` shows which models in your traffic have no known price.
- **Organization and project administration.** Rename or delete an organization or a project through the API, with a typed confirmation for deletes.
- **Observability of Spanlight itself.** Optional self-tracing with OpenTelemetry, a readiness check (`/health/ready`) that reports the database, the migrations and the worker, and Prometheus metrics for the worker (jobs, outbox, notifications, rollups) on `WORKER_METRICS_PORT`.
- **Operations.** Runbooks for deploying, rolling back, restoring, rotating secrets, revoking keys, scaling, ingestion spikes and service level objectives, plus a threat model and security documentation.
- **Documentation site.** Quickstart, Python SDK, OTLP, self-hosting, configuration, API reference, security, runbooks and this changelog, served at `/docs/` by the web image.
- **Load tests.** k6 scripts and a seeder in `backend/load/` measure ingestion (500 spans a second), the dashboard overview and the trace list (10 million spans) against the Compose stack, and a manually started workflow runs them on a GitHub-hosted runner. Method and targets are in `docs/performance.md`.

### Changed

- **Versioned API.** Dashboard routes moved from `/api/<resource>` to `/api/v1/<resource>`. The old paths return `404`. Ingestion (`/v1/traces`, `/v1/otlp/traces`) keeps its own version and is unchanged. A future breaking change will ship as `/api/v2`, with `/api/v1` kept for at least 12 months.
- **Postgres shared memory.** The Compose `postgres` service gets 256 MB of `/dev/shm` instead of Docker's 64 MB default, which parallel queries on large tables could exhaust ("could not resize shared memory segment").
- **Dashboard queries at 10 million spans.** Migration 0016 swaps the `spans` time index for a covering one, so a 24 hour overview is answered from the index and not from the table. It is built `CONCURRENTLY`: writes continue, and on a large table it takes minutes and extra disk.
- **Row-level security policies read their settings once per statement.** Migration 0017 rewrites the tenant-isolation and worker-bypass policies of `traces`, `spans`, the rollup tables and `exports` so `current_setting()` is evaluated once per query instead of once per row; which rows are visible does not change. It takes a brief exclusive lock on each table and gives up after 5 seconds if it cannot get it, so run it again at a quieter moment.
- **A busy database answers `503`, not `500`.** A request that waits more than 5 seconds for a connection (`API_POOL_TIMEOUT_SECONDS`) or has a statement that runs longer than 10 seconds (`API_STATEMENT_TIMEOUT_SECONDS`) now gets `503 SERVICE_UNAVAILABLE` with `Retry-After: 5`.
- **Postgres JIT off in Compose.** The `postgres` service starts with `jit=off`, which costs more than it saves on the dashboard and rollup queries.
- **More than one replica.** Rate limits and idempotency state live in Postgres, so the API can run as several replicas.
- **Optional features report themselves.** A request that needs an unconfigured integration (email, object storage, OAuth, `CREDENTIALS_KEYS`) answers `409 NOT_CONFIGURED` and names the setting; a background job that needs one ends as `skipped_not_configured`.

### Security

- Two-factor seeds are encrypted at rest with the keys in `CREDENTIALS_KEYS`.
- Sign-up is throttled per client IP.
- Password hashing and checking (argon2) run off the event loop, on a small dedicated executor that caps how many hashes run at once, so a burst of sign-ins cannot starve other requests or exhaust memory.
- Requests to `/api/v1` are limited to 1 MiB (`413` above that). Deeply nested JSON sent to ingestion answers `400 INVALID_JSON` instead of `500`.
- `BACKUPS_ENABLED` and `BACKUP_DATABASE_URL` are set only on the worker, the only service that runs backups. The object storage keys stay on both services, because the API signs export download links.
- Responses that reveal a secret (a new API key or access token, recovery codes, a two-factor setup secret) carry `Cache-Control: no-store`.
- The `/metrics` token is compared in constant time.
- The web image runs Caddy as a non-root user.
- Export files are written under a separate key for each attempt, so a retry or a lease takeover can never delete a file another attempt finished. Download links force the browser to save the file instead of showing it.
- A database that is too busy to answer answers `503` with `Retry-After`, not `500`.
- Row-level security policies read their settings once per query. Which rows are visible does not change.

## [0.1.0]

Initial version.

### Added

- **Tracing.** Python SDK (`spanlight`) with `@observe`, spans and wrappers for the OpenAI and Anthropic clients, native JSON ingestion (`POST /v1/traces`) and OTLP ingestion (`POST /v1/otlp/traces`, JSON and protobuf, OpenTelemetry GenAI attributes).
- **Dashboard.** Overview with latency, token, cost and error metrics, a trace explorer with a span waterfall, and session views.
- **Cost.** Versioned per-model prices; a model without a known price shows as unknown, never as $0.
- **Teams.** Organizations, projects, roles, invites, API keys and an audit log.
- **Privacy.** Postgres row-level security, secret redaction before storage, and per-project switch for payload capture.
- **Self-hosting.** One Docker image with `api`, `worker` and `web` roles, a Compose file and a Railway deployment guide.
