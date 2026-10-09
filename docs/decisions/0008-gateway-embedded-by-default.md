# 8. The gateway runs embedded in the api by default, standalone by flag

Date: 2026-10-09 · Status: accepted

## Context

The LLM gateway (`/gw/v1/*`) sits in the request path of the applications that use it: an OpenAI or Anthropic SDK sends its calls to Spanlight, which forwards them to the provider, streams the answer back and records a span. Its traffic is unlike the dashboard's. Calls are long (a streamed completion can run for minutes), most of their time is spent waiting on the provider, and their volume follows the user's application rather than people clicking in the dashboard.

Most Spanlight installations are a single node: one `docker compose` stack on a small server, or the hosted demo on Railway's Hobby plan, where every extra service costs money and memory. For them a separate gateway service is one more container to run, monitor and upgrade, and buys nothing until the traffic is large. Larger installations want the opposite: long streams kept off the process that serves the dashboard and ingestion, so a burst of slow provider calls cannot hold the api's connections, and the gateway scaled on its own.

Both need the same code. The gateway shares the database, the settings, the span pipeline (`ingest_spans`), the credential encryption and the rate limiter with the api.

## Decision

The gateway is one module in the api's codebase and image, with three modes chosen by `GATEWAY_MODE`:

- **`embedded` (the default).** The api mounts the `/gw/v1` router next to `/api/v1` and `/v1`. One process, one container, nothing to configure.
- **`standalone`.** The api leaves `/gw/*` unmounted, and a second process from the same image serves it: `python -m app.gateway`, which runs `app.main:create_gateway_app` with uvicorn. That app serves only `/gw/v1/*`, `/health/*` and `/metrics`, with the request-id and access-log middleware and none of the dashboard's (no cookies, CSRF, Origin check or idempotency keys).
- **`disabled`.** The api leaves `/gw/*` unmounted and nothing else serves it.

In `standalone` and `disabled` mode the api answers `/gw/*` with its ordinary `404` problem+json. Wherever the gateway runs, every error under `/gw/` uses the imitated provider's envelope and the dashboard's errors keep theirs: the gateway's error handlers wrap the api's and look at the path first.

Caddy routes `/gw/*` to `GATEWAY_UPSTREAM`, which defaults to the api. It proxies those paths with `flush_interval -1`, so streamed tokens reach the client as they arrive, and a request body limit of 11 MiB, a little above the gateway's own 10 MB, so an oversized body gets the gateway's provider-shaped `413` rather than Caddy's.

Both processes build their own upstream HTTP client and gateway runtime in their lifespan. At shutdown each one stops taking requests, lets in-flight streams finish or close (closing a stream queues its span), drains the spans still being written, closes the client and only then disposes of its database engine.

## Consequences

- **One service by default.** A single-node installation and the Railway demo run the gateway inside the api with no extra container, port or setting. The hosted demo sets `GATEWAY_ORG_RPM_CEILING` so one organization's traffic cannot crowd out the others'.
- **Moving the gateway out needs no code change.** An operator whose long streams start to compete with the dashboard sets `GATEWAY_MODE=standalone` on the api, starts `python -m app.gateway` from the same image and points `GATEWAY_UPSTREAM` at it. The two can then be scaled and restarted separately.
- **The same image everywhere.** There is no second build to keep in step: the api, the worker and the standalone gateway are three commands on one image, sharing settings, migrations and versions.
- **Embedded traffic shares the api's resources.** In the default mode gateway calls use the api's event loop, database pool and memory. The gateway holds no database connection while it waits on a provider (its transaction ends after the key and limit checks, and spans are written afterwards by a bounded set of background tasks), so the pool is not the first limit; the number of open streams per process is. That is the signal to switch to `standalone`.
- **The api still holds a gateway client in every mode.** Checking a provider credential from the dashboard, and in-process callers such as the demo traffic job, go through the same egress-checked client, so the api builds it whatever `GATEWAY_MODE` says.
- **Two processes to observe in standalone mode.** Each exposes `/health/live`, `/health/ready` and `/metrics`; the gateway's metrics (`spanlight_gateway_*`) come from whichever process serves `/gw/*`.
