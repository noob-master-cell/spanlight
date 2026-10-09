# 2. Server-side sessions for the dashboard, hashed API keys for ingestion

Date: 2026-10-07 · Status: accepted

## Context

Two kinds of callers: people using the dashboard in a browser, and applications sending telemetry.

## Decision

- **Dashboard:** an opaque random session token in an httpOnly, SameSite=Lax cookie. Only its SHA-256 hash is stored. Sessions slide for 7 days with a 30-day absolute limit. Logout deletes the row. State-changing requests require an allowlisted `Origin` and a double-submit CSRF token.
- **Ingestion:** project-scoped API keys of the form `spl_live_<prefix>_<secret>`. The prefix is a lookup key; the secret is stored hashed and compared in constant time. The key, never the request body, decides which project data lands in.

## Why not JWTs

JWTs cannot be revoked before they expire without a server-side denylist, which is a session store with extra steps. Role changes and logouts must take effect immediately, and every dashboard request already touches Postgres.

## Consequences

One indexed lookup per dashboard request. Users can list and revoke their sessions, and key revocation is immediate.
