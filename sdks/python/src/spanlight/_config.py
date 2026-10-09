"""Configuration resolution for the SDK.

Every option can be passed explicitly to :class:`~spanlight.Spanlight`
or :func:`~spanlight.init`; anything left as ``None`` falls back to
a ``SPANLIGHT_*`` environment variable and then to a default.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_HOST = "http://localhost:8000"
INGEST_PATH = "/v1/traces"

_FALSE_VALUES = frozenset({"0", "false", "no", "off"})
_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})


@dataclass(frozen=True)
class SpanlightConfig:
    """Resolved, immutable SDK configuration.

    Attributes:
        api_key: Project API key (``spl_live_...``). ``None`` disables export.
        host: Base URL of the Spanlight API.
        environment: Deployment environment attached to every trace.
        release: Application version attached to every trace.
        enabled: Whether spans are recorded and exported at all.
        flush_interval: Seconds between background flushes.
        batch_size: Maximum spans per ingestion request.
        max_queue: Maximum buffered spans; the oldest are dropped beyond this.
        gzip: Whether request bodies are gzip-compressed.
        timeout: Per-request HTTP timeout in seconds.
        max_retries: Retries per batch for retryable failures.
        shutdown_timeout: Seconds the interpreter-exit flush may take.
    """

    api_key: str | None
    host: str
    environment: str | None
    release: str | None
    enabled: bool
    flush_interval: float
    batch_size: int
    max_queue: int
    gzip: bool
    timeout: float
    max_retries: int
    shutdown_timeout: float

    @property
    def ingest_url(self) -> str:
        """Full URL of the batch ingestion endpoint."""
        return self.host.rstrip("/") + INGEST_PATH


def parse_bool(raw: str | None, default: bool) -> bool:
    """Interpret an environment-variable string as a boolean.

    Args:
        raw: The raw value, or ``None`` when the variable is unset.
        default: Value used when ``raw`` is unset, empty or unrecognised.

    Returns:
        The parsed boolean.
    """
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in _TRUE_VALUES:
        return True
    if normalized in _FALSE_VALUES:
        return False
    return default


def _env(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None or not value.strip():
        return None
    return value.strip()


def resolve_config(
    *,
    api_key: str | None,
    host: str | None,
    environment: str | None,
    release: str | None,
    enabled: bool | None,
    flush_interval: float,
    batch_size: int,
    max_queue: int,
    gzip: bool,
    timeout: float,
    max_retries: int,
    shutdown_timeout: float,
) -> SpanlightConfig:
    """Merge explicit arguments with ``SPANLIGHT_*`` environment variables.

    Explicit arguments always win over the environment. Numeric options are
    clamped to sane minimums rather than rejected, because configuration
    mistakes must never crash the host application.
    """
    resolved_enabled = (
        enabled if enabled is not None else parse_bool(_env("SPANLIGHT_ENABLED"), True)
    )
    return SpanlightConfig(
        api_key=api_key or _env("SPANLIGHT_API_KEY"),
        host=host or _env("SPANLIGHT_HOST") or DEFAULT_HOST,
        environment=environment or _env("SPANLIGHT_ENVIRONMENT"),
        release=release or _env("SPANLIGHT_RELEASE"),
        enabled=resolved_enabled,
        flush_interval=max(flush_interval, 0.05),
        batch_size=min(max(batch_size, 1), 1000),
        max_queue=max(max_queue, 1),
        gzip=gzip,
        timeout=max(timeout, 0.1),
        max_retries=max(max_retries, 0),
        shutdown_timeout=max(shutdown_timeout, 0.0),
    )
