# Changelog

All notable changes to Spanlight are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project is pre-1.0, so minor versions may change behaviour; breaking changes are called out.

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

### Changed

- **Versioned API.** Dashboard routes moved from `/api/<resource>` to `/api/v1/<resource>`. The old paths return `404`. Ingestion (`/v1/traces`, `/v1/otlp/traces`) keeps its own version and is unchanged. A future breaking change will ship as `/api/v2`, with `/api/v1` kept for at least 12 months.
- **More than one replica.** Rate limits and idempotency state live in Postgres, so the API can run as several replicas.
- **Optional features report themselves.** A request that needs an unconfigured integration (email, object storage, OAuth, `CREDENTIALS_KEYS`) answers `409 NOT_CONFIGURED` and names the setting; a background job that needs one ends as `skipped_not_configured`.

### Security

- Two-factor seeds are encrypted at rest with the keys in `CREDENTIALS_KEYS`.

## [0.1.0]

Initial version.

### Added

- **Tracing.** Python SDK (`spanlight`) with `@observe`, spans and wrappers for the OpenAI and Anthropic clients, native JSON ingestion (`POST /v1/traces`) and OTLP ingestion (`POST /v1/otlp/traces`, JSON and protobuf, OpenTelemetry GenAI attributes).
- **Dashboard.** Overview with latency, token, cost and error metrics, a trace explorer with a span waterfall, and session views.
- **Cost.** Versioned per-model prices; a model without a known price shows as unknown, never as $0.
- **Teams.** Organizations, projects, roles, invites, API keys and an audit log.
- **Privacy.** Postgres row-level security, secret redaction before storage, and per-project switch for payload capture.
- **Self-hosting.** One Docker image with `api`, `worker` and `web` roles, a Compose file and a Railway deployment guide.
