"""The ORM models live in a package split by domain, with one public import path."""

import importlib

from app.db.models import Base

ALL_TABLES = {
    "api_keys",
    "audit_events",
    "email_tokens",
    "idempotency_keys",
    "invites",
    "jobs",
    "login_attempts",
    "memberships",
    "model_prices",
    "notification_outbox",
    "oauth_identities",
    "organizations",
    "personal_access_tokens",
    "projects",
    "recovery_codes",
    "sessions",
    "spans",
    "throttle_events",
    "traces",
    "users",
}

DOMAIN_MODULES = (
    "auth",
    "base",
    "identity",
    "notifications",
    "platform",
    "pricing",
    "projects",
    "telemetry",
)


def test_models_package_exports_every_table() -> None:
    assert set(Base.metadata.tables.keys()) == ALL_TABLES


def test_domain_modules_exist() -> None:
    for module in DOMAIN_MODULES:
        assert importlib.import_module(f"app.db.models.{module}")
