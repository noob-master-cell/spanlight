"""Audit trail writes. Callers commit as part of the audited change."""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditAction, AuditEvent, Membership


async def record_audit(
    db: AsyncSession,
    *,
    org_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    action: AuditAction,
    target_type: str,
    target_id: str | uuid.UUID,
    ip: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditEvent(
            org_id=org_id,
            actor_user_id=actor_user_id,
            action=action.value,
            target_type=target_type,
            target_id=str(target_id),
            ip=ip,
            metadata_=metadata or {},
        )
    )
    await db.flush()


async def record_user_audit_in_each_org(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    action: AuditAction,
    ip: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Audit a change to a person's own account in every org they belong to.

    Account changes (a password reset, a linked sign-in provider) belong to no single org, and
    each org's audit log should show what happened to its members. The user is the actor and
    the target. A user in no org leaves no event: the audit log is per org.
    """
    org_ids = (
        await db.scalars(select(Membership.org_id).where(Membership.user_id == user_id))
    ).all()
    for org_id in org_ids:
        await record_audit(
            db,
            org_id=org_id,
            actor_user_id=user_id,
            action=action,
            target_type="user",
            target_id=user_id,
            ip=ip,
            metadata=metadata,
        )
