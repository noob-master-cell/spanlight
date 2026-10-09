# 10. The gateway cache is exact-match and lives in Postgres

Date: 2026-10-09 · Status: accepted

## Context

Applications that call the same prompt again and again (evaluation runs, retries after a client timeout, a cron job that asks the same question every hour) pay the provider each time and wait for each answer. A response cache answers a repeated request from storage instead. It also has to be safe for the people who use it: a cache that returns the wrong answer, or one project's answer to another, is worse than no cache.

Two designs were considered. A **semantic cache** matches requests that mean the same thing by comparing embeddings. It saves more calls, but it needs an embedding model and a vector index, it can return an answer to a question that was only similar, and nobody can say why a given request hit or missed. An **exact-match cache** replays an answer only for a request that is identical in everything that can change the answer.

## Decision

Cache by exact match, for non-streaming requests, in a Postgres table, and only for keys that opt in.

- **The key.** SHA-256 over the surface name (`chat_completions`, `responses` or `messages`), the id and the saved version of the route the gateway key uses, and the canonical JSON of the request body (sorted keys, no whitespace, UTF-8), joined by newlines. The route is in the key because its model aliases and credentials decide which model answers: two routes that map the same alias to different models never share answers, and saving a route makes its earlier entries unreachable until they expire. The fields `stream`, `stream_options`, `user` and `metadata` are removed first, because they shape the transport or label the caller and never change the answer. Every other field is in the key, so a different model, temperature, tool list or message is a different entry.
- **Scoped by project.** The project is not in the hash, but the route is and belongs to one project. The table's primary key is `(project_id, cache_key)` and every lookup, store and purge names the project, under row-level security like the rest of the project's data. Two projects that send the same request never share an entry, and a bug that forgets the project filter returns nothing.
- **Opt-in per gateway key.** A key with `cache_ttl_seconds` (1 to 86 400) uses the cache; a key without it does not, and its responses report `off`. The time to live belongs to the key that stores the entry, and an entry stored by one key can be read by any cache-enabled key of the same project that uses the same route at the same version. A route does not carry a TTL.
- **What is stored.** Only `200` responses with a body of at most 1 MB, as the provider's bytes plus its content type, so a hit replays the answer byte for byte. The original token usage is stored with it. A hit is recorded on its span with `spanlight.cache=hit`, zero usage and zero cost, and the original usage in `spanlight.cache.original_usage`, so cost reports never count a replay as spend. Responses carry `X-Spanlight-Cache: hit | miss | off | bypass`.
- **Independent of `capture_payloads`.** Storing an answer for replay is something the key's owner turned on explicitly, so the cache keeps the response whatever the project's payload capture says. The spans still follow `capture_payloads`: a project that records no prompts still records none, hits included.
- **Postgres, not Redis.** The cache is a table with an index on `expires_at`. A lookup is one primary-key statement that also counts the hit, so it needs no second round trip. A lookup never returns a row past `expires_at`; an hourly job deletes expired rows in batches. A purge endpoint (`POST /api/v1/projects/{project_id}/gateway/cache/purge`, permission `gateway:write`, audited) deletes a project's whole cache.
- **Behind an interface.** The gateway talks to a `GatewayCache` protocol. Postgres is the only implementation.

## Consequences

- **Fewer calls, no surprises.** A hit is exactly the answer a previous identical request got. There is no similarity threshold to tune and a miss is always explainable: some field differed. The cost is a lower hit rate than a semantic cache would reach; a prompt that differs by one word is a miss.
- **Streaming is never cached.** A streaming request reports `bypass` and always reaches the provider. A stream is not stored and cannot be replayed from the cache.
- **A model that answers differently each time is frozen.** Within the TTL, the same request returns the same answer even though the provider would have sampled a new one. That is the point of the feature and the reason it is opt-in; a key that needs fresh samples leaves `cache_ttl_seconds` unset.
- **Large and rarely repeated responses cost storage.** Entries are capped at 1 MB and expire on their own, but a key with a long TTL and unique requests only fills the table. The TTL is the lever, and the purge endpoint empties it.
- **Boring by default.** No new service to run, back up or secure: the cache is covered by the existing backups, row-level security and project deletion cascade. The price is that every lookup and store is a database statement; at the request rates a single Postgres serves, that is milliseconds.
- **Redis later, if it is ever needed.** A deployment that outgrows Postgres for this can add a Redis implementation of `GatewayCache` without changing the gateway, the key or the API.
