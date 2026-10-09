"""Add personal access tokens.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-08

A person can create a token for scripts and tools that act as them on the dashboard API. The
token holds no permissions of its own; the API reads the owner's memberships on every request.

Choices worth knowing about:

* Like `api_keys`, only the SHA-256 of the secret is stored, and `prefix` (`spl_pat_` plus 12
  characters) is unique and is what a request is looked up by. The CHECK on `secret_hash` says it
  is 32 bytes, the size of a SHA-256 digest, so a plaintext secret cannot be stored by mistake.
* `scope` is an enum type (`read`, `write`). Unlike an API key's scopes there are exactly two, they
  form a ladder rather than a set, and the application classes every permission against them, so
  a third value would be a design change and not a configuration one.
* `expires_at` and `revoked_at` are nullable with no default: NULL is "never expires" and "still
  valid". A revoked token stays as a row, so a revoked token is told apart from one that never
  existed, and `last_used_at` stays on record.
* `user_id` cascades: deleting a user deletes their tokens, which can only narrow access. The
  index on it serves the cascade and the listing of a user's tokens; the unique index on `prefix`
  serves authentication.
* The table is not project-scoped, so it has no row-level security. It is read by the auth code
  for the credential being presented and by the owner's own token routes.
* Downgrade drops the table and the type, which ends every token. That is the safe direction: the
  older schema has no way to honour the scope, and no token gains access.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE TYPE token_scope AS ENUM ('read', 'write')")
    op.execute(
        """
        CREATE TABLE personal_access_tokens (
            id           uuid PRIMARY KEY,
            user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            name         text NOT NULL,
            prefix       text NOT NULL,
            secret_hash  bytea NOT NULL,
            scope        token_scope NOT NULL,
            created_at   timestamptz NOT NULL DEFAULT now(),
            expires_at   timestamptz,
            last_used_at timestamptz,
            revoked_at   timestamptz,
            CONSTRAINT personal_access_tokens_prefix_key UNIQUE (prefix),
            CONSTRAINT personal_access_tokens_name_check CHECK (length(name) BETWEEN 1 AND 100),
            CONSTRAINT personal_access_tokens_secret_hash_check
                CHECK (octet_length(secret_hash) = 32)
        )
        """
    )
    op.execute(
        "CREATE INDEX personal_access_tokens_user_id_idx ON personal_access_tokens (user_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS personal_access_tokens")
    op.execute("DROP TYPE IF EXISTS token_scope")
