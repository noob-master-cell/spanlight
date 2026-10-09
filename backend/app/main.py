"""Application factory: `uvicorn app.main:app`."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import structlog
from fastapi import FastAPI
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import health, ingest, v1
from app.api.deps import Clock, utcnow
from app.config import Settings, get_settings
from app.core.body_limit import BodyLimitMiddleware
from app.core.errors import install_error_handlers
from app.core.idempotency import install_idempotency
from app.core.logging import configure_logging
from app.core.middleware import (
    BearerRequestMiddleware,
    OriginCheckMiddleware,
    RequestContextMiddleware,
)
from app.core.sentry import init_sentry
from app.core.tracing import configure_tracing, shutdown_tracing
from app.db.session import create_engine, create_session_factory
from app.pricing.cost import sync_seed_prices

logger = structlog.get_logger(__name__)


def create_app(
    settings: Settings | None = None,
    *,
    oauth_transport: httpx.AsyncBaseTransport | None = None,
    clock: Clock | None = None,
) -> FastAPI:
    """Build the app.

    Both keyword arguments exist for tests: `oauth_transport` replaces the network for sign-in
    provider calls, and `clock` replaces the time that one-time codes and login challenges are
    judged against, so a test decides which code is valid.
    """
    settings = settings or get_settings()
    configure_logging(settings.log_level, json=settings.log_json)
    init_sentry(settings)

    # A request waits only briefly for a connection: a pool that is full means the database is
    # behind, and an early 503 lets the client back off instead of piling up behind it.
    engine = create_engine(settings.database_url, pool_timeout=settings.api_pool_timeout_seconds)
    session_factory = create_session_factory(engine)
    # Idempotency keys get a pool of their own: they take a second connection while the request
    # still holds one from the main pool. No overflow, and a short wait before giving up.
    idempotency_engine = create_engine(
        settings.database_url,
        pool_size=settings.idempotency_pool_size,
        max_overflow=0,
        pool_timeout=settings.idempotency_pool_timeout_seconds,
    )
    # Rate-limit checks run on their own connections too, outside the request's transaction (see
    # `app.core.ratelimit`). A pool apart from the idempotency one, so a burst of requests being
    # limited cannot starve idempotency reservations, which fail the request when they time out.
    rate_limit_engine = create_engine(
        settings.database_url,
        pool_size=settings.rate_limit_pool_size,
        max_overflow=0,
        pool_timeout=settings.rate_limit_pool_timeout_seconds,
        # A stale connection fails one check, which fails open and is logged; a ping on every
        # checkout would add a round trip to every ingest and bearer read.
        pre_ping=False,
    )

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        await _sync_prices(session_factory)
        yield
        await engine.dispose()
        await idempotency_engine.dispose()
        await rate_limit_engine.dispose()
        await shutdown_tracing(getattr(application.state, "tracer_provider", None))

    app = FastAPI(
        title="Spanlight API",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.idempotency_engine = idempotency_engine
    app.state.idempotency_session_factory = create_session_factory(idempotency_engine)
    app.state.oauth_transport = oauth_transport
    app.state.clock = clock or utcnow
    app.state.rate_limit_engine = rate_limit_engine
    app.state.rate_limit_session_factory = create_session_factory(rate_limit_engine)

    install_error_handlers(app)
    # First, so it is the innermost middleware: it sees the response a route's error became.
    install_idempotency(app)
    # Before the middleware below: its attribute middleware must be inside the request-id one.
    configure_tracing(settings, app, engine)
    # Outside the idempotency middleware (which reads bodies) and inside the ones below, so a
    # refusal is logged with a request id.
    app.add_middleware(BodyLimitMiddleware)
    # Added last = outermost: every response, including Origin rejections,
    # carries a request id and is logged.
    app.add_middleware(OriginCheckMiddleware, allowed_origins=settings.origin_allowlist)
    app.add_middleware(BearerRequestMiddleware)
    app.add_middleware(RequestContextMiddleware)

    for router in (v1.router, ingest.router, health.router):
        app.include_router(router)
    return app


async def _sync_prices(session_factory: async_sessionmaker[AsyncSession]) -> None:
    """Make sure the bundled price snapshot is present. Never blocks startup."""
    try:
        async with session_factory() as session:
            inserted = await sync_seed_prices(session)
            await session.commit()
    except SQLAlchemyError as exc:
        logger.warning("price_sync_failed", error_type=type(exc).__name__)
        return
    if inserted:
        logger.info("price_sync_inserted", rows=inserted)


app = create_app()
