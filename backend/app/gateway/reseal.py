"""Resealing provider credentials under the active key of CREDENTIALS_KEYS.

A batch command (`spanlight reseal-credentials`), run after a new key is added to the keyring:
only once no credential is sealed under an older key may that key leave the keyring. It commits
per batch. The clear API key exists only in local variables while a row is resealed.
"""

import uuid
from dataclasses import dataclass

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.core.crypto import (
    CryptoNotConfigured,
    DecryptionFailed,
    Sealed,
    UnknownKeyId,
    decrypt,
    encrypt,
    parse_keyring,
)
from app.gateway import queries

logger = structlog.get_logger(__name__)

RESEAL_BATCH_SIZE = 100


@dataclass(frozen=True)
class ResealResult:
    resealed: int
    # Rows that could not be opened with any key in the keyring; they keep their old seal.
    failed: int
    # Rows still sealed under a key other than the active one once the pass ended, counted
    # afresh: the failed ones plus any written under an older key meanwhile. Zero means no
    # credential needs the older keys any more.
    remaining: int


async def reseal_credentials(
    db: AsyncSession, *, settings: Settings, batch_size: int = RESEAL_BATCH_SIZE
) -> ResealResult:
    """Seal every credential under the active key of CREDENTIALS_KEYS, one batch at a time.

    Commits after each batch. Rows another transaction holds are waited for, never skipped. A
    row that no key in the keyring opens is counted, logged by id and left as it is. The result's
    `remaining` is a fresh count after the pass: only when it is zero may an older key leave the
    keyring. Raises `CryptoNotConfigured`.
    """
    if settings.credentials_keys is None:
        raise CryptoNotConfigured("CREDENTIALS_KEYS is not set")
    active_key_id = parse_keyring(settings.credentials_keys.get_secret_value()).active_id
    resealed = 0
    failed: list[uuid.UUID] = []
    while True:
        batch = await queries.credentials_not_sealed_under(
            db, active_key_id, exclude=failed, limit=batch_size
        )
        if not batch:
            break
        for credential in batch:
            try:
                plaintext = decrypt(
                    Sealed(ciphertext=credential.ciphertext, key_id=credential.key_id),
                    settings=settings,
                )
            except (UnknownKeyId, DecryptionFailed) as failure:
                logger.warning(
                    "provider_credential_reseal_failed",
                    credential_id=str(credential.id),
                    error_type=type(failure).__name__,
                )
                failed.append(credential.id)
                continue
            sealed = encrypt(plaintext, settings=settings)
            credential.ciphertext = sealed.ciphertext
            credential.key_id = sealed.key_id
            resealed += 1
        await db.commit()
    remaining = await queries.count_credentials_not_sealed_under(db, active_key_id)
    await db.commit()
    return ResealResult(resealed=resealed, failed=len(failed), remaining=remaining)
