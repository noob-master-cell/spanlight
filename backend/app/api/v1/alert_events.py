"""Alert events: each time a rule fired, until it resolved.

Members list events (`project:read`), budgets' events included; owners and admins acknowledge
them (`alerts:write`), open or resolved, once.
"""

import uuid
from typing import Annotated, Literal

import structlog
from fastapi import APIRouter, Depends, Query, Request

from app.alerts import rules_queries, rules_service
from app.alerts.rule_errors import AlreadyAcknowledgedError, EventNotFoundError
from app.alerts.rules_queries import EventRow
from app.api.deps import Access, ClockDep, DbSession, client_ip, require
from app.api.locks import lock_project_of
from app.api.schemas import AlertEventOut, Page, UserOut
from app.core.errors import conflict, not_found
from app.core.pagination import DEFAULT_PAGE_SIZE, PageLimit, decode_uuid_cursor, encode_cursor
from app.core.permissions import Permission

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/projects/{project_id}/alert-events", tags=["alerts"])

EventReader = Annotated[Access, Depends(require(Permission.PROJECT_READ))]
EventWriter = Annotated[Access, Depends(require(Permission.ALERTS_WRITE))]

EventStateFilter = Literal["firing", "resolved"]


def _event_out(row: EventRow) -> AlertEventOut:
    event, rule, acknowledger = row
    return AlertEventOut(
        id=event.id,
        rule_id=event.rule_id,
        rule_name=rule.name,
        rule_kind=rule.kind,
        state="firing" if event.resolved_at is None else "resolved",
        value=event.value,
        threshold=event.threshold,
        started_at=event.started_at,
        resolved_at=event.resolved_at,
        acknowledged_by=UserOut.model_validate(acknowledger) if acknowledger else None,
        acknowledged_at=event.acknowledged_at,
    )


@router.get("", response_model=Page[AlertEventOut], summary="List alert events")
async def list_events(
    project_id: uuid.UUID,
    access: EventReader,
    db: DbSession,
    rule_id: Annotated[uuid.UUID | None, Query()] = None,
    state: Annotated[EventStateFilter | None, Query()] = None,
    limit: PageLimit = DEFAULT_PAGE_SIZE,
    cursor: Annotated[str | None, Query()] = None,
) -> Page[AlertEventOut]:
    """Newest first. `state=firing` keeps open events, `state=resolved` resolved ones."""
    rows = await rules_queries.list_events(
        db,
        access.require_project().id,
        rule_id=rule_id,
        firing=None if state is None else state == "firing",
        after=decode_uuid_cursor(cursor) if cursor else None,
        limit=limit,
    )
    page = rows[:limit]
    next_cursor = None
    if len(rows) > limit:
        last = page[-1][0]
        next_cursor = encode_cursor(last.started_at, str(last.id))
    return Page(items=[_event_out(row) for row in page], next_cursor=next_cursor)


@router.post(
    "/{event_id}/acknowledge", response_model=AlertEventOut, summary="Acknowledge an alert event"
)
async def acknowledge_event(
    project_id: uuid.UUID,
    event_id: uuid.UUID,
    request: Request,
    access: EventWriter,
    db: DbSession,
    clock: ClockDep,
) -> AlertEventOut:
    """Record that you have seen the event. `409 ALREADY_ACKNOWLEDGED` the second time."""
    locked_project_id = await lock_project_of(access, db)
    try:
        await rules_service.acknowledge_event(
            db,
            access.org.id,
            locked_project_id,
            event_id,
            access.user_id,
            now=clock(),
            ip=client_ip(request),
        )
    except EventNotFoundError:
        raise not_found() from None
    except AlreadyAcknowledgedError:
        raise conflict(
            "ALREADY_ACKNOWLEDGED", "Someone has already acknowledged this alert."
        ) from None
    found = await rules_queries.get_event(db, locked_project_id, event_id)
    if found is None:
        raise not_found()
    acknowledged = _event_out(found)
    await db.commit()
    logger.info(
        "alert_event_acknowledged",
        org_id=str(access.org.id),
        project_id=str(locked_project_id),
        event_id=str(event_id),
    )
    return acknowledged
