# 3. Tenant isolation is enforced by Postgres row-level security

Date: 2026-10-07 · Status: accepted

## Context

Traces contain customers' prompts and completions. A single missing `WHERE project_id = …` in application code would leak one tenant's data to another.

## Decision

Authorization is checked in three layers:

1. Middleware identifies the caller (session or API key).
2. A route dependency, `require(permission)`, checks membership and role through one central permission table. Non-members get `404`, so resource existence is not revealed.
3. `traces` and `spans` have `ENABLE` and `FORCE ROW LEVEL SECURITY`, with a policy comparing `project_id` to `current_setting('app.project_id')`. Each request sets it with `SET LOCAL` inside its transaction. Background maintenance that spans projects uses an explicit bypass setting that only worker code sets.

The application connects as a non-superuser role, because superusers bypass RLS.

## Consequences

A query that forgets its tenant filter returns nothing instead of everything. Tests prove cross-tenant reads fail even through raw SQL. The cost is one `SET LOCAL` per request and slightly more care in migrations.
