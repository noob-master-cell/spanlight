"""Allow the `project.delete` audit action.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-09

Deleting a project is recorded in the organization's audit log with the project's name and slug,
because the project row, which the event's `target_id` points at, is gone afterwards.

`audit_events.action` is a CHECK over a fixed list, so the constraint is dropped and added again
with the longer list, exactly as in 0005 and 0006. The migration is one transaction, so
`audit_events` stays locked until it commits and the new constraint scans the existing rows inside
that window, which is acceptable for a table of small, infrequent rows.

There is no other schema change: deleting a project or an organization relies on the foreign keys
that already cascade (a project takes its traces, spans and API keys with it; an organization
takes its memberships, invites and audit events). The organization's `projects` foreign key stays
`RESTRICT`, so the application deletes an organization's projects first, in the same transaction.

Downgrade deletes the `project.delete` events, which the older constraint would reject, and
restores the previous list. Upgrading again starts without them.
"""

from collections.abc import Sequence

from alembic import op

PREVIOUS_AUDIT_ACTIONS = (
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
    "user.totp_enable",
    "user.totp_disable",
    "org.update",
)
NEW_AUDIT_ACTIONS = ("project.delete",)

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _set_audit_actions((*PREVIOUS_AUDIT_ACTIONS, *NEW_AUDIT_ACTIONS))


def downgrade() -> None:
    listed = ", ".join(f"'{action}'" for action in NEW_AUDIT_ACTIONS)
    op.execute(f"DELETE FROM audit_events WHERE action IN ({listed})")
    _set_audit_actions(PREVIOUS_AUDIT_ACTIONS)


def _set_audit_actions(actions: tuple[str, ...]) -> None:
    listed = ", ".join(f"'{action}'" for action in actions)
    op.execute("ALTER TABLE audit_events DROP CONSTRAINT audit_events_action_check")
    op.execute(
        "ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_check "
        f"CHECK (action IN ({listed}))"
    )
