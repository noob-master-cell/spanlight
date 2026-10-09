---
title: Gateway error responses
description: Every error the gateway itself produces, with its Spanlight code, HTTP status and the OpenAI and Anthropic response shapes.
sidebar:
  order: 6
---

Errors under `/gw/` never use the dashboard's `problem+json`. The gateway answers in the shape of the provider SDK you are using, so the official clients raise their usual exceptions and retry the statuses they normally retry.

Which shape you get follows the **path**: `/gw/v1/messages` gets the Anthropic shape, and `/gw/v1/chat/completions` and `/gw/v1/responses` get the OpenAI shape. `GET /gw/v1/models` gets the Anthropic shape when the request carries an `anthropic-version` header.

Every error response carries:

- `X-Request-ID`, the id of the call (also in the span and, for Anthropic, in the body);
- `X-Spanlight-Code`, the stable Spanlight code from the table below;
- `Retry-After` in whole seconds (rounded up, at least 1) when waiting helps.

## The two shapes

OpenAI:

```json
{
  "error": {
    "message": "Rate limit reached for gateway key spl_gw_abcdefghijkl: 60 requests per minute.",
    "type": "requests",
    "param": null,
    "code": "rate_limit_exceeded",
    "spanlight_code": "RATE_LIMITED"
  }
}
```

Anthropic:

```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit reached for gateway key spl_gw_abcdefghijkl: 60 requests per minute.",
    "spanlight_code": "RATE_LIMITED"
  },
  "request_id": "4f2c0a7e9b1d4c3f8a5e6d7c8b9a0f1e"
}
```

`spanlight_code` is added to both. Match on it, not on the message, which can change.

## Codes the gateway produces

| `spanlight_code` | Status | OpenAI `type` / `code` | Anthropic `type` | When |
| --- | --- | --- | --- | --- |
| `UNAUTHORIZED` | 401 | `invalid_request_error` / `invalid_api_key` | `authentication_error` | The key is missing, malformed, unknown, revoked or has the wrong secret, or `Authorization` and `x-api-key` carry different keys |
| `RATE_LIMITED` | 429 | `requests` / `rate_limit_exceeded` (`tokens` when the tokens-per-minute limit was hit) | `rate_limit_error` | The organization ceiling, the key's requests per minute or its tokens per minute was exceeded. Has `Retry-After` |
| `BUDGET_EXCEEDED` | 402 | `insufficient_quota` / `insufficient_quota` | `billing_error` | A budget blocked the call before it reached a provider. Reserved: the gateway checks budgets before every call, but no budget rules ship yet |
| `MODEL_NOT_ALLOWED` | 404 | `invalid_request_error` / `model_not_found` (`param: "model"`) | `not_found_error` | The model is not in the key's `allowed_models` |
| `NO_COMPATIBLE_TARGET` | 400 | `invalid_request_error` | `invalid_request_error` | None of the route's targets can serve the surface, for example a messages call on a route with only OpenAI credentials |
| `INVALID_REQUEST` | 400 | `invalid_request_error` | `invalid_request_error` | The body is not a JSON object with a string `model`, or uses an unsupported `Content-Encoding`, or does not decompress |
| `PAYLOAD_TOO_LARGE` | 413 | `invalid_request_error` | `request_too_large` | The body is over 10 MB, counted after decompression |
| `UPSTREAM_UNREACHABLE` | 502 | `server_error` | `api_error` | Every attempt failed to connect, or the provider answered with a redirect, which the gateway does not follow |
| `UPSTREAM_BLOCKED` | 502 | `server_error` | `api_error` | The credential's host resolves to a private or local address. Never retried |
| `UPSTREAM_TIMEOUT` | 504 | `server_error` | `timeout_error` | The route's `timeout_ms` budget ran out |
| `NOT_FOUND` | 404 | `invalid_request_error` | `not_found_error` | An unknown path under `/gw/` |
| `METHOD_NOT_ALLOWED` | 405 | `invalid_request_error` | `invalid_request_error` | A known path with the wrong method; the `Allow` header lists the right ones. A browser preflight (`OPTIONS`) also gets this, because the gateway sends no CORS headers |
| `SERVICE_UNAVAILABLE` | 503 | `server_error` | `overloaded_error` | The database is too busy to check the key. `Retry-After: 5`; both official SDKs retry it |
| `INTERNAL_ERROR` | 500 | `server_error` | `api_error` | An unexpected gateway failure. The message names the request id |
| `ERROR` | as raised | `invalid_request_error` below 500, `server_error` from 500 | `invalid_request_error` below 500, `api_error` from 500 | Any other HTTP status the framework raises |

## Errors from the provider

When the provider itself answers with an error that the route does not retry, the gateway returns that response **unchanged**: the provider's status and body, with `X-Spanlight-Code: UPSTREAM_ERROR` added. Your SDK raises the provider's own exception. The call's span is marked as an error and records the provider's error type.

Only a short allowlist of provider headers is passed back: `content-type`, `retry-after`, `x-ratelimit-*`, `anthropic-ratelimit-*` and `openai-processing-ms`; the provider's `request-id` becomes `x-upstream-request-id`.

## Errors from the Lab

A [Lab fault](/docs/gateway/lab/) is returned in the provider's shape and wording, with `spanlight_code` and `X-Spanlight-Code` set to `FAULT_<SCENARIO>` and the header `X-Spanlight-Fault: <scenario>`:

| Scenario | Code | Status |
| --- | --- | --- |
| `auth_expired` | `FAULT_AUTH_EXPIRED` | 401 |
| `scope_denied` | `FAULT_SCOPE_DENIED` | 403 |
| `rate_limited` | `FAULT_RATE_LIMITED` | 429 with `Retry-After` |
| `unsupported_parameter` | `FAULT_UNSUPPORTED_PARAMETER` | 400 |
| `provider_5xx` | `FAULT_PROVIDER_5XX` | 500, 502, 503 or 529 |
| `timeout` | `FAULT_TIMEOUT` | 504 |

The other three scenarios (`malformed_json`, `truncated_stream`, `slow_response`) change a real answer and have no error body of their own.

## Statuses and the official SDKs

| Status | OpenAI and Anthropic SDKs |
| --- | --- |
| 429, 500, 502, 503, 504, 529 | Retry with backoff, and honour `Retry-After` |
| 401, 402, 404, 400, 413 | Raise at once |

That is why a blocked budget is `402` and an exceeded rate limit `429`: a client should not retry the first and should wait for the second.
