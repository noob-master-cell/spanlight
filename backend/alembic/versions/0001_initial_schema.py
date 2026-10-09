"""Initial schema: identity, tenancy, telemetry, pricing and jobs.

Revision ID: 0001
Revises:
Create Date: 2026-10-07

Written by hand as plain SQL so the DDL (constraints, RLS policies, the
generated duration column) is reviewable exactly as Postgres will see it.

Row-level security: `traces` and `spans` are ENABLEd *and* FORCEd, so even
the table owner is filtered. Superusers and BYPASSRLS roles still bypass RLS,
so the application must connect as an ordinary role (see README).
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


AUDIT_ACTIONS = (
    "org.create",
    "member.add",
    "member.role_change",
    "member.remove",
    "invite.create",
    "invite.revoke",
    "invite.accept",
    "project.create",
    "project.update",
    "key.create",
    "key.revoke",
    "user.password_reset",
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    op.execute("CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'member', 'viewer')")
    op.execute(
        "CREATE TYPE span_kind AS ENUM ('llm', 'tool', 'retrieval', 'chain', 'http', 'other')"
    )
    op.execute("CREATE TYPE span_status AS ENUM ('ok', 'error', 'unset')")
    op.execute("CREATE TYPE job_status AS ENUM ('queued', 'running', 'done', 'failed')")

    _create_identity_tables()
    _create_tenancy_tables()
    _create_telemetry_tables()
    _create_pricing_and_jobs_tables()
    _enable_row_level_security()


def _create_identity_tables() -> None:
    op.execute(
        """
        CREATE TABLE users (
            id            uuid PRIMARY KEY,
            email         citext NOT NULL UNIQUE,
            password_hash text NOT NULL,
            name          text NOT NULL,
            created_at    timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE sessions (
            id                  uuid PRIMARY KEY,
            user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            token_hash          bytea NOT NULL UNIQUE,
            created_at          timestamptz NOT NULL DEFAULT now(),
            last_seen_at        timestamptz NOT NULL,
            expires_at          timestamptz NOT NULL,
            absolute_expires_at timestamptz NOT NULL,
            ip                  inet,
            user_agent          text,
            CHECK (expires_at <= absolute_expires_at)
        )
        """
    )
    op.execute("CREATE INDEX sessions_user_id_idx ON sessions (user_id)")
    op.execute("CREATE INDEX sessions_absolute_expires_at_idx ON sessions (absolute_expires_at)")

    op.execute(
        """
        CREATE TABLE login_attempts (
            id         bigserial PRIMARY KEY,
            email      citext NOT NULL,
            ip         inet,
            succeeded  boolean NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX login_attempts_email_idx ON login_attempts (email, created_at)")
    op.execute("CREATE INDEX login_attempts_ip_idx ON login_attempts (ip, created_at)")


def _create_tenancy_tables() -> None:
    op.execute(
        """
        CREATE TABLE organizations (
            id         uuid PRIMARY KEY,
            name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
            slug       text NOT NULL UNIQUE,
            is_demo    boolean NOT NULL DEFAULT false,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE memberships (
            org_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
            user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            role       membership_role NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (org_id, user_id)
        )
        """
    )
    op.execute("CREATE INDEX memberships_user_id_idx ON memberships (user_id)")

    op.execute(
        """
        CREATE TABLE projects (
            id               uuid PRIMARY KEY,
            org_id           uuid NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
            name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
            slug             text NOT NULL,
            retention_days   integer NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 90),
            capture_payloads boolean NOT NULL DEFAULT true,
            created_at       timestamptz NOT NULL DEFAULT now(),
            UNIQUE (org_id, slug)
        )
        """
    )

    op.execute(
        """
        CREATE TABLE api_keys (
            id           uuid PRIMARY KEY,
            project_id   uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
            name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
            prefix       text NOT NULL UNIQUE,
            secret_hash  bytea NOT NULL,
            created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
            created_at   timestamptz NOT NULL DEFAULT now(),
            last_used_at timestamptz,
            revoked_at   timestamptz
        )
        """
    )
    op.execute("CREATE INDEX api_keys_project_id_idx ON api_keys (project_id)")
    op.execute("CREATE INDEX api_keys_created_by_idx ON api_keys (created_by)")

    op.execute(
        """
        CREATE TABLE invites (
            id          uuid PRIMARY KEY,
            org_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
            role        membership_role NOT NULL,
            token_hash  bytea NOT NULL UNIQUE,
            created_by  uuid REFERENCES users (id) ON DELETE SET NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            expires_at  timestamptz NOT NULL,
            accepted_at timestamptz
        )
        """
    )
    op.execute("CREATE INDEX invites_org_id_idx ON invites (org_id)")
    op.execute("CREATE INDEX invites_created_by_idx ON invites (created_by)")

    actions = ", ".join(f"'{action}'" for action in AUDIT_ACTIONS)
    op.execute(
        f"""
        CREATE TABLE audit_events (
            id            uuid PRIMARY KEY,
            org_id        uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
            actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
            action        text NOT NULL CHECK (action IN ({actions})),
            target_type   text NOT NULL,
            target_id     text NOT NULL,
            ip            inet,
            metadata      jsonb NOT NULL DEFAULT '{{}}'::jsonb,
            created_at    timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX audit_events_org_created_idx "
        "ON audit_events (org_id, created_at DESC, id DESC)"
    )
    op.execute("CREATE INDEX audit_events_actor_idx ON audit_events (actor_user_id)")


def _create_telemetry_tables() -> None:
    op.execute(
        """
        CREATE TABLE traces (
            project_id       uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
            trace_id         text NOT NULL CHECK (trace_id ~ '^[0-9a-f]{32}$'),
            name             text,
            environment      text,
            release          text,
            external_user_id text,
            session_id       text,
            tags             text[] NOT NULL DEFAULT '{}',
            started_at       timestamptz NOT NULL,
            ended_at         timestamptz NOT NULL,
            span_count       integer NOT NULL DEFAULT 0,
            error_count      integer NOT NULL DEFAULT 0,
            input_tokens     bigint NOT NULL DEFAULT 0,
            output_tokens    bigint NOT NULL DEFAULT 0,
            cost_usd         numeric(14, 8),
            has_unpriced     boolean NOT NULL DEFAULT false,
            PRIMARY KEY (project_id, trace_id)
        )
        """
    )
    op.execute("CREATE INDEX traces_project_started_idx ON traces (project_id, started_at DESC)")
    op.execute(
        "CREATE INDEX traces_project_session_idx ON traces (project_id, session_id) "
        "WHERE session_id IS NOT NULL"
    )
    op.execute("CREATE INDEX traces_tags_idx ON traces USING gin (tags)")

    op.execute(
        """
        CREATE TABLE spans (
            project_id             uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
            trace_id               text NOT NULL,
            span_id                text NOT NULL CHECK (span_id ~ '^[0-9a-f]{16}$'),
            parent_span_id         text,
            kind                   span_kind NOT NULL,
            name                   text NOT NULL,
            status                 span_status NOT NULL,
            status_message         text,
            started_at             timestamptz NOT NULL,
            ended_at               timestamptz NOT NULL CHECK (ended_at >= started_at),
            duration_ms            double precision GENERATED ALWAYS AS
                                       (EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000) STORED,
            provider               text,
            model                  text,
            input_tokens           integer CHECK (input_tokens >= 0),
            output_tokens          integer CHECK (output_tokens >= 0),
            cached_tokens          integer CHECK (cached_tokens >= 0),
            cost_usd               numeric(14, 8),
            pricing_version        text,
            time_to_first_token_ms double precision,
            input                  jsonb,
            output                 jsonb,
            attributes             jsonb NOT NULL DEFAULT '{}'::jsonb,
            truncated              boolean NOT NULL DEFAULT false,
            ingested_at            timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (project_id, trace_id, span_id),
            FOREIGN KEY (project_id, trace_id)
                REFERENCES traces (project_id, trace_id) ON DELETE CASCADE
        )
        """
    )
    op.execute("CREATE INDEX spans_project_started_idx ON spans (project_id, started_at DESC)")
    op.execute(
        "CREATE INDEX spans_project_model_started_idx ON spans (project_id, model, started_at)"
    )


def _create_pricing_and_jobs_tables() -> None:
    op.execute(
        """
        CREATE TABLE model_prices (
            id                    uuid PRIMARY KEY,
            provider              text NOT NULL,
            model_pattern         text NOT NULL,
            input_per_mtok        numeric(12, 6) NOT NULL CHECK (input_per_mtok >= 0),
            output_per_mtok       numeric(12, 6) NOT NULL CHECK (output_per_mtok >= 0),
            cached_input_per_mtok numeric(12, 6) CHECK (cached_input_per_mtok >= 0),
            effective_from        timestamptz NOT NULL,
            version               text NOT NULL,
            UNIQUE (provider, model_pattern, effective_from)
        )
        """
    )

    op.execute(
        """
        CREATE TABLE jobs (
            id           bigserial PRIMARY KEY,
            kind         text NOT NULL,
            payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
            run_after    timestamptz NOT NULL DEFAULT now(),
            attempts     integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
            max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
            lease_until  timestamptz,
            fence        bigint NOT NULL DEFAULT 0,
            last_error   text,
            status       job_status NOT NULL DEFAULT 'queued',
            dedupe_key   text UNIQUE,
            created_at   timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX jobs_queued_run_after_idx ON jobs (run_after) WHERE status = 'queued'")
    op.execute("CREATE INDEX jobs_running_lease_idx ON jobs (lease_until) WHERE status = 'running'")


def _enable_row_level_security() -> None:
    for table in ("traces", "spans"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        # Permissive policies are OR-ed: a row is visible when it belongs to the
        # project bound to the transaction, or when worker code opted into bypass.
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
    for table in (
        "jobs",
        "model_prices",
        "spans",
        "traces",
        "audit_events",
        "invites",
        "api_keys",
        "projects",
        "memberships",
        "organizations",
        "login_attempts",
        "sessions",
        "users",
    ):
        op.execute(f"DROP TABLE IF EXISTS {table}")
    for enum_type in ("job_status", "span_status", "span_kind", "membership_role"):
        op.execute(f"DROP TYPE IF EXISTS {enum_type}")
