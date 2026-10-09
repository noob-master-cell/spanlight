"""Rewrite the row-level-security policies so their settings are read once per statement.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-09

Every project-scoped table has two permissive policies: `<table>_project_isolation` (the row's
`project_id` is the project bound to the transaction) and `<table>_worker_bypass` (worker code set
`app.bypass_rls`). Both read a transaction-local setting with `current_setting(...)`. Written as
a bare function call, Postgres evaluates it as part of the per-row filter, so a scan pays two
setting lookups and a text-to-uuid parse for every row it reads. On a 24 hour window of a 10
million span project that was 130 ms for an index-only scan against 38 ms with row-level security
bypassed.

Wrapped in a scalar subquery, `(SELECT ...)`, the expression no longer refers to the row, so the
planner makes it an InitPlan: evaluated once when the statement starts, and its result is reused
for every row. Nothing about who can see what changes:

* Both settings are transaction-local (`set_config(..., true)`) and constant for the length of a
  statement, so the single evaluation returns exactly what each per-row evaluation did.
* An unset setting is still NULL (`current_setting(..., true)` is the missing-ok form), which still
  makes `project_id = NULL` and `NULL = 'on'` non-true, so a request that bound no project and
  never asked for bypass still sees no rows.
* An InitPlan runs each time the statement runs, not when it is planned, so a cached or prepared
  plan reads the setting of the transaction it executes in, never one from an earlier use.
* The two policies are still OR-ed, `FORCE ROW LEVEL SECURITY` is untouched, and `USING` and
  `WITH CHECK` still carry the same expression, so the write side is as strict as the read side.

For the project policy the whole right-hand side, `NULLIF(...)::uuid`, sits inside the subquery,
not only the `current_setting` call. A subquery that wrapped just the call would leave the
`NULLIF` and the cast outside it, to be computed again for every row.

Choices worth knowing about:

* `ALTER POLICY` replaces the expressions in place; the policies are never dropped, so there is no
  moment in which a table has none (and so shows no rows to anyone). The command, the roles and
  the names are unchanged. If a policy were missing the migration would fail, and so roll back,
  instead of silently skipping it.
* `ALTER POLICY` takes an `ACCESS EXCLUSIVE` lock on its table, held until the migration commits.
  The work is catalog-only and takes milliseconds, but the lock queues behind any open transaction
  on the table, and everything else then queues behind it. So the migration sets
  `lock_timeout` to 5 seconds first: if it cannot get the lock it fails and rolls back, and can be
  run again, instead of stalling ingestion. The setting is `SET LOCAL`, and the previous value is
  put back at the end, because Alembic runs every pending migration in one transaction and the
  next one must not inherit it.
* Tables are altered `traces` first, then `spans`, the order in which ingestion and retention lock
  them, so the migration and those transactions wait for each other's locks in the same direction.
  (The reverse order was tried and deadlocked against a live ingest transaction.)
* The policies of 0001, 0011 and 0014 are history and are not edited; this migration is the only
  place the new form is written. `app/db/rls.py` only sets the two settings and has no policy
  SQL, and the ORM models declare no policies.

Downgrade puts the previous expressions back, character for character as 0001, 0011 and 0014
created them. The tables are slower to scan but hide and show exactly the same rows.
"""

from collections.abc import Iterator, Sequence
from contextlib import contextmanager

from sqlalchemy import text

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LOCK_TIMEOUT = "5s"

# Every table with row-level security (0001: traces, spans; 0011: the two rollups; 0014: exports),
# in the order ingestion and retention lock them: `traces` before `spans`.
TABLES = ("traces", "spans", "span_rollups_hourly", "trace_rollups_hourly", "exports")

# The expressions exactly as 0001, 0011 and 0014 created them. Each policy uses one expression for
# both `USING` and `WITH CHECK`.
PROJECT_BEFORE = "project_id = NULLIF(current_setting('app.project_id', true), '')::uuid"
BYPASS_BEFORE = "current_setting('app.bypass_rls', true) = 'on'"

# The same expressions with each setting read inside a scalar subquery (an InitPlan).
PROJECT_AFTER = "project_id = (SELECT NULLIF(current_setting('app.project_id', true), '')::uuid)"
BYPASS_AFTER = "(SELECT current_setting('app.bypass_rls', true)) = 'on'"


@contextmanager
def _short_lock_timeout() -> Iterator[None]:
    """Fail fast instead of queueing behind a long transaction, then restore the setting.

    No `try/finally`: after an error the transaction is aborted and rolls back, which discards the
    `SET LOCAL` by itself, and a statement run in `finally` would only mask the real error.
    """
    bind = op.get_bind()
    previous = bind.execute(text("SELECT current_setting('lock_timeout')")).scalar_one()
    bind.execute(text(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'"))
    yield
    bind.execute(text("SELECT set_config('lock_timeout', :previous, true)"), {"previous": previous})


def _alter_policies(project_expression: str, bypass_expression: str) -> None:
    for table in TABLES:
        op.execute(
            f"ALTER POLICY {table}_project_isolation ON {table} "
            f"USING ({project_expression}) WITH CHECK ({project_expression})"
        )
        op.execute(
            f"ALTER POLICY {table}_worker_bypass ON {table} "
            f"USING ({bypass_expression}) WITH CHECK ({bypass_expression})"
        )


def upgrade() -> None:
    with _short_lock_timeout():
        _alter_policies(PROJECT_AFTER, BYPASS_AFTER)


def downgrade() -> None:
    with _short_lock_timeout():
        _alter_policies(PROJECT_BEFORE, BYPASS_BEFORE)
