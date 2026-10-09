"""Render the `Settings` fields as the configuration reference of the documentation site.

Run from `backend/` after adding, removing or changing a setting:

    uv run python scripts/gen_config_table.py            # rewrite the table
    uv run python scripts/gen_config_table.py --check    # exit 1 if the page is out of date

The tables are written into `docs-site/src/content/docs/configuration.md` between the
`BEGIN GENERATED SETTINGS` and `END GENERATED SETTINGS` markers; everything outside them is
written by hand. Names, types and defaults come from `app.config.Settings`. The prose cannot, so
`DESCRIPTIONS` holds one sentence per setting, and the script refuses to run while a setting has
none (or a description names a setting that no longer exists): a new setting cannot ship
undocumented. Defaults of secrets are never printed.
"""

import argparse
import re
import sys
import types
from pathlib import Path
from typing import Any, Literal, Union, get_args, get_origin
from urllib.parse import urlsplit, urlunsplit

from pydantic import SecretStr
from pydantic.fields import FieldInfo

from app.config import Settings

PAGE_PATH = (
    Path(__file__).resolve().parents[2]
    / "docs-site"
    / "src"
    / "content"
    / "docs"
    / "configuration.md"
)
BEGIN_MARKER = "<!-- BEGIN GENERATED SETTINGS: written by backend/scripts/gen_config_table.py -->"
END_MARKER = "<!-- END GENERATED SETTINGS -->"
UPDATE_COMMAND = "cd backend && uv run python scripts/gen_config_table.py"

# Each group is a heading on the page; its settings appear in this order.
GROUPS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    (
        "Core",
        "The settings every deployment needs to look at.",
        ("database_url", "app_base_url", "allowed_origins", "secret_key", "credentials_keys"),
    ),
    (
        "Email",
        "Email is optional. It is on when `EMAIL_PROVIDER` is `resend` or `smtp` (with what it "
        "needs), or `console` with `EMAIL_CONSOLE_FILE` set. Features that depend on email, such "
        "as address verification and password reset, stay off without it.",
        (
            "email_provider",
            "email_from",
            "resend_api_key",
            "smtp_host",
            "smtp_port",
            "smtp_username",
            "smtp_password",
            "smtp_starttls",
            "email_console_file",
        ),
    ),
    (
        "Sign in with GitHub and Google",
        "A provider is on exactly when both of its values are set. Setting only one of a pair "
        "stops the application at startup.",
        (
            "oauth_github_client_id",
            "oauth_github_client_secret",
            "oauth_google_client_id",
            "oauth_google_client_secret",
        ),
    ),
    (
        "Object storage",
        "Backups and trace exports need an S3-compatible store. It is on when the bucket and "
        "both keys are set; setting only some of them stops the application at startup. A "
        "request that needs storage while it is off answers `409 NOT_CONFIGURED`.",
        (
            "s3_bucket",
            "s3_access_key",
            "s3_secret_key",
            "s3_region",
            "s3_endpoint",
            "s3_public_endpoint",
            "s3_force_path_style",
        ),
    ),
    (
        "Backups",
        "The nightly backup job runs when `BACKUPS_ENABLED` is true, object storage is on and "
        "`BACKUP_DATABASE_URL` is set. Otherwise it ends as `skipped_not_configured`.",
        ("backups_enabled", "backup_database_url"),
    ),
    (
        "Worker and health",
        "",
        ("worker_required", "worker_metrics_port"),
    ),
    (
        "Demo workspace",
        "The live demo is fed by real model calls under a monthly budget. It is on by default "
        "exactly when `ANTHROPIC_API_KEY` is set.",
        ("anthropic_api_key", "demo_enabled", "demo_monthly_budget_usd"),
    ),
    (
        "API request limits",
        "A request that would otherwise wait on a busy database fails fast with `503` and "
        "`Retry-After` instead of queueing behind slow work. The worker, exports and deleting an "
        "organization or project are not subject to the statement limit.",
        ("api_pool_timeout_seconds", "api_statement_timeout_seconds"),
    ),
    (
        "Connection pools",
        "Idempotency keys and rate limiting each use a small pool of their own, so they cannot "
        "starve the main one. Change these only after reading the "
        "[scaling runbook](/docs/runbooks/scale/).",
        (
            "idempotency_pool_size",
            "idempotency_pool_timeout_seconds",
            "rate_limit_pool_size",
            "rate_limit_pool_timeout_seconds",
        ),
    ),
    (
        "Monitoring and logging",
        "",
        (
            "metrics_token",
            "sentry_dsn",
            "otel_exporter_otlp_endpoint",
            "otel_service_name",
            "log_level",
            "log_json",
        ),
    ),
)

DESCRIPTIONS: dict[str, str] = {
    "database_url": (
        "SQLAlchemy URL the application connects to. The role must not be a superuser and must "
        "not have `BYPASSRLS`, or row-level security is silently skipped. The Compose file "
        "builds it from `APP_DB_PASSWORD`."
    ),
    "app_base_url": (
        "The public URL the dashboard is served from. It is the allowed `Origin` for "
        "state-changing requests and the base of the links in emails and OAuth callbacks. An "
        "`https` URL turns on `Secure` cookies and requires a real `SECRET_KEY`."
    ),
    "allowed_origins": (
        "Extra origins allowed to make state-changing requests, comma-separated. Leave empty "
        "unless another site must call the API from a browser."
    ),
    "secret_key": (
        "HMAC key for CSRF tokens and for the short-lived signed state of two-factor and "
        "GitHub or Google sign-in. Required when `APP_BASE_URL` uses `https`: the application "
        "refuses to start with the built-in development value. Generate a long random string. "
        "Rotating it does not sign anyone out."
    ),
    "credentials_keys": (
        "Master keys that encrypt stored secrets such as two-factor seeds, as "
        "`<key_id>:<base64 of 32 bytes>`, comma-separated. The first entry encrypts new data; "
        "keep older entries so existing data stays readable. Unset leaves two-factor "
        "authentication unavailable. Back the value up: a lost key cannot be recovered."
    ),
    "email_provider": (
        "How email is sent. `resend` needs `RESEND_API_KEY` and `EMAIL_FROM`; `smtp` needs "
        "`SMTP_HOST` and `EMAIL_FROM`. `console` only logs the recipient and subject."
    ),
    "email_from": (
        "Sender address, for example `Spanlight <noreply@example.com>`. Required for `resend` "
        "and `smtp`."
    ),
    "resend_api_key": "API key of the Resend account. Required for `resend`.",
    "smtp_host": "SMTP server host name. Required for `smtp`.",
    "smtp_port": "SMTP server port.",
    "smtp_username": "SMTP user name. Optional.",
    "smtp_password": "SMTP password. Optional.",
    "smtp_starttls": (
        "Upgrade the SMTP connection with STARTTLS. Turn it off only for a trusted local relay: "
        "mail and password then travel in clear text."
    ),
    "email_console_file": (
        "With the `console` provider, also append each message to this file as one JSON line. "
        "For development and tests: it counts as email being configured."
    ),
    "oauth_github_client_id": (
        "Client ID of a GitHub OAuth app. Callback URL: "
        "`<APP_BASE_URL>/api/v1/auth/oauth/github/callback`."
    ),
    "oauth_github_client_secret": "Client secret of the GitHub OAuth app.",
    "oauth_google_client_id": (
        "Client ID of a Google OAuth client. Callback URL: "
        "`<APP_BASE_URL>/api/v1/auth/oauth/google/callback`."
    ),
    "oauth_google_client_secret": "Client secret of the Google OAuth client.",
    "s3_bucket": "Bucket for backups and exports. Keep it private and encrypted at rest.",
    "s3_access_key": "Access key ID for the bucket.",
    "s3_secret_key": "Secret access key for the bucket.",
    "s3_region": "Region of the bucket. AWS buckets need it, for example `eu-west-1`.",
    "s3_endpoint": "Endpoint URL of a non-AWS service such as MinIO or Cloudflare R2.",
    "s3_public_endpoint": (
        "The address browsers reach the store at, when that differs from `S3_ENDPOINT` (for "
        "example `http://minio:9000` inside Docker and `http://localhost:9000` outside). "
        "Download links are signed against it."
    ),
    "s3_force_path_style": (
        "Address buckets as `<endpoint>/<bucket>` instead of `<bucket>.<endpoint>`. MinIO and "
        "most self-hosted services need this."
    ),
    "backups_enabled": "Set to `false` to turn the nightly backup off.",
    "backup_database_url": (
        "Connection URL `pg_dump` uses. It must use a superuser or a role with `BYPASSRLS`, "
        "never the application role: the tenant tables force row-level security and a dump "
        "fails without bypassing it."
    ),
    "worker_required": (
        "`/health/ready` answers `503` when no worker has reported in the last 120 seconds. "
        "Set to `false` only for a deployment that deliberately runs the API without a worker; "
        "notifications and exports only move while a worker runs."
    ),
    "worker_metrics_port": (
        "Port on which the worker serves `/metrics`, with the same `METRICS_TOKEN` rule as the "
        "API. Unset leaves the listener off, and then the worker's job, outbox, notification "
        "and rollup metrics are not exposed."
    ),
    "anthropic_api_key": "Anthropic API key for the demo workspace's live model calls.",
    "demo_enabled": (
        "Force the demo workspace on or off. Unset means on exactly when `ANTHROPIC_API_KEY` is "
        "set."
    ),
    "demo_monthly_budget_usd": (
        "Month-to-date spending cap for the demo's model calls, in US dollars. The demo job "
        "checks it before every provider call."
    ),
    "api_pool_timeout_seconds": (
        "Seconds an API request waits for a connection from the main pool. Past it the request "
        "answers `503 SERVICE_UNAVAILABLE` with `Retry-After: 5`. Blank keeps the default."
    ),
    "api_statement_timeout_seconds": (
        "Longest one database statement of an API request may run. The database cancels it and "
        "the request answers `503 SERVICE_UNAVAILABLE` with `Retry-After: 5`. Blank keeps the "
        "default."
    ),
    "idempotency_pool_size": "Connections in the idempotency-key pool.",
    "idempotency_pool_timeout_seconds": (
        "Seconds a request waits for an idempotency connection before it fails."
    ),
    "rate_limit_pool_size": "Connections in the rate-limit pool.",
    "rate_limit_pool_timeout_seconds": (
        "Seconds a rate-limit check waits for a connection. A check that cannot get one is "
        "skipped and the request goes through, so keep this short."
    ),
    "metrics_token": (
        "Bearer token that protects `/metrics`. Unset makes `/metrics` answer `404`. The "
        "endpoint is served by the API directly, not through the web port."
    ),
    "sentry_dsn": (
        "Sentry DSN for error reporting. Request bodies, cookies and query strings are never sent."
    ),
    "otel_exporter_otlp_endpoint": (
        "Base URL of an OTLP HTTP collector for Spanlight's own traces (spans go to "
        "`<endpoint>/v1/traces`; a value ending in `/traces` is used as it is, and a "
        "`/v1/otlp` base gets `/traces`). Unset turns self-tracing off. Request bodies, headers "
        "and query parameters are never recorded."
    ),
    "otel_service_name": "Service name on Spanlight's own spans.",
    "log_level": "Log level: `DEBUG`, `INFO`, `WARNING` or `ERROR`.",
    "log_json": "Write logs as JSON lines. Turn off for human-readable development output.",
}

# Settings whose default has a credential inside it. The default is shown with it masked.
MASKED_URL_FIELDS = {"database_url"}


def _unwrap_optional(annotation: Any) -> Any:
    """`X | None` -> `X`; anything else unchanged."""
    if get_origin(annotation) in (types.UnionType, Union):
        arms = [arm for arm in get_args(annotation) if arm is not type(None)]
        if len(arms) == 1:
            return arms[0]
    # `Annotated[X, ...]` keeps its payload as the first argument.
    if hasattr(annotation, "__metadata__"):
        return _unwrap_optional(get_args(annotation)[0])
    return annotation


def _is_secret(field: FieldInfo) -> bool:
    return _unwrap_optional(field.annotation) is SecretStr


def _type_label(name: str, field: FieldInfo) -> str:
    inner = _unwrap_optional(field.annotation)
    if inner is SecretStr:
        return "secret"
    if get_origin(inner) is Literal:
        return " \\| ".join(f"`{value}`" for value in get_args(inner))
    if get_origin(inner) is list:
        return "comma-separated list"
    labels = {
        "str": "string",
        "int": "integer",
        "float": "number",
        "bool": "boolean",
        "Decimal": "decimal",
        "Path": "path",
    }
    label = labels.get(getattr(inner, "__name__", ""))
    if label is None:
        raise SystemExit(
            f"gen_config_table: no type label for {name}: {inner!r}; extend _type_label"
        )
    limits = []
    for item in field.metadata:
        for attribute, text in (("ge", "min"), ("gt", "greater than"), ("le", "max")):
            if hasattr(item, attribute):
                limits.append(f"{text} {getattr(item, attribute)}")
    return f"{label} ({', '.join(limits)})" if limits else label


def _default_label(name: str, field: FieldInfo) -> str:
    if field.default_factory is not None:
        produced = field.default_factory()  # type: ignore[call-arg]
        return "empty" if not produced else f"`{produced}`"
    default = field.default
    if _is_secret(field):
        # Never print a secret's default. The only secret with one is the development key.
        return "unset" if default is None else "built-in development value (do not use)"
    if default is None:
        return "unset"
    if name in MASKED_URL_FIELDS:
        parts = urlsplit(str(default))
        host = parts.hostname or ""
        netloc = f"{parts.username}:***@{host}" if parts.username else host
        if parts.port:
            netloc = f"{netloc}:{parts.port}"
        masked = urlunsplit((parts.scheme, netloc, parts.path, "", ""))
        return f"`{masked}` (local development)"
    if isinstance(default, bool):
        return f"`{str(default).lower()}`"
    return f"`{default}`"


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def render_tables() -> str:
    fields = Settings.model_fields
    grouped = [name for _, _, names in GROUPS for name in names]

    problems: list[str] = []
    problems += [f"{name} is not in any group" for name in fields if name not in grouped]
    problems += [
        f"{name} is in a group but is not a setting" for name in grouped if name not in fields
    ]
    problems += [
        f"{name} appears in more than one group" for name in set(grouped) if grouped.count(name) > 1
    ]
    problems += [
        f"{name} has no entry in DESCRIPTIONS" for name in fields if name not in DESCRIPTIONS
    ]
    problems += [
        f"DESCRIPTIONS names {name}, which is not a setting"
        for name in DESCRIPTIONS
        if name not in fields
    ]
    if problems:
        raise SystemExit(
            "gen_config_table: keep GROUPS and DESCRIPTIONS in step with Settings:\n  "
            + "\n  ".join(sorted(problems))
        )

    blocks: list[str] = []
    for title, intro, names in GROUPS:
        blocks.append(f"### {title}\n")
        if intro:
            blocks.append(f"{intro}\n")
        blocks.append("| Variable | Type | Default | Description |\n| --- | --- | --- | --- |")
        for name in names:
            field = fields[name]
            blocks.append(
                f"| `{name.upper()}` | {_type_label(name, field)} | {_default_label(name, field)} "
                f"| {_cell(DESCRIPTIONS[name])} |"
            )
        blocks.append("")
    return "\n".join(blocks).rstrip() + "\n"


def render_page(current: str) -> str:
    pattern = re.compile(re.escape(BEGIN_MARKER) + r".*?" + re.escape(END_MARKER), re.DOTALL)
    if not pattern.search(current):
        raise SystemExit(f"gen_config_table: {PAGE_PATH} has no generated-settings markers")
    block = f"{BEGIN_MARKER}\n\n{render_tables()}\n{END_MARKER}"
    return pattern.sub(lambda _: block, current)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if the page is out of date")
    arguments = parser.parse_args()

    current = PAGE_PATH.read_text(encoding="utf-8")
    updated = render_page(current)
    if arguments.check:
        if updated != current:
            print(
                f"{PAGE_PATH.name} is out of date with app.config.Settings. Run: {UPDATE_COMMAND}",
                file=sys.stderr,
            )
            return 1
        print(f"{PAGE_PATH.name} is up to date")
        return 0
    if updated != current:
        PAGE_PATH.write_text(updated, encoding="utf-8")
        print(f"wrote {PAGE_PATH}")
    else:
        print(f"{PAGE_PATH.name} already up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
