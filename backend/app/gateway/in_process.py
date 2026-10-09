"""Gateway contexts for callers inside Spanlight, which have no gateway key.

Later explanations, the playground, judges and experiments will call `execute` through one of
the project's routes with `key=None`: no rate limits, cache or faults apply, and the caller names
the trace's environment. Nothing calls `context_for_project` yet: the demo job uses its own
gateway key (`app.services.demo_gateway`), so its calls are attributed to that key. The module is
kept as the in-process contract those later callers build on.
"""

import random
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import GatewayRoute, Project, ProviderCredential
from app.db.rls import bind_project
from app.gateway.context import GatewayContext, GatewayServices, new_rng
from app.gateway.route_config import load_stored
from app.gateway.route_errors import RouteNotFoundError


async def context_for_project(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    route_id: uuid.UUID | None,
    environment: str,
    services: GatewayServices,
    rng: random.Random | None = None,
) -> GatewayContext:
    """The context of an in-process gateway call (`key=None`) through one of the project's routes.

    For callers inside Spanlight (the demo job, explanations, the playground): no rate limits,
    cache or faults apply, and `environment` labels the trace. `route_id` None means the
    project's default route. Binds the project on `db`; reads only. Raises `RouteNotFoundError`
    when the project, the route or (for None) a default route is missing.
    """
    await bind_project(db, project_id)
    project = await db.scalar(select(Project).where(Project.id == project_id))
    if project is None:
        raise RouteNotFoundError
    which = GatewayRoute.is_default.is_(True) if route_id is None else GatewayRoute.id == route_id
    route = await db.scalar(
        select(GatewayRoute).where(GatewayRoute.project_id == project_id, which)
    )
    if route is None:
        raise RouteNotFoundError
    config = load_stored(route.config)
    credentials = await db.scalars(
        select(ProviderCredential).where(
            ProviderCredential.org_id == project.org_id,
            ProviderCredential.id.in_(config.credential_ids()),
        )
    )
    return GatewayContext(
        key=None,
        project_id=project.id,
        org_id=project.org_id,
        environment=environment,
        route=config,
        route_id=route.id,
        route_name=route.name,
        route_version=route.version,
        credentials={credential.id: credential for credential in credentials},
        capture_payloads=project.capture_payloads,
        budget_guard=services.budget_guard,
        cache=services.cache,
        http=services.http,
        sessions=services.sessions,
        settings=services.settings,
        rng=rng if rng is not None else new_rng(),
    )
