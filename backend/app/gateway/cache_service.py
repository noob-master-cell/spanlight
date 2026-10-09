"""Purging a project's gateway response cache. The caller commits.

The caller has share-locked the organization and the project (`lock_project_for_write`), so the
delete and its audit event follow the lock order of `app.services.deletion`. The router binds the
project for row-level security, as for every project route.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditAction
from app.gateway.cache import GatewayCache, PostgresGatewayCache
from app.services.audit import record_audit


async def purge_cache(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    ip: str | None = None,
    cache: GatewayCache | None = None,
) -> int:
    """Delete every cached response of the project and audit how many went. Returns the count."""
    deleted = await (cache or PostgresGatewayCache()).purge(db, project_id)
    await record_audit(
        db,
        org_id=org_id,
        actor_user_id=actor_id,
        action=AuditAction.GATEWAY_CACHE_PURGE,
        target_type="project",
        target_id=project_id,
        ip=ip,
        metadata={"deleted": deleted},
    )
    return deleted
