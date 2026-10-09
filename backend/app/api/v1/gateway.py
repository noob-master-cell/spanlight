"""Project-level gateway operations: the traffic overview and purging the response cache.

Members read the overview (`project:read`); owners and admins purge (`gateway:write`).
"""

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Query, Request, status

from app.api.deps import Access, DbSession, client_ip, require
from app.api.locks import lock_project_of
from app.api.schemas.gateway import GatewayOverviewOut
from app.api.window import TimeWindow, Window
from app.core.errors import FieldError, ProblemError
from app.core.permissions import Permission
from app.gateway import cache_service, overview_service
from app.gateway.overview_queries import MAX_OVERVIEW_WINDOW

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/projects/{project_id}/gateway", tags=["gateway"])

GatewayWriter = Annotated[Access, Depends(require(Permission.GATEWAY_WRITE))]
GatewayReader = Annotated[Access, Depends(require(Permission.PROJECT_READ))]
EnvironmentFilter = Annotated[str | None, Query(max_length=64)]


def overview_window(window: Window) -> TimeWindow:
    """The shared `from`/`to` window, narrowed to the week the overview reads from raw spans."""
    if window.length > MAX_OVERVIEW_WINDOW:
        raise ProblemError(
            422,
            "VALIDATION_ERROR",
            "The gateway overview window may span at most 7 days.",
            errors=[FieldError(field="from", message="window exceeds 7 days")],
        )
    return window


OverviewWindow = Annotated[TimeWindow, Depends(overview_window)]


@router.get("/overview", response_model=GatewayOverviewOut, summary="Gateway traffic overview")
async def overview(
    project_id: uuid.UUID,
    access: GatewayReader,
    db: DbSession,
    window: OverviewWindow,
    environment: EnvironmentFilter = None,
) -> GatewayOverviewOut:
    """Requests, errors, cache, fallbacks, latency and usage per target and key.

    Counts every call that came through a gateway key, Lab faults included (`faults` says how
    many). At most 7 days; longer is `422`.
    """
    project = access.require_project()
    return await overview_service.overview(db, project.id, access.org.id, window, environment)


@router.post(
    "/cache/purge",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Purge the gateway response cache",
)
async def purge_cache(
    project_id: uuid.UUID, request: Request, access: GatewayWriter, db: DbSession
) -> None:
    """Delete every cached response of the project, whatever key stored it.

    Idempotent: purging an empty cache succeeds. The audit event records how many entries went.
    """
    locked_project_id = await lock_project_of(access, db)
    deleted = await cache_service.purge_cache(
        db, access.org.id, locked_project_id, access.user_id, ip=client_ip(request)
    )
    await db.commit()
    logger.info(
        "gateway_cache_purged",
        org_id=str(access.org.id),
        project_id=str(locked_project_id),
        deleted=deleted,
    )
