"""The `spl_oauth` cookie that ties an OAuth callback to the browser that started it.

Starting a sign-in stores `{state, PKCE verifier, provider, intent, next, user_id, exp}` in a
signed, httpOnly cookie, and sends the same `state` to the provider. The provider returns it with
the authorization code, and the callback only goes on if the two match. That is what stops login
CSRF: an attacker who gets a victim's browser to open a callback URL with the attacker's own
`code` has no cookie to match it in the victim's browser, so the victim is never signed in as
the attacker.

The cookie is signed (HMAC-SHA256 with `SECRET_KEY`), not encrypted: everything in it is either
public (`provider`, `intent`, `next`) or only useful to the browser that holds it (the PKCE
verifier proves nothing without the authorization code the provider sent to that same browser).
It lives for 10 minutes and the callback always clears it, so a state is meant to be used once.
It is not tracked on the server, so a copy of the cookie replayed within the 10 minutes still
passes this check; it then fails at the provider, which accepts each authorization code once.
"""

import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, get_args

from fastapi import Response

from app.auth.signing import seal, unseal
from app.config import Settings

STATE_COOKIE = "spl_oauth"
# Only the OAuth routes need it, so the browser sends it nowhere else.
STATE_COOKIE_PATH = "/api/v1/auth/oauth"
STATE_TTL = timedelta(minutes=10)

Intent = Literal["sign_in", "link"]
INTENTS: tuple[str, ...] = get_args(Intent)

MAX_NEXT_LENGTH = 2048
# Names the signed payload as an OAuth state, so a signature made for another purpose with the
# same key can never validate as one.
_SIGNING_CONTEXT = b"spanlight.oauth_state.v1."


@dataclass(frozen=True)
class OAuthState:
    state: str
    verifier: str
    provider: str
    intent: Intent
    next: str
    user_id: uuid.UUID | None
    exp: datetime


def new_state(
    *, provider: str, intent: Intent, next: str, user_id: uuid.UUID | None, now: datetime
) -> OAuthState:
    return OAuthState(
        state=secrets.token_urlsafe(32),
        # 64 characters, inside RFC 7636's 43 to 128.
        verifier=secrets.token_urlsafe(48),
        provider=provider,
        intent=intent,
        next=next,
        user_id=user_id,
        exp=now + STATE_TTL,
    )


def sign_state(secret_key: str, state: OAuthState) -> str:
    return _seal(
        secret_key,
        {
            "state": state.state,
            "verifier": state.verifier,
            "provider": state.provider,
            "intent": state.intent,
            "next": state.next,
            "user_id": str(state.user_id) if state.user_id else None,
            "exp": int(state.exp.timestamp()),
        },
    )


def read_state(secret_key: str, raw: str | None, *, now: datetime) -> OAuthState | None:
    """The state in a cookie value, or None if it is missing, forged, expired or malformed."""
    if not raw:
        return None
    payload = _open(secret_key, raw)
    if payload is None:
        return None
    try:
        state = payload["state"]
        verifier = payload["verifier"]
        provider = payload["provider"]
        intent = payload["intent"]
        next_path = payload["next"]
        raw_user_id = payload["user_id"]
        raw_exp = payload["exp"]
        if not isinstance(raw_exp, int) or isinstance(raw_exp, bool):
            return None
        exp = datetime.fromtimestamp(raw_exp, UTC)
        if raw_user_id is not None and not isinstance(raw_user_id, str):
            return None
        user_id = uuid.UUID(raw_user_id) if raw_user_id is not None else None
    except (KeyError, ValueError, OverflowError, OSError):
        return None
    strings = (state, verifier, provider, next_path)
    if not all(isinstance(value, str) and value for value in strings) or intent not in INTENTS:
        return None
    if exp <= now:
        return None
    # Made by `safe_next` before it was signed; checked again so that a bug in one place does not
    # make an open redirect.
    return OAuthState(state, verifier, provider, intent, safe_next(next_path), user_id, exp)


def state_matches(stored: OAuthState, provider: str, presented_state: str | None) -> bool:
    """Whether a callback for `provider` carrying `presented_state` belongs to this state."""
    if not presented_state:
        return False
    # Both comparisons always run, so the time taken does not say which one failed.
    same_state = hmac.compare_digest(stored.state.encode(), presented_state.encode())
    same_provider = hmac.compare_digest(stored.provider.encode(), provider.encode())
    return same_state and same_provider


def set_state_cookie(response: Response, settings: Settings, state: OAuthState) -> None:
    response.set_cookie(
        STATE_COOKIE,
        sign_state(settings.secret_key.get_secret_value(), state),
        max_age=int(STATE_TTL.total_seconds()),
        httponly=True,
        secure=settings.secure_cookies,
        # Lax, not Strict: the provider sends the browser back with a cross-site navigation, and
        # Strict would withhold the cookie from exactly that request.
        samesite="lax",
        path=STATE_COOKIE_PATH,
    )


def clear_state_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        STATE_COOKIE,
        path=STATE_COOKIE_PATH,
        secure=settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )


def safe_next(raw: str | None) -> str:
    """Where to send the browser afterwards: a path on this site, or `/`.

    Accepts only a string that starts with exactly one `/`. Everything else becomes `/`: other
    sites (`https://…`, `//host`), schemes (`javascript:`), a backslash right after the slash
    (browsers read `/\\host` as `//host`) and control characters anywhere (browsers drop tabs and
    line breaks inside a URL, so a slash, a tab and a second slash would become `//`; a line
    break would also split a header).
    """
    if not raw or len(raw) > MAX_NEXT_LENGTH:
        return "/"
    if not raw.startswith("/") or raw.startswith(("//", "/\\")):
        return "/"
    if any(ord(char) < 0x20 or ord(char) == 0x7F for char in raw):
        return "/"
    return raw


def _seal(secret_key: str, payload: dict[str, Any]) -> str:
    return seal(secret_key, _SIGNING_CONTEXT, payload)


def _open(secret_key: str, raw: str) -> dict[str, Any] | None:
    return unseal(secret_key, _SIGNING_CONTEXT, raw)
