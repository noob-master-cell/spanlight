# 7. Rate limits live in Postgres, as token buckets

Date: 2026-10-09 · Status: accepted

## Context

The API limits three things: ingestion per API key, demo sign-ins per client address, and reads made with an access token or API key. Until now each limiter was a Python object in the memory of one API process. With two replicas every limit silently doubles, a client that is sent to a different replica on each request sees no limit at all, and a restart forgets everything. That is why the API could only run as a single replica.

A shared limiter needs shared state. [Postgres is already the only datastore](0001-postgres-only-storage.md), so the question is whether a limit check is cheap enough to live there, not whether to add Redis.

## Decision

Keep one **token bucket** per caller in a Postgres table, and take a token with a single statement.

- **Table.** `rate_limit_buckets(key text PRIMARY KEY, tokens double precision, updated_at timestamptz)`. It is `UNLOGGED`: a crash empties it, which only means every bucket starts full again, and skipping the write-ahead log keeps a write per request cheap. Backups pass `--no-unlogged-table-data`. There is no index on `updated_at`, so the constant rewriting of that column stays an in-page (HOT) update; `fillfactor = 70` leaves room for it.
- **One statement.** `PostgresTokenBucket(rate, burst).acquire(db, key)` runs an `INSERT ... ON CONFLICT (key) DO UPDATE ... WHERE ... RETURNING` inside a CTE. A new key is inserted with `burst - 1` tokens. An existing key is updated to its refilled count minus one, but only if that count is at least one: the refill is the stored tokens plus the seconds since `updated_at` times `rate`, capped at `burst`. When the `WHERE` is false the row is left alone and the statement reports a refusal together with the wait until one token is available, `(1 - tokens) / rate`. Concurrent statements on one key queue on the row lock and each re-evaluates the refill against the row the previous one left; concurrent first inserts are arbitrated by the primary key. Two requests can therefore never spend the same token, whatever replica they arrive on.
- **The database clock.** Refill uses `now()` from the database, never the API host's clock, so replicas with skewed clocks agree. Time never runs backwards: a negative elapsed time counts as zero and `updated_at` only moves forward.
- **Not in the request's transaction.** A token is taken on a connection of its own, in its own short transaction, committed before the request continues. On the request's session the row lock would be held until the request committed, which would serialise every concurrent request of one key behind the slowest one, and a request that rolled back would give its token back. The connections come from a small dedicated pool (`RATE_LIMIT_POOL_SIZE`, default 5, no overflow; `RATE_LIMIT_POOL_TIMEOUT_SECONDS`, default 0.25), apart from the main pool because the request already holds a connection from it, and apart from the idempotency pool so a surge of limited requests cannot starve idempotency reservations, which fail the request when they time out.
- **Buckets.**

  | Key | Rate | Burst | Applies to |
  | --- | --- | --- | --- |
  | `ingest:key:<api key id>` | 50 per second | 100 | `POST /v1/traces`, `POST /v1/otlp/traces`, after the key's scope is checked |
  | `demo:ip:<client address>` | 10 per hour | 10 | `POST /api/v1/demo/session` |
  | `api:token:<token id>` and `api:key:<api key id>` | 20 per second | 40 | `GET` and `HEAD` under `/api/v1` authenticated with a bearer, once the credential is valid |

  Requests authenticated with a session cookie are not limited by the third bucket, and neither are bearer writes. The client address is the same one login throttling uses: the Caddy proxy writes its trusted view of the client into `X-Forwarded-For`, and uvicorn runs with `--proxy-headers`.
- **The answer.** `429` with the stable code `RATE_LIMITED` and a `Retry-After` header in whole seconds, rounded up, at least 1. Every refusal increments `spanlight_rate_limit_rejections_total{scope}` with scope `ingest`, `demo` or `api`.
- **If the limiter cannot run.** When a token cannot be taken because the pool is exhausted or the database is unreachable, the request is let through and a `rate_limit_unavailable` warning is logged (at most once a minute per scope) and `spanlight_rate_limit_unavailable_total{scope}` is incremented. Failing closed would turn a hiccup in a side pool into an outage of ingestion, and every route that does anything needs the database anyway, so an unreachable database is refused further on with a more useful error. The cost is that during such a hiccup the limit is not enforced.
- **Pruning.** The cleanup job deletes buckets idle for more than an hour. An idle bucket has refilled completely (the slowest refill, the demo's, takes one hour), so this changes nothing for the caller and bounds the table to the callers of the last hour.
- **What stays as it is.** Login, forgot-password and verification throttles stay count-based on `throttle_events` and `login_attempts`: they limit attempts per window and keep an audit trail, which a token bucket does not.
- **Removed.** The in-memory `TokenBucketLimiter` and `SlidingWindowLimiter`.

## Consequences

- **Replicas share their limits.** `deploy/compose.replicas.yaml` runs two API replicas. The run-one-replica restriction on rate limits is gone.
- **A write per limited request.** Each accepted request updates one row, and a refused one only locks it. On an unlogged table with in-page updates this costs about a millisecond and no WAL, but it is a statement the old in-memory check was not. The dedicated pool bounds the connections it can take; if a deployment outgrows five connections, raise `RATE_LIMIT_POOL_SIZE` before considering anything else.
- **A hot key is a hot row.** All requests of one API key serialise on its bucket for the length of one short statement. At the 50 per second a key is allowed that is not contention; a key sending thousands per second is being refused anyway, and a refusal does not write.
- **The retry hint is approximate.** On a refusal, the seconds to wait are computed from the row as the statement started, which under heavy contention can lag the locked row by a few milliseconds. The decision itself always uses the locked row.
- **A crash or restart refills every bucket.** That is what an unlogged table gives up, and it only ever loosens a limit for a moment.
- **Bearer reads cost a check even when allowed.** A dashboard script that polls with a token spends 1 of its 20 tokens a second per request; legitimate clients are far below that.

## Checking that replicas share a bucket

This check needs the full stack and was not part of the change that introduced the limiter. Start two replicas, create an API key with the `ingest:write` scope, then send 150 requests as fast as possible through the proxy:

```bash
docker compose -f deploy/compose.yaml -f deploy/compose.replicas.yaml --env-file deploy/.env up -d --build
# KEY is an API key with the ingest:write scope; the body is any valid native batch.
seq 150 | xargs -P 50 -I{} curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://localhost:8080/v1/traces \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"spans": []}' | sort | uniq -c
```

With one shared bucket of 100 the output shows about 100 `200` responses and about 50 `429` (a few more `200`s are possible because the bucket refills at 50 per second while the requests are in flight). With per-process buckets each replica would allow its own 100 and all 150 would succeed. `docker compose ... logs api` shows both replicas serving requests, and `spanlight_rate_limit_rejections_total{scope="ingest"}` on each replica's `/metrics` adds up to the number of `429`s.
