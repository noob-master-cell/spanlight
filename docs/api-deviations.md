# API contract: deviations and clarifications (backend, Milestone 1)

The backend implements the API as first designed (that design is not published) without changing
any documented shape. This file is the reference for where the original design was silent or
ambiguous, and for the decisions the backend made. Items marked **Deviation** depart from the
original design; everything else is a clarification.

## Versioning

- The dashboard API is served under `/api/v1`, for example `GET /api/v1/projects/{project_id}/traces`.
  The earlier unversioned `/api/<resource>` paths no longer exist and return 404.
- Not part of the versioned surface, and unchanged: ingestion (`POST /v1/traces`, `POST /v1/otlp/traces`,
  versioned on its own), `/health/*`, `/metrics`, and the OpenAPI document and docs UI
  (`/api/openapi.json`, `/api/docs`).
- A breaking change ships as `/api/v2`. From then on `/api/v1` keeps working for at least 12 months
  and its responses carry a `Deprecation` header. Additive changes (new fields, endpoints, optional
  parameters) stay in `/api/v1`. See [ADR 5](decisions/0005-public-api-under-api-v1.md).
- The `route` label of `spanlight_http_requests_total` and `spanlight_http_request_duration_seconds`
  is the full route template, so it carries the prefix (for example
  `/api/v1/projects/{project_id}/traces`).

## Errors

- Every error is `application/problem+json`: `{type:"about:blank", title, status, detail, code, request_id, errors?}`.
  Every response also carries an `X-Request-ID` header (an incoming valid `X-Request-ID` is echoed back).
- Codes in use: `UNAUTHORIZED` (401), `INVALID_CREDENTIALS` (401, login), `KEY_EXPIRED` (401, an API key
  past its `expires_at`), `TOKEN_EXPIRED` (401, a personal access token past its `expires_at`),
  `FORBIDDEN` (403), `KEY_SCOPE` (403, an API key used outside its scopes),
  `TOKEN_SCOPE` (403, a read-only personal access token used to change something),
  `SESSION_REQUIRED` (403, a personal access token used on a route that needs a signed-in session),
  `CSRF_FAILED` (403), `ORIGIN_NOT_ALLOWED` (403), `NOT_FOUND` (404), `EMAIL_TAKEN` (409),
  `EMAIL_ALREADY_VERIFIED` (409), `EMAIL_UNVERIFIED` (409, an action needs a verified email address while
  email is configured), `LAST_OWNER` (409), `NOT_CONFIGURED` (409, a request needs an
  optional integration the operator has not set up; `detail` names the setting to change),
  `LAST_SIGN_IN_METHOD` (409, unlinking the only way to sign in),
  `TOTP_ALREADY_ENABLED` / `TOTP_NOT_ENABLED` (409, two-factor setup state),
  `TWO_FACTOR_NOT_ENABLED` (409, an owner requires two-factor for the org without having it),
  `TWO_FACTOR_REQUIRED` (403, the org requires two-factor and the caller has not turned it on),
  `INVALID_TOTP_CODE` (422 when enabling or disabling, 401 when signing in),
  `TOTP_CHALLENGE_INVALID` (401, the second step of signing in),
  `CONFIRMATION_MISMATCH` (422, a deletion whose typed `confirm` is not the slug of what it deletes),
  `IDEMPOTENCY_MISMATCH` (422, an `Idempotency-Key` first used for a different request),
  `IDEMPOTENCY_IN_PROGRESS` (409, the first request with that key has not answered yet),
  `SLUG_UNAVAILABLE` (409), `PAYLOAD_TOO_LARGE` (413),
  `UNSUPPORTED_MEDIA_TYPE` (415), `VALIDATION_ERROR` (422, with `errors[].field`),
  `RATE_LIMITED` (429, with `Retry-After`), `INVALID_JSON` / `INVALID_OTLP` / `BAD_REQUEST` (400),
  `INTERNAL_ERROR` (500).
- Validation `errors[].field` is the dotted path without the `body.`/`query.` prefix (e.g. `password`).
- **Request body limit:** every `/api/v1` request body is limited to **1 MiB**. Over the limit is `413
  PAYLOAD_TOO_LARGE`, answered without reading the body when `Content-Length` already declares too much, and
  while reading when the body is chunked or understates its length. Ingestion (`/v1/traces`,
  `/v1/otlp/traces`) is outside this limit and keeps its own 5 MB.

## Auth, CSRF, sessions

- `spl_csrf` is a signed token bound to the session; the SPA echoes the cookie value in `X-CSRF-Token`.
  `GET /api/v1/auth/me` re-issues `spl_csrf` if it is missing or stale, so the SPA can recover.
- State-changing `/api/` requests (every version) **without an `Origin` header are rejected** (403 `ORIGIN_NOT_ALLOWED`),
  not only those with a foreign Origin. Browsers always send Origin on POST/PUT/PATCH/DELETE. A request that
  carries `Authorization: Bearer …` is exempt from this check and from CSRF (see API key scopes, expiry and
  bearer requests); other `Authorization` schemes are not.
- CSRF is required on every authenticated unsafe method, including `POST /api/v1/auth/logout` and
  `POST /api/v1/invites/accept`. Exempt (Origin check only): `signup`, `login`, `POST /api/v1/demo/session`,
  `POST /api/v1/auth/email/verify/confirm`, `POST /api/v1/auth/password/forgot`,
  `POST /api/v1/auth/password/reset`, `POST /api/v1/auth/totp/verify`.
- `POST /api/v1/auth/signup` is limited to **10 attempts per IP per hour**; the 11th is 429 `RATE_LIMITED`
  with `Retry-After`. Every attempt counts, including one refused with `409 EMAIL_TAKEN`, so probing for
  registered addresses is limited too.
- Login throttle: once an email has **5** failures (or an IP **20**) within 15 minutes, further attempts
  return 429 with `Retry-After` — i.e. the 6th attempt is blocked. Throttled attempts are not recorded.
  Wrong two-factor codes count as failed sign-ins too (see Two-factor authentication).
- `POST /api/v1/demo/session` → **200 `User`** and sets the same cookies as login (`Max-Age` 3600).
  404 when the demo is disabled; 429 after 10 per IP per hour.
- `DELETE /api/v1/auth/sessions/{id}` returns 404 for sessions that are not the caller's.
- **Addition:** `DELETE /api/v1/auth/sessions` → 204 signs out everywhere else: it deletes every session of
  the caller except the one making the request, which keeps working. It needs a session and the CSRF header like
  any authenticated unsafe method, and it is a no-op (still 204) when there are no other sessions. Other users'
  sessions are never touched.
- **The shared demo account's sessions are not manageable.** Every demo visitor is the same user, so their
  sessions belong to other people. For the demo user, `GET /api/v1/auth/sessions` lists only the caller's own
  session (so other visitors' addresses and browsers are not shown), and `DELETE /api/v1/auth/sessions` and
  `DELETE /api/v1/auth/sessions/{id}` answer `403 FORBIDDEN` without ending anything. A visitor can still
  `POST /api/v1/auth/logout` to end their own session.

## Orgs, members, invites

- `PATCH /api/v1/orgs/{org_id}/members/{user_id}` → 200 `{user: User, role, created_at}` (same shape as a
  member list item).
- Only owners may grant the owner role, change an owner's role, remove an owner, or invite as owner;
  admins get 403 for those.
- `DELETE …/members/{own user id}` lets any member **leave** the org (still subject to `LAST_OWNER`).
- Accepting an invite as an existing member keeps the existing role (never downgrades).
- Invalid, used, expired or revoked invite tokens → 404.
- **Addition:** `GET /api/v1/invites/preview?token=…` → 200 `{org: {id, name, slug}, role, expires_at}`,
  so the invite page can show the organization and role **before** the user accepts. It requires a
  signed-in session (401 otherwise), changes nothing (no audit event, the invite stays usable) and
  returns the same 404 `NOT_FOUND` for unknown, used, expired and revoked tokens. The token travels
  in the query string, like the `/invite/{token}` page URL it comes from.
- **Addition (invite emails, 2026-10-08):** `POST /api/v1/orgs/{org_id}/invites` takes an optional
  `email` (a valid address, else 422 `VALIDATION_ERROR`) next to `role`. The create response and
  `GET /api/v1/orgs/{org_id}/invites` items gain `email`, which is `null` for an invite created without
  one. The response still returns `url`, whether or not anything was mailed.
  - **Mailing.** With an `email` and a configured email sender, the invitation is also queued for
    delivery. The invite, its `invite.create` audit event and the queued email are one transaction.
    The email names the inviter (the caller's name), the organization and the role, and carries the
    same `url`. Without an `email`, or when email is not configured, nothing is queued and the invite is
    created as before; the address, if given, is still stored and listed. The response does not say
    whether the email was queued, so a client that needs to know checks whether email is configured.
  - **Limit.** At most **20 mailed invites per organization per hour**, counted only for invites that
    are mailed (link-only invites and invites created while email is not configured do not count).
    The 21st gets 429 `RATE_LIMITED` with `Retry-After` (whole seconds, rounded up) and **no invite is
    created**. Refused requests are not recorded, so retrying early does not extend the wait. The
    counts live in Postgres (`throttle_events`), so they hold across API replicas. The limit exists
    because anyone can sign up, create an organization and invite arbitrary addresses; unlimited, that
    would let strangers send mail from the instance's sender address.
  - **Accepting is unchanged.** Mailing does not tie an invite to the address it was sent to: any
    signed-in holder of the link can accept it, as for a link shared by hand. The link keeps its
    `{APP_BASE_URL}/invite/<token>` shape. Because the token is in the path, it can appear in access
    logs and `Referer` headers; unlike the verification and reset links, it is not in the URL fragment.
- **Addition (2026-10-08):** `PATCH /api/v1/orgs/{org_id}` → 200 `Org` takes `{"require_2fa": bool}` (see
  Two-factor authentication) and, since 2026-10-09, `name` (see Organization and project administration).
  `Org` (in `memberships[].org`, `POST /orgs`, this response and `GET /orgs/{id}`) gains a `require_2fa`
  boolean, false by default.
- Audit actions: `org.create, org.update, member.add, member.role_change, member.remove, invite.create,
  invite.revoke, invite.accept, project.create, project.update, project.delete, key.create, key.revoke,
  user.password_reset, user.oauth_link, user.oauth_unlink, user.totp_enable, user.totp_disable`.
  `actor` is null for CLI actions.
- Internal: a permission `org:read` (held by every role) guards org-level reads; it does not change
  which roles can do what.

## Projects, keys

- Creating a project requires `project:write` (admin/owner). Listing keys requires `project:read`.
- `prefix` is the displayable start of the key, `spl_live_<12 chars>`; the full key is
  `<prefix>_<32 chars>`. `secret` appears only in the 201 response.
- `last_used_at` is updated at most once per minute, by ingestion and by reads alike.
- Keys have scopes and an optional expiry; see API key scopes, expiry and bearer requests.
- Projects can be deleted (`DELETE /api/v1/projects/{project_id}`); see Organization and project
  administration.

## Traces, sessions, metrics

- Non-members get 404 for every project route; members lacking a permission get 403.
- `from`/`to` default to the last 24 h; `from >= to` or a window > 90 days → 422.
- Sessions: `last_at` is the latest trace `ended_at`; ordering and cursors use it (desc).
- KPI definitions (overview, timeseries, models):
  - `llm_calls`, `errors`/`error_rate`, `p50_ms`/`p95_ms` (`percentile_cont`) and `unpriced_calls` are
    computed over spans of kind `llm` started in the window.
  - `cost_usd` and token totals are over **all** spans in the window (matching trace rollups);
    `cost_usd` is `null` when nothing in the window was priced. `error_rate`/percentiles are `null`
    when there are no LLM calls.
  - `traces` counts traces started in the window. `environment` filters by the trace's environment.
  - Timeseries buckets are gapless (empty buckets have zero counts and `null` cost/p95), in UTC.
- Metrics source and `approximate`: windows of 24 h or less read the raw spans (exact percentiles);
  longer windows read the hourly rollups (hours whose `bucket_start` is in `[floor_hour(from), to)`,
  so the first and last hour count in full) and estimate p50/p95 from merged latency histograms.
  The overview's previous period follows the same rule as the current one. `overview` carries a
  top-level `approximate: bool`; `timeseries` and `models` stay plain lists (an envelope would break
  clients), so each item carries the same `approximate: bool`. Rollup reads can lag up to 5 minutes.
- Trace `status=ok|error` filters on `error_count = 0 | > 0`. `q` matches the trace name
  (case-insensitive substring) or an exact trace id.
- Money is a decimal string with up to 8 fractional digits, e.g. `"0.00021000"`.

## Ingestion (`POST /v1/traces`)

- Both ingestion routes need a key with the `ingest:write` scope (403 `KEY_SCOPE` otherwise). The scope is checked
  before the per-key rate limit, so a key that may not ingest spends nothing from it.
- **Token convention (shared with the SDK):** `usage.input_tokens` is the total prompt size
  *including* cached tokens; `usage.cached_tokens` is the cached subset. Cost =
  `(input - cached) × input_rate + cached × cached_rate + output × output_rate`; with no published
  cached rate, cached tokens bill at the input rate. Cache writes are not priced separately.
  `cached_tokens > input_tokens` rejects the span.
- Cost is `null` (never 0) for unknown models or when input/output tokens are missing; such
  LLM spans set the trace's `has_unpriced`.
- **Deviation — model matching:** a price pattern matches the model exactly, or followed by a
  snapshot suffix (`-YYYYMMDD`, `-YYYY-MM-DD`, `-latest`); longest pattern wins. Plain prefix
  matching (as in the original design) would price e.g. `gpt-4.1-nano` as `gpt-4.1`. Matching is
  case-insensitive; when `provider` is sent it must match the price's provider.
- Unknown span fields are ignored (forward compatible) rather than rejected.
- Per-span rejections (`rejected[].reason` is `"<field>: <message>"`): schema errors; `end_time`
  before `start_time`; `start_time` older than 90 days; `end_time` more than 10 minutes in the
  future; a span parenting itself; attributes over 64 KB; all-zero ids. Timestamps must be ISO-8601
  **with an offset** or integer unix nanoseconds. Ids are lowercased.
- A `span_id` repeated within one batch keeps the **last** occurrence; earlier ones are reported in
  `rejected` with reason `duplicate span_id in batch…`.
- Trace fields: last non-null wins (within a batch and across batches); `null` never overwrites.
  `tags` are unioned. Rollups are always recomputed from stored spans, so re-sending is idempotent.
- Payloads: secrets are redacted first, then `input`/`output` over 32 KB are replaced by a **string**
  holding the first 32 KB of their JSON text, with `truncated: true`.
- The body may be `Content-Encoding: gzip` or `deflate`; the 5 MB limit applies after decompression.
  NaN/Infinity and NUL characters are rejected/stripped.
  JSON nested more than 64 levels deep is `400 INVALID_JSON`.

## OTLP (`POST /v1/otlp/traces`)

- Model: `gen_ai.response.model` is preferred over `gen_ai.request.model` (it is the billed snapshot).
- Kind: `llm` if any `gen_ai.*` attribute; `http` for client spans with `http.*`/`url.*`
  attributes; `retrieval` with `db.*`; otherwise `other`.
- Trace name: the root span's name (falling back to `service.name`); non-root spans do not set it.
- Legacy `gen_ai.usage.prompt_tokens`/`completion_tokens` are accepted. Content attributes are parsed
  as JSON when they are JSON strings and are removed from `attributes`; `service.name` is copied into
  `attributes`.
- JSON ids may be hex (as in the original design) or base64. Response: `{}` or
  `{"partialSuccess": {"rejectedSpans": "<n>", "errorMessage": "…"}}`; protobuf mirrors this.

## Health and metrics

- `/metrics` returns 404 when `METRICS_TOKEN` is unset, 401 for a wrong/missing bearer.
- `/health/ready` reports `migrations: "pending"` (503) when the DB is not at the Alembic head.

## Worker / demo

- **Deviation (directed by the coordinator):** the demo job writes spans by calling the ingestion
  pipeline function directly instead of going through the Python SDK and the HTTP API.
- The demo job also skips (with a warning) if any billed demo LLM call this month is unpriced, since
  the budget could not be enforced. It runs at most one attempt per period (no paid retries).
- `cleanup_sessions` also prunes login attempts and throttle events older than a day, email tokens that
  are used or expired and older than a day, finished jobs older than 7 days, and idempotency keys past
  their 24 hours.

## Trace summaries: `error_message` (added 2026-10-08)

`TraceSummary` (trace list items and trace detail) gains `error_message: string | null` — the
status message of the earliest failed span (ties broken by span id), truncated to 500 characters.
`null` when no span failed or the failed span sent no message. Used by the Overview "Recent errors"
card and the trace list. Computed with a correlated subquery on the spans primary key.

## Price catalogue (added 2026-10-09)

- `GET /api/v1/prices` lists every row of the price table ordered by provider, `model_pattern` and
  `effective_from`; money is a decimal string. Any signed-in user may read it (session or access
  token); API keys get 403 `KEY_SCOPE`. There is no write endpoint: prices change through
  `spanlight sync-prices`.
- `GET /api/v1/projects/{project_id}/unpriced-models` needs `project:read` (an API key with
  `traces:read` may read its own project) and takes the usual `from`/`to` window. It groups LLM
  spans started in the window by provider and model, counting those with a model, both token
  counts and a NULL cost: the model matched no price at ingestion. Spans missing a model or a
  token count are NULL-cost for another reason and are not listed, so the list can be shorter
  than the overview's `unpriced_calls`. Most-called first, at most 100 models.

## Email verification (added 2026-10-08)

Verification is soft: an unverified user uses the product normally; nothing is blocked on it.

- `User` gains `email_verified: boolean`, true once the owner of the address has proven it. It is on
  every response that embeds a user: signup, login, `GET /api/v1/auth/me` (as `user.email_verified`;
  `MeOut` has no separate top-level field), members, API key creators and audit actors.
- `POST /api/v1/auth/email/verify/request` (session and CSRF) → **202 `{"status": "accepted"}`** and
  queues a verification email for the signed-in user. The body is the `AcceptedOut` shape, meant for
  any request whose work is finished later by the worker. Checked in this order:
  1. 409 `NOT_CONFIGURED` when email is not configured. `detail` names `EMAIL_PROVIDER` and
     `EMAIL_CONSOLE_FILE`; the `console` provider counts as configured only when `EMAIL_CONSOLE_FILE`
     is set, since logging an address delivers nothing.
  2. 403 `FORBIDDEN` for the shared demo user. Everyone who starts a demo session is signed in as that
     one anonymous account, so no visitor may make the server send mail to its address.
  3. 409 `EMAIL_ALREADY_VERIFIED`.
  4. 429 `RATE_LIMITED` with `Retry-After` (whole seconds, rounded up) after **3 requests per user per
     hour**. The email sent at signup is not counted, and refused requests are not recorded, so
     retrying early does not extend the wait. The count lives in Postgres, so it holds across API
     replicas.
- `POST /api/v1/auth/email/verify/confirm` with `{"token"}` → **200 `User`**. It needs no session,
  because the link is often opened in a browser that is not signed in; the Origin check still applies
  and CSRF does not (there is no session to bind it to).
  - **404 `NOT_FOUND`, the same response for every bad token**: unknown, already used, expired, or
    issued for another purpose (a password-reset token). Nothing tells a caller which. A token
    presented to the wrong route is not spent.
  - Confirming an address that is already verified (with a second valid token) returns 200 and keeps
    the original verification time.
- **The link** is `{APP_BASE_URL}/verify-email#token=<token>`. The token is in the URL fragment, which
  browsers send neither to the server nor in a `Referer` header, so it stays out of access logs; the
  page reads the fragment and posts it to the confirm route.
- **The token** is 32 random bytes in URL-safe base64 (43 characters), stored only as its SHA-256,
  single use, and valid for 24 hours. Concurrent confirmations with one token succeed exactly once.
- Signup queues the verification email in the signup transaction when email is configured, so the
  account, its token and the queued email commit together. Without email configured nothing is
  queued and the user stays unverified.

## Password reset (added 2026-10-08)

Both routes need no session, because the person has forgotten their password. The Origin check still
applies and CSRF does not (there is no session to bind it to). Neither sets a cookie.

- `POST /api/v1/auth/password/forgot` with `{"email"}` → **202 `{"status": "accepted"}`** (`AcceptedOut`).
  - **The answer is the same for every address.** A known address, an unknown one and the demo user's
    get the same status and the same body; only a known, non-demo address also gets a token and a
    queued email. Unknown addresses queue nothing. Both kinds are counted by the limits below first,
    so hitting a limit says nothing about whether an account exists.
  - 409 `NOT_CONFIGURED` when email is not configured, with the same `detail` as the verification
    request. It is the operator's state, so it is the same for every address and is checked before
    the limits (such a request is not counted).
  - 429 `RATE_LIMITED` with `Retry-After` (whole seconds, rounded up) after **3 requests per email
    address per 15 minutes**, or **10 per client IP per 15 minutes**. The email address is compared
    case-insensitively. The email limit is checked first, then the IP limit, always in that order.
    Refused requests are not recorded, so retrying early does not extend the wait. The counts live in
    Postgres (`throttle_events`), so they hold across API replicas. The sign-in throttle is separate
    and unchanged: it still counts failed sign-ins in `login_attempts`.
  - Asking again retires the reset links sent before: **at most one reset link is live per user**.
    Verification links are not affected.
  - Validation: `email` must be a valid address (422 `VALIDATION_ERROR`).
- `POST /api/v1/auth/password/reset` with `{"token", "password"}` → **204**, no body. `password` is
  10–256 characters, the same rule as signup.
  - **404 `NOT_FOUND`, the same response for every bad token**: unknown, already used, expired, or
    issued for another purpose (a verification token). A token presented to the wrong route is not
    spent. A password that fails validation (422) does not spend the token either, so the link can be
    used again with a better one.
  - A successful reset is one transaction. It sets the new password hash; **ends every session** of
    the user; sets `email_verified_at` if it was unset, since the link reached the inbox (an earlier
    verification time is kept); marks the user's other unused reset links as used; and writes a
    `user.password_reset` audit event, with `actor` the user, `target` the user and `metadata`
    `{"via": "email"}`, to each org the user belongs to.
  - **No session survives the change.** A sign-in that was verifying the old password while the reset
    committed either is refused (401 `INVALID_CREDENTIALS`) or has the session it created ended by the
    reset; it never keeps one. The same holds for `spanlight reset-password`.
  - **It does not sign the user in.** The person signs in afterwards with the new password.
- **The link** is `{APP_BASE_URL}/reset-password#token=<token>`, with the token in the URL fragment for
  the same reason as the verification link. The page reads the fragment and posts it to the reset route.
- **The token** has the same format as the verification token (43 characters, stored only as its
  SHA-256, single use) and is valid for **1 hour**. Concurrent resets with one token succeed exactly once.
- **The demo user** cannot be reset by email: `forgot` treats its address like an unknown one, and it
  sends nothing.
- The reset email body, which holds the link, is kept in the notification outbox only until the row is
  settled. Once it is sent, or has failed for good, the stored payload is reduced to the subject.

## Sign in with GitHub and Google (added 2026-10-08)

A provider is **configured** when both its `OAUTH_<PROVIDER>_CLIENT_ID` and `OAUTH_<PROVIDER>_CLIENT_SECRET`
are set (a blank value counts as unset). Setting only one of a pair stops the app at startup, and the
message names the two variables, not their values. The callback URL to register with the provider is
`{APP_BASE_URL}/api/v1/auth/oauth/{provider}/callback`.

| Route | Auth | Behaviour |
|---|---|---|
| `GET /api/v1/auth/oauth/providers` | none | `[{"provider": "github"}, {"provider": "google"}]`, configured providers only, in that order |
| `GET /api/v1/auth/oauth/identities` | session | `[{"provider", "email", "created_at", "last_used_at"}]`, the caller's linked accounts, oldest first |
| `GET /api/v1/auth/oauth/{provider}/start?next=&intent=sign_in\|link` | none (`link` needs a session) | `302` to the provider; `404 NOT_FOUND` for an unknown or unconfigured provider; `401 UNAUTHORIZED` for `intent=link` without a session; for `intent=link` also `403 FORBIDDEN` for the demo account and `409 EMAIL_UNVERIFIED` for an unverified account (see Linking); `422` for another `intent` |
| `GET /api/v1/auth/oauth/{provider}/callback?code&state` | the `spl_oauth` cookie | `302`, always (see below); `404` for an unconfigured provider |
| `DELETE /api/v1/auth/oauth/{provider}` | session + CSRF | `204`; `404 NOT_FOUND` if that provider is not linked; `409 LAST_SIGN_IN_METHOD` if the user has no password and no other linked provider |

- **`start` and `callback` are browser navigations, so they never answer with problem+json** once the
  provider is known. A failed callback is a `302` to `{APP_BASE_URL}/login?error=<CODE>`, with `<CODE>` one of
  `OAUTH_STATE`, `OAUTH_PROVIDER_ERROR`, `EMAIL_UNVERIFIED_AT_PROVIDER`, `ACCOUNT_EMAIL_UNVERIFIED` or
  `OAUTH_ALREADY_LINKED`. Every query parameter of the callback is optional, so a malformed callback gets
  this redirect rather than a `422`. All of these responses carry `Cache-Control: no-store`.
- **The state cookie `spl_oauth`** is set by `start` and cleared by every callback, whatever its outcome. It
  is httpOnly, `SameSite=Lax`, `Secure` when `APP_BASE_URL` is https, scoped to `Path=/api/v1/auth/oauth`
  and lives 10 minutes. Its value is signed with `SECRET_KEY` (HMAC-SHA256) and holds the `state` sent to
  the provider, the PKCE verifier, the provider, the intent, `next` and, for a link, the user who started
  it. The callback needs the cookie to be present, correctly signed, unexpired and for the same provider,
  and its `state` to equal the `state` query parameter (compared in constant time); otherwise it redirects
  with `OAUTH_STATE`, before anything is sent to the provider. This is what stops a login CSRF: a callback
  URL built from someone else's `code` has no matching cookie in the victim's browser.
- **`next`** must be a path that starts with exactly one `/`. Anything else (`//host`, `/\host`, a scheme,
  a control character anywhere, more than 2048 characters) becomes `/`. The default is `/` for a sign-in and
  `/settings/security` for a link. The redirect is always `{APP_BASE_URL}{next}`.
- **The provider exchange** uses the authorization-code flow with PKCE (`S256`). The access token is used
  for the profile calls only and is neither stored nor logged. Calls time out after 10 seconds. A refused
  code, an unreachable provider, a bad status or a malformed answer is `OAUTH_PROVIDER_ERROR`, as is the
  user declining at the provider (`error=access_denied`). Scopes: GitHub `read:user user:email`, Google
  `openid email profile`.
- **The profile**: GitHub's `/user` (id, name, login) plus `/user/emails` (the primary address and its
  `verified` flag); Google's userinfo (`sub`, `email`, `email_verified`, `name`). An email counts as
  verified only when the provider says so. A provider that reports no primary address gives no email.

**Resolution of a sign-in**, in this order:

1. An identity with this `(provider, subject)` exists: that user signs in. The subject is the provider's
   stable account id; a changed or unverified email does not matter.
2. Otherwise, if a user has the same email: the provider must say it is verified (else
   `EMAIL_UNVERIFIED_AT_PROVIDER`) and the local account's email must be verified (else
   `ACCOUNT_EMAIL_UNVERIFIED`); with both, the identity is linked and the user signs in. A user that already
   has a different account of the same provider linked gets `OAUTH_ALREADY_LINKED`. The shared demo account
   is never matched.
3. Otherwise, if the provider says the email is verified, a **new user** is created with no password,
   `email_verified_at` set, and the provider's name (the part of the email before `@` if there is none; at
   most 100 characters). If the email is not verified, or there is none, **no account is created**
   (`EMAIL_UNVERIFIED_AT_PROVIDER`): GitHub lets anyone attach an unverified address to their account, and an
   account created for it would keep that GitHub identity after the real owner of the address recovered it.

On success the callback creates a session exactly like password login (same cookies, same lifetimes) and
redirects to `{APP_BASE_URL}{next}`. Concurrent first sign-ins for one account create one user.

For a user with **two-factor authentication** on, the callback creates no session and sets no session
cookie. It redirects to `{APP_BASE_URL}/login/two-factor#challenge=<challenge>` instead (the challenge is in
the fragment, so no server sees it), and the page finishes with `POST /api/v1/auth/totp/verify`. `next` is
not carried over. What the callback wrote before that point stays: a new user, or an identity linked
because both emails are verified. That identity is the user's own provider account, and every sign-in
through it still needs the second factor.

**Linking** (`intent=link`): the identity attaches to the signed-in user, who must be the user who started
the flow, else `OAUTH_STATE`. The provider's email is not checked, since the person already proved who they
are with their session and sign-in never goes by that email. An account already linked to someone else, or a
different account of the same provider than the one the user already linked, is `OAUTH_ALREADY_LINKED`.
Linking the account that is already linked is a no-op.

- **Only verified accounts can link, when email is configured.** Anyone can register an address that is not
  theirs, and a provider attached to that unproven account would keep a way in after the address's real
  owner recovered the account. So with email configured (`EMAIL_PROVIDER` set up, see `NOT_CONFIGURED`),
  `start?intent=link` answers **409 `EMAIL_UNVERIFIED`** for a user whose email is not verified, and the
  callback checks again and redirects with `ACCOUNT_EMAIL_UNVERIFIED`, linking nothing. Without email nobody
  can verify an address, and the email recovery that makes this dangerous cannot run, so linking stays
  allowed for unverified accounts.
- **The demo account cannot link**: `start?intent=link` answers **403 `FORBIDDEN`** for it, whether or not
  email is configured, and the callback refuses with `ACCOUNT_EMAIL_UNVERIFIED`. It is shared and
  anonymous, so a visitor's provider account would otherwise stay bound to it, show up in its identity
  list for later visitors and put the visitor's IP in the demo org's audit log.
- **Ruling: a link returns to `next`.** The login page sends signed-in users away, which would lose an error
  shown there, so for `intent=link` both success and failure redirect to `{APP_BASE_URL}{next}`; a failure
  appends `error=<CODE>` to the query string (`next` keeps its own query and fragment).
- **Unlinking** takes a lock on the user, so two simultaneous unlinks cannot remove every way to sign in.
  It works whether or not the provider is still configured.
- **Audit**: `user.oauth_link` (`metadata`: `provider`, and `via` of `email_match` or `link`) and
  `user.oauth_unlink` (`metadata`: `provider`) are written to each org the user belongs to, with `actor` and
  `target` the user. Creating a user through a provider writes nothing, since the user has no org yet.

**Users without a password**
- `GET /api/v1/auth/me` gains a top-level **`has_password`** boolean: false for a user who signed up with a
  provider and never set a password, and for the shared demo account. It is not on `UserOut`, which other
  people's profiles are also shown through.
- `POST /api/v1/auth/login` for such a user answers exactly as for an unknown address: **401
  `INVALID_CREDENTIALS`**, after a dummy password verification so it takes as long, and counted as a failed
  attempt.
- Such a user can set a password with the password reset flow; the email proves the inbox.

## Password reset and linked providers (added 2026-10-08)

A password reset that **verifies a previously unverified email** (the first time the address is proven) also
**removes every sign-in provider linked to that user**, in the same transaction, and writes a
`user.oauth_unlink` audit event per removed provider to each org the user belongs to, with `metadata`
`{"provider", "reason": "password_reset"}`. Until then the address was unproven, so whoever registered it
could have attached a provider that would otherwise stay on the account after the owner recovered it. The
owner can link their own providers again afterwards. A reset for an account whose email was already
verified leaves its providers alone. `spanlight reset-password` (the admin CLI) changes neither.

## Two-factor authentication (added 2026-10-08)

Time-based one-time passwords (RFC 6238: HMAC-SHA1, 6 digits, 30-second steps) with recovery codes. It
needs `CREDENTIALS_KEYS`, which seals the secret in the database (AES-256-GCM, see `NOT_CONFIGURED`).

| Route | Auth | Request | Response |
|---|---|---|---|
| `GET /api/v1/auth/totp` | session | | `{"enabled", "enabled_at", "recovery_codes_remaining"}` |
| `POST /api/v1/auth/totp/setup` | session + CSRF | | `{"secret", "otpauth_url"}`; replaces a pending secret; `409 TOTP_ALREADY_ENABLED`; `409 NOT_CONFIGURED` without `CREDENTIALS_KEYS`; `403 FORBIDDEN` for the demo account |
| `POST /api/v1/auth/totp/enable` | session + CSRF | `{"code"}` | `{"recovery_codes": [10 strings]}`; `422 INVALID_TOTP_CODE`; `409 TOTP_ALREADY_ENABLED`; `409 EMAIL_UNVERIFIED`; `403 FORBIDDEN` for the demo account |
| `POST /api/v1/auth/totp/disable` | session + CSRF | `{"code"}` (TOTP or recovery) | `204`; `422 INVALID_TOTP_CODE`; `409 TOTP_NOT_ENABLED`; `429` |
| `POST /api/v1/auth/totp/verify` | none (Origin check) | `{"challenge", "code"}` | `200` `LoginOut` with cookies; `401 INVALID_TOTP_CODE`; `401 TOTP_CHALLENGE_INVALID`; `429` |

- **Login now returns `LoginOut`**, a union discriminated by `status`: `{"status": "signed_in", "user": User}`
  with the session cookies set, as before but wrapped, or `{"status": "totp_required", "challenge",
  "expires_at"}` with **no cookies** when the password was right and the account has two-factor
  authentication. A wrong password still answers `401 INVALID_CREDENTIALS` before any of this, so the
  challenge only ever means "the first step passed".
- **The challenge** is signed with `SECRET_KEY` (HMAC-SHA256, its own signing context) over the user id, an
  expiry, a random nonce and a fingerprint of the user's password, and lasts 5 minutes. It is not stored. It
  signs nobody in by itself; it names whom a code is for. Expired, forged, malformed, for a user that does
  not exist, for a user whose two-factor authentication has been turned off since, and issued before the
  user's password changed: all `401 TOTP_CHALLENGE_INVALID`.
- **Ruling: a challenge does not outlive a password change.** The fingerprint is the first 16 bytes
  (hex) of SHA-256 over the stored password hash, or a fixed value for an account with no password. `verify`
  recomputes it from the user row it has locked, so any change of the password (a reset by email, the
  admin CLI, setting a first password on a provider-only account) ends every open challenge of that user,
  and the person signs in again with the new password. A password is often replaced because it leaked, and
  a sign-in that passed the first step with the old one must not become a session afterwards. The token is
  signed, not encrypted, and carries only the truncated digest, never the hash. The refused attempt is
  not counted as a failed sign-in.
- **Ruling: a sign-in sees two-factor authentication being turned on while it runs.** The password check is
  slow, so a person can finish enabling two-factor authentication in another browser while a password
  sign-in (or a GitHub/Google callback) for the same account is in flight. Both read the user row under a
  shared lock after the first step and decide from that read whether to issue a challenge or a session, so
  the late sign-in gets `totp_required` (or the redirect to the second step) and never a password-only
  session.
- **Codes.** A code is accepted for the current 30-second step and one step either side. It is accepted
  once: the step of the last accepted code is stored, and a code for an earlier or equal step is refused,
  so a code that was seen cannot be replayed. The code that enables two-factor authentication counts as
  used, so signing in right after enabling needs the next code. Spaces and hyphens in a typed code are
  ignored.
- **Recovery codes.** `enable` returns 10 codes of 10 characters from `a-z2-7`, shown as `abcde-fghij`,
  once and never again. Only their SHA-256 is stored. A recovery code is accepted wherever a code is
  (`verify`, `disable`), case-insensitively and without the hyphen, and works once. `GET /auth/totp`
  reports how many are left. `disable` deletes all of them, and `enable` makes a fresh set.
- **Two checks on one account never both succeed with one code.** `verify`, `enable` and `disable` read the
  user row `FOR UPDATE`, so two requests presenting the same code run one after the other and the second is
  refused.
- **Throttling.** Wrong codes at `verify` are recorded as failed sign-ins for the account's email and the
  client IP, so they share the password's limit: 5 failures per email (20 per IP) in 15 minutes, and the next
  attempt is `429` with `Retry-After`, checked before the code is looked at. The user row is locked before
  the failures are counted, so concurrent attempts cannot overshoot the limit. A throttled request records
  nothing. `disable` needs a code too, and a stolen session must not be able to try them all, so it allows
  **5 attempts per user per 15 minutes** (`429 RATE_LIMITED`); this limit is independent of the sign-in one.
- **Ruling: `enable` needs a verified email when email is configured** (`409 EMAIL_UNVERIFIED`, checked
  before the code), for the reason given under linking providers: anyone can register an address that is
  not theirs, and a second factor set on that account would outlast the real owner's recovery. Without
  email configured nobody can verify an address, so the rule does not apply.
- **Ruling: `enable` without a `setup` is `422 INVALID_TOTP_CODE`**, with a `detail` that says to start the
  setup first; there is no secret for any code to be right for. `setup` never reveals an existing secret:
  it answers `409 TOTP_ALREADY_ENABLED` once enabled, and replaces the secret before that.
- **Ruling: the demo account cannot set up or enable two-factor authentication** (`403 FORBIDDEN`): it is a
  single shared, anonymous account, and one visitor turning it on would lock every later visitor out.
- **Secrets are returned once and never logged.** The `setup` response carries `secret`, the `enable`
  response carries the recovery codes, and both are sent with `Cache-Control: no-store`. The secret is
  stored sealed, with the id of the key it was sealed under. If the secret can no longer be opened (the key
  left `CREDENTIALS_KEYS`), signing in fails closed instead of skipping the second factor; recovery codes
  still work.
- **Operator recovery.** Someone who lost both the authenticator app and the recovery codes cannot turn
  two-factor authentication off themselves, since that needs a code. `spanlight reset-2fa --email <address>`
  does it from the host: it clears the secret, the stored step and every recovery code in one transaction
  and writes a `user.totp_disable` audit event to each org of the user with no actor and `metadata`
  `{"via": "cli"}`, then prints one line. An unknown address exits non-zero and changes nothing; a user
  without two-factor authentication exits zero, says so and writes nothing. The password and the sessions
  are not touched (`spanlight reset-password` revokes sessions). The user then signs in with the password
  alone and can enrol again; in an org that requires two-factor, they must.
- **`GET /api/v1/auth/me` gains a top-level `totp_enabled` boolean**, next to `has_password`. It is not on
  `User`, which other people's profiles are also shown through.
- **Audit**: `user.totp_enable` and `user.totp_disable` are written to each org the user belongs to, with
  `actor` and `target` the user and no `metadata`. A failed attempt writes nothing.

**Requiring it for an organization**

- `PATCH /api/v1/orgs/{org_id}` with `{"require_2fa": true|false}` needs the owner-only permission
  `org:security` (admins get `403 FORBIDDEN`, non-members `404`). `require_2fa` must be a boolean: `null`
  or anything else is `422 VALIDATION_ERROR`. Setting it to its current value is a no-op: `200`, no audit
  event. The same route also renames the organization; see Organization and project administration.
- Turning it **on** needs `CREDENTIALS_KEYS` (else `409 NOT_CONFIGURED`) and two-factor authentication on the
  owner's own account (else `409 TWO_FACTOR_NOT_ENABLED`), so the owner can always meet the rule they set.
  Turning it off needs neither. Each change writes an `org.update` audit event whose `metadata` has
  `"require_2fa": {"from": <bool>, "to": <bool>}`.
- While it is on, a member of that org without two-factor authentication gets **`403 TWO_FACTOR_REQUIRED`**
  on every route scoped to the org or one of its projects. Membership is checked first, so a non-member
  still gets `404`; the check comes before the role check. `/api/v1/auth/*` is not affected, which is how
  the member turns two-factor on, and `GET /auth/me` still lists the org. Ingestion with an API key is not
  affected: a key is not a person signing in.
- A member who turns their own two-factor authentication off while an org of theirs requires it is locked
  out of that org until they enable it again. Nothing prevents it.

## API key scopes, expiry and bearer requests (added 2026-10-08)

A project API key (`spl_live_…`) used to do one thing, ingest. It now carries scopes and may expire, and a
key can read its own project through the dashboard API.

| Scope | Allows |
|---|---|
| `ingest:write` | `POST /v1/traces` and `POST /v1/otlp/traces` |
| `traces:read` | the read routes listed below, for the key's own project |
| `scores:write`, `prompts:read` | reserved: accepted when creating a key, but no route uses them yet |

- **Creating a key.** `POST /api/v1/projects/{project_id}/keys` takes `{"name", "scopes"?, "expires_at"?}`.
  `scopes` is a non-empty list of the values above and defaults to `["ingest:write"]`; repeated values are
  stored once, in the order first given. An unknown scope, an empty list, or an `expires_at` that is not in the
  future is `422 VALIDATION_ERROR` (`errors[].field` is `scopes…` or `expires_at`). `expires_at` is an ISO-8601
  time; one without an offset is read as UTC, and `null` (the default) means the key never expires. The
  database enforces the scope list as well (`api_keys_scopes_check`).
- **Shapes.** `ApiKey` gains `scopes` (list of strings) and `expires_at` (time or `null`), in the list and in
  the 201 response. The `key.create` audit event's `metadata` gains `scopes` and `expires_at`. Keys created
  before this change have `["ingest:write"]` and no expiry, so none of them changes behaviour.
- **Ingestion.** A key without `ingest:write` gets `403 KEY_SCOPE` on both ingestion routes.
- **Expiry.** A key at or past its `expires_at` is `401 KEY_EXPIRED`, on ingestion and on reads. This is only
  said to a caller who proved they hold the key: a wrong secret is `401 UNAUTHORIZED` whatever the key's state,
  and a revoked key is `401 UNAUTHORIZED` even if it has also expired.
- **Reading with a key.** A key with `traces:read` may call these routes, and only for its own project:
  `GET /api/v1/projects/{project_id}/traces`, `…/traces/{trace_id}`, `…/sessions`, `…/filters`,
  `…/metrics/overview`, `…/metrics/timeseries` and `…/metrics/models`. Responses are the same as for a session.
  - The project in the path must be the key's. Any other project, existing or not, is `404 NOT_FOUND`, the same
    answer a non-member gets, and the check comes before the scope check. Row-level security is bound to the
    key's project for the request, as it is for a member.
  - For its own project, a key without `traces:read` is `403 KEY_SCOPE`.
  - Every other `/api/v1` route answers an API key with `403 KEY_SCOPE`. That includes the routes that only a
    session may use (`/auth/*`, creating an organization, accepting an invite) and the routes that need no
    sign-in at all (signup, login, email verification, password reset, `POST /auth/totp/verify`,
    `POST /demo/session` and the `/auth/oauth/…` routes): a key is refused there rather than served as an
    anonymous request, and nothing is created or signed in. A key never has an organization role, so it
    cannot manage keys, members or projects.
  - A bearer that is not a valid, unrevoked, unexpired key is `401` on every `/api/v1` route (`UNAUTHORIZED`,
    or `KEY_EXPIRED` for an expired key), before any of the above.
  - A key is not a user, so reads with it are not subject to `TWO_FACTOR_REQUIRED`, which is a check on a
    person's account. Creating the key is: it needs a session, and an organization that requires two-factor
    authentication refuses a member without it (see Two-factor authentication).
  - Reads update `last_used_at` like ingestion (at most once a minute), including requests that are then
    refused with 403 or 404, since the key did authenticate.
- **Bearer requests ignore cookies.** When a request to `/api` has an `Authorization: Bearer …` header, its
  `Cookie` header is dropped before routing and the CSRF and `Origin` checks are skipped: a bearer credential
  is not attached by the browser on another site's behalf. The header is never combined with, or replaced by,
  a cookie. A bearer that is empty or carries a key that is malformed or unknown is `401 UNAUTHORIZED` even
  when the request also has a valid session cookie. The scheme name is matched case-insensitively. A page on
  another site cannot add the header to a request without a CORS preflight, and the API sends no CORS headers.
- **Only `Bearer` counts.** Any other `Authorization` scheme (Basic, Negotiate, Digest, or an empty value) is
  ignored: the request keeps its cookies and is checked as if the header were absent, including the `Origin`
  check and CSRF. Browsers attach Basic and Negotiate credentials by themselves when a proxy in front of the
  app asks for them, so treating those as a bearer would let a cross-site request skip the `Origin` check
  (a login CSRF). A signed-in dashboard request that happens to carry such a header keeps working through its
  cookie.

## Personal access tokens (added 2026-10-08)

A personal access token (PAT, `spl_pat_<12 characters>_<32 characters>`, lowercase base32) is a credential a
person creates for scripts and tools. It acts as that person on the dashboard API, with their organization
roles, and never as more than its own scope allows. It is sent as `Authorization: Bearer spl_pat_…`. Only a
signed-in browser session manages tokens.

| Route | Auth | Request | Response |
|---|---|---|---|
| `GET /api/v1/auth/tokens` | session | none | `[{id, name, prefix, scope, created_at, expires_at, last_used_at}]`, active tokens, newest first |
| `POST /api/v1/auth/tokens` | session | `{"name", "scope", "expires_at"?}` | `201`, the same object plus `"token"` |
| `DELETE /api/v1/auth/tokens/{token_id}` | session | none | `204` |

- **Creating.** `name` is 1 to 100 characters. `scope` is `read` or `write` and has no default: leaving it out,
  or sending another value, is `422 VALIDATION_ERROR`. `expires_at` follows the rules for API keys: an ISO-8601
  time in the future (one without an offset is UTC), or `null` (the default) for a token that never expires.
  The 201 carries `Cache-Control: no-store`.
- **The secret is shown once.** `token` is in the 201 response and nowhere else. The list, `GET /auth/me` and
  every later response omit it, and the database keeps only the SHA-256 of the secret. The `prefix`
  (`spl_pat_` and 12 characters) is what the list shows to tell tokens apart. A token cannot be recovered; create
  another.
- **Listing** returns the caller's tokens that can still be used: revoked and expired tokens are not listed.
- **Revoking** sets `revoked_at` and is idempotent: revoking a revoked token is another `204` and keeps the first
  time. A token that does not exist, or belongs to someone else, is `404 NOT_FOUND`, and revoking never reveals
  which. The revoked token is `401 UNAUTHORIZED` from its next use.
- **The demo account cannot create tokens** (`403 FORBIDDEN`). Every demo visitor is the same user, so a token
  would outlive the visit and be usable by anyone who saw it.
- **Creating and revoking are logged**, not audited: the structured logs `pat_created` and `pat_revoked` carry
  the user id, token id and scope (and the expiry, for creation), and never the token or its secret. A token
  belongs to a user and not to an organization, so there is no organization audit event for it.

**What a token may do**

- **Memberships are read on every request.** A token has no permissions of its own. The organization or
  project in the path is looked up against the owner's memberships on each call, so removing the member, or
  changing their role, takes effect on the next request. A project or organization the owner does not belong to
  is `404 NOT_FOUND`, the answer a session gets, and that is decided before the scope or the role.
- **Scope.** Every permission is classed `read` or `write`. `org:read`, `project:read` and `audit:read` are
  `read`; every other permission is `write`. A `write` token may do whatever its owner's role allows. A `read`
  token is refused with `403 TOKEN_SCOPE` on a `write` permission, and also on any method other than GET, HEAD
  and OPTIONS: leaving an organization (`DELETE /orgs/{org_id}/members/{own id}`) needs only `org:read`, and a
  read-only token must not be able to do it. Note that listing invites needs `member:manage`, which is a
  `write` permission, so a `read` token cannot list invites. The checks run in this order: a non-member is
  `404`, then `403 TWO_FACTOR_REQUIRED`, then `403 FORBIDDEN` for a role without the permission, then
  `403 TOKEN_SCOPE`. A token is therefore never told anything a session of the same user would not be.
- **Two-factor authentication applies.** In an organization that requires it, a token whose owner has not
  turned it on gets `403 TWO_FACTOR_REQUIRED` on the organization's routes, like their session. `GET /auth/me`
  still answers, so a tool can tell whose token it is.
- **Bearer requests ignore cookies, `Origin` and CSRF**, as for API keys: the `Cookie` header is dropped and a
  token is never combined with a session. A request that carries a token and the cookies of another user is
  served as the token's user. A bearer that is malformed, unknown, or revoked is `401 UNAUTHORIZED`, even when
  a valid session cookie is also sent.
- **Expiry.** A token at or past its `expires_at` is `401 TOKEN_EXPIRED`, on every `/api/v1` route. As for API
  keys this is only said to a caller who proved they hold the token: a wrong secret is `401 UNAUTHORIZED`
  whatever the token's state, and a revoked token is `401 UNAUTHORIZED` even if it has also expired.
- **`last_used_at`** is written at most once a minute, including for requests that are then refused with 403 or
  404, since the token did authenticate.

**Where a token is accepted**

- Every `/api/v1` route that names an organization or project (guarded by a permission), under the rules above.
  These include the read routes an API key with `traces:read` may use, which a token reaches in every project
  its owner belongs to and not only one.
- `GET /api/v1/auth/me`, which answers with the owner's account and memberships. It does not set cookies for a
  token.
- Nowhere else. Every route that needs a signed-in session answers a token with `403 SESSION_REQUIRED`: all of
  `/api/v1/auth/*` except `GET /auth/me` (so a token cannot create, list or revoke tokens, change two-factor
  authentication, or manage sessions or linked accounts), `POST /orgs`, `GET /invites/preview` and
  `POST /invites/accept`. So do the routes that need no sign-in (signup, login, email verification, password
  reset, `POST /auth/totp/verify`, `POST /demo/session`, `/auth/oauth/…`): a token is refused there rather than
  served as an anonymous request. An API key gets `403 KEY_SCOPE` on all of these, as before.
- A token is not an API key: on `POST /v1/traces` and `POST /v1/otlp/traces` it is `401 UNAUTHORIZED`, and an
  API key on the token routes is `403 KEY_SCOPE`.

Bearer reads of `/api/v1` (`GET` and `HEAD`, with a token or an API key) are rate limited per credential: 20
requests a second with bursts of 40, counted once the credential is known to be valid. Over the limit the answer
is `429 RATE_LIMITED` with `Retry-After`. Bearer writes and signed-in browsers are not limited per credential.

## Organization and project administration (added 2026-10-09)

| Route | Permission | Request | Response |
|---|---|---|---|
| `PATCH /api/v1/orgs/{org_id}` | `org:update` (admin, owner); `org:security` (owner) for `require_2fa` | `{"name"?, "require_2fa"?}` | `200` `Org`; audit `org.update` |
| `DELETE /api/v1/orgs/{org_id}` | `org:delete` (owner) | `{"confirm": "<org slug>"}` | `204` |
| `DELETE /api/v1/projects/{project_id}` | `project:delete` (admin, owner) | `{"confirm": "<project slug>"}` | `204`; audit `project.delete` |

**Renaming**

- `PATCH /orgs/{org_id}` takes `name`, `require_2fa`, or both. At least one is required: an empty body is
  `422 VALIDATION_ERROR`. A field that is left out is left alone, and `null` is not a way to leave it out: it
  is a `422` too (the OpenAPI document lists the fields as nullable, but the route refuses `null`). Unknown
  fields are `422`. `name` follows the rules for creating an organization: trimmed, 1 to 100 characters.
- A rename changes the name only. The `slug` stays as it was, because it is what a deletion asks to be typed
  out and what links and the audit log refer to.
- Each field has its own permission and a request with both needs both: an admin who sends `require_2fa`,
  alone or with a `name`, gets `403 FORBIDDEN` and nothing is applied. If turning `require_2fa` on is
  refused (`409 NOT_CONFIGURED`, `409 TWO_FACTOR_NOT_ENABLED`), a `name` sent with it is not applied either.
- Only values that change are applied. Sending the current values is a no-op: `200`, no audit event. A change
  writes one `org.update` event whose `metadata` lists just the changed fields, each as
  `{"from": …, "to": …}`: `{"name": {"from": "Acme", "to": "Acme Labs"}}`, or both `name` and `require_2fa`.

**Deleting**

- The caller types the slug of the organization (or project) being deleted as `confirm`. It is compared
  exactly as typed: not trimmed, and case-sensitive, so the display name does not match. A wrong value is
  `422 CONFIRMATION_MISMATCH` and nothing is deleted. A body without `confirm`, or with something that is
  not a string of at most 200 characters, is `422 VALIDATION_ERROR`. Permission is checked first, so a caller
  who may not delete gets `403 FORBIDDEN` (a non-member `404`) whatever they typed.
- **Organization.** Its projects are deleted first, with their traces, spans and API keys, and then the
  organization, with its memberships, invites and audit events, all in one transaction: either all of it is
  deleted or none is. It is synchronous, which is fine for the organizations this serves. People are not
  deleted: they simply no longer belong to it, so `GET /auth/me` stops listing it. Its API keys stop working
  (`401`). An organization has no audit log left to write to, so the deletion is logged instead: the structured
  log `org_deleted` carries `org_id`, `project_ids` and `actor_user_id`, and nothing else.
- **Project.** Its traces, spans and API keys are deleted with it. The organization's audit log keeps a
  `project.delete` event, written in the same transaction, with `target_type` `project`, `target_id` the
  project's id and `metadata` `{"name": "<name>", "slug": "<slug>"}`, since the project can no longer be looked
  up. Its slug can be used again by a new project.
- **The demo organization** cannot be renamed, have its settings changed, or be deleted, and neither can its
  projects: `403 FORBIDDEN`.
- A personal access token needs the `write` scope for all three routes (all of them are changes), like any
  other non-GET request. An API key is `403 KEY_SCOPE`.

## Idempotency keys (added 2026-10-09)

A `POST` route that accepts an `Idempotency-Key` header can be retried safely: it runs once, and a retry is
answered with the first answer. A route that accepts the header says so and lists it among its parameters in
the OpenAPI document; on any other route the header is ignored.

- **The header** is optional. A key is 1 to 128 visible ASCII characters (no spaces, control characters or
  non-ASCII); anything else is `422 VALIDATION_ERROR` with `errors[].field` `Idempotency-Key`, and the route
  does not run. A request without the header behaves as it always did and nothing is stored.
- **Whose key it is.** A key belongs to the caller that sent it: to the user for a browser session or a
  personal access token, so a script and the dashboard acting as the same user share their keys, and to the
  API key for an API key. Different callers can use the same key without affecting each other.
- **Which request it was.** Two requests are the same when their method, path and body match. A JSON body is
  compared as JSON, so key order and whitespace do not matter. The query string is not part of the
  comparison, so routes that accept the header take their parameters in the body.
- **First request.** The route runs. Its status, JSON body and `Content-Type` are kept for 24 hours.
- **Same key, same request, after the first has answered.** The kept status and body are returned with the
  original `Content-Type` and `Idempotent-Replayed: true`, and the route does not run again. Other response
  headers are not replayed: the replay has the `X-Request-ID` of the retry.
- **Same key, different request.** `422 IDEMPOTENCY_MISMATCH`, whether the first request has answered or not.
  Send a new key for a different request.
- **Same key while the first request is still running.** `409 IDEMPOTENCY_IN_PROGRESS`; retry in a moment. A
  first request that has not answered after 60 seconds is taken to have died: the next request with the key
  runs the route and takes the key over, so a request slower than a minute can run twice.
- **What is kept.** Every `2xx` and `4xx` answer, including a `422` for a body the route rejects, so a client
  that fixes a rejected request must send it under a new key. A `5xx` is never kept: the key is released so
  that the retry runs. Authentication failures (`401`, `403 CSRF_FAILED`, `403 ORIGIN_NOT_ALLOWED`) and refusals
  by the route's permission check (`403`, `404`) come before the key is looked at, so they are never kept.
- **A replay is authorized like the request it replays.** The permission check runs again before the key is
  looked at, so a caller who has lost access since, such as a member who was removed or a token that was
  revoked, gets the `401`, `403` or `404` the original request would now get, not the kept answer.
- **JSON only, up to 1 MiB.** The kept body is JSON. If a route answers with anything else (another content
  type, a file), or with a JSON body of more than 1 MiB, the answer is delivered as it is but cannot be kept,
  and the key is released.
- **The limit of the guarantee.** If the server stops after the route has committed its changes and before
  the answer is kept, the key stays unanswered for a minute and the retry then runs the route again.
- **Retention.** A key is forgotten 24 hours after the first request reserved it. A key past that time is
  ignored even before the cleanup job removes it, and can be used again for any request.

## Exports (added 2026-10-09)

- **Trace exports** are asynchronous. `POST /api/v1/projects/{id}/exports` answers `202` with the export in
  status `queued`; the `create_export` job writes the file to object storage and moves it to `running`, then to
  `done` or `failed`. Poll `GET .../exports/{export_id}` (or the list) for the status. It needs object storage:
  without `S3_BUCKET`, `S3_ACCESS_KEY` and `S3_SECRET_KEY` the request is `409 NOT_CONFIGURED`.
- **Who may export.** `export:create` is held by members, admins and owners; a viewer is `403`. A session or a
  personal access token with the `write` scope can create one; an API key cannot (`403 KEY_SCOPE`). The routes
  accept an `Idempotency-Key`: a retry with the same key and body returns the same export.
  Like any answer to a keyed request, a `409 NOT_CONFIGURED` is kept for 24 hours and replayed for the same key and
  body, so after turning object storage on, retry with a new key.
- **Filters.** `filters` takes the trace-list filters under the same names (`from`, `to`, `environment`, `release`,
  `model`, `status`, `user_id`, `session_id`, `tag`, `q`) with the same meaning. `from` and `to` are required and
  `to - from` is at most 90 days; a time without an offset is UTC. An unknown filter is `422`.
- **Size limit.** More than 100 000 matching traces end the export as `failed` with `error_code`
  `EXPORT_TOO_LARGE`, and the job does not retry. The `error_code` values are `EXPORT_TOO_LARGE`, `NOT_CONFIGURED`
  (storage was switched off after the request), `EXPORT_TIMEOUT` (a read ran past two minutes; not retried) and
  `EXPORT_FAILED` (every attempt failed, or the job was lost and cleanup gave up on it after two hours).
- **Download links.** `download_url` is present only while the status is `done`, in the list as well as on a single
  export, and is a presigned link valid for one hour. Fetch the export again (`GET .../exports/{export_id}`) for a
  fresh link; none is given once `expires_at` has passed. A file is deleted 7 days after the export completed and
  the export becomes `expired`, with no link. Deleting a project deletes its export files too.
- **File contents.** CSV has one row per trace with the columns `trace_id, name, started_at, ended_at, duration_ms,
  status, environment, release, user_id, session_id, span_count, error_count, input_tokens, output_tokens,
  cost_usd, tags`, CRLF line ends and UTF-8. `status` is `error` when the trace has a failed span, else `ok`. An
  unknown value is an empty cell, `cost_usd` is a decimal string, and tags are joined with `;`. A cell that starts
  with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed with `'` so that a spreadsheet does not run it as
  a formula. JSONL has one JSON object per line: the fields of the trace detail endpoint plus `status`, with the
  spans nested under `spans`. Both are ordered newest trace first.
- **Audit log filters.** `GET /api/v1/orgs/{id}/audit` accepts `action` (exact match), `actor_id`, `from`
  (inclusive) and `to` (exclusive); all are optional. `from` must be earlier than `to`.
- **Audit log CSV.** `GET /api/v1/orgs/{id}/audit/export.csv` takes the same filters and streams the matching
  events as CSV (`id, created_at, action, actor_id, actor_email, target_type, target_id, ip, metadata`, with
  `metadata` as JSON), newest first, under the same formula protection. More than 50 000 matching events are
  `422 EXPORT_TOO_LARGE`, answered before anything is sent; narrow the filters. Like the other audit routes it
  needs `audit:read`.
