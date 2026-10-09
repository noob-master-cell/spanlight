"""Add TOTP two-factor authentication, recovery codes and the per-org requirement.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-08

A user can protect their account with a time-based one-time password (RFC 6238). The seed has to
be read back to check a code, so it cannot be hashed: `users.totp_secret` holds it sealed with
AES-256-GCM under a key from `CREDENTIALS_KEYS` (see `app.core.crypto`), and `totp_key_id` names
the key it was sealed under so a keyring can rotate. Recovery codes are one-way: only their
SHA-256 is stored.

Choices worth knowing about:

* A user is **enrolling** while `totp_secret` is set and `totp_enabled_at` is NULL (the secret was
  shown, no code has proved the authenticator app has it yet), and **enrolled** once
  `totp_enabled_at` is set. Enrolling again replaces the pending secret.
* `totp_last_step` is the 30-second step of the last code accepted. A code is accepted only for a
  later step, so a code that was observed (shoulder-surfing, a phishing page relaying it) cannot
  be used a second time. It is a bigint: steps are Unix time divided by 30.
* Three CHECK constraints keep those states honest in the schema instead of trusting the
  application: the sealed secret and its key id come together, "enabled" implies a secret, and a
  last step implies "enabled". A user row can never be in a half-configured state a login would
  have to guess about.
* `recovery_codes` has no surrogate id: a code is identified by its owner and hash, so that pair
  is the primary key, which also serves the foreign key and the lookup at sign-in. The hash is
  checked to be 32 bytes, the size of a SHA-256 digest, so a plaintext code cannot be stored by
  mistake. `used_at` keeps a used code on record instead of deleting it, so a reused code is
  refused (not "unknown") and the remaining count is a plain count.
* `organizations.require_2fa` defaults to false. The constant default means PostgreSQL adds the
  column without rewriting the table.
* `audit_events.action` is a CHECK over a fixed list, so `user.totp_enable`, `user.totp_disable`
  and `org.update` are added to it: the constraint is dropped and added again with the longer
  list, exactly as in 0005. The whole migration is one transaction, so `audit_events` stays locked
  until it commits and the new constraint scans the existing rows inside that window, which is
  acceptable for a table of small, infrequent rows.
* Downgrade turns two-factor authentication off for everyone: it drops the secrets, the recovery
  codes and the organizations' requirement, and deletes the audit events of the three new
  actions, which the older schema cannot hold. After upgrading again people enrol again. It does
  not refuse when accounts are enrolled, because rolling a bad deploy back is the case it is for.
"""

from collections.abc import Sequence

from alembic import op

AUDIT_ACTIONS = (
    "org.create",
    "member.add",
    "member.role_change",
    "member.remove",
    "invite.create",
    "invite.revoke",
    "invite.accept",
    "project.create",
    "project.update",
    "key.create",
    "key.revoke",
    "user.password_reset",
    "user.oauth_link",
    "user.oauth_unlink",
)
TOTP_AUDIT_ACTIONS = ("user.totp_enable", "user.totp_disable", "org.update")

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE users
            ADD COLUMN totp_secret     bytea,
            ADD COLUMN totp_key_id     text,
            ADD COLUMN totp_enabled_at timestamptz,
            ADD COLUMN totp_last_step  bigint,
            ADD CONSTRAINT users_totp_secret_key_id_check
                CHECK ((totp_secret IS NULL) = (totp_key_id IS NULL)),
            ADD CONSTRAINT users_totp_enabled_check
                CHECK (totp_enabled_at IS NULL OR totp_secret IS NOT NULL),
            ADD CONSTRAINT users_totp_last_step_check
                CHECK (totp_last_step IS NULL OR totp_enabled_at IS NOT NULL)
        """
    )
    op.execute(
        """
        CREATE TABLE recovery_codes (
            user_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            code_hash bytea NOT NULL,
            used_at   timestamptz,
            CONSTRAINT recovery_codes_pkey PRIMARY KEY (user_id, code_hash),
            CONSTRAINT recovery_codes_code_hash_check CHECK (octet_length(code_hash) = 32)
        )
        """
    )
    op.execute("ALTER TABLE organizations ADD COLUMN require_2fa boolean NOT NULL DEFAULT false")
    _set_audit_actions((*AUDIT_ACTIONS, *TOTP_AUDIT_ACTIONS))


def downgrade() -> None:
    listed = ", ".join(f"'{action}'" for action in TOTP_AUDIT_ACTIONS)
    op.execute(f"DELETE FROM audit_events WHERE action IN ({listed})")
    _set_audit_actions(AUDIT_ACTIONS)
    op.execute("ALTER TABLE organizations DROP COLUMN require_2fa")
    op.execute("DROP TABLE IF EXISTS recovery_codes")
    # Dropping a column drops the CHECK constraints that mention it.
    op.execute(
        """
        ALTER TABLE users
            DROP COLUMN totp_last_step,
            DROP COLUMN totp_enabled_at,
            DROP COLUMN totp_key_id,
            DROP COLUMN totp_secret
        """
    )


def _set_audit_actions(actions: tuple[str, ...]) -> None:
    listed = ", ".join(f"'{action}'" for action in actions)
    op.execute("ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check")
    op.execute(
        "ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check "
        f"CHECK (action IN ({listed}))"
    )
