"""Add a covering index for windowed span reads.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-09

The dashboard reads every span that started in a window of up to 24 hours (the overview KPIs, the
time series, the per-model table) and the rollup job reads the last 48 hours the same way. The
old index, `spans_project_started_idx (project_id, started_at DESC)`, finds the rows but not the
values: `kind`, `status`, `duration_ms`, token counts and cost are only in the table, so every
row in the window is a heap fetch. On a table of 10 million spans that is 14 GB of mostly random
reads per request, and a 24 hour overview took seconds under 20 requests a second.

This migration replaces it with `spans_project_started_cov_idx`, which has the same two leading
keys and carries every column those reads need. The planner can then answer them with an
index-only scan and never touch the table.

Choices worth knowing about:

* The leading keys are `(project_id, started_at)` ascending. A btree is scanned backward just as
  well, so the queries that wanted `started_at DESC` lose nothing, and the old index becomes
  redundant and is dropped (a second index on the same keys would only slow down every insert).
* `INCLUDE` holds the union of what these reads take from `spans`: `trace_id` (the join key when
  an environment filter is given), `kind`, `status`, `duration_ms`, `cost_usd`, `input_tokens`,
  `output_tokens`, `cached_tokens`, `provider`, `model` and `time_to_first_token_ms`. Included
  columns are not searchable, only returned, so they do not change which rows the index finds.
  `duration_ms` is a stored generated column, which an index can include.
* The widest possible entry is well under the 2 704 byte btree limit: ingestion caps `provider`
  at 128 characters, `model` at 256 and `trace_id` at 32, and the rest are fixed-width numbers.
* Both statements run `CONCURRENTLY`, so writes to `spans` continue while the index is built
  (this takes a while on a big table, and uses extra disk for the length of the build). That
  cannot happen inside a transaction, hence `autocommit_block()`. The new index is created
  before the old one is dropped, so a read always has an index. A build that is interrupted
  leaves an INVALID index behind; the leftover is dropped first, so running the migration again
  is safe.
* An index-only scan skips a heap fetch only for pages the visibility map marks all-visible, and
  autovacuum sets that bit. Its default insert trigger (1 000 rows plus 20 % of the table) would
  leave days of recent inserts unmarked on a large project, exactly the pages the 1 hour and
  24 hour windows read. So `spans` gets autovacuum triggers of 10 000 rows plus 1 %. `ALTER TABLE
  ... SET` takes a SHARE UPDATE EXCLUSIVE lock, which neither reads nor writes wait for.

Downgrade recreates the old index (concurrently), drops the new one and resets the two storage
parameters to the server defaults. The queries keep working on either index; they are slower
without the covering one.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COVERING_INDEX = "spans_project_started_cov_idx"
PREVIOUS_INDEX = "spans_project_started_idx"

# Every column the windowed reads take from `spans` besides the two keys (see the module docstring).
INCLUDED_COLUMNS = (
    "trace_id",
    "kind",
    "status",
    "duration_ms",
    "cost_usd",
    "input_tokens",
    "output_tokens",
    "cached_tokens",
    "provider",
    "model",
    "time_to_first_token_ms",
)


def _index_is_valid(name: str) -> bool | None:
    """True if the index exists and is valid, False if it exists but is INVALID, None if absent.

    Offline (`--sql`) there is no database to ask, so the answer is None and the statements below
    are the unconditional ones.
    """
    context = op.get_context()
    if context.as_sql:
        return None
    row = context.bind.execute(  # type: ignore[union-attr]  # bind is set when not as_sql
        sa.text(
            "SELECT i.indisvalid FROM pg_index AS i JOIN pg_class AS c ON c.oid = i.indexrelid "
            "WHERE c.relname = :name AND c.relnamespace = current_schema()::regnamespace"
        ),
        {"name": name},
    ).first()
    return None if row is None else bool(row[0])


def _build_index(name: str, definition: str) -> None:
    """Create `name` concurrently, unless a valid one is already there.

    An interrupted build leaves an INVALID index that IF NOT EXISTS would skip, so only that
    leftover is dropped first. A valid index from an earlier, partly finished run is kept: it
    keeps serving reads while the rest of the migration runs again.
    """
    state = _index_is_valid(name)
    if state is True:
        return
    if state is False:
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
    op.execute(f"CREATE INDEX CONCURRENTLY {name} {definition}")


def upgrade() -> None:
    included = ", ".join(INCLUDED_COLUMNS)
    with op.get_context().autocommit_block():
        _build_index(COVERING_INDEX, f"ON spans (project_id, started_at) INCLUDE ({included})")
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {PREVIOUS_INDEX}")
    op.execute(
        "ALTER TABLE spans SET ("
        "autovacuum_vacuum_insert_scale_factor = 0.01, "
        "autovacuum_vacuum_insert_threshold = 10000)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE spans RESET ("
        "autovacuum_vacuum_insert_scale_factor, autovacuum_vacuum_insert_threshold)"
    )
    with op.get_context().autocommit_block():
        _build_index(PREVIOUS_INDEX, "ON spans (project_id, started_at DESC)")
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {COVERING_INDEX}")
