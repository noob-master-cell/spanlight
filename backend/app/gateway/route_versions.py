"""Checking a route config against the database and saving it as the route's next version.

Every save of a route's config bumps `version` and appends the config to
`gateway_route_versions`. The bump is a single `UPDATE ... WHERE version = :expected`, so of two
edits from the same version exactly one wins, with no read-then-write window.
"""

import uuid
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import FieldError
from app.db.models import GatewayRoute, GatewayRouteVersion
from app.gateway import queries, route_queries
from app.gateway.route_config import RouteConfig
from app.gateway.route_errors import (
    InvalidRouteConfigError,
    RouteNotFoundError,
    RouteVersionConflictError,
)

UNKNOWN_CREDENTIAL = "is not a provider credential of this organization"


async def check_credentials(db: AsyncSession, org_id: uuid.UUID, config: RouteConfig) -> None:
    """Raise `InvalidRouteConfigError` naming each target whose credential is not the org's.

    Field paths are relative to the request body (`config.targets.<i>.credential_id`), like the
    schema's own errors. A revert, whose body has no config, reports the same paths: they name
    the field of the saved config being reverted to.

    The credentials found are key-share locked until commit, so one deleted concurrently is
    either seen as gone here or sees this route when its deletion looks for routes that use it.
    """
    found = await queries.share_lock_credentials(db, org_id, config.credential_ids())
    errors = [
        FieldError(field=f"config.targets.{index}.credential_id", message=UNKNOWN_CREDENTIAL)
        for index, target in enumerate(config.targets)
        if target.credential_id not in found
    ]
    if errors:
        raise InvalidRouteConfigError(errors)


async def save_version(
    db: AsyncSession,
    project_id: uuid.UUID,
    route_id: uuid.UUID,
    actor_id: uuid.UUID,
    config: RouteConfig,
    *,
    expected_version: int | None,
    now: datetime,
) -> GatewayRoute:
    """Store `config` as the route's next version; with `expected_version`, only from that one.

    The row lock the UPDATE takes orders concurrent saves, so version numbers never collide.
    """
    stored = config.model_dump(mode="json")
    statement = (
        update(GatewayRoute)
        .where(GatewayRoute.project_id == project_id, GatewayRoute.id == route_id)
        .values(
            config=stored, version=GatewayRoute.version + 1, updated_by=actor_id, updated_at=now
        )
        .returning(GatewayRoute)
        .execution_options(populate_existing=True, synchronize_session=False)
    )
    if expected_version is not None:
        statement = statement.where(GatewayRoute.version == expected_version)
    route = await db.scalar(statement)
    if route is None:
        current = await route_queries.route_version(db, project_id, route_id)
        if current is None:
            raise RouteNotFoundError
        raise RouteVersionConflictError(current)
    db.add(version_row(route, actor_id, now=now))
    await db.flush()
    return route


def parse_saved(saved: GatewayRouteVersion) -> RouteConfig:
    """A saved version's config, validated as a new one would be.

    A rule tightened since it was saved refuses it with `InvalidRouteConfigError`, with field
    paths under `config.` as in `check_credentials`.
    """
    try:
        return RouteConfig.model_validate(saved.config)
    except ValidationError as error:
        raise InvalidRouteConfigError(
            [
                FieldError(
                    field=".".join(["config", *(str(part) for part in item["loc"])]),
                    message=item["msg"],
                )
                for item in error.errors()
            ]
        ) from None


def version_row(route: GatewayRoute, actor_id: uuid.UUID, *, now: datetime) -> GatewayRouteVersion:
    return GatewayRouteVersion(
        route_id=route.id,
        version=route.version,
        project_id=route.project_id,
        config=route.config,
        updated_by=actor_id,
        created_at=now,
    )
