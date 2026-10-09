"""Writing a gateway call's span, and what the call used, after the client has its answer.

`record` runs in a session of its own, so it never shares a transaction with the request (or
holds a lock the request needs). In one transaction it writes the span through `ingest_spans`
(with the key as `source_key_id`), counts the call and its tokens in the key's current minute
(`record_minute`; a cache hit counts zero tokens), and moves the `last_used_at` of the key and of
each provider credential the call used, each at most once a minute. A call without a key (an
in-process caller) writes only the span and the credentials' `last_used_at`.

A failure is logged and counted, never raised: the client was already answered. `record_soon`
runs `record` as a task the caller does not wait for, which also survives the client going
away mid-stream; `drain` waits for those tasks (shutdown, tests). A context with a `span_sink`
takes the span instead: its caller awaits each write itself (`DirectSpans`, the demo job).

The background writes are bounded, since each holds a database connection from the pool the
requests use: at most `GATEWAY_RECORD_CONCURRENCY` run at once, and at most
`GATEWAY_RECORD_BACKLOG` wait or run. A span past the backlog is dropped, counted as
`reason="overflow"` and logged at most once a minute, without its contents.
"""

import asyncio
import time
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.observability import GATEWAY_RECORD_FAILURES, INGESTED_SPANS, REJECTED_SPANS
from app.db.models import GatewayKey, ProviderCredential
from app.gateway.context import GatewayContext, GatewayResult
from app.gateway.key_limits import record_minute
from app.ingest.pipeline import IngestTarget, ingest_spans

logger = structlog.get_logger(__name__)

METRIC_SOURCE = "gateway"
LAST_USED_INTERVAL = timedelta(minutes=1)
OVERFLOW_LOG_INTERVAL_S = 60.0


@dataclass
class _Writers:
    """The background writes of one event loop, and how many may run and wait."""

    loop: asyncio.AbstractEventLoop
    slots: asyncio.Semaphore
    backlog: int
    pending: set["asyncio.Task[None]"] = field(default_factory=set)
    dropped: int = 0  # since the last overflow log line
    logged_at: float | None = None


_writers: _Writers | None = None


async def record(
    context: GatewayContext, span: dict[str, Any], credential_ids: Sequence[uuid.UUID] = ()
) -> bool:
    """Write the span and the key's usage. True when the span was stored.

    Never raises (see the module docstring): a failed or refused write is logged, counted and
    answered with False.
    """
    now = context.clock()
    target = IngestTarget(
        project_id=context.project_id,
        capture_payloads=context.capture_payloads,
        org_id=context.org_id,
        source_key_id=context.key_id,
    )
    try:
        async with context.sessions() as db, db.begin():
            # `ingest_spans` binds the project, which the key's rows below need as well.
            outcome = await ingest_spans(db, target, [span], now=now)
            if context.key is not None:
                await record_minute(
                    db, context.key.key.id, context.project_id, _total_tokens(span), now
                )
                await _touch_key(db, context.key.key, now)
            await _touch_credentials(db, context, credential_ids, now)
    except Exception:
        GATEWAY_RECORD_FAILURES.labels("error").inc()
        logger.exception("gateway.record_failed", span_id=span.get("span_id"))
        return False
    INGESTED_SPANS.labels(METRIC_SOURCE).inc(outcome.accepted)
    if outcome.rejected:
        REJECTED_SPANS.labels(METRIC_SOURCE).inc(len(outcome.rejected))
        GATEWAY_RECORD_FAILURES.labels("rejected").inc()
        logger.warning(
            "gateway.span_rejected",
            span_id=span.get("span_id"),
            reason=outcome.rejected[0].reason,
        )
        return False
    return True


def record_soon(
    context: GatewayContext, span: dict[str, Any], credential_ids: Sequence[uuid.UUID] = ()
) -> None:
    """Run `record` in the background, or drop the span when the backlog is full.

    A context with a `span_sink` hands the span to it instead.
    """
    if context.span_sink is not None:
        context.span_sink.add(span, credential_ids)
        return
    writers = _writers_for(context)
    if len(writers.pending) >= writers.backlog:
        _overflow(writers)
        return
    task = writers.loop.create_task(_write(writers, context, span, credential_ids))
    writers.pending.add(task)
    task.add_done_callback(writers.pending.discard)


def credentials_used(result: GatewayResult) -> tuple[uuid.UUID, ...]:
    """The credentials the call's attempts sent a request with; a blocked attempt sent none."""
    used = (attempt.credential_id for attempt in result.attempts if attempt.error != "blocked")
    return tuple(dict.fromkeys(used))


class DirectSpans:
    """A `SpanSink` whose owner writes each span itself, awaiting the write (`write`)."""

    def __init__(self) -> None:
        self._pending: list[tuple[dict[str, Any], Sequence[uuid.UUID]]] = []

    def add(self, span: dict[str, Any], credential_ids: Sequence[uuid.UUID]) -> None:
        self._pending.append((span, credential_ids))

    async def write(self, context: GatewayContext) -> bool:
        """Write the spans taken so far, one by one. False when any of them was not stored."""
        stored = True
        while self._pending:
            span, credential_ids = self._pending.pop(0)
            stored = await record(context, span, credential_ids) and stored
        return stored


async def drain(timeout_s: float | None = None) -> None:
    """Wait for the spans still being written, at most `timeout_s` when given."""
    writers = _writers
    if writers is None or writers.loop is not asyncio.get_running_loop():
        return
    deadline = None if timeout_s is None else time.monotonic() + timeout_s
    while writers.pending:
        left = None if deadline is None else deadline - time.monotonic()
        if left is not None and left <= 0:
            logger.warning("gateway.record_drain_timeout", pending=len(writers.pending))
            return
        await asyncio.wait(list(writers.pending), timeout=left)


async def _write(
    writers: _Writers,
    context: GatewayContext,
    span: dict[str, Any],
    credential_ids: Sequence[uuid.UUID],
) -> None:
    async with writers.slots:
        await record(context, span, credential_ids)


def _writers_for(context: GatewayContext) -> _Writers:
    """This loop's writers, made on first use (a test may run several loops one after another)."""
    global _writers  # noqa: PLW0603 - one set of writers per process, rebuilt for a new loop
    loop = asyncio.get_running_loop()
    if _writers is None or _writers.loop is not loop:
        settings = context.settings
        _writers = _Writers(
            loop=loop,
            slots=asyncio.Semaphore(settings.gateway_record_concurrency),
            backlog=settings.gateway_record_backlog,
        )
    return _writers


def _overflow(writers: _Writers) -> None:
    GATEWAY_RECORD_FAILURES.labels("overflow").inc()
    writers.dropped += 1
    now = time.monotonic()
    if writers.logged_at is None or now - writers.logged_at >= OVERFLOW_LOG_INTERVAL_S:
        logger.warning("gateway.record_overflow", dropped=writers.dropped, backlog=writers.backlog)
        writers.logged_at, writers.dropped = now, 0


async def _touch_key(db: AsyncSession, key: GatewayKey, now: datetime) -> None:
    """Move `last_used_at` to now unless it moved less than a minute ago."""
    if key.last_used_at is not None and now - key.last_used_at < LAST_USED_INTERVAL:
        return
    await db.execute(
        update(GatewayKey)
        .where(
            GatewayKey.id == key.id,
            or_(
                GatewayKey.last_used_at.is_(None),
                GatewayKey.last_used_at < now - LAST_USED_INTERVAL,
            ),
        )
        .values(last_used_at=now)
        .execution_options(synchronize_session=False)
    )


async def _touch_credentials(
    db: AsyncSession,
    context: GatewayContext,
    credential_ids: Sequence[uuid.UUID],
    now: datetime,
) -> None:
    """Move each used credential's `last_used_at` to now, at most once a minute, like the key's.

    `provider_credentials` has no row-level security: the `org_id` condition scopes the update.
    """
    for credential_id in credential_ids:
        loaded = context.credentials.get(credential_id)
        seen = loaded.last_used_at if loaded is not None else None
        if seen is not None and now - seen < LAST_USED_INTERVAL:
            continue  # moved less than a minute ago, as far as this call's snapshot knows
        await db.execute(
            update(ProviderCredential)
            .where(
                ProviderCredential.org_id == context.org_id,
                ProviderCredential.id == credential_id,
                or_(
                    ProviderCredential.last_used_at.is_(None),
                    ProviderCredential.last_used_at < now - LAST_USED_INTERVAL,
                ),
            )
            .values(last_used_at=now)
            .execution_options(synchronize_session=False)
        )


def _total_tokens(span: dict[str, Any]) -> int:
    usage = span.get("usage") or {}
    return sum(
        value
        for value in (usage.get("input_tokens"), usage.get("output_tokens"))
        if isinstance(value, int)
    )


__all__ = ["DirectSpans", "credentials_used", "drain", "record", "record_soon"]
