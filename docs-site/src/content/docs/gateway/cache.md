---
title: Response cache
description: Serve repeated identical gateway calls from Postgres instead of the provider, with a time to live per key.
sidebar:
  order: 3
---

The gateway can answer a repeated call from its own storage instead of calling the provider. It is useful for tests, evaluations, demos and any workload that sends the same prompt many times. It is **off by default** and you turn it on per gateway key.

## Turn it on

Set **Cache TTL** on a gateway key (**Gateway, Keys**), or `cache_ttl_seconds` through the API. The value is the time to live in seconds, from 1 to 86 400 (24 hours). Without a value the key never reads or writes the cache. Changing the TTL affects the entries stored from then on; entries already stored keep the expiry they were given.

## What matches

The cache is an **exact match**. Two calls share an entry only when all of these are the same:

- the surface (`chat_completions`, `responses` or `messages`);
- the route and the route's saved version;
- the request body, as JSON with sorted keys and no whitespace, ignoring `stream`, `stream_options`, `user` and `metadata`.

Everything else in the body counts: the model, messages, temperature, tools, `max_tokens` and so on. A different temperature is a different entry. Entries are also kept apart by project, so identical requests from two projects never meet.

Because the route and its version are part of the key, saving or reverting a route makes its earlier entries unreachable (they simply expire). Two routes never share an answer, since their aliases and credentials decide which model answers.

## What is stored

- **Non-streaming calls only.** A streaming call always goes to the provider and reports `bypass`.
- **Provider successes only.** Only a `200` is stored. Errors, retries and answers produced by a Lab fault are never cached.
- **At most 1 MB.** A larger answer is passed through and not stored.
- **Answers that report usage.** A `200` whose body has no token usage (some OpenAI-compatible servers omit it) is not stored, because a hit has to be able to report the usage of the answer it replays.

A hit returns the stored body and content type unchanged, with `X-Spanlight-Cache: hit`. If the cache cannot be read or written, the call simply goes to the provider; a cache problem never fails a call.

## `X-Spanlight-Cache`

Every model call made with a gateway key carries the header:

| Value | Meaning |
| --- | --- |
| `hit` | Served from the cache; the provider was not called |
| `miss` | The key has a TTL and the call could be cached, but no live entry was found; the provider answered and a successful answer is stored |
| `off` | The key has no TTL |
| `bypass` | The key has a TTL but this call cannot be cached because it streams |

`/gw/v1/models` is never cached and has no such header.

## What a hit looks like in the dashboard

A hit is recorded as an ordinary span with `spanlight.cache` set to `hit`. Its usage is reported as zero, because nothing was billed, and the tokens of the original answer are kept in the `spanlight.cache.original_usage` attribute. Cost for a hit is therefore zero and not unknown. **Gateway, Overview** shows the hit rate: hits divided by hits plus misses, so keys without a cache and streaming calls do not drag it down. With no cacheable traffic the rate is "—", not 0 %.

## Privacy

The cache is independent of the project's `capture_payloads` setting. Turning a TTL on for a key is the explicit choice to store that key's responses, and a hit needs the stored body, so the cache keeps them even when the project does not store prompts and completions on its spans. Spans still follow `capture_payloads`. Do not enable the cache on a key whose responses must not be stored.

## Purge and expiry

- **Expiry.** A lookup never returns an entry past its expiry. A background job on the worker deletes expired entries to free space.
- **Purge.** Owners and admins can delete every entry of a project at once with **Purge cache** in the menu of the **Gateway, Keys** page, or `POST /api/v1/projects/{project_id}/gateway/cache/purge` (`204`). Purging an empty cache succeeds. The purge is recorded in the audit log.

## Storage

Entries live in the Postgres database Spanlight already uses, so there is nothing more to run. Each entry holds the full response body (up to 1 MB), so size the TTL for the number of distinct prompts you send, not only for freshness.
