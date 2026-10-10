"""Add an index for reading one release's traces.

Revision ID: 0405
Revises: 0404
Create Date: 2026-10-10

Release comparison lists the releases seen in a window and reads every trace of one or two of
them. The release lives on the trace, so without an index each read is a scan of the project's
traces in the window. `traces_project_release_started_idx (project_id, release, started_at DESC)`
finds one release's traces by start time directly.

Choices worth knowing about:

* The index is partial, `WHERE release IS NOT NULL`: traces without a release can never match a
  release read, and leaving them out keeps the index small and cheap to maintain on every ingest.
* It is built `CONCURRENTLY`, as 0302 builds its index, so ingestion keeps writing to `traces`
  during the build. That cannot run inside a transaction, hence `autocommit_block()`. An
  interrupted build leaves an INVALID index behind; the leftover is dropped first, so running the
  migration again is safe.

Downgrade drops the index (concurrently). Release comparison keeps working, more slowly.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0405"
down_revision: str | None = "0404"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX = "traces_project_release_started_idx"


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
            "ON traces (project_id, release, started_at DESC) "
            "WHERE release IS NOT NULL"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX}")
