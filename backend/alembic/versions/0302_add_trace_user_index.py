"""Add an index for reading one end user's traces.

Revision ID: 0302
Revises: 0301
Create Date: 2026-10-10

A budget scoped to one end user (`external_user_id`) sums the cost of that user's spans over the
budget period, which can be a month. The user lives on the trace, so the read joins `traces` and
filters on `external_user_id`; without an index that is a scan of every trace of the project.
`traces_project_user_started_idx (project_id, external_user_id, started_at)` finds one user's
traces directly.

Choices worth knowing about:

* The index is partial, `WHERE external_user_id IS NOT NULL`: most traces carry no user, they can
  never match a user filter, and leaving them out keeps the index small and cheap to maintain on
  every ingest.
* `started_at` is the third key so a read can also bound the trace's start time.
* It is built `CONCURRENTLY`, as 0016 and 0202 build theirs, so ingestion keeps writing to
  `traces` during the build. That cannot run inside a transaction, hence `autocommit_block()`.
  An interrupted build leaves an INVALID index behind; the leftover is dropped first, so running
  the migration again is safe.

Downgrade drops the index (concurrently). User budgets keep working, more slowly.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0302"
down_revision: str | None = "0301"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX = "traces_project_user_started_idx"


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


def upgrade() -> None:
    with op.get_context().autocommit_block():
        state = _index_is_valid(INDEX)
        if state is True:
            return
        if state is False:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX}")
        op.execute(
            f"CREATE INDEX CONCURRENTLY {INDEX} "
            "ON traces (project_id, external_user_id, started_at) "
            "WHERE external_user_id IS NOT NULL"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX}")
