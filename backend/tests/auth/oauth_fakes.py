"""GitHub and Google stand-ins for the OAuth tests: one `httpx.MockTransport`, no network.

The fake answers the token, profile and email endpoints the app calls. It checks what a real
provider would check (the bearer token on API calls) and records every request, so a test can
assert on what the app sent: the PKCE `code_verifier`, the redirect URI, the client credentials.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs

import httpx

GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

ACCESS_TOKEN = "provider-access-token"


def _json(body: Any, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=body)


@dataclass
class FakeProviders:
    """What GitHub and Google will say. Change a field before the callback to change the answer."""

    github_user: dict[str, Any] = field(
        default_factory=lambda: {"id": 1001, "login": "ada-gh", "name": "Ada Lovelace"}
    )
    github_emails: list[dict[str, Any]] = field(
        default_factory=lambda: [
            {"email": "other@example.com", "primary": False, "verified": True},
            {"email": "ada@example.com", "primary": True, "verified": True},
        ]
    )
    google_userinfo: dict[str, Any] = field(
        default_factory=lambda: {
            "sub": "google-2002",
            "email": "ada@example.com",
            "email_verified": True,
            "name": "Ada Lovelace",
        }
    )
    # Replace the answer for one URL, for example `{GITHUB_TOKEN_URL: lambda: httpx.Response(500)}`.
    overrides: dict[str, Callable[[], httpx.Response]] = field(default_factory=dict)
    requests: list[httpx.Request] = field(default_factory=list)

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = str(request.url.copy_with(query=None))
        override = self.overrides.get(url)
        if override is not None:
            return override()
        if url in (GITHUB_TOKEN_URL, GOOGLE_TOKEN_URL):
            return _json({"access_token": ACCESS_TOKEN, "token_type": "bearer", "scope": "x"})
        if request.headers.get("authorization") != f"Bearer {ACCESS_TOKEN}":
            return _json({"message": "Bad credentials"}, 401)
        if url == GITHUB_USER_URL:
            return _json(self.github_user)
        if url == GITHUB_EMAILS_URL:
            return _json(self.github_emails)
        if url == GOOGLE_USERINFO_URL:
            return _json(self.google_userinfo)
        return httpx.Response(404)

    def requests_to(self, url: str) -> list[httpx.Request]:
        return [r for r in self.requests if str(r.url.copy_with(query=None)) == url]

    def token_request_form(self, url: str) -> dict[str, str]:
        """The single token request to `url`, as the form fields the provider received."""
        (request,) = self.requests_to(url)
        return {key: values[0] for key, values in parse_qs(request.content.decode()).items()}

    def set_github_email(self, email: str, *, verified: bool = True) -> None:
        self.github_emails = [{"email": email, "primary": True, "verified": verified}]

    def set_google_email(self, email: str, *, verified: bool = True) -> None:
        self.google_userinfo = {**self.google_userinfo, "email": email, "email_verified": verified}
