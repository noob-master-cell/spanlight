"""Add a lease and a fencing token to the notification outbox.

Revision ID: 0300
Revises: 0205
Create Date: 2026-10-10

Until now a worker held a row lock for the whole send. Alert deliveries call outside HTTP
services, so the send moves out of the transaction: a worker claims a row by committing a lease
(`lease_until`) and a new fencing token (`fence`), sends with no transaction open, and records
the outcome only if the row still carries its token. A worker that stalled past its lease and
lost the row to another one cannot settle it a second time (ADR 0011, "Leases and fencing").

Choices worth knowing about:

* `fence` is `bigint NOT NULL DEFAULT 0`. A constant default is stored in the catalogue, so
  adding the column rewrites no rows. Every claim increments it; it never goes down.
* `lease_until` is nullable: NULL means nobody holds the row. A settled row (`sent` or
  `failed`) never holds a lease, which the second CHECK enforces.
* No new index. Claims keep using `notification_outbox_status_next_attempt_idx`; the lease is a
  filter on the few due rows that index returns.
* `kind` is plain text (migration 0002), so the new `slack`, `webhook` and `pagerduty` kinds
  need no schema change.
* The CHECKs hold for every existing row (`fence` is 0, `lease_until` NULL). The upgrade runs in
  one transaction that already holds the `ACCESS EXCLUSIVE` lock from `ADD COLUMN`, so the
  validation scan blocks writes for its length; the outbox is pruned to a week of rows, so
  that is brief.
* Lock waits are capped at 5 seconds (`SET LOCAL lock_timeout`, as in 0017 and 0204): behind
  a long transaction on the outbox the migration fails instead of stalling every delivery queued
  behind its `ACCESS EXCLUSIVE` request. If it times out, run it again.
* Deploy: restart every worker together with this migration. A worker from before it ignores
  leases, so it could send a row a new worker holds, and its writes would break the lease CHECK.

Downgrade drops both columns and their CHECKs. A row leased at that moment loses its lease;
the old protocol does not use one.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0300"
down_revision: str | None = "0205"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LOCK_TIMEOUT = "5s"


def upgrade() -> None:
    op.execute(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'")
    op.execute(
        """
        ALTER TABLE notification_outbox
            ADD COLUMN fence       bigint NOT NULL DEFAULT 0,
            ADD COLUMN lease_until timestamptz
        """
    )
    op.execute(
        """
        ALTER TABLE notification_outbox
            ADD CONSTRAINT notification_outbox_fence_check CHECK (fence >= 0),
            ADD CONSTRAINT notification_outbox_lease_check
                CHECK (status = 'pending' OR lease_until IS NULL)
        """
    )


def downgrade() -> None:
    op.execute(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'")
    op.execute(
        """
        ALTER TABLE notification_outbox
            DROP CONSTRAINT IF EXISTS notification_outbox_lease_check,
            DROP CONSTRAINT IF EXISTS notification_outbox_fence_check,
            DROP COLUMN IF EXISTS lease_until,
            DROP COLUMN IF EXISTS fence
        """
    )
