"""The identity of a problem, stable across runs."""

import hashlib
from uuid import UUID


def fingerprint(project_id: UUID, kind: str, key: str) -> str:
    """First 32 hex characters of SHA-256 over `"{project_id}:{kind}:{key}"`."""
    return hashlib.sha256(f"{project_id}:{kind}:{key}".encode()).hexdigest()[:32]
