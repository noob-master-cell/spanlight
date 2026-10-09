"""The email settings: defaults, blank-means-unset, and the checks that stop a bad setup at startup.

Settings are built with `_env_file=None` and the email variables cleared, so neither a developer's
`.env` nor their shell can change the outcome.
"""

from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.config import Settings

EMAIL_VARIABLES = (
    "EMAIL_PROVIDER",
    "EMAIL_FROM",
    "RESEND_API_KEY",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "SMTP_STARTTLS",
    "EMAIL_CONSOLE_FILE",
)
FROM = "Spanlight <noreply@example.com>"


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in EMAIL_VARIABLES:
        monkeypatch.delenv(name, raising=False)


def build(**values: Any) -> Settings:
    return Settings(_env_file=None, **values)


def test_defaults_to_the_console_provider_with_nothing_configured() -> None:
    settings = build()

    assert settings.email_provider == "console"
    assert settings.email_from is None and settings.email_console_file is None
    assert settings.resend_api_key is None and settings.smtp_password is None
    assert settings.smtp_host is None and settings.smtp_username is None
    assert settings.smtp_port == 587 and settings.smtp_starttls is True
    assert settings.is_email_configured is False


def test_console_without_a_file_is_not_configured(tmp_path: Path) -> None:
    assert build(email_provider="console").is_email_configured is False
    assert build(email_console_file=tmp_path / "outbox.jsonl").is_email_configured is True


def test_console_file_from_the_environment_counts_as_configured(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("EMAIL_CONSOLE_FILE", str(tmp_path / "outbox.jsonl"))

    settings = build()

    assert settings.email_console_file == tmp_path / "outbox.jsonl"
    assert settings.is_email_configured is True


def test_resend_and_smtp_are_configured_once_they_validate() -> None:
    resend = build(email_provider="resend", resend_api_key="re_x", email_from=FROM)
    smtp = build(email_provider="smtp", smtp_host="smtp.example.com", email_from=FROM)

    assert resend.is_email_configured is True
    assert smtp.is_email_configured is True


def test_resend_without_a_key_fails_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("EMAIL_FROM", FROM)

    with pytest.raises(ValidationError, match="RESEND_API_KEY"):
        build()


@pytest.mark.parametrize(
    ("values", "missing"),
    [
        ({"email_provider": "resend", "email_from": FROM}, "RESEND_API_KEY"),
        ({"email_provider": "resend", "resend_api_key": "re_x"}, "EMAIL_FROM"),
        ({"email_provider": "smtp", "email_from": FROM}, "SMTP_HOST"),
        ({"email_provider": "smtp", "smtp_host": "smtp.example.com"}, "EMAIL_FROM"),
        ({"email_provider": "resend", "resend_api_key": "", "email_from": FROM}, "RESEND_API_KEY"),
        ({"email_provider": "smtp", "smtp_host": "", "email_from": FROM}, "SMTP_HOST"),
        (
            {"email_provider": "smtp", "smtp_host": "smtp.example.com", "email_from": ""},
            "EMAIL_FROM",
        ),
    ],
)
def test_a_provider_missing_what_it_needs_fails_settings(
    values: dict[str, Any], missing: str
) -> None:
    with pytest.raises(ValidationError, match=missing):
        build(**values)


def test_settings_errors_never_echo_secrets() -> None:
    with pytest.raises(ValidationError) as resend:
        build(email_provider="resend", resend_api_key="re_super_secret_key")
    with pytest.raises(ValidationError) as smtp:
        build(email_provider="smtp", smtp_password="super-secret-password", email_from=FROM)

    assert "re_super_secret_key" not in str(resend.value)
    assert "super-secret-password" not in str(smtp.value)


def test_secrets_are_masked_in_repr() -> None:
    settings = build(
        email_provider="smtp",
        smtp_host="smtp.example.com",
        smtp_password="super-secret-password",
        resend_api_key="re_super_secret_key",
        email_from=FROM,
    )

    assert "super-secret-password" not in repr(settings)
    assert "re_super_secret_key" not in repr(settings)
    assert settings.smtp_password is not None
    assert settings.smtp_password.get_secret_value() == "super-secret-password"


def test_an_unknown_provider_fails_settings() -> None:
    with pytest.raises(ValidationError, match="email_provider"):
        build(email_provider="carrier-pigeon")


def test_blank_variables_mean_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    # `docker compose` passes `${VAR:-}` through as an empty string, and a `KEY=` line in a .env
    # file is how people write "not set".
    for name in EMAIL_VARIABLES:
        monkeypatch.setenv(name, "")

    settings = build()

    assert settings.email_provider == "console"
    assert settings.smtp_port == 587 and settings.smtp_starttls is True
    assert settings.email_from is None and settings.resend_api_key is None
    assert settings.smtp_host is None and settings.smtp_username is None
    assert settings.smtp_password is None and settings.email_console_file is None
    assert settings.is_email_configured is False


def test_smtp_settings_are_read_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_PROVIDER", "smtp")
    monkeypatch.setenv("EMAIL_FROM", FROM)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "2525")
    monkeypatch.setenv("SMTP_USERNAME", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "pw")
    monkeypatch.setenv("SMTP_STARTTLS", "false")

    settings = build()

    assert (settings.smtp_host, settings.smtp_port) == ("smtp.example.com", 2525)
    assert settings.smtp_username == "mailer" and settings.smtp_starttls is False
