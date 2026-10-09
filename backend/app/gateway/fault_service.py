"""Fault profiles: create, edit and delete them. Callers commit.

Attaching a profile to a key is the key service's job (`key_service.update_key`), which also
enforces that no profile runs on a production key. Deleting a profile detaches its keys through
the foreign key's `ON DELETE SET NULL`.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import FieldError
from app.db.errors import violated_constraint
from app.db.models import AuditAction, FaultProfile
from app.gateway import fault_queries
from app.gateway.fault_errors import (
    FaultProfileNameTakenError,
    FaultProfileNotFoundError,
    InvalidFaultProfileError,
)
from app.gateway.fault_params import default_params, stored_params
from app.gateway.fault_schemas import FaultProfileCreate, FaultProfileUpdate
from app.services.audit import record_audit

NAME_CONSTRAINT = "fault_profiles_project_name_key"


async def create_profile(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    data: FaultProfileCreate,
    *,
    now: datetime,
    ip: str | None = None,
) -> FaultProfile:
    """Store a new profile. Raises `InvalidFaultProfileError` and `FaultProfileNameTakenError`."""
    _check_expiry(data.expires_at, now)
    profile = FaultProfile(
        project_id=project_id,
        name=data.name,
        scenario=data.scenario,
        params=stored_params(data.params),
        probability=data.probability,
        enabled=data.enabled,
        expires_at=data.expires_at,
        created_by=actor_id,
        created_at=now,
        updated_at=now,
    )
    await _flush_profile(db, profile)
    await _audit(
        db,
        org_id,
        actor_id,
        AuditAction.FAULT_PROFILE_CREATE,
        profile,
        ip,
        {
            "scenario": profile.scenario.value,
            "params": profile.params,
            "probability": data.probability,
            "enabled": profile.enabled,
            "expires_at": _jsonable(profile.expires_at),
        },
    )
    return profile


async def update_profile(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    profile_id: uuid.UUID,
    actor_id: uuid.UUID,
    data: FaultProfileUpdate,
    *,
    now: datetime,
    ip: str | None = None,
) -> FaultProfile:
    """Apply the fields `data` carries. An edit that changes nothing audits nothing.

    Raises `FaultProfileNotFoundError`, `InvalidFaultProfileError` (an `expires_at` that is not
    in the future) and `FaultProfileNameTakenError`.
    """
    profile = await fault_queries.lock_profile(db, project_id, profile_id, exclusive=False)
    if profile is None:
        raise FaultProfileNotFoundError
    sent = data.changes()
    if "params" not in sent and sent.get("scenario", profile.scenario) != profile.scenario:
        # Params belong to a scenario: a different scenario starts from its defaults.
        sent["params"] = default_params(sent["scenario"])
    if "params" in sent:
        sent["params"] = stored_params(sent["params"])
    changed = {
        field: value for field, value in sent.items() if _stored_value(profile, field) != value
    }
    if not changed:
        return profile
    if changed.get("expires_at") is not None:
        _check_expiry(changed["expires_at"], now)
    for field, value in changed.items():
        setattr(profile, field, value)
    profile.updated_at = now
    await _flush_profile(db, profile)
    await _audit(
        db,
        org_id,
        actor_id,
        AuditAction.FAULT_PROFILE_UPDATE,
        profile,
        ip,
        {"changes": {field: _jsonable(value) for field, value in changed.items()}},
    )
    return profile


async def delete_profile(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    profile_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    ip: str | None = None,
) -> None:
    """Delete the profile; keys that ran it run nothing. Raises `FaultProfileNotFoundError`."""
    profile = await fault_queries.lock_profile(db, project_id, profile_id)
    if profile is None:
        raise FaultProfileNotFoundError
    attached = (await fault_queries.attached_key_ids(db, project_id)).get(profile.id, [])
    await _audit(
        db,
        org_id,
        actor_id,
        AuditAction.FAULT_PROFILE_DELETE,
        profile,
        ip,
        {"scenario": profile.scenario.value, "detached_key_ids": [str(id_) for id_ in attached]},
    )
    await db.delete(profile)
    await db.flush()


def _check_expiry(expires_at: datetime | None, now: datetime) -> None:
    if expires_at is not None and expires_at <= now:
        raise InvalidFaultProfileError(
            [FieldError(field="expires_at", message="must be in the future")]
        )


def _stored_value(profile: FaultProfile, field: str) -> Any:
    value = getattr(profile, field)
    # `probability` is a Decimal in the row and a float in the request.
    return float(value) if field == "probability" else value


async def _flush_profile(db: AsyncSession, profile: FaultProfile) -> None:
    try:
        # The flush is inside the savepoint, so a duplicate name rolls back to it and leaves
        # the outer transaction usable (opening the savepoint would flush first, outside it).
        async with db.begin_nested():
            db.add(profile)
            await db.flush()
    except IntegrityError as error:
        if violated_constraint(error) == NAME_CONSTRAINT:
            raise FaultProfileNameTakenError from None
        raise


async def _audit(
    db: AsyncSession,
    org_id: uuid.UUID,
    actor_id: uuid.UUID,
    action: AuditAction,
    profile: FaultProfile,
    ip: str | None,
    metadata: dict[str, Any],
) -> None:
    await record_audit(
        db,
        org_id=org_id,
        actor_user_id=actor_id,
        action=action,
        target_type="fault_profile",
        target_id=profile.id,
        ip=ip,
        metadata={"name": profile.name, "project_id": str(profile.project_id), **metadata},
    )


def _jsonable(value: object) -> object:
    return value.isoformat() if isinstance(value, datetime) else value
