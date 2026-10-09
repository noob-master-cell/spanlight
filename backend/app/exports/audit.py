"""The audit log's filters and its CSV export.

`GET /orgs/{id}/audit` and `GET /orgs/{id}/audit/export.csv` take the same filters, so the file
holds what the filtered list shows. The CSV is streamed in keyset batches, so a large log never
sits in memory.
"""

import json
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated

from fastapi import Depends, Query
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import aliased
from sqlalchemy.sql.elements import ColumnElement

from app.core.errors import FieldError, ProblemError
from app.db.models import AuditEvent, User
from app.exports.schemas import as_utc
from app.exports.writers import csv_line

# More matching events than this and the CSV is refused with `EXPORT_TOO_LARGE`.
MAX_AUDIT_EXPORT_ROWS = 50_000
AUDIT_BATCH_SIZE = 1000

AUDIT_CSV_COLUMNS: tuple[str, ...] = (
    "id",
    "created_at",
    "action",
    "actor_id",
    "actor_email",
    "target_type",
    "target_id",
    "ip",
    "metadata",
)


@dataclass(frozen=True)
class AuditFilters:
    action: str | None = None
    actor_id: uuid.UUID | None = None
    from_: datetime | None = None
    to: datetime | None = None

    def conditions(self, org_id: uuid.UUID) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [AuditEvent.org_id == org_id]
        if self.action is not None:
            conditions.append(AuditEvent.action == self.action)
        if self.actor_id is not None:
            conditions.append(AuditEvent.actor_user_id == self.actor_id)
        if self.from_ is not None:
            conditions.append(AuditEvent.created_at >= self.from_)
        if self.to is not None:
            conditions.append(AuditEvent.created_at < self.to)
        return conditions


def audit_filters(
    action: Annotated[str | None, Query(min_length=1, max_length=100)] = None,
    actor_id: Annotated[uuid.UUID | None, Query()] = None,
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: Annotated[datetime | None, Query()] = None,
) -> AuditFilters:
    """The `action`, `actor_id`, `from` and `to` query parameters; `from` is inclusive, `to` not."""
    start = as_utc(from_) if from_ else None
    end = as_utc(to) if to else None
    if start is not None and end is not None and start >= end:
        raise ProblemError(
            422,
            "VALIDATION_ERROR",
            "`from` must be earlier than `to`.",
            errors=[FieldError(field="from", message="must be earlier than `to`")],
        )
    return AuditFilters(action=action, actor_id=actor_id, from_=start, to=end)


AuditQuery = Annotated[AuditFilters, Depends(audit_filters)]


def too_large() -> ProblemError:
    return ProblemError(
        422,
        "EXPORT_TOO_LARGE",
        f"More than {MAX_AUDIT_EXPORT_ROWS:,} audit events match. Narrow the export with "
        "`from`, `to`, `action` or `actor_id`.",
    )


async def count_events_up_to(
    db: AsyncSession, org_id: uuid.UUID, filters: AuditFilters, cap: int
) -> int:
    """How many events match, counting no further than `cap + 1`."""
    limited = select(AuditEvent.id).where(*filters.conditions(org_id)).limit(cap + 1)
    return int(await db.scalar(select(func.count()).select_from(limited.subquery())) or 0)


def _batch_query(
    org_id: uuid.UUID, filters: AuditFilters, after: tuple[datetime, uuid.UUID] | None
) -> Select[AuditEvent, User]:
    actor = aliased(User)
    query = (
        select(AuditEvent, actor)
        .outerjoin(actor, actor.id == AuditEvent.actor_user_id)
        .where(*filters.conditions(org_id))
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .limit(AUDIT_BATCH_SIZE)
    )
    if after is not None:
        created_at, event_id = after
        query = query.where(
            or_(
                AuditEvent.created_at < created_at,
                and_(AuditEvent.created_at == created_at, AuditEvent.id < event_id),
            )
        )
    return query


def _event_line(event: AuditEvent, actor: User | None) -> bytes:
    return csv_line(
        (
            str(event.id),
            event.created_at.isoformat(),
            event.action,
            str(event.actor_user_id) if event.actor_user_id else "",
            actor.email if actor else "",
            event.target_type,
            event.target_id,
            str(event.ip) if event.ip else "",
            json.dumps(event.metadata_, ensure_ascii=False, separators=(",", ":")),
        )
    )


async def stream_audit_csv(
    session_factory: async_sessionmaker[AsyncSession], org_id: uuid.UUID, filters: AuditFilters
) -> AsyncIterator[bytes]:
    """The audit log as CSV, newest first, one chunk per batch.

    It opens a session of its own: a response body is produced after the request's session
    dependency has finished, so the request's session cannot be relied on here. The caller has
    already authorized `org_id` and counted the rows.
    """
    yield csv_line(AUDIT_CSV_COLUMNS)
    after: tuple[datetime, uuid.UUID] | None = None
    while True:
        async with session_factory() as db:
            rows = (await db.execute(_batch_query(org_id, filters, after))).all()
        if not rows:
            return
        yield b"".join(_event_line(event, actor) for event, actor in rows)
        if len(rows) < AUDIT_BATCH_SIZE:
            return
        last = rows[-1][0]
        after = (last.created_at, last.id)
