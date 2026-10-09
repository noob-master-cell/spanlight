"""Gateway routes: create, edit, revert, make default and delete them. Callers commit.

Every save of a route's config, its creation included, is kept as a numbered version, so the
history is complete and a revert is just another save. How a config is checked against the
database and saved as the next version is in `route_versions`.

Every write here ends with an audit event, so the caller share-locks the organization and the
project first (`app.services.deletion.lock_project_for_write`), before any route row: the lock
order that keeps a concurrent project or organization deletion from deadlocking with it.
"""

import uuid
from datetime import datetime

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.errors import violated_constraint
from app.db.models import AuditAction, GatewayRoute
from app.gateway import key_service, route_queries, route_versions
from app.gateway.route_config import RouteConfig
from app.gateway.route_errors import (
    RouteInUseError,
    RouteNameTakenError,
    RouteNotFoundError,
    RouteVersionNotFoundError,
)
from app.services.audit import record_audit

NAME_CONSTRAINT = "gateway_routes_project_name_key"
DEFAULT_INDEX = "gateway_routes_one_default_idx"


async def create_route(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    name: str,
    config: RouteConfig,
    *,
    now: datetime,
    ip: str | None = None,
) -> GatewayRoute:
    """Store the route as version 1. The project's first route becomes its default.

    Raises `InvalidRouteConfigError` and `RouteNameTakenError`.
    """
    await route_versions.check_credentials(db, org_id, config)
    stored = config.model_dump(mode="json")
    is_default = not await route_queries.project_has_routes(db, project_id)
    route = _new_route(project_id, actor_id, name, stored, is_default=is_default, now=now)
    try:
        await _insert_route(db, route)
    except IntegrityError as error:
        if not (is_default and violated_constraint(error) == DEFAULT_INDEX):
            raise
        # A concurrent request created the project's first route a moment earlier, and so the
        # default; this one is an ordinary route.
        route = _new_route(project_id, actor_id, name, stored, is_default=False, now=now)
        await _insert_route(db, route)
    db.add(route_versions.version_row(route, actor_id, now=now))
    await db.flush()
    await _audit(
        db,
        org_id,
        actor_id,
        AuditAction.GATEWAY_ROUTE_CREATE,
        route,
        ip,
        {"name": route.name, "version": route.version, "is_default": route.is_default},
    )
    return route


async def update_route(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    route_id: uuid.UUID,
    actor_id: uuid.UUID,
    config: RouteConfig,
    expected_version: int,
    *,
    now: datetime,
    ip: str | None = None,
) -> GatewayRoute:
    """Save `config` as the next version, if the route is still at `expected_version`.

    Raises `InvalidRouteConfigError`, `RouteNotFoundError` and `RouteVersionConflictError`.
    """
    await route_versions.check_credentials(db, org_id, config)
    route = await route_versions.save_version(
        db, project_id, route_id, actor_id, config, expected_version=expected_version, now=now
    )
    await _audit(
        db,
        org_id,
        actor_id,
        AuditAction.GATEWAY_ROUTE_UPDATE,
        route,
        ip,
        {"version": route.version},
    )
    return route


async def revert_route(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    route_id: uuid.UUID,
    actor_id: uuid.UUID,
    version: int,
    *,
    now: datetime,
    ip: str | None = None,
) -> GatewayRoute:
    """Save the config of an earlier `version` again, as a new version.

    The old config is validated as a new one would be: a credential deleted since then, or a
    rule tightened since then, refuses the revert. Raises `RouteNotFoundError`,
    `RouteVersionNotFoundError` and `InvalidRouteConfigError`.
    """
    if await route_queries.route_version(db, project_id, route_id) is None:
        raise RouteNotFoundError
    saved = await route_queries.get_route_version(db, project_id, route_id, version)
    if saved is None:
        raise RouteVersionNotFoundError(version)
    config = route_versions.parse_saved(saved)
    await route_versions.check_credentials(db, org_id, config)
    route = await route_versions.save_version(
        db, project_id, route_id, actor_id, config, expected_version=None, now=now
    )
    await _audit(
        db,
        org_id,
        actor_id,
        AuditAction.GATEWAY_ROUTE_REVERT,
        route,
        ip,
        {"version": route.version, "from_version": version},
    )
    return route


async def set_default_route(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    route_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    ip: str | None = None,
) -> GatewayRoute:
    """Make the route the project's default, the one keys without a route of their own use.

    Not a config save: `version`, `updated_by` and `updated_at` stay as they are. Making the
    default route the default again changes nothing and audits nothing. Raises
    `RouteNotFoundError`.
    """
    if route_id not in await route_queries.lock_project_routes(db, project_id):
        raise RouteNotFoundError
    route = await route_queries.get_route(db, project_id, route_id)
    if route is None:
        raise RouteNotFoundError
    if route.is_default:
        return route
    # The old default is cleared first: the partial unique index allows one default at a time.
    await db.execute(
        update(GatewayRoute)
        .where(GatewayRoute.project_id == project_id, GatewayRoute.is_default)
        .values(is_default=False)
    )
    route.is_default = True
    await db.flush()
    await _audit(
        db, org_id, actor_id, AuditAction.GATEWAY_ROUTE_UPDATE, route, ip, {"is_default": True}
    )
    return route


async def delete_route(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    route_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    ip: str | None = None,
) -> None:
    """Delete the route and its history. Raises `RouteNotFoundError` and `RouteInUseError`.

    Deleting the default route leaves the project without one until another is made default.
    """
    route = await route_queries.lock_route(db, project_id, route_id)
    if route is None:
        raise RouteNotFoundError
    key_name = await route_queries.route_in_use(db, route.id)
    if key_name is not None:
        raise RouteInUseError(route.name, key_name)
    # Revoked keys may still name the route; the foreign key would refuse the delete.
    await key_service.release_route(db, project_id, route.id)
    await _audit(
        db,
        org_id,
        actor_id,
        AuditAction.GATEWAY_ROUTE_DELETE,
        route,
        ip,
        {"name": route.name, "version": route.version, "is_default": route.is_default},
    )
    await db.delete(route)
    await db.flush()


async def _audit(
    db: AsyncSession,
    org_id: uuid.UUID,
    actor_id: uuid.UUID,
    action: AuditAction,
    route: GatewayRoute,
    ip: str | None,
    metadata: dict[str, object],
) -> None:
    await record_audit(
        db,
        org_id=org_id,
        actor_user_id=actor_id,
        action=action,
        target_type="gateway_route",
        target_id=route.id,
        ip=ip,
        metadata=metadata,
    )


def _new_route(
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    name: str,
    stored: dict[str, object],
    *,
    is_default: bool,
    now: datetime,
) -> GatewayRoute:
    return GatewayRoute(
        project_id=project_id,
        name=name,
        is_default=is_default,
        config=stored,
        version=1,
        updated_by=actor_id,
        created_at=now,
        updated_at=now,
    )


async def _insert_route(db: AsyncSession, route: GatewayRoute) -> None:
    try:
        async with db.begin_nested():
            db.add(route)
    except IntegrityError as error:
        if violated_constraint(error) == NAME_CONSTRAINT:
            raise RouteNameTakenError from None
        raise
