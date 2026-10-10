"""Apply one state change of a rule: open or close its event and describe it as a payload.

The event row is written before the payload goes anywhere, and the payload's `event_id` is that
row's id: a deliverer may look the event up (PagerDuty skips a trigger whose event is gone or
resolved), and it must find it in the same transaction that queued the delivery.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Literal

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.evaluate import Transition
from app.alerts.evaluation_queries import ProjectNames, resolve_open_event
from app.alerts.payload import (
    AlertPayload,
    BudgetPayload,
    OrgRef,
    ProjectRef,
    RulePayload,
    budgets_url,
    rule_url,
)
from app.alerts.types import RuleStateName
from app.budgets.periods import next_reset
from app.core.ids import new_id
from app.db.models import AlertEvent, AlertRule, Budget

logger = structlog.get_logger(__name__)

EventName = Literal["alert.fired", "alert.resolved", "budget.exceeded"]


@dataclass(frozen=True, slots=True)
class EventFacts:
    """What a payload says about one event, apart from the rule and the project."""

    event: EventName
    event_id: uuid.UUID
    value: Decimal
    threshold: Decimal
    started_at: datetime
    resolved_at: datetime | None


def budget_payload(budget: Budget, spent: Decimal, now: datetime) -> BudgetPayload:
    """The `budget` part of a budget event: the budget as it is, and the spend measured at `now`.
    `resets_at` is the end of the period `now` falls in, the period that spend belongs to."""
    return BudgetPayload.model_validate(
        {
            "id": budget.id,
            "name": budget.name,
            "scope": budget.scope.value,
            "scope_id": budget.scope_id,
            "period": budget.period.value,
            "amount_usd": budget.amount_usd,
            "spent_usd": spent,
            "action": budget.action.value,
            "resets_at": next_reset(budget.period, now),
        }
    )


def build_payload(
    rule: AlertRule,
    names: ProjectNames,
    facts: EventFacts,
    *,
    now: datetime,
    app_base_url: str,
    budget: BudgetPayload | None = None,
) -> AlertPayload:
    """The `AlertPayload` of one event of `rule`. A budget event links to the budgets page."""
    url = (
        budgets_url(app_base_url, names.org_id, names.project_id)
        if budget is not None
        else rule_url(app_base_url, names.org_id, names.project_id, rule.id)
    )
    return AlertPayload(
        event=facts.event,
        event_id=facts.event_id,
        occurred_at=now,
        org=OrgRef(id=names.org_id, name=names.org_name),
        project=ProjectRef(id=names.project_id, name=names.project_name),
        rule=RulePayload(
            id=rule.id,
            name=rule.name,
            kind=rule.kind,
            metric=rule.metric,
            comparator=rule.comparator,
            threshold=rule.threshold,
            window_minutes=rule.window_minutes,
            filters={str(key): str(value) for key, value in rule.filters.items()},
        ),
        value=facts.value,
        threshold=facts.threshold,
        started_at=facts.started_at,
        resolved_at=facts.resolved_at,
        budget=budget,
        url=url,
    )


async def apply_transition(
    db: AsyncSession,
    rule: AlertRule,
    names: ProjectNames,
    transition: Transition,
    *,
    app_base_url: str,
    budget: BudgetPayload | None = None,
) -> AlertPayload | None:
    """Open the event (`ok -> firing`) or close the open one (`firing -> ok`) and return the
    payload to send; None when a resolve finds no open event (nothing to tell anyone about).

    Opening first closes an orphan open event (one left open while the state says `ok`) without
    telling anyone, so it cannot block every later fire; then it flushes the insert, so a second
    open event for the rule raises `IntegrityError` from the one-open-event index here, before
    anything is queued.
    """
    if transition.to_state is RuleStateName.FIRING:
        return await _open_event(db, rule, names, transition, app_base_url, budget)
    return await _close_event(db, rule, names, transition, app_base_url, budget)


async def _open_event(
    db: AsyncSession,
    rule: AlertRule,
    names: ProjectNames,
    transition: Transition,
    app_base_url: str,
    budget: BudgetPayload | None,
) -> AlertPayload:
    orphan = await resolve_open_event(db, rule, transition.at, not_before_start=True)
    if orphan is not None:
        logger.warning("alert_orphan_event_resolved", rule_id=str(rule.id), event_id=str(orphan.id))
    event_id = new_id()
    facts = EventFacts(
        event="budget.exceeded" if budget is not None else "alert.fired",
        event_id=event_id,
        value=transition.value,
        threshold=transition.threshold,
        started_at=transition.at,
        resolved_at=None,
    )
    payload = build_payload(
        rule, names, facts, now=transition.at, app_base_url=app_base_url, budget=budget
    )
    db.add(
        AlertEvent(
            id=event_id,
            project_id=rule.project_id,
            rule_id=rule.id,
            state=RuleStateName.FIRING,
            value=transition.value,
            threshold=transition.threshold,
            started_at=transition.at,
            payload=payload.to_json_dict(),
        )
    )
    await db.flush()
    return payload


async def _close_event(
    db: AsyncSession,
    rule: AlertRule,
    names: ProjectNames,
    transition: Transition,
    app_base_url: str,
    budget: BudgetPayload | None,
) -> AlertPayload | None:
    # Never before the event started: an api edit's clock may run behind the pass that opened it.
    event = await resolve_open_event(db, rule, transition.at, not_before_start=True)
    if event is None:
        logger.warning("alert_open_event_missing", rule_id=str(rule.id))
        return None
    facts = EventFacts(
        event="alert.resolved",
        event_id=event.id,
        value=transition.value,
        threshold=transition.threshold,
        started_at=event.started_at,
        resolved_at=event.resolved_at or transition.at,
    )
    return build_payload(
        rule, names, facts, now=transition.at, app_base_url=app_base_url, budget=budget
    )
