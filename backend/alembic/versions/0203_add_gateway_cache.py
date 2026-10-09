"""Add the gateway's exact-match response cache.

Revision ID: 0203
Revises: 0202
Create Date: 2026-10-09

A gateway key with `cache_ttl_seconds` set replays the stored answer to a request it has seen
before, instead of calling the provider again. `gateway_cache` holds those answers.

Choices worth knowing about:

* The primary key is `(project_id, cache_key)`. `cache_key` is the SHA-256 of the surface and
  the request body and does not include the project, so two projects sending the same request
  never share an entry: every lookup names its project, and the key is only unique within it.
  `project_id` cascades, so deleting a project deletes its cache.
* `body` is the response as the provider sent it, in bytes, with its `content_type`, so a hit
  replays it byte for byte. The time to live is chosen by the key that stores the entry and is
  kept as `expires_at`; a lookup ignores a row past it, and the prune job deletes it later.
  `usage` is the original call's token usage as JSON; a hit records it on the span as the
  original usage. `hit_count` counts the replays.
* The CHECKs are the limits the gateway applies before it stores: a 32-byte key (a SHA-256) and
  a body of at most 1 MB (1 048 576 bytes), and `expires_at` after `created_at`.
* `(expires_at)` serves the prune job, which deletes expired rows across all projects. The
  primary key already serves every lookup and the per-project purge.
* Row-level security is the policy pair every project-scoped table has, in the InitPlan form of
  0017. The prune job is the only code that sets the bypass flag.

Downgrade drops the table; the cache refills as requests arrive.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0203"
down_revision: str | None = "0202"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = "gateway_cache"

PROJECT_EXPRESSION = (
    "project_id = (SELECT NULLIF(current_setting('app.project_id', true), '')::uuid)"
)
BYPASS_EXPRESSION = "(SELECT current_setting('app.bypass_rls', true)) = 'on'"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {TABLE} (
            project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
            cache_key     bytea NOT NULL CHECK (octet_length(cache_key) = 32),
            model         text NOT NULL,
            body          bytea NOT NULL CHECK (octet_length(body) <= 1048576),
            content_type  text NOT NULL,
            usage         jsonb NOT NULL,
            created_at    timestamptz NOT NULL DEFAULT now(),
            expires_at    timestamptz NOT NULL,
            hit_count     bigint NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
            PRIMARY KEY (project_id, cache_key),
            CONSTRAINT gateway_cache_expiry_check CHECK (expires_at > created_at)
        )
        """
    )
    op.execute(f"CREATE INDEX gateway_cache_expires_idx ON {TABLE} (expires_at)")

    op.execute(f"ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {TABLE} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {TABLE}_project_isolation ON {TABLE} "
        f"USING ({PROJECT_EXPRESSION}) WITH CHECK ({PROJECT_EXPRESSION})"
    )
    op.execute(
        f"CREATE POLICY {TABLE}_worker_bypass ON {TABLE} "
        f"USING ({BYPASS_EXPRESSION}) WITH CHECK ({BYPASS_EXPRESSION})"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {TABLE}")
