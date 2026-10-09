---
title: Provider credentials
description: Store provider API keys encrypted, choose a base URL for OpenAI-compatible servers, understand which addresses the gateway refuses to call, and rotate the master keys.
sidebar:
  order: 5
---

A **provider credential** is a provider API key that the gateway uses to call a provider on behalf of your application. Credentials belong to an **organization**; its projects' routes pick them as targets. Your applications only ever hold a gateway key, never the provider key.

**Only organization owners** can add, rotate, check or delete a credential. Any member can list them, and the list never contains the key. Manage them in **Gateway, Credentials**.

## Providers

| `provider` | Reaches | `base_url` |
| --- | --- | --- |
| `openai` | `api.openai.com` | Not allowed |
| `anthropic` | `api.anthropic.com` | Not allowed |
| `openai_compatible` | Any server that speaks the OpenAI API: a vLLM or Ollama server, OpenRouter, Together, a company proxy | Required |

An `openai` or `anthropic` credential always uses the provider's own host. A base URL there would only send the key somewhere else, so it is refused. A credential's `name` is 1 to 100 characters and unique in the organization.

## The key is write-only

The API key is accepted when you create or rotate a credential and never returned again: not in the list, not in the audit log, not in the logs. It is trimmed of surrounding whitespace, must be visible ASCII without spaces and at most 512 characters.

It is stored encrypted with the master keys in `CREDENTIALS_KEYS`. The gateway decrypts it in memory for each call. Responses that describe a credential are marked `Cache-Control: no-store`.

**`CREDENTIALS_KEYS` must be set**, on the api and the worker. Without it, adding, rotating and checking a credential answer `409 NOT_CONFIGURED` naming the setting. Format and generation are in [Configuration](/docs/configuration/).

## Base URLs and private addresses

For `openai_compatible`, the base URL is the address the gateway appends paths to, for example `https://openrouter.ai/api/v1` (so a call goes to `…/chat/completions`). A base URL must:

- start with `https://`;
- have a host, and no user name, password, query string or fragment;
- be at most 2 048 characters, with no spaces or control characters;
- use a host written in a standard way: an IP address must be in dotted-decimal form (`127.1`, `0177.0.0.1` and `2130706433` are refused, however a resolver might read them).

Trailing slashes are removed. Any failure is `422` on the field `base_url`.

### Private addresses are blocked

A base URL can name any host, so the gateway protects the network it runs in. It resolves the host and refuses it when **any** address it resolves to is private or reserved: loopback, the RFC 1918 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`, which includes cloud metadata services), carrier-grade NAT, unique-local and multicast IPv6, and the IPv4 addresses hidden inside IPv6 forms.

The check runs twice:

1. **When you save or rotate the credential.** A host that resolves to a private address, or does not resolve, is a `422` on `base_url`, so you find out immediately.
2. **On every connection the gateway opens**, with the address that is actually used. A name that was public when you saved it and later points to a private address (DNS rebinding) is refused at call time. The call fails with `502 UPSTREAM_BLOCKED` and is neither retried nor sent to another target.

The gateway does not follow redirects, so a provider cannot send a call to an internal address either. A redirect answer is `502 UPSTREAM_UNREACHABLE`.

### Local model servers: `GATEWAY_ALLOW_INSECURE_BASE_URLS`

To use a model server on your own machine or network, such as Ollama on `http://localhost:11434/v1`, the operator sets `GATEWAY_ALLOW_INSECURE_BASE_URLS=true`. It allows `http://` and private, loopback and link-local addresses for every credential on that deployment. A host that does not resolve is still refused.

Leave it off on any deployment that is shared with people you do not trust: with it on, a credential can point the gateway at anything the server can reach. See [Configuration](/docs/configuration/).

## Check a credential

**Check** calls the provider's model list (`GET /v1/models`) with the stored key, without following redirects and with a 10 second timeout. It always answers `200` with either `ok` or `error`:

- `ok`: the key works.
- `error`: a short status line such as `401 Unauthorized`, `timeout`, `connection error`, `host not found`, `blocked address` or `key cannot be decrypted`. The provider's response body is never shown.

The result and its time are stored as `last_checked_at` and `last_error`, and shown in the list; both are empty for a credential never checked. `last_used_at` shows when the gateway last used the credential.

## Rotate a key

**Rotate** replaces the provider key of a credential, keeping its name, id and the routes that use it. The old key is gone from that moment, and the check result is cleared because it described the old key. A base URL is checked again against today's rules when you rotate.

## Delete a credential

A credential that the **current version** of a route names cannot be deleted (`409 CREDENTIAL_IN_USE`). Remove it from the route first. An older route version may still name it; reverting to that version is then refused (`422`).

## Rotate the master keys

`CREDENTIALS_KEYS` holds one or more master keys, `<key_id>:<base64 of 32 bytes>`, comma-separated. The **first** entry seals new data, and every entry can open data sealed under its id. To rotate:

1. Add the new key **after** the old one on the api and the worker, and restart both.
2. Move the new key to the front.
3. Re-seal the stored credentials under it:

   ```bash
   spanlight reseal-credentials
   ```

   It prints how many credentials it re-sealed, never a key, and exits with an error if any credential is still sealed under an older key or cannot be opened with any key you have. Only when it succeeds can you remove the older key.

With Compose, run it in the worker container: `docker compose -f deploy/compose.yaml --env-file deploy/.env exec worker spanlight reseal-credentials`. The full procedure, including how to verify each step, is in [Rotate secrets](/docs/runbooks/rotate-secrets/).

**Back up `CREDENTIALS_KEYS` outside the database backups.** A lost key cannot be recovered; every credential sealed under it has to be entered again.
