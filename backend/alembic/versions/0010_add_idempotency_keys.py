"""Add idempotency keys.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-09

A client that retries a POST (after a timeout, say) sends the same `Idempotency-Key` header, and
the API then runs the request once and answers the retry with the first answer. This table is
where that is remembered: one row per (principal, key), written before the request runs and
completed once it has an answer.

Choices worth knowing about:

* `principal_id` is text (`user:<id>` for a session or a personal access token, `key:<id>` for an
  API key), not a foreign key: it names a user or a key without tying the row to either one, so
  nothing cascades into it and it expires on its own. Two people, or a person and a key, may use
  the same `key` independently, which is why it is part of the primary key.
* A row with a NULL `status` is in flight: the request that reserved it has not answered yet. The
  CHECK `idempotency_keys_outcome_check` says such a row has no body and no content type either,
  so a half-written answer cannot be replayed.
* `status` is limited to 200 to 499. Server errors are never stored (the row is deleted so a retry
  can run), and nothing below 200 is a final answer.
* `body` is the JSON the first request answered with and `content_type` is its media type, so a
  replay can say the same thing, including `application/problem+json` for a stored error. Both are
  NULL for an answer with no body, such as a 204. The column is not in the first sketch of this
  table; without it a replayed error would be labelled `application/json`.
* `request_hash` is the SHA-256 of the method, the path and the canonical body, 32 bytes, so a key
  reused for a different request is told apart from a retry.
* `created_at` doubles as the owner's token: a request that takes over an abandoned row writes a
  new `created_at`, and only the request holding that exact value may complete or delete the row.
* `expires_at` is set when the row is made, a day later, and the cleanup job prunes through the
  index on it. The table is not project-scoped, so it has no row-level security.

Downgrade drops the table. Nothing else refers to it, and a retry that finds no row simply runs
again, which is what the API did before this migration.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE idempotency_keys (
            principal_id text NOT NULL,
            key          text NOT NULL,
            request_hash bytea NOT NULL,
            status       integer,
            body         jsonb,
            content_type text,
            created_at   timestamptz NOT NULL DEFAULT now(),
            expires_at   timestamptz NOT NULL,
            CONSTRAINT idempotency_keys_pkey PRIMARY KEY (principal_id, key),
            CONSTRAINT idempotency_keys_key_check CHECK (length(key) BETWEEN 1 AND 128),
            CONSTRAINT idempotency_keys_request_hash_check CHECK (octet_length(request_hash) = 32),
            CONSTRAINT idempotency_keys_status_check
                CHECK (status IS NULL OR status BETWEEN 200 AND 499),
            CONSTRAINT idempotency_keys_outcome_check
                CHECK (status IS NOT NULL OR (body IS NULL AND content_type IS NULL)),
            CONSTRAINT idempotency_keys_expiry_check CHECK (expires_at > created_at)
        )
        """
    )
    op.execute("CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS idempotency_keys")
