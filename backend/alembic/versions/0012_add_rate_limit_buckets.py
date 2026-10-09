"""Add rate limit buckets.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-09

One row per rate-limited caller (`ingest:key:<id>`, `demo:ip:<ip>`, `api:token:<id>`,
`api:key:<id>`): the tokens left in its bucket and when that count was last written. The API takes
a token with one `INSERT ... ON CONFLICT DO UPDATE` (see `app.core.ratelimit`), so every API
replica draws from the same bucket instead of each keeping its own in memory.

Choices worth knowing about:

* The table is `UNLOGGED`. A crash empties it, which only means every bucket starts full again,
  and skipping the write-ahead log keeps a write per request cheap. It is also absent from a
  physical standby, which is fine for state that is worthless once an hour old. Backups pass
  `--no-unlogged-table-data` for the same reason.
* `key` is plain text and the primary key: the only lookup is by key, and the upsert needs a
  unique index to arbitrate on. There is nothing to cascade from, so no foreign keys.
* `tokens` is a float because buckets refill continuously (50 per second, 10 per hour).
* The table is not project-scoped, so it has no row-level security.
* There is no index on `updated_at`, deliberately. Every successful acquire rewrites that column,
  and an indexed column would turn each of those updates into a full index insert instead of a
  cheap in-page (HOT) update. The cleanup job deletes rows idle for more than an hour with a
  sequential scan, which is fast because the table only holds the callers seen in the last
  hour. A deleted row is a full bucket, which is what an hour of idleness would have produced.
* `fillfactor = 70` leaves room in each page for those in-page updates.

Downgrade drops the table. Nothing else refers to it.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNLOGGED TABLE rate_limit_buckets (
            key        text PRIMARY KEY,
            tokens     double precision NOT NULL,
            updated_at timestamptz NOT NULL
        ) WITH (fillfactor = 70)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS rate_limit_buckets")
