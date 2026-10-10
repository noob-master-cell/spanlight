"""Add the per-user daily stats the end-user analytics read.

Revision ID: 0404
Revises: 0403
Create Date: 2026-10-10

`user_stats_daily` holds one row per project, UTC day and end user (`traces.external_user_id`):
how many traces the user started that day, how many LLM calls those made, how many failed, how many
have no price, what they cost and how many tokens they used. The `refresh_user_stats` job
recomputes yesterday and today every 15 minutes from the raw traces and spans, so the user list
reads a few thousand small rows instead of aggregating spans.

Choices worth knowing about:

* The primary key is `(project_id, day, external_user_id)`, the natural key the refresh upserts
  on. Rows cascade from `projects`, so deleting a project deletes its stats.
* `cost_usd` is NULL when the user's day has no priced call, never 0: an unknown cost stays
  unknown. The counters are not null and non-negative by CHECK.
* There is no separate `(project_id, day)` index: the primary key's leading columns are exactly
  that, so the list's sum over a window of days and retention's delete by day both use it.
  One user's detail needs `(project_id, external_user_id, day)`, or it would walk every user's
  entries for each day of the window.
* `unpriced_calls` is what makes a `cost_usd` a lower bound: calls the price book could not price.
* Row-level security is the policy pair every project-scoped table has, in the InitPlan form of
  0017. The refresh binds one project at a time; retention bypasses.

The migration creates a new table only, in one transaction. Downgrade drops it; the stats are
recomputed from the raw rows only for the days the refresh covers.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0404"
down_revision: str | None = "0403"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = "user_stats_daily"

PROJECT_EXPRESSION = (
    "project_id = (SELECT NULLIF(current_setting('app.project_id', true), '')::uuid)"
)
BYPASS_EXPRESSION = "(SELECT current_setting('app.bypass_rls', true)) = 'on'"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE {TABLE} (
            project_id        uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
            day               date NOT NULL,
            external_user_id  text NOT NULL,
            traces            integer NOT NULL CHECK (traces >= 0),
            llm_calls         integer NOT NULL CHECK (llm_calls >= 0),
            errors            integer NOT NULL CHECK (errors >= 0),
            unpriced_calls    integer NOT NULL CHECK (unpriced_calls >= 0),
            cost_usd          numeric(14, 8) CHECK (cost_usd >= 0),
            tokens            bigint NOT NULL CHECK (tokens >= 0),
            PRIMARY KEY (project_id, day, external_user_id)
        )
        """
    )

    op.execute(
        f"CREATE INDEX {TABLE}_project_user_day_idx ON {TABLE} (project_id, external_user_id, day)"
    )
    op.execute(f"ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {TABLE} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {TABLE}_project_isolation ON {TABLE} "
        f"USING ({PROJECT_EXPRESSION}) WITH CHECK ({PROJECT_EXPRESSION})"
    )
    op.execute(
        f"CREATE POLICY {TABLE}_worker_bypass ON {TABLE} "
        f"USING ({BYPASS_EXPRESSION}) WITH CHECK ({BYPASS_EXPRESSION})"
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {TABLE}")
