"""Add hourly rollup tables.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-09

Two tables hold pre-aggregated metrics so that dashboards over days or weeks read a few hundred
rows instead of every span: `span_rollups_hourly` (one row per project, hour, environment,
provider, model and span kind) and `trace_rollups_hourly` (one row per project, hour and
environment). The rollup job rewrites them from the raw spans; they are derived data and can be
rebuilt at any time.

Choices worth knowing about:

* The dimension columns that can be unknown (`environment`, `provider`, `model`) stay NULL when
  they are unknown, never `''`. The unique constraint is `NULLS NOT DISTINCT`, so two rows with
  the same hour and a NULL model still collide instead of both being accepted.
* The primary key is a surrogate identity column. A natural key cannot be the primary key because
  its columns may be NULL, and the rows are written by `INSERT ... SELECT` in the database, which
  has no UUIDv7 generator on Postgres 17. Nothing refers to a rollup row by id.
* `latency_buckets` and `ttft_buckets` are 32-element histograms (see `app.rollups.buckets`); the
  CHECK constraints only guard their length, the bucket index is computed by the job. `cost_usd`
  is a plain numeric because a sum over an hour can exceed the span column's precision, and it is
  NULL when every span in the row is unpriced.
* The `(project_id, bucket_start)` index serves the read path (a time range for one project) and
  the job's delete-then-insert of a range.
* Row-level security is the same policy pair as `traces` and `spans`: a row is visible when it
  belongs to the project bound to the transaction, or when worker code opted into bypass.
  Rows are deleted with their project (`ON DELETE CASCADE`).

Downgrade drops both tables. Nothing else refers to them, and the metrics API reads the raw spans
for any window it cannot answer from a rollup.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("span_rollups_hourly", "trace_rollups_hourly")


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE span_rollups_hourly (
            id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            project_id      uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
            bucket_start    timestamptz NOT NULL,
            environment     text,
            provider        text,
            model           text,
            kind            span_kind NOT NULL,
            span_count      bigint NOT NULL CHECK (span_count >= 0),
            errors          bigint NOT NULL CHECK (errors >= 0),
            input_tokens    bigint NOT NULL CHECK (input_tokens >= 0),
            output_tokens   bigint NOT NULL CHECK (output_tokens >= 0),
            cached_tokens   bigint NOT NULL CHECK (cached_tokens >= 0),
            cost_usd        numeric,
            unpriced_calls  bigint NOT NULL CHECK (unpriced_calls >= 0),
            latency_buckets integer[] NOT NULL CHECK (cardinality(latency_buckets) = 32),
            ttft_buckets    integer[] NOT NULL CHECK (cardinality(ttft_buckets) = 32),
            computed_at     timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT span_rollups_hourly_dimensions_key
                UNIQUE NULLS NOT DISTINCT
                    (project_id, bucket_start, environment, provider, model, kind)
        )
        """
    )
    op.execute(
        "CREATE INDEX span_rollups_hourly_project_bucket_idx "
        "ON span_rollups_hourly (project_id, bucket_start)"
    )
    op.execute(
        """
        CREATE TABLE trace_rollups_hourly (
            id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            project_id     uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
            bucket_start   timestamptz NOT NULL,
            environment    text,
            traces         bigint NOT NULL CHECK (traces >= 0),
            errored_traces bigint NOT NULL CHECK (errored_traces >= 0),
            computed_at    timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT trace_rollups_hourly_dimensions_key
                UNIQUE NULLS NOT DISTINCT (project_id, bucket_start, environment)
        )
        """
    )
    op.execute(
        "CREATE INDEX trace_rollups_hourly_project_bucket_idx "
        "ON trace_rollups_hourly (project_id, bucket_start)"
    )

    for table in _TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_project_isolation ON {table}
                USING (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid)
                WITH CHECK (project_id = NULLIF(current_setting('app.project_id', true), '')::uuid)
            """
        )
        op.execute(
            f"""
            CREATE POLICY {table}_worker_bypass ON {table}
                USING (current_setting('app.bypass_rls', true) = 'on')
                WITH CHECK (current_setting('app.bypass_rls', true) = 'on')
            """
        )


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.execute(f"DROP TABLE IF EXISTS {table}")
