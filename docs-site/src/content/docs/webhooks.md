---
title: Alert webhooks
description: The signed HTTP requests Spanlight sends for alerts and budgets, how to verify them, and how failed deliveries are retried.
sidebar:
  order: 3
---

A webhook channel makes Spanlight send a signed `POST` with a JSON body to a URL you choose whenever an alert rule fires or resolves, or a budget is exceeded. Use it to open tickets, page a rota, or feed your own tooling. This page lists the events, the request, how to check that a request really came from your Spanlight, and what happens when your endpoint is down.

Webhook channels belong to an organization. Create one under **Alerts → Channels**, choose **Webhook** and enter the URL. Spanlight shows the signing secret once, when the channel is created and again when you rotate it. Copy it then; it cannot be read back.

## Events

| `event` | Sent when |
| --- | --- |
| `alert.fired` | An alert rule's condition became true. |
| `alert.resolved` | The condition stopped being true. A resolved budget rule also sends this event, with `budget` set. |
| `budget.exceeded` | A budget reached its amount. |
| `test` | You pressed **Send test** on the channel. The body is smaller: `version`, `event`, `occurred_at`, `org` and `url`. |

## The request

```http
POST /your/endpoint HTTP/1.1
Content-Type: application/json
User-Agent: spanlight/1.0.0
X-Spanlight-Event: alert.fired
X-Spanlight-Delivery: 0192f5a0-1111-7000-8000-00000000d1e1
X-Spanlight-Timestamp: 1760087700
X-Spanlight-Signature: sha256=<64 hex characters>
```

| Header | Meaning |
| --- | --- |
| `X-Spanlight-Event` | The event name from the table above. |
| `X-Spanlight-Delivery` | The id of this delivery. It stays the same on every retry, so it is the key to deduplicate on. |
| `X-Spanlight-Timestamp` | When this attempt was signed, in Unix seconds. It changes on every attempt. |
| `X-Spanlight-Signature` | `sha256=` and the hex HMAC-SHA256 of `<timestamp>.<body>` under your signing secret. |

The body is compact JSON in UTF-8 (no spaces between tokens). Decimal numbers are strings, and times are UTC in `YYYY-MM-DDTHH:MM:SSZ` form.

```json
{
  "version": "2026-10-01",
  "event": "alert.fired",
  "event_id": "0192f5a0-0000-7000-8000-0000000000e1",
  "occurred_at": "2026-10-10T09:15:00Z",
  "org": { "id": "0192f5a0-0000-7000-8000-00000000a001", "name": "Acme" },
  "project": { "id": "0192f5a0-0000-7000-8000-00000000b001", "name": "Support Copilot" },
  "rule": {
    "id": "0192f5a0-0000-7000-8000-00000000c001",
    "name": "Error rate in prod",
    "kind": "threshold",
    "metric": "error_rate",
    "comparator": "gt",
    "threshold": "0.05",
    "window_minutes": 15,
    "filters": { "environment": "production" }
  },
  "value": "0.083",
  "threshold": "0.05",
  "started_at": "2026-10-10T09:15:00Z",
  "resolved_at": null,
  "budget": null,
  "url": "https://app.example.com/0192f5a0-0000-7000-8000-00000000a001/0192f5a0-0000-7000-8000-00000000b001/alerts/0192f5a0-0000-7000-8000-00000000c001"
}
```

- `threshold` at the top level is the threshold that applied. For an anomaly rule it is the anomaly threshold at that moment, while `rule.threshold` is `null`.
- `budget` is `null` for rule alerts. For budget events it is `{ id, name, scope, scope_id, period, amount_usd, spent_usd, action, resets_at }`, `rule.kind` is `budget` and `rule.window_minutes` is `null`.
- `resolved_at` is set on `alert.resolved`.
- New fields can appear in a later `version`. Ignore fields you do not know.

## Verify a request

Check every request before you act on it:

1. Read the **raw** body bytes. Do not parse and re-serialize them; any change to the bytes changes the signature.
2. Read `X-Spanlight-Timestamp` and reject the request if it is more than 300 seconds away from your clock, in either direction. This stops someone replaying a captured request later.
3. Compute `HMAC-SHA256(secret, "<timestamp>." + body)` with the signing secret as the key, write it as lowercase hex and prefix it with `sha256=`.
4. Compare it with `X-Spanlight-Signature` in constant time.
5. Deduplicate on `X-Spanlight-Delivery`. Delivery is at-least-once, so a retry can reach you after you already handled the first attempt.

```python
import hashlib
import hmac
import time

def verify(secret: bytes, timestamp: str, body: bytes, header: str, tolerance: int = 300) -> bool:
    try:
        sent_at = int(timestamp)
    except ValueError:
        return False
    if abs(time.time() - sent_at) > tolerance:
        return False
    mac = hmac.new(secret, timestamp.encode() + b"." + body, hashlib.sha256)
    expected = ("sha256=" + mac.hexdigest()).encode()
    return hmac.compare_digest(expected, header.encode())
```

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verify(secret, timestamp, body, header, toleranceSeconds = 300) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

### Reference vector

Use this to test your implementation. With the secret `whsec_testsecret` (the ASCII text), the timestamp `1760000000` and the body

```text
{"version":"2026-10-01","event":"alert.fired"}
```

the signature is

```text
sha256=4cc8b9a14fd1521d3e288d2cc68077b30c14aeeaa10627c561859d0418d069a4
```

## Responses and retries

Answer with any `2xx` status as soon as you have stored the event; Spanlight does not read the body of a `2xx` answer and waits at most 10 seconds. Do slow work after you answer.

| Your answer | What Spanlight does |
| --- | --- |
| Any `2xx` | The delivery is done. |
| `408`, `429`, any `5xx`, a timeout or a connection error | Retried. |
| Any other `4xx` | Failed for good. A retry would get the same answer. |
| Any `3xx` | Failed for good. Redirects are never followed; give the channel the final URL. |

A retryable failure is tried again after 30 seconds, then after 1 minute, 2 minutes and so on, doubling each time up to a cap of 1 hour between attempts, for 8 attempts in all. After the last one the delivery is marked failed and stays visible, with its error, in the channel's delivery list, where you can retry it by hand. The error shows the status and the start of your response body, never the URL or the secret.

## PagerDuty test events

A PagerDuty channel sends Events API v2 events instead of webhooks, and does not use the signature described above. **Send test** on a PagerDuty channel triggers an incident with severity `info` and resolves it straight away, with the dedup key `spanlight-test-<channel id>`. It does not page anyone and leaves no open incident, although the two events appear briefly in the service's activity. If the resolve cannot be sent, the incident stays open until you resolve it in PagerDuty.

## URL and secret handling

- The URL must start with `https://` and must resolve to a public address. Addresses that are private, loopback, link-local or reserved are refused when you save the channel and again when Spanlight connects, so a DNS change after the check does not get around it. An operator running Spanlight inside a private network can lift both rules with `WEBHOOK_ALLOW_PRIVATE_TARGETS` (see [Configuration](/docs/configuration/)).
- Anyone in your organization who can read channels can see the webhook URL. Put tokens in the signing secret and verify the signature; do not put them in the query string.
- Rotating the secret takes effect at once. Requests already queued are signed with the new secret when they are sent, so switch your receiver to accept the new secret before you rotate, or accept both for a while.
