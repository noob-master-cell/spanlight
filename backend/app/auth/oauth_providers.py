"""The sign-in providers: their endpoints and scopes, and how their profiles are read.

Only data and pure functions live here. The calls that fetch a profile are in
`app.auth.oauth_client`, and the rules for what a profile may do are in
`app.auth.oauth_service`, so everything below can be tested with plain dictionaries.

A provider's answer is untrusted input: a malformed one raises `ValueError`, which the caller
treats as the provider failing, and an email is only ever trusted as verified when the provider
says so with the exact boolean `true`.
"""

from dataclasses import dataclass
from typing import Any

from app.config import OAuthProviderName


@dataclass(frozen=True)
class ProviderSpec:
    name: OAuthProviderName
    authorize_url: str
    token_url: str
    scope: str


PROVIDERS: dict[str, ProviderSpec] = {
    "github": ProviderSpec(
        name="github",
        authorize_url="https://github.com/login/oauth/authorize",
        token_url="https://github.com/login/oauth/access_token",  # noqa: S106 - a public URL
        scope="read:user user:email",
    ),
    "google": ProviderSpec(
        name="google",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",  # noqa: S106 - a public URL
        scope="openid email profile",
    ),
}

GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
# The access token goes to Google over TLS, so the answer needs no further proof of origin and
# the ID token is never read.
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

MAX_EMAIL_LENGTH = 254  # RFC 5321


@dataclass(frozen=True)
class OAuthProfile:
    """Who the provider says the signed-in person is."""

    provider: OAuthProviderName
    # The provider's stable id for the account. Identifies the user; the email does not.
    subject: str
    email: str | None
    email_verified: bool
    name: str | None


def parse_github_profile(user: Any, emails: Any) -> OAuthProfile:
    """Read GitHub's `/user` and `/user/emails` answers.

    The email is the account's primary one and its `verified` flag; `/user`'s own `email` field
    is the public profile address, which is neither necessarily primary nor verified.
    """
    github_id = user.get("id") if isinstance(user, dict) else None
    if not isinstance(github_id, int) or isinstance(github_id, bool):
        raise ValueError("GitHub user has no numeric id")
    if not isinstance(emails, list) or not all(isinstance(entry, dict) for entry in emails):
        raise ValueError("GitHub emails is not a list of objects")

    email: str | None = None
    verified = False
    for entry in emails:
        if entry.get("primary") is True:
            email = _clean_email(entry.get("email"))
            verified = email is not None and entry.get("verified") is True
            break

    return OAuthProfile(
        provider="github",
        subject=str(github_id),
        email=email,
        email_verified=verified,
        name=_clean_name(user.get("name")) or _clean_name(user.get("login")),
    )


def parse_google_profile(info: Any) -> OAuthProfile:
    """Read Google's userinfo answer."""
    subject = info.get("sub") if isinstance(info, dict) else None
    if not isinstance(subject, str) or not subject:
        raise ValueError("Google userinfo has no sub")

    email = _clean_email(info.get("email"))
    # Userinfo sends a boolean; the older tokeninfo endpoint sent the string "true".
    flag = info.get("email_verified")
    verified = email is not None and (flag is True or flag == "true")
    return OAuthProfile(
        provider="google",
        subject=subject,
        email=email,
        email_verified=verified,
        name=_clean_name(info.get("name")),
    )


def _clean_email(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    address = value.strip()
    if not address or len(address) > MAX_EMAIL_LENGTH or address.count("@") != 1:
        return None
    local, domain = address.split("@")
    return address if local and "." in domain else None


def _clean_name(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip() or None
