"""Add worker heartbeats.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-09

Each worker process upserts one row here every 10 seconds, so `/health/ready` can tell whether
anything is still running jobs and delivering notifications. The newest `last_seen_at` is what
readiness reads; one row per process (not one row in total) means a rolling deploy, where the old
and the new worker overlap, never makes the age jump.

Choices worth knowing about:

* `worker_id` is text: the host name, the process id and a random suffix, unique to one start of
  one process. A restarted worker gets a new row and the old one ages out; the worker prunes rows
  a day old while it beats.
* `last_seen_at` is written with the database's `now()`, and readiness measures the age with the
  database's clock too, so a worker host with a skewed clock cannot make itself look stale.
* `version` is the backend package version the process runs, so a mixed fleet is visible in the
  table during a rollout.
* The table is not project-scoped, so it has no row-level security and no foreign keys. The app
  role gets its privileges from the default privileges set when the role is provisioned.

Downgrade drops the table. Readiness then has no heartbeat to read, which is the state before
this migration.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE worker_heartbeats (
            worker_id    text PRIMARY KEY,
            last_seen_at timestamptz NOT NULL,
            version      text NOT NULL,
            CONSTRAINT worker_heartbeats_worker_id_check CHECK (length(worker_id) BETWEEN 1 AND 200)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS worker_heartbeats")
