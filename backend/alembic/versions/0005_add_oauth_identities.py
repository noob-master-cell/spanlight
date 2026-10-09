"""Add OAuth identities, let a user have no password, and audit linking.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-08

Sign in with GitHub or Google. An identity is a user's account at a provider; the user signs in
by proving they control it. A user who signed up through a provider has no password, so
`users.password_hash` becomes nullable.

Choices worth knowing about:

* `(provider, subject)` is unique: one provider account belongs to one user. `subject` is the
  provider's stable id for the account, not the email, which its owner can change. Sign-in
  resolves by this pair first.
* `(user_id, provider)` is unique too: a user has at most one GitHub and one Google account
  linked, so "unlink GitHub" always means one row. That index leads with `user_id`, so it also
  serves the foreign key; there is no separate index on it.
* `provider` is text with a CHECK rather than an enum type: adding a provider later is a
  constraint change, not a type change, and the application owns the list of providers anyway.
* `email` is what the provider reported, for display. It is nullable (a provider may report
  none) and never used to find a user, so it carries no unique constraint.
* `last_used_at` starts at the link time and moves forward on every sign-in with the identity.
* The table is not project-scoped, so it has no row-level security. It is read and written only
  by the auth code for the signed-in user (or the user being signed in).
* `audit_events.action` is a CHECK over a fixed list, so `user.oauth_link` and
  `user.oauth_unlink` have to be added to it: the constraint is dropped and added again with the
  longer list. The whole migration is one transaction, so `audit_events` stays locked against
  reads and writes until it commits, and the new constraint scans the existing rows inside that
  window. `ADD CONSTRAINT ... NOT VALID` followed by `VALIDATE CONSTRAINT` would not shorten it
  (the exclusive lock from the DROP is held to the end of the transaction). That is acceptable
  here: the table holds one small row per account or org change, and the deployments in this
  repository run migrations to completion before the app starts. Downgrade deletes the audit
  events of those two actions (the links they describe are dropped with the table) before
  restoring the shorter list.
* Downgrade refuses to run while a user without a password exists, since the NOT NULL it
  restores cannot hold for them: set a password for them (or delete them) first. It checks
  before changing anything so the error names the cause, and the migration is one transaction.
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
)
OAUTH_AUDIT_ACTIONS = ("user.oauth_link", "user.oauth_unlink")

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE oauth_identities (
            id           uuid PRIMARY KEY,
            user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            provider     text NOT NULL,
            subject      text NOT NULL,
            email        citext,
            created_at   timestamptz NOT NULL DEFAULT now(),
            last_used_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT oauth_identities_provider_check CHECK (provider IN ('github', 'google')),
            CONSTRAINT oauth_identities_provider_subject_key UNIQUE (provider, subject),
            CONSTRAINT oauth_identities_user_id_provider_key UNIQUE (user_id, provider)
        )
        """
    )
    op.execute("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL")
    _set_audit_actions((*AUDIT_ACTIONS, *OAUTH_AUDIT_ACTIONS))


def downgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE
            stranded integer;
        BEGIN
            SELECT count(*) INTO stranded FROM users WHERE password_hash IS NULL;
            IF stranded > 0 THEN
                RAISE EXCEPTION
                    'cannot downgrade: % user(s) have no password because they sign in with '
                    'OAuth only; give them a password or delete them first', stranded;
            END IF;
        END
        $$
        """
    )
    op.execute("DROP TABLE IF EXISTS oauth_identities")
    op.execute("ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL")
    listed = ", ".join(f"'{action}'" for action in OAUTH_AUDIT_ACTIONS)
    op.execute(f"DELETE FROM audit_events WHERE action IN ({listed})")
    _set_audit_actions(AUDIT_ACTIONS)


def _set_audit_actions(actions: tuple[str, ...]) -> None:
    listed = ", ".join(f"'{action}'" for action in actions)
    op.execute("ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check")
    op.execute(
        "ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check "
        f"CHECK (action IN ({listed}))"
    )
