"""A channel's secret: generating a webhook signing secret, sealing and opening it.

The clear secret only passes through these functions and the request that sent it; none of them
logs it or puts it in an exception.
"""

import secrets
from typing import TYPE_CHECKING

from app.core.crypto import Sealed, decrypt, encrypt
from app.db.models import AlertChannel

if TYPE_CHECKING:
    from app.config import Settings

WEBHOOK_SECRET_PREFIX = "whsec_"  # noqa: S105 - a prefix, not a secret
# 24 random bytes are 32 base64url characters, with no padding.
_WEBHOOK_SECRET_BYTES = 24


def generate_webhook_secret() -> str:
    """A new signing secret: `whsec_` and 32 base64url characters (192 random bits)."""
    return WEBHOOK_SECRET_PREFIX + secrets.token_urlsafe(_WEBHOOK_SECRET_BYTES)


def seal_secret(channel: AlertChannel, secret: str, *, settings: "Settings") -> None:
    """Seal `secret` under the active key of CREDENTIALS_KEYS and store it on the channel.

    Raises `CryptoNotConfigured` without CREDENTIALS_KEYS.
    """
    sealed = encrypt(secret.encode(), settings=settings)
    channel.secret_enc = sealed.ciphertext
    channel.secret_key_id = sealed.key_id


def open_secret(channel: AlertChannel, *, settings: "Settings") -> str | None:
    """The clear secret, or None for a channel without one. Raises the `core.crypto` errors."""
    if channel.secret_enc is None or channel.secret_key_id is None:
        return None
    sealed = Sealed(ciphertext=channel.secret_enc, key_id=channel.secret_key_id)
    return decrypt(sealed, settings=settings).decode()
