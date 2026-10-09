---
title: Self-hosting
description: Run Spanlight with Docker Compose or on Railway, and what each service does.
sidebar:
  order: 20
---

Spanlight is one Docker image with three roles and Postgres. Postgres is the only datastore, and it also holds the job queue, so there is no Redis or message broker to run.

## What runs

| Service | Role | Listens |
| --- | --- | --- |
| `postgres` | PostgreSQL 17. Traces, spans, users, sessions, rollups and the job queue. | 5432, internal |
| `migrate` | Applies the database migrations as the database owner, creates the unprivileged `spanlight_app` role, then exits. | none |
| `api` | The FastAPI application: authentication, ingestion and queries. | 8000, internal |
| `worker` | Background jobs: retention, cleanup, hourly rollups, notifications, backups and exports, demo traffic. | 9100 for `/metrics`, internal |
| `web` | Caddy. Serves the dashboard and this documentation, and proxies `/api`, `/v1` and `/health` to the API. | `WEB_PORT`, 8080 by default |

The API and worker connect as `spanlight_app`, a role that is neither a superuser nor able to bypass row-level security. Row-level security on the trace tables is what keeps one project's data from another's even if a query forgets its filter, so never point `DATABASE_URL` at the database owner.

## Docker Compose

Requirements: Docker with the Compose plugin.

```bash
git clone https://github.com/noob-master-cell/spanlight.git
cd spanlight
cp deploy/.env.example deploy/.env       # fill in POSTGRES_PASSWORD, APP_DB_PASSWORD and SECRET_KEY
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build
```

The dashboard is at `http://localhost:8080` (change the port with `WEB_PORT`). Check the stack with:

```bash
curl http://localhost:8080/health/ready
```

A healthy instance answers `200` and a body like `{"status":"ok","database":"ok","migrations":"ok","worker_heartbeat_age_s":7.4,"outbox_backlog":0}`: the seconds since a worker last reported, and the number of notifications waiting to be sent. `/health/ready` answers `503` when the database is unreachable, when the schema is not the one this build expects, when no worker has reported in the last two minutes (unless `WORKER_REQUIRED=false`), or when more than 1000 notifications are overdue by over ten minutes.

Spanlight does not terminate TLS. Put your own reverse proxy or load balancer in front of the `web` service, set `APP_BASE_URL` to the public `https://` URL, and set `TRUSTED_PROXIES` to the proxy's address ranges so rate limits and session records see real client addresses. With an `https` base URL cookies become `Secure` and the application refuses to start with the default `SECRET_KEY`.

### Optional add-ons

Each is switched on by its own variables; see [Configuration](/docs/configuration/) for all of them.

- **Email** (address verification and password reset): set `EMAIL_PROVIDER` to `resend` or `smtp` and the values it needs.
- **Sign in with GitHub and Google**: set the client ID and secret of a provider, and register `<APP_BASE_URL>/api/v1/auth/oauth/<provider>/callback` as its callback URL.
- **Two-factor authentication**: set `CREDENTIALS_KEYS`, and back its value up. Without it, authenticator enrolment answers `409 NOT_CONFIGURED`.
- **Object storage, backups and exports**: set `S3_BUCKET`, `S3_ACCESS_KEY` and `S3_SECRET_KEY` (and `S3_ENDPOINT` for a store other than AWS). Nightly backups additionally need `BACKUP_DATABASE_URL`. To try this locally without a cloud account, add the MinIO file: `docker compose -f deploy/compose.yaml -f deploy/compose.minio.yaml --env-file deploy/.env up -d --build`.
- **More than one API replica**: rate limits and idempotency state live in Postgres, so replicas share them. `deploy/compose.replicas.yaml` is an example that runs two.
- **Metrics**: set `METRICS_TOKEN` and scrape `api:8000/metrics` and `worker:9100/metrics` on the internal network with `Authorization: Bearer <token>`. `deploy/prometheus.yml` is an example scrape configuration. `/metrics` is not served through the web port.
- **Error reporting and self-tracing**: `SENTRY_DSN`, and `OTEL_EXPORTER_OTLP_ENDPOINT` for OpenTelemetry spans about Spanlight's own requests and queries.

## Railway

The public demo runs on Railway: Railway Postgres plus three services built from the same Dockerfile. The [Railway guide](/docs/deploy/railway/) walks through it step by step, including the secrets and the infrastructure-as-code file in `deploy/railway/`.

## Upgrading and operating

Back up before every upgrade. The [runbooks](/docs/runbooks/) cover each procedure with the commands and the output to expect:

- [Deploy a new version](/docs/runbooks/deploy/) and [roll it back](/docs/runbooks/rollback/)
- [Restore a database backup](/docs/runbooks/restore/)
- [Rotate secrets](/docs/runbooks/rotate-secrets/) and [revoke a key](/docs/runbooks/revoke-key/)
- [Scale](/docs/runbooks/scale/) and handle an [ingestion spike](/docs/runbooks/ingestion-spike/)
- [Service level objectives and alerts](/docs/runbooks/slo/)

## Admin commands

The `spanlight` command inside the `api` container is the operator's tool:

```bash
docker compose -f deploy/compose.yaml --env-file deploy/.env exec api spanlight --help
```

It creates users (`create-user`), resets passwords (`reset-password`) and two-factor authentication (`reset-2fa`), refreshes the price table (`sync-prices`), runs migrations (`migrate`), and restores a backup (`restore`; see the [restore runbook](/docs/runbooks/restore/)).
