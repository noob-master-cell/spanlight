# Spanlight

[![CI](https://github.com/noob-master-cell/spanlight/actions/workflows/ci.yml/badge.svg)](https://github.com/noob-master-cell/spanlight/actions/workflows/ci.yml) [![CodeQL](https://github.com/noob-master-cell/spanlight/actions/workflows/codeql.yml/badge.svg)](https://github.com/noob-master-cell/spanlight/actions/workflows/codeql.yml) [![PyPI](https://img.shields.io/pypi/v/spanlight)](https://pypi.org/project/spanlight/) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Open-source observability for LLM applications.** Add three lines to your Python app and see every LLM call: prompts and completions, latency, time to first token, token usage, cost and errors, grouped into traces and user sessions.

- **Real traffic only.** Instrument your app with the Python SDK, or point any OpenTelemetry GenAI exporter at the OTLP endpoint.
- **Cost you can trust.** Prices are versioned per model. A model with no known price shows as _unknown_, never as $0.
- **Built for teams.** Organizations, projects, roles, invites, API keys and an audit log.
- **Private by design.** Postgres row-level security isolates every project. Secrets are redacted from payloads before storage, and payload capture can be switched off per project.
- **Self-hosted.** One `docker compose up`, or [deploy to Railway](docs/deploy/railway.md).

**Status:** pre-1.0. Tracing, dashboards, sessions, teams and the Python SDK work today. The gateway, alerts, automated diagnosis and evals are planned: see [Compare](#compare) and the [Roadmap](#roadmap).

## Quickstart

### 1. Start the platform

```bash
cp deploy/.env.example deploy/.env    # fill in the secrets
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build
```

Open http://localhost:8080, create an account, and follow the setup wizard to create a project and an API key.

### 2. Instrument your app

```bash
pip install "spanlight[anthropic]"
```

Use `spanlight[openai]` for OpenAI. Python 3.10 or newer is required. To run the code on `main` instead of the last release, install from the repository:

```bash
pip install "spanlight[anthropic] @ git+https://github.com/noob-master-cell/spanlight#subdirectory=sdks/python"
```

```python
import spanlight
from anthropic import Anthropic

spanlight.init(api_key="spl_live_…", host="http://localhost:8080")
client = spanlight.wrap_anthropic(Anthropic())

@spanlight.observe()
def answer(question: str) -> str:
    reply = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=300,
        messages=[{"role": "user", "content": question}],
    )
    return reply.content[0].text
```

### 3. Watch it arrive

The wizard shows your first trace live as it arrives. From there you have an overview dashboard, a searchable trace explorer with a span waterfall, and session views of multi-turn conversations.

## Compare

How Spanlight lines up against the tools it is closest to. Items Spanlight has not built yet are marked with the phase that delivers them, for example "(Phase 2)"; a plain ✓ is built today. The other columns are the maintainer's assessment as of October 2026 and may be out of date.

|                                         | Langfuse               | Helicone | Portkey | Braintrust | Arize Phoenix | Spanlight   |
| --------------------------------------- | ---------------------- | -------- | ------- | ---------- | ------------- | ----------- |
| Tracing and sessions                    | ✓                      | ✓        | partial | ✓          | ✓             | ✓           |
| Gateway                                 | –                      | ✓        | ✓       | ✓          | –             | ✓ (Phase 2) |
| Prompts and evals                       | ✓                      | partial  | partial | ✓          | ✓             | ✓ (Phase 5) |
| Alerts and budgets                      | –                      | partial  | ✓       | –          | –             | ✓ (Phase 3) |
| Automated diagnosis of client behaviour | –                      | –        | –       | –          | –             | ✓ (Phase 4) |
| Fault injection lab                     | –                      | –        | –       | –          | –             | ✓ (Phase 2) |
| Single Postgres self-host               | – (ClickHouse + Redis) | –        | –       | –          | ✓             | ✓           |
| Tenant isolation in the database        | –                      | –        | –       | –          | –             | ✓ (RLS)     |

## Architecture

```
 your app ──SDK / OTLP──▶  web (Caddy) ──▶ api (FastAPI) ──▶ Postgres ◀── worker
                            static SPA       auth, ingest,      traces,     retention,
                                             queries            spans,      cleanup,
                                                                jobs        demo traffic
```

| Path                           | What it is                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`backend/`](backend/)         | FastAPI, SQLAlchemy 2 (async), Alembic, a Postgres-backed job queue, and the `spanlight` admin CLI |
| [`frontend/`](frontend/)       | React 19, TypeScript, TanStack Router and Query, Tailwind v4, Radix and Recharts                   |
| [`sdks/python/`](sdks/python/) | `spanlight` SDK: `@observe`, spans, and OpenAI and Anthropic wrappers                              |
| [`deploy/`](deploy/)           | Dockerfile, Caddyfile, Compose file, example Prometheus config and Grafana dashboard               |
| [`docs/`](docs/)               | Decision records, API notes and the Railway deploy guide                                           |

### Design decisions

- [Postgres is the only datastore](docs/decisions/0001-postgres-only-storage.md), which keeps operations simple, with a stated path to scale.
- [Server-side sessions, hashed API keys](docs/decisions/0002-sessions-not-jwt.md): revocation takes effect immediately.
- [Row-level security for tenant isolation](docs/decisions/0003-row-level-security.md): a forgotten filter fails closed.
- [Synchronous, idempotent ingestion](docs/decisions/0004-synchronous-idempotent-ingestion.md): SDK retries never double-count.
- [Versioned API paths](docs/decisions/0005-public-api-under-api-v1.md): the dashboard API lives under `/api/v1`, and breaking changes get a new version.
- [Hourly rollups with bucketed histograms](docs/decisions/0006-hourly-rollups-with-bucketed-histograms.md): long-window charts stay fast and still report percentiles.
- [Postgres-backed rate limiting](docs/decisions/0007-postgres-backed-rate-limiting.md): one limit shared by every API replica.

## Documentation

- **Docs site:** every instance serves it at `/docs/` (for example http://localhost:8080/docs/): quickstart, Python SDK, OTLP, self-hosting, configuration, the API reference, security, runbooks and the [changelog](CHANGELOG.md). Its source is [`docs-site/`](docs-site/).
- [Decision records](docs/decisions/): why the architecture is the way it is.
- [Python SDK](sdks/python/README.md): install, the `@observe` and `span` API, the OpenAI and Anthropic wrappers, and delivery guarantees.
- [API notes](docs/api-deviations.md): error format, auth and CSRF, ingestion, OTLP and metric definitions as implemented.
- [Deploy to Railway](docs/deploy/railway.md): the public-demo setup, step by step.
- [Contributing](CONTRIBUTING.md) and the [security policy](SECURITY.md).

## Development

| Component  | Run                                                      | Check                                                                                                   |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Backend    | `cd backend && uv run uvicorn app.main:app --reload`     | `uv run ruff check && uv run ruff format --check && uv run mypy app && uv run pytest`                   |
| Frontend   | `cd frontend && npm run dev` (proxies `/api` to `:8000`) | `npm run lint && npm run format:check && npm run typecheck && npm test`                                 |
| SDK        | —                                                        | `cd sdks/python && uv run ruff check && uv run ruff format --check && uv run mypy src && uv run pytest` |
| Docs site  | `cd docs-site && npm run dev` (serves `/docs/` on `:4321`) | `npm run build` (fails on a broken link), then `cd backend && uv run python scripts/gen_config_table.py --check` |
| End-to-end | full stack running                                       | `cd frontend && E2E_BASE_URL=http://localhost:5173 npx playwright test`                                 |

Backend tests need a real Postgres (`TEST_DATABASE_URL`); see [backend/README.md](backend/README.md). CI runs on pull requests and on pushes to `main`: the backend, frontend and SDK checks, the Docker builds, a Compose smoke test, the release-workflow check and a relative-link check on the Markdown docs (`scripts/check-links.sh`). The end-to-end suite runs locally. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, the test database, commit conventions and the review checklist.

## Roadmap

Only what exists today is ticked. Versions are the planned server release for each phase, and the plan can change: open an issue to discuss it.

- [x] **Milestone 1, foundation:** accounts, organizations, projects, roles, invites, API keys and an audit log; native and OTLP ingestion; overview dashboard, trace explorer and sessions; the Python SDK; self-hosting with Docker Compose
- [ ] **Phase 0, launch (0.1, in progress):** CI, CodeQL, the release pipeline and the Railway files are in the repository. Still to come: the first tagged release with signed images, the PyPI package and the public demo
- [ ] **Phase 1, production hardening (0.2):** email delivery, password reset, GitHub and Google sign-in, two-factor authentication, scoped tokens, a versioned `/api/v1`, hourly rollups, backups with a tested restore, load-test numbers, a threat model and the docs site
- [ ] **Phase 2, gateway (0.3):** an OpenAI- and Anthropic-compatible proxy with routing, caching, retries, fallbacks, budgets and a fault-injection lab
- [ ] **Phase 3, alerts and budgets (0.4):** threshold, anomaly and budget rules with email, Slack, webhook and PagerDuty delivery
- [ ] **Phase 4, the Doctor (0.5):** detectors that diagnose retry storms, ignored `Retry-After`, truncated streams, context growth, tool loops and more, with evidence and fixes
- [ ] **Phase 5, prompts and evals (0.6):** prompt versions, playground, datasets, scores, annotation queues, evaluators, experiments and a CI gate
- [ ] **Phase 6, SDKs and integrations (0.7):** JS SDK, LangChain/LlamaIndex/Vercel AI SDK integrations, MCP server, CLI, webhooks
- [ ] **Phases 7 and 8, governance and scale (0.8, 1.0):** SSO, SCIM, redaction policies, erasure, Helm, operator console, v1.0

## License

[MIT](LICENSE)
