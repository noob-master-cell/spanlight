"""Add the outcome of a finished job.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-09

`jobs.outcome` says how a job that ended `done` ended: `ok`, or one of the `skipped_*` values
when the task found an optional setting missing or a spending cap reached and did nothing. It
is NULL while the job has not finished, after a failure, and on rows that finished before this
column existed.

The CHECK lists the values `app.jobs.outcome.JobOutcome` defines; a new outcome needs a new
migration that widens it. The column is nullable with no default, so adding it rewrites nothing.

Downgrade drops the column (and its CHECK with it).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE jobs ADD COLUMN outcome text")
    # Added NOT VALID, then validated on its own: validating takes a lighter lock than adding a
    # checked constraint, so a large jobs table is not locked against writes while it is scanned.
    op.execute(
        """
        ALTER TABLE jobs
            ADD CONSTRAINT jobs_outcome_check
                CHECK (outcome IN ('ok', 'skipped_not_configured', 'skipped_budget')) NOT VALID
        """
    )
    op.execute("ALTER TABLE jobs VALIDATE CONSTRAINT jobs_outcome_check")


def downgrade() -> None:
    op.execute("ALTER TABLE jobs DROP CONSTRAINT jobs_outcome_check, DROP COLUMN outcome")
