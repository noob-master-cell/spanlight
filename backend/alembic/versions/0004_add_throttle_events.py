"""Add the generic throttle table.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-08

One row per throttled call, keyed by a scope (what is limited, such as `email_verify`) and a key
(who it is limited for, such as a user id or an IP address). `app.core.throttle` counts the rows
inside a window to decide whether the next call may proceed. The counts live in Postgres rather
than in process memory, so the limit holds across API replicas and survives a restart.

Choices worth knowing about:

* `id` is an identity column: rows have no meaning of their own and are never addressed by id,
  so a time-ordered UUID would buy nothing.
* The one index serves the only query, the count of a (scope, key) pair inside a window.
* The table is not project-scoped, so it has no row-level security.
* Rows older than a day are pruned by the cleanup job; windows are minutes to an hour.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE throttle_events (
            id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            scope      text NOT NULL,
            key        text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX throttle_events_scope_key_created_at_idx "
        "ON throttle_events (scope, key, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS throttle_events")
