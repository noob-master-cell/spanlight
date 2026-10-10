"""Alert rules: what a project watches, and the preview the rule editor draws.

Members list and read rules and draw previews (`project:read`); owners and admins create, edit,
mute and delete them (`alerts:write`). The rules a budget owns (`kind: budget`) are not listed
here and are `404` on every rule route: they change only through their budget. Responses are
built before the commit, which ends the project binding that row-level security needs.
"""

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Request, status

from app.alerts import rules_queries, rules_service
from app.alerts.preview import preview_rule
from app.alerts.rule_errors import (
    InvalidMuteError,
    RuleLimitError,
    RuleNotFoundError,
    UnknownChannelError,
)
from app.api.deps import Access, ClockDep, DbSession, SettingsDep, client_ip, require
from app.api.locks import lock_project_of
from app.api.schemas import (
    AlertRuleOut,
    AlertRuleStateOut,
    MuteRequest,
    RuleDefinition,
    RulePreviewOut,
    RulePreviewPoint,
    RuleSpec,
)
from app.core.errors import FieldError, ProblemError, not_found
from app.core.permissions import Permission
from app.core.ratelimit import PostgresTokenBucket, enforce_rate_limit
from app.db.models import AlertRule, AlertState

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/projects/{project_id}/alert-rules", tags=["alerts"])

RuleReader = Annotated[Access, Depends(require(Permission.PROJECT_READ))]
RuleWriter = Annotated[Access, Depends(require(Permission.ALERTS_WRITE))]

PREVIEW_LIMITER = PostgresTokenBucket(rate=30 / 60, burst=30)
"""Per user: 30 previews, refilling at 30 a minute."""

RULE_ERRORS = (RuleNotFoundError, RuleLimitError, UnknownChannelError, InvalidMuteError)


def _rule_problem(error: Exception) -> ProblemError:
    """The problem response for an error the rule service raises."""
    if isinstance(error, RuleNotFoundError):
        return not_found()
    if isinstance(error, RuleLimitError):
        return ProblemError(
            422, "LIMIT_EXCEEDED", f"A project can have at most {error.limit} alert rules."
        )
    if isinstance(error, UnknownChannelError):
        listed = ", ".join(str(channel_id) for channel_id in error.channel_ids)
        return ProblemError(
            422,
            "UNKNOWN_CHANNEL",
            "A rule can only notify channels of this organization.",
            errors=[FieldError(field="channel_ids", message=f"Not a channel here: {listed}")],
        )
    if isinstance(error, InvalidMuteError):
        return ProblemError(
            422,
            "VALIDATION_ERROR",
            "The request is invalid.",
            errors=[FieldError(field="until", message=str(error))],
        )
    raise error


def _rule_out(rule: AlertRule, state: AlertState | None) -> AlertRuleOut:
    state_out = AlertRuleStateOut.model_validate(state) if state is not None else None
    return AlertRuleOut.model_validate(rule).model_copy(update={"state": state_out})


def _log(event: str, access: Access, rule_id: uuid.UUID, **fields: object) -> None:
    logger.info(
        event,
        org_id=str(access.org.id),
        project_id=str(access.require_project().id),
        rule_id=str(rule_id),
        **fields,
    )


@router.get("", response_model=list[AlertRuleOut], summary="List alert rules")
async def list_rules(
    project_id: uuid.UUID, access: RuleReader, db: DbSession
) -> list[AlertRuleOut]:
    """Firing rules first, then by name. Unpaginated: a project has at most 100 rules."""
    rows = await rules_queries.list_rules(db, access.require_project().id)
    return [_rule_out(rule, state) for rule, state in rows]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=AlertRuleOut,
    summary="Add an alert rule",
)
async def create_rule(
    project_id: uuid.UUID,
    body: RuleSpec,
    request: Request,
    access: RuleWriter,
    db: DbSession,
    clock: ClockDep,
) -> AlertRuleOut:
    """Store a rule. `422 UNKNOWN_CHANNEL` for a channel outside the organization; `422
    LIMIT_EXCEEDED` past 100 rules (budgets' rules do not count)."""
    locked_project_id = await lock_project_of(access, db)
    try:
        rule = await rules_service.create_rule(
            db,
            access.org.id,
            locked_project_id,
            access.user_id,
            body,
            now=clock(),
            ip=client_ip(request),
        )
    except RULE_ERRORS as error:
        raise _rule_problem(error) from None
    created = _rule_out(rule, None)
    await db.commit()
    _log("alert_rule_created", access, rule.id, kind=rule.kind.value, metric=rule.metric.value)
    return created


@router.post("/preview", response_model=RulePreviewOut, summary="Preview an alert rule")
async def preview(
    project_id: uuid.UUID,
    body: RuleDefinition,
    request: Request,
    access: RuleReader,
    db: DbSession,
    clock: ClockDep,
) -> RulePreviewOut:
    """What the rule would have measured over the last 7 days, one point per window (at least
    an hour apart, at most 168 points), with its line at each point.

    Reads only; at most 30 previews per person a minute (`429 RATE_LIMITED`).
    """
    await enforce_rate_limit(
        request,
        PREVIEW_LIMITER,
        f"alert-preview:{access.user_id}",
        scope="alert_preview",
        detail="You drew 30 rule previews in the last minute. Try again in a moment.",
    )
    result = await preview_rule(db, access.require_project().id, body, now=clock())
    return RulePreviewOut(
        points=[
            RulePreviewPoint(
                window_end=point.window_end, value=point.value, threshold=point.threshold
            )
            for point in result.points
        ],
        approximate=result.approximate,
    )


@router.get("/{rule_id}", response_model=AlertRuleOut, summary="Get an alert rule")
async def get_rule(
    project_id: uuid.UUID, rule_id: uuid.UUID, access: RuleReader, db: DbSession
) -> AlertRuleOut:
    found = await rules_queries.get_rule(db, access.require_project().id, rule_id)
    if found is None:
        raise not_found()
    return _rule_out(*found)


@router.patch("/{rule_id}", response_model=AlertRuleOut, summary="Edit an alert rule")
async def update_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    body: RuleSpec,
    request: Request,
    access: RuleWriter,
    db: DbSession,
    clock: ClockDep,
    settings: SettingsDep,
) -> AlertRuleOut:
    """Replace the rule with the whole rule sent; its kind may change. Errors as for the create.

    Changing what a firing rule measures or judges, or disabling it, resolves its alert first
    and sends `alert.resolved`; renaming it or changing its channels or cooldown does not.
    """
    locked_project_id = await lock_project_of(access, db)
    try:
        rule = await rules_service.update_rule(
            db,
            access.org.id,
            locked_project_id,
            rule_id,
            access.user_id,
            body,
            now=clock(),
            ip=client_ip(request),
            settings=settings,
        )
    except RULE_ERRORS as error:
        raise _rule_problem(error) from None
    updated = _rule_out(rule, await rules_queries.get_state(db, rule.id))
    await db.commit()
    _log("alert_rule_updated", access, rule.id)
    return updated


@router.post("/{rule_id}/mute", response_model=AlertRuleOut, summary="Mute an alert rule")
async def mute_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    body: MuteRequest,
    request: Request,
    access: RuleWriter,
    db: DbSession,
    clock: ClockDep,
) -> AlertRuleOut:
    """Stop the rule's notifications until `until` (at most 30 days ahead); `null` unmutes.

    A muted rule still fires, resolves and records its events.
    """
    locked_project_id = await lock_project_of(access, db)
    try:
        rule = await rules_service.mute_rule(
            db,
            access.org.id,
            locked_project_id,
            rule_id,
            access.user_id,
            body.until,
            now=clock(),
            ip=client_ip(request),
        )
    except RULE_ERRORS as error:
        raise _rule_problem(error) from None
    muted = _rule_out(rule, await rules_queries.get_state(db, rule.id))
    await db.commit()
    _log("alert_rule_muted", access, rule.id, muted=body.until is not None)
    return muted


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an alert rule")
async def delete_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    request: Request,
    access: RuleWriter,
    db: DbSession,
    clock: ClockDep,
    settings: SettingsDep,
) -> None:
    """Delete the rule with its state and events. A firing alert is resolved first and sends
    `alert.resolved`. Notifications already queued still go out."""
    locked_project_id = await lock_project_of(access, db)
    try:
        await rules_service.delete_rule(
            db,
            access.org.id,
            locked_project_id,
            rule_id,
            access.user_id,
            now=clock(),
            ip=client_ip(request),
            settings=settings,
        )
    except RULE_ERRORS as error:
        raise _rule_problem(error) from None
    await db.commit()
    _log("alert_rule_deleted", access, rule_id)
