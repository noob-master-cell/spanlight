"""Add the notification outbox.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-08

The transactional outbox every notification goes through (ADR 0011). A producer inserts
a row in the same transaction as the decision that caused it; the worker delivers it.

Choices worth knowing about:

* `kind` is plain `text`, not an enum type, so adding a delivery kind (Slack, webhook,
  PagerDuty) never needs a migration. The allowed values live in application code.
* `channel_id` has no foreign key yet: the channels table does not exist until Phase 3.
* The table is not project-scoped, so it has no row-level security. It holds mail for any
  tenant and is read and written only by the worker and by producers in a request's
  transaction, never through a user-facing query.
* `sent_at` is set exactly when `status` is `sent`, enforced here rather than trusted to code.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed')")
    op.execute(
        """
        CREATE TABLE notification_outbox (
            id              uuid PRIMARY KEY,
            kind            text NOT NULL,
            channel_id      uuid,
            target          jsonb NOT NULL,
            payload         jsonb NOT NULL,
            status          notification_status NOT NULL DEFAULT 'pending',
            attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
            next_attempt_at timestamptz NOT NULL DEFAULT now(),
            last_error      text,
            created_at      timestamptz NOT NULL DEFAULT now(),
            sent_at         timestamptz,
            CHECK ((status = 'sent') = (sent_at IS NOT NULL))
        )
        """
    )
    # The worker's poll: pending rows whose next attempt is due, oldest first.
    op.execute(
        "CREATE INDEX notification_outbox_status_next_attempt_idx "
        "ON notification_outbox (status, next_attempt_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notification_outbox")
    op.execute("DROP TYPE IF EXISTS notification_status")
