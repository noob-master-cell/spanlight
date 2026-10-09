"""Add single-use email tokens and the columns that use them.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-08

Email verification and password reset both mail a link carrying a secret. This migration adds
the table that holds those secrets, and two columns other features need at the same time.

Choices worth knowing about:

* Only the SHA-256 of a token is stored in this table, like sessions and invites, so reading it
  yields no working links. The raw link does exist in the body of the queued email in
  `notification_outbox` until that row is settled (sent, or failed for good); the outbox then
  keeps only the subject.
* `kind` is an enum, not free text: a token of one kind must never be accepted for the other,
  and the application filters on it, so a typo has to be a type error rather than a silent miss.
* `used_at` makes a token single use. It is set, never cleared; the row stays until cleanup
  removes it, so a replayed link reads as "used" rather than "never existed".
* The table is not project-scoped, so it has no row-level security. It is read and written only
  by the auth code with the token in hand, never through a user-facing listing.
* `users.email_verified_at` is NULL until the address is proven. Existing users stay unverified.
* `invites.email` is for invite emails: the address an invite was sent to. It is unused for now:
  nothing reads or writes it yet.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE TYPE email_token_kind AS ENUM ('verify', 'reset')")
    op.execute(
        """
        CREATE TABLE email_tokens (
            id         uuid PRIMARY KEY,
            user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            kind       email_token_kind NOT NULL,
            token_hash bytea NOT NULL UNIQUE,
            created_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL,
            used_at    timestamptz
        )
        """
    )
    op.execute("CREATE INDEX email_tokens_user_id_idx ON email_tokens (user_id)")

    op.execute("ALTER TABLE users ADD COLUMN email_verified_at timestamptz")
    op.execute("ALTER TABLE invites ADD COLUMN email citext")


def downgrade() -> None:
    op.execute("ALTER TABLE invites DROP COLUMN IF EXISTS email")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at")
    op.execute("DROP TABLE IF EXISTS email_tokens")
    op.execute("DROP TYPE IF EXISTS email_token_kind")
