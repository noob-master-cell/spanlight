"""Liveness, readiness and Prometheus metrics."""

import hmac
from dataclasses import dataclass
from typing import Annotated

import structlog
from fastapi import APIRouter, Header, Request, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.api.deps import SettingsDep
from app.core.errors import not_found, unauthorized
from app.db.migrations import head_revision

router = APIRouter(tags=["health"])
logger = structlog.get_logger(__name__)

# The worker beats every 10 s, so two minutes without a beat means it is down or cut off from
# the database (and only matters while WORKER_REQUIRED is on).
WORKER_HEARTBEAT_MAX_AGE_SECONDS = 120.0
# Mail is stuck when more than this many pending notifications are overdue by more than
# 10 minutes: the worker is not draining the outbox.
OUTBOX_STALLED_LIMIT = 1000
# `outbox_backlog` is reported exactly up to this many pending rows and as this number beyond.
OUTBOX_BACKLOG_CAP = 10_000


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(request: Request, settings: SettingsDep) -> JSONResponse:
    database, migrations, background = await _probe(request)
    healthy = database == "ok" and migrations == "ok"
    heartbeat_age: float | None = None
    outbox_backlog = 0
    if background is not None:
        heartbeat_age, outbox_backlog = background.heartbeat_age, background.pending
        worker_stale = settings.worker_required and (
            heartbeat_age is None or heartbeat_age > WORKER_HEARTBEAT_MAX_AGE_SECONDS
        )
        healthy = healthy and not worker_stale and background.overdue <= OUTBOX_STALLED_LIMIT
    # Numbers and fixed words only: this endpoint is unauthenticated. `outbox_backlog` stops
    # counting at OUTBOX_BACKLOG_CAP, so a runaway backlog cannot make the probe slow.
    # `gateway_mode` says where /gw/* is served from (embedded, standalone or disabled).
    return JSONResponse(
        {
            "status": "ok" if healthy else "unavailable",
            "database": database,
            "migrations": migrations,
            "worker_heartbeat_age_s": heartbeat_age,
            "outbox_backlog": outbox_backlog,
            "gateway_mode": settings.gateway_mode,
        },
        status_code=200 if healthy else 503,
    )


@dataclass(frozen=True)
class _Background:
    heartbeat_age: float | None  # seconds since the newest worker heartbeat, None if there is none
    pending: int  # pending outbox rows, counted up to OUTBOX_BACKLOG_CAP
    overdue: int  # pending rows overdue by over ten minutes, counted up to the limit plus one


async def _probe(request: Request) -> tuple[str, str, _Background | None]:
    """Check the database and migrations and, once those are fine, the worker and the outbox.

    Everything runs on one pooled connection. The last item is None unless the database answers
    and migrations are at head (the other tables may not exist before that).
    """
    try:
        async with request.app.state.engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            try:
                current = await connection.scalar(text("SELECT version_num FROM alembic_version"))
            except SQLAlchemyError:
                return "ok", "pending", None  # the alembic_version table does not exist yet
            if current != head_revision():
                return "ok", "pending", None
            return "ok", "ok", await _background_work(connection)
    except (SQLAlchemyError, OSError) as exc:
        logger.warning("readiness_database_unavailable", error_type=type(exc).__name__)
        return "unavailable", "unknown", None


async def _background_work(connection: AsyncConnection) -> _Background:
    """Read the worker heartbeat age and the outbox counts in one statement.

    Ages are measured on the database clock. A pending row is overdue when its
    `next_attempt_at`, the time the worker should have picked it up, is more than ten minutes
    past: a row in normal retry backoff is not due yet, so only a worker that is not delivering
    makes rows overdue. Both counts read the `(status, next_attempt_at)` index and stop at a cap.
    """
    row = (
        await connection.execute(
            text(
                """
                SELECT
                    (SELECT extract(epoch FROM now() - max(last_seen_at)) FROM worker_heartbeats),
                    (SELECT count(*) FROM (
                        SELECT 1 FROM notification_outbox WHERE status = 'pending'
                        LIMIT :backlog_cap) pending),
                    (SELECT count(*) FROM (
                        SELECT 1 FROM notification_outbox
                        WHERE status = 'pending' AND next_attempt_at < now() - interval '10 minutes'
                        LIMIT :overdue_cap) overdue)
                """
            ),
            {"backlog_cap": OUTBOX_BACKLOG_CAP, "overdue_cap": OUTBOX_STALLED_LIMIT + 1},
        )
    ).one()
    age = None if row[0] is None else round(float(row[0]), 1)
    return _Background(heartbeat_age=age, pending=int(row[1]), overdue=int(row[2]))


@router.get("/metrics", include_in_schema=False)
async def metrics(
    settings: SettingsDep, authorization: Annotated[str | None, Header()] = None
) -> Response:
    if settings.metrics_token is None:
        raise not_found()
    expected = f"Bearer {settings.metrics_token.get_secret_value()}"
    # Compare bytes: hmac.compare_digest rejects non-ASCII str, and a header can carry any byte.
    if authorization is None or not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise unauthorized("A valid metrics bearer token is required.")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
