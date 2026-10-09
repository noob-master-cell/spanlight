"""Provision the database role the application connects as.

Row-level security does not apply to superusers or BYPASSRLS roles, so the
API and worker must connect as an ordinary role. Migrations run as the database
owner; this step then creates (or updates) the app role and grants it data
access. It is idempotent and safe to run on every deploy.
"""

import re

import psycopg
from psycopg import sql

_ROLE_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def ensure_app_role(admin_url: str, role: str, password: str) -> None:
    """Create or update `role` as a login role without RLS bypass, then grant access."""
    if not _ROLE_NAME.fullmatch(role):
        raise ValueError(f"Unsafe role name: {role!r}")

    conninfo = admin_url.replace("postgresql+psycopg://", "postgresql://", 1)
    role_id = sql.Identifier(role)

    with psycopg.connect(conninfo, autocommit=True) as connection:
        exists = connection.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,)).fetchone()
        verb = sql.SQL("ALTER") if exists else sql.SQL("CREATE")
        # Passwords cannot be bound as parameters in DDL; sql.Literal quotes safely.
        connection.execute(
            sql.SQL(
                "{verb} ROLE {role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE "
                "PASSWORD {password}"
            ).format(verb=verb, role=role_id, password=sql.Literal(password))
        )

        database = connection.info.dbname
        for statement in (
            "GRANT CONNECT ON DATABASE {database} TO {role}",
            "GRANT USAGE ON SCHEMA public TO {role}",
            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role}",
            "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {role}",
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role}",
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {role}",
        ):
            connection.execute(
                sql.SQL(statement).format(database=sql.Identifier(database), role=role_id)
            )
