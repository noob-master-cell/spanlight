"""Alert rules and events: create, edit, mute and delete rules; acknowledge events. Callers
commit.

Every write runs in a transaction bound to the project (row-level security), takes the project's
write lock first (`lock_project_for_write`, through the router), then the rule or event row,
then writes the audit event: the lock order of `app.services.deletion`. The project lock conflicts
with itself, so two creates in one project run one after the other and cannot both pass the rule
limit. Budget rules are out of reach here: their budget manages them, and every lookup treats
them as missing.

Audit metadata holds the rule's name, kind and metric and the names of the fields that changed;
rules carry no secrets.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts import rules_queries as queries
from app.alerts.evaluation import close_firing_alert
from app.alerts.rule_errors import (
    AlreadyAcknowledgedError,
    EventNotFoundError,
    InvalidMuteError,
    RuleLimitError,
    RuleNotFoundError,
    UnknownChannelError,
)
from app.alerts.rule_spec import RuleSpec
from app.config import Settings
from app.db.models import AlertEvent, AlertRule, AuditAction
from app.services.audit import record_audit

# Budget rules do not count: budgets have their own limit (50 per project).
MAX_RULES_PER_PROJECT = 100
# Changing any of these makes the rule measure or judge something else, so a firing alert under
# the old definition is resolved first. The name, the channels and the cooldown are not among them.
DEFINITION_COLUMNS = frozenset(
    {
        "kind",
        "metric",
        "comparator",
        "threshold",
        "window_minutes",
        "filters",
        "baseline_windows",
        "sensitivity",
    }
)
MAX_MUTE = timedelta(days=30)


async def check_channels(db: AsyncSession, org_id: uuid.UUID, spec: RuleSpec) -> None:
    """Every channel the rule names is a channel of the organization, or `UnknownChannelError`."""
    known = await queries.org_channel_ids(db, org_id, spec.channel_ids)
    unknown = [channel_id for channel_id in spec.channel_ids if channel_id not in known]
    if unknown:
        raise UnknownChannelError(unknown)


async def create_rule(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    actor_id: uuid.UUID,
    spec: RuleSpec,
    *,
    now: datetime,
    ip: str | None = None,
) -> AlertRule:
    """Store a new rule. The caller holds the project's write lock.

    Raises `UnknownChannelError` and `RuleLimitError`.
    """
    await check_channels(db, org_id, spec)
    if await queries.count_rules(db, project_id) >= MAX_RULES_PER_PROJECT:
        raise RuleLimitError(MAX_RULES_PER_PROJECT)
    rule = AlertRule(
        project_id=project_id,
        created_by=actor_id,
        created_at=now,
        updated_at=now,
        **spec.column_values(),
    )
    db.add(rule)
    await db.flush()
    await _audit(db, org_id, rule, AuditAction.ALERT_RULE_CREATE, actor_id, ip=ip)
    return rule


async def update_rule(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    actor_id: uuid.UUID,
    spec: RuleSpec,
    *,
    now: datetime,
    ip: str | None = None,
    settings: Settings | None = None,
) -> AlertRule:
    """Replace the rule with `spec`. The caller holds the project's write lock.

    A firing alert is resolved first, with `alert.resolved` queued for the rule's current
    channels (unless muted), when the edit changes the definition (`DEFINITION_COLUMNS`) or
    disables the rule: the open event described the old rule, and a disabled rule is never
    evaluated again. Other edits keep the state. An edit that changes nothing writes no audit
    event. Raises `RuleNotFoundError` and `UnknownChannelError`.
    """
    rule = await queries.lock_rule(db, project_id, rule_id)
    if rule is None:
        raise RuleNotFoundError
    await check_channels(db, org_id, spec)
    values = spec.column_values()
    changed = [column for column, value in values.items() if getattr(rule, column) != value]
    if not changed:
        return rule
    if DEFINITION_COLUMNS.intersection(changed) or ("enabled" in changed and not spec.enabled):
        # Before the change: the resolve payload describes the rule that fired.
        await close_firing_alert(db, rule, now, settings=settings)
    for column in changed:
        setattr(rule, column, values[column])
    rule.updated_at = now
    await db.flush()
    await _audit(
        db, org_id, rule, AuditAction.ALERT_RULE_UPDATE, actor_id, ip=ip, extra={"changed": changed}
    )
    return rule


def check_mute(until: datetime | None, now: datetime) -> None:
    """A mute ends in the future and at most 30 days ahead; `None` unmutes."""
    if until is None:
        return
    if until <= now:
        raise InvalidMuteError("must be in the future")
    if until - now > MAX_MUTE:
        raise InvalidMuteError("must be at most 30 days ahead")


async def mute_rule(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    actor_id: uuid.UUID,
    until: datetime | None,
    *,
    now: datetime,
    ip: str | None = None,
) -> AlertRule:
    """Mute the rule until `until`, or unmute it with `None`. The caller holds the project lock.

    A muted rule still fires and resolves, and records its events; it notifies nobody until the
    mute ends. Raises `RuleNotFoundError`, then `InvalidMuteError`.
    """
    rule = await queries.lock_rule(db, project_id, rule_id)
    if rule is None:
        raise RuleNotFoundError
    check_mute(until, now)
    rule.muted_until = until
    rule.updated_at = now
    await db.flush()
    muted = until.isoformat() if until is not None else None
    await _audit(
        db, org_id, rule, AuditAction.ALERT_RULE_MUTE, actor_id, ip=ip, extra={"until": muted}
    )
    return rule


async def delete_rule(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    now: datetime,
    ip: str | None = None,
    settings: Settings | None = None,
) -> None:
    """Delete the rule with its state and events. The caller holds the project's write lock.

    A firing alert is resolved first, queuing `alert.resolved` (unless muted), so receivers
    close their incident. Notifications already queued for the rule are still delivered.
    Raises `RuleNotFoundError`.
    """
    rule = await queries.lock_rule(db, project_id, rule_id)
    if rule is None:
        raise RuleNotFoundError
    await close_firing_alert(db, rule, now, settings=settings)
    await _audit(db, org_id, rule, AuditAction.ALERT_RULE_DELETE, actor_id, ip=ip)
    await db.delete(rule)
    await db.flush()


async def acknowledge_event(
    db: AsyncSession,
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    event_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    now: datetime,
    ip: str | None = None,
) -> AlertEvent:
    """Record that `actor_id` has seen the event, open or resolved. The caller holds the project
    lock.

    Raises `EventNotFoundError` and `AlreadyAcknowledgedError`.
    """
    event = await queries.lock_event(db, project_id, event_id)
    if event is None:
        raise EventNotFoundError
    if event.acknowledged_at is not None:
        raise AlreadyAcknowledgedError
    event.acknowledged_by = actor_id
    event.acknowledged_at = now
    await db.flush()
    await record_audit(
        db,
        org_id=org_id,
        actor_user_id=actor_id,
        action=AuditAction.ALERT_EVENT_ACKNOWLEDGE,
        target_type="alert_event",
        target_id=event.id,
        ip=ip,
        metadata={"rule_id": str(event.rule_id)},
    )
    return event


async def _audit(
    db: AsyncSession,
    org_id: uuid.UUID,
    rule: AlertRule,
    action: AuditAction,
    actor_id: uuid.UUID,
    *,
    ip: str | None,
    extra: dict[str, object] | None = None,
) -> None:
    """The audit event for a rule write: its name, kind and metric, plus `extra`."""
    metadata: dict[str, object] = {
        "name": rule.name,
        "kind": rule.kind.value,
        "metric": rule.metric.value,
        **(extra or {}),
    }
    await record_audit(
        db,
        org_id=org_id,
        actor_user_id=actor_id,
        action=action,
        target_type="alert_rule",
        target_id=rule.id,
        ip=ip,
        metadata=metadata,
    )
