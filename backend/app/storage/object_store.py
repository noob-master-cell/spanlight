"""The object store interface and the choice of implementation."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime
from threading import Lock
from typing import Protocol

from app.config import Settings


@dataclass(frozen=True, slots=True)
class ObjectInfo:
    """One stored object as `ObjectStore.list` reports it."""

    key: str
    size: int
    last_modified: datetime


class ObjectStore(Protocol):
    async def put(self, key: str, body: bytes | AsyncIterator[bytes], content_type: str) -> None:
        """Store `body` under `key`, replacing any object already there.

        An async iterator is uploaded as it is produced, so a large body is never held in memory
        in full. If the upload fails part-way nothing is left behind under `key`.
        """
        ...

    def open(self, key: str) -> AsyncIterator[bytes]:
        """Yield the object's content in chunks. Raises if `key` does not exist.

        A caller that may stop before the end must wrap the iterator in `contextlib.aclosing`,
        or the connection stays open until the generator is garbage collected.
        """
        ...

    async def delete(self, key: str) -> None:
        """Remove `key`. Deleting a key that does not exist is not an error."""
        ...

    async def list(self, prefix: str) -> list[ObjectInfo]:
        """Every object whose key starts with `prefix`, in key order."""
        ...

    def presigned_get_url(self, key: str, expires_in: int) -> str:
        """A URL that downloads `key` without credentials for `expires_in` seconds."""
        ...


# One store per process: building a boto3 client loads its service model and is not cheap, and
# the client keeps a connection pool worth reusing. `get_settings` is cached, so in practice the
# settings object is the same on every call; a different one (tests) gets a fresh store.
_cache_lock = Lock()
_cached: tuple[Settings, ObjectStore] | None = None


def get_object_store(settings: Settings) -> ObjectStore | None:
    """The store for `settings`, or None when object storage is not configured.

    The same store is returned for as long as `settings` is the same object.
    """
    global _cached  # noqa: PLW0603 - the process-wide cache described above
    if not settings.is_object_storage_configured:
        return None
    with _cache_lock:
        if _cached is None or _cached[0] is not settings:
            # s3 imports ObjectInfo from this module, so importing it at the top would be
            # circular. It also keeps boto3 unloaded for code that only needs the interface.
            from app.storage.s3 import S3ObjectStore  # noqa: PLC0415

            _cached = (settings, S3ObjectStore.from_settings(settings))
        return _cached[1]
