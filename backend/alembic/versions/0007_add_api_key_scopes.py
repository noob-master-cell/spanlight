"""Add API key scopes and expiry.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-08

A key used to be able to do exactly one thing, ingest. Now it carries a set of scopes
(`ingest:write`, `traces:read`, `scores:write`, `prompts:read`) and may expire.

Choices worth knowing about:

* `scopes` is a `text[]` with a CHECK instead of an array of an enum type: adding a scope later
  is a CHECK swap, whereas a new enum value cannot be used in the transaction that adds it. The
  CHECK says the array has at least one element and every element is one of the four, so a key
  that can do nothing, or something no route understands, is not representable. `<@` reads "is
  contained in", and a NULL or misspelled element fails it.
* The default is `{ingest:write}` and the column is NOT NULL. The default is a constant, so
  PostgreSQL adds the column without rewriting the table, and every existing key gets the one
  scope it already effectively had: no key changes behaviour when this is deployed.
* `expires_at` is nullable with no default: NULL means "never expires", which is what every
  existing key is.
* The CHECK is validated against the existing rows while the table is locked. `api_keys` holds
  one row per key a person created by hand, so that is a short scan.
* Downgrade cannot keep scopes or expiry, and dropping them would widen access: a read-only
  key would start to ingest and an expired key would work again. So downgrade first revokes
  every key that lacks `ingest:write` and every key that has already expired. A key with a
  future expiry stays valid but loses the expiry, so it no longer ends on its own. After
  upgrading again, surviving keys have the default scope and no expiry.
"""

from collections.abc import Sequence

from alembic import op

SCOPES = ("ingest:write", "traces:read", "scores:write", "prompts:read")

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    allowed = ", ".join(f"'{scope}'" for scope in SCOPES)
    op.execute(
        f"""
        ALTER TABLE api_keys
            ADD COLUMN scopes     text[] NOT NULL DEFAULT '{{ingest:write}}',
            ADD COLUMN expires_at timestamptz,
            ADD CONSTRAINT api_keys_scopes_check
                CHECK (cardinality(scopes) >= 1 AND scopes <@ ARRAY[{allowed}])
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE api_keys
        SET revoked_at = now()
        WHERE revoked_at IS NULL
          AND (NOT (scopes @> ARRAY['ingest:write'])
               OR (expires_at IS NOT NULL AND expires_at <= now()))
        """
    )
    # Dropping a column drops the CHECK constraint that mentions it.
    op.execute("ALTER TABLE api_keys DROP COLUMN expires_at, DROP COLUMN scopes")
