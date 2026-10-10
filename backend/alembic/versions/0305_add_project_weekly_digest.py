"""Add the per-project switch for the weekly digest email.

Revision ID: 0305
Revises: 0304
Create Date: 2026-10-10

Every Monday the `weekly_digest` job emails the members of an organization a summary of each
project's week. `projects.weekly_digest_enabled` lets a project opt out; it defaults to on, so
existing projects start receiving the digest once the job runs.

Choices worth knowing about:

* `bool NOT NULL DEFAULT true` is a constant default, which PostgreSQL 11 and later store in the
  catalogue: adding the column rewrites no rows and holds its lock only for an instant.
* The wait for that `ACCESS EXCLUSIVE` lock is capped at 5 seconds (`SET LOCAL lock_timeout`, as
  in 0017 and 0204). `projects` is read on nearly every request, and an ALTER queued behind one
  long transaction would make every later query on the table queue behind it; the migration
  fails instead. If it times out, run it again.
* No index. The job reads the flag while listing the projects that had traffic, which it finds
  through the rollup index; the flag is only a filter on those few rows.
* The flag is project configuration, not tenant data, so it needs no row-level security of its
  own (`projects` has none).

Downgrade drops the column. Projects lose their choice; the digest job of the older code does not
exist, so nothing reads it.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0305"
down_revision: str | None = "0304"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LOCK_TIMEOUT = "5s"


def upgrade() -> None:
    op.execute(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'")
    op.execute(
        "ALTER TABLE projects ADD COLUMN weekly_digest_enabled boolean NOT NULL DEFAULT true"
    )


def downgrade() -> None:
    op.execute(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS weekly_digest_enabled")
