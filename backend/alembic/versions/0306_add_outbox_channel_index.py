"""Add an index for reading one channel's deliveries.

Revision ID: 0306
Revises: 0305
Create Date: 2026-10-10

The delivery log of an alert channel lists the outbox rows of that channel, newest first, in
pages (`WHERE channel_id = $1 ORDER BY created_at DESC, id DESC`). Until now the outbox had one
index, `(status, next_attempt_at)`, built for the worker's claim; a channel's log would scan the
whole table, which holds every verification mail and every alert delivery of every organization.
`notification_outbox_channel_created_idx (channel_id, created_at DESC, id DESC)` serves the page
and its keyset cursor directly.

Choices worth knowing about:

* The index is partial, `WHERE channel_id IS NOT NULL`: transactional mail carries no channel,
  can never match, and is most of the table's churn. Leaving it out keeps the index small and
  the worker's inserts and settlements of that mail free of index maintenance.
* A status filter (`status=failed`) is applied on the rows the index returns: one channel has
  few enough rows for that, and a `status` key would only widen every entry.
* It is built `CONCURRENTLY`, as 0302 builds its index, so alert deliveries keep being queued
  during the build. That cannot run inside a transaction, hence `autocommit_block()`. An
  interrupted build leaves an INVALID index behind; the leftover is dropped first, so running
  the migration again is safe.

Downgrade drops the index (concurrently). The delivery log keeps working, more slowly.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0306"
down_revision: str | None = "0305"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX = "notification_outbox_channel_created_idx"


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
            "ON notification_outbox (channel_id, created_at DESC, id DESC) "
            "WHERE channel_id IS NOT NULL"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX}")
