"""The challenge that carries a password-checked sign-in over to the second factor.

When the password (or the OAuth provider) has vouched for a user who has two-factor
authentication on, the server must not create a session yet. It hands the browser a challenge
instead: a signed statement "this browser got past the first step as user X until time T". The
browser sends it back with a code, and only then is the session created.

The challenge is stateless (HMAC-SHA256 with `SECRET_KEY` over `{user_id, expiry, nonce,
password fingerprint}`), lasts five minutes and proves nothing by itself: it does not sign anyone
in, it only names whom a code is for. It can be presented more than once inside its five minutes,
which is harmless, because every use still needs a code that is valid now and is accepted once,
and wrong codes are counted against the account's sign-in limit. The nonce makes every challenge
different.

The fingerprint ties it to the password it was issued for. A password is often replaced because it
leaked, and a sign-in that passed the first step with the old one must not become a session after
the change. The second step compares the fingerprint with the user's current password (see
`ChallengeClaims.matches`), so any change to it, a reset included, ends every open challenge.
"""

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.auth.signing import seal, unseal
from app.config import Settings

CHALLENGE_TTL = timedelta(minutes=5)
# Names the signed payload as a login challenge, so a signature made for another purpose (the
# OAuth state cookie) with the same key can never validate as one.
SIGNING_CONTEXT = b"spanlight.totp-challenge.v1."


@dataclass(frozen=True)
class Challenge:
    token: str
    expires_at: datetime


@dataclass(frozen=True)
class ChallengeClaims:
    """What a valid challenge says: whom it is for, and which password it was issued against."""

    user_id: uuid.UUID
    credential: str

    def matches(self, password_hash: str | None) -> bool:
        """Whether `password_hash`, the user's current one, is what the challenge was issued for."""
        return hmac.compare_digest(
            self.credential.encode(), credential_fingerprint(password_hash).encode()
        )


def credential_fingerprint(password_hash: str | None) -> str:
    """16 bytes (hex) of SHA-256 over the stored password hash; fixed for "no password".

    A user who signs in only with a provider has no hash; giving them one changes the fingerprint
    like any other change. The token is signed, not encrypted, so it must not carry the hash: a
    truncated digest of it says nothing a holder of the token could use.
    """
    material = b"no-password" if password_hash is None else b"password:" + password_hash.encode()
    return hashlib.sha256(material).digest()[:16].hex()


def issue_challenge(
    settings: Settings, user_id: uuid.UUID, now: datetime, *, password_hash: str | None
) -> Challenge:
    """A challenge for `user_id`, tied to their current `password_hash` (None for no password)."""
    expires_at = now + CHALLENGE_TTL
    token = seal(
        settings.secret_key.get_secret_value(),
        SIGNING_CONTEXT,
        {
            "u": str(user_id),
            "exp": int(expires_at.timestamp()),
            "n": secrets.token_urlsafe(16),
            "pw": credential_fingerprint(password_hash),
        },
    )
    return Challenge(token=token, expires_at=expires_at)


def read_challenge(settings: Settings, token: str, now: datetime) -> ChallengeClaims | None:
    """The claims of a challenge, or None if it is forged, malformed or expired.

    Whether the password is still the one it was issued for is not decided here: that needs the
    user's current hash, which only the caller holds (see `ChallengeClaims.matches`).
    """
    payload = unseal(settings.secret_key.get_secret_value(), SIGNING_CONTEXT, token)
    if payload is None:
        return None
    raw_user_id, raw_exp = payload.get("u"), payload.get("exp")
    nonce, credential = payload.get("n"), payload.get("pw")
    if not isinstance(raw_user_id, str) or not isinstance(nonce, str) or not nonce:
        return None
    if not isinstance(credential, str) or not credential:
        return None
    if not isinstance(raw_exp, int) or isinstance(raw_exp, bool):
        return None
    try:
        user_id = uuid.UUID(raw_user_id)
        expires_at = datetime.fromtimestamp(raw_exp, UTC)
    except (ValueError, OverflowError, OSError):
        return None
    # The instant of expiry is already too late.
    if expires_at <= now:
        return None
    return ChallengeClaims(user_id=user_id, credential=credential)
