"""Application-level encryption for secrets that must be read back (TOTP seeds, provider keys).

Password hashes are one-way and live in `core/security.py`. A TOTP seed or a provider credential
has to be recovered in clear text, so it is sealed with AES-256-GCM under a master key that lives
in the environment and never in the database.

`CREDENTIALS_KEYS` is a keyring: `"<key_id>:<base64 of 32 bytes>[,<key_id>:<base64>...]"`. The
first entry seals new data. Every entry can open data sealed under its id, which is what makes
rotation possible: put a new key first and keep the old ones until nothing is sealed under them.

This module imports `Settings` for typing only. `config.py` imports `parse_keyring` at runtime to
reject a bad keyring when the settings load, so the dependency must not point back.
"""

import base64
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

if TYPE_CHECKING:
    from app.config import Settings

KEY_SIZE = 32  # AES-256
NONCE_SIZE = 12  # 96 bits, the size GCM is specified and fastest for
TAG_SIZE = 16

_KEY_ID = re.compile(r"[A-Za-z0-9_.-]{1,64}")


class CryptoError(Exception):
    """Base class. Messages never contain key material or plaintext."""


class CryptoNotConfigured(CryptoError):  # noqa: N818 - public interface name, kept as specified
    """CREDENTIALS_KEYS is not set, so nothing can be sealed or opened."""


class UnknownKeyId(CryptoError):  # noqa: N818 - public interface name, kept as specified
    """The data was sealed under a key id that is no longer in the keyring."""


class DecryptionFailed(CryptoError):  # noqa: N818 - public interface name, kept as specified
    """Wrong key, altered or truncated ciphertext, or a key id that was changed after sealing."""


class InvalidKeyringError(CryptoError, ValueError):
    """CREDENTIALS_KEYS does not follow the format. A ValueError so pydantic reports it."""


@dataclass(frozen=True)
class Sealed:
    """A sealed value, as stored: `ciphertext` is the 12-byte nonce, then ciphertext and tag."""

    ciphertext: bytes
    key_id: str


@dataclass(frozen=True)
class Keyring:
    active_id: str
    # Insertion order is the order of CREDENTIALS_KEYS; the first entry is `active_id`.
    keys: Mapping[str, bytes] = field(repr=False)


def parse_keyring(raw: str) -> Keyring:
    """Parse and validate the CREDENTIALS_KEYS format.

    Errors name the entry by position and state the rule it broke. They never quote the value,
    because the value is key material and settings errors end up in logs.
    """
    keys: dict[str, bytes] = {}
    for position, entry in enumerate(raw.split(","), start=1):
        key_id, key = _parse_entry(entry.strip(), position)
        if key_id in keys:
            raise InvalidKeyringError(f"entry {position}: key id {key_id!r} appears more than once")
        keys[key_id] = key
    return Keyring(active_id=next(iter(keys)), keys=keys)


def _parse_entry(entry: str, position: int) -> tuple[str, bytes]:
    if not entry:
        raise InvalidKeyringError(f"entry {position} is empty")
    key_id, separator, encoded = entry.partition(":")
    if not separator:
        raise InvalidKeyringError(f"entry {position} must look like <key_id>:<base64 key>")
    if not _KEY_ID.fullmatch(key_id):
        raise InvalidKeyringError(
            f"entry {position}: the key id must be 1 to 64 letters, digits, '.', '_' or '-'"
        )
    try:
        # `validate=True` rejects stray characters and the URL-safe alphabet instead of
        # silently discarding them, which would turn a typo into a different key.
        key = base64.b64decode(encoded, validate=True)
    except ValueError:  # binascii.Error, or non-ASCII input
        raise InvalidKeyringError(
            f"entry {position}: the key is not base64 (standard alphabet, with padding)"
        ) from None
    if len(key) != KEY_SIZE:
        raise InvalidKeyringError(f"entry {position}: the key must decode to {KEY_SIZE} bytes")
    return key_id, key


def _keyring(settings: "Settings") -> Keyring:
    if settings.credentials_keys is None:
        raise CryptoNotConfigured(
            "CREDENTIALS_KEYS is not set; set it to `<key_id>:<base64 key>`, for example "
            "`v1:` followed by the output of `openssl rand -base64 32`"
        )
    return parse_keyring(settings.credentials_keys.get_secret_value())


def encrypt(plaintext: bytes, *, settings: "Settings") -> Sealed:
    """Seal `plaintext` under the first key of the keyring.

    The key id is bound in as associated data, so a row whose `key_id` column is edited to name
    another key fails to open instead of decrypting under a key the data was never sealed with.
    """
    keyring = _keyring(settings)
    key_id = keyring.active_id
    # A fresh random nonce per call. With 96-bit nonces the collision risk stays negligible up to
    # about 2**32 encryptions under one key, far above the volume of credentials stored here.
    nonce = os.urandom(NONCE_SIZE)
    sealed = AESGCM(keyring.keys[key_id]).encrypt(nonce, plaintext, key_id.encode())
    return Sealed(ciphertext=nonce + sealed, key_id=key_id)


def decrypt(sealed: Sealed, *, settings: "Settings") -> bytes:
    """Open a value sealed under any key still in the keyring."""
    keyring = _keyring(settings)
    key = keyring.keys.get(sealed.key_id)
    if key is None:
        raise UnknownKeyId(f"no key with id {sealed.key_id!r} in CREDENTIALS_KEYS")
    if len(sealed.ciphertext) < NONCE_SIZE + TAG_SIZE:
        raise DecryptionFailed("the sealed value is too short to be valid")
    nonce, body = sealed.ciphertext[:NONCE_SIZE], sealed.ciphertext[NONCE_SIZE:]
    try:
        return AESGCM(key).decrypt(nonce, body, sealed.key_id.encode())
    except InvalidTag:
        raise DecryptionFailed("the sealed value did not authenticate") from None
