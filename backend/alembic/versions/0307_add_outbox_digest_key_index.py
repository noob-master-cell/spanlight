"""Add an index for finding a weekly digest's rows in the outbox.

Revision ID: 0307
Revises: 0306
Create Date: 2026-10-10

The weekly digest job checks, under each digest's advisory lock, whether that digest is already
queued (`app.alerts.digest_queries.digest_already_queued`). It filters on the `digest_key` the
outbox keeps in each row's `summary`, a value no index served: every check scanned the whole
outbox, once per project, and a run over many projects spent its time budget doing so.
`notification_outbox_digest_key_idx` on `((payload -> 'summary') ->> 'digest_key')` answers the
check directly.

Choices worth knowing about:

* The index is partial, `WHERE channel_id IS NULL`: digest rows are transactional mail and never
  carry a channel, so alert deliveries, which do, stay out of it. The query states the same
  condition, so the planner can prove the predicate.
* The query spells the key expression exactly as the index does, with constant keys rather than
  bound ones; a `payload[$1] ->> $2` expression would not match the index.
* The key survives settlement: a sent or failed row keeps its `summary`, so the index stays
  correct after the worker reduces a row's payload.
* It is built `CONCURRENTLY`, as 0302 and 0306 build theirs, so mail keeps being queued during the
  build. That cannot run inside a transaction, hence `autocommit_block()`. An interrupted build
  leaves an INVALID index behind; the leftover is dropped first, so running the migration again is
  safe.

Downgrade drops the index (concurrently). The digest keeps working, more slowly.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0307"
down_revision: str | None = "0306"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX = "notification_outbox_digest_key_idx"


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
            "ON notification_outbox (((payload -> 'summary') ->> 'digest_key')) "
            "WHERE channel_id IS NULL"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {INDEX}")
