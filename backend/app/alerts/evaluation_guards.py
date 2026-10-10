"""Checks the evaluation job makes on a rule's stored state before judging it again, and the
last reading a forced resolve reports."""

from datetime import datetime, timedelta
from decimal import Decimal

import structlog

from app.alerts.types import RuleStateName
from app.budgets.periods import period_start
from app.db.models import AlertEvent, AlertRule, AlertState, Budget

logger = structlog.get_logger(__name__)

# A stored evaluation at most this far ahead of a pass's `now` is a newer pass's; further ahead,
# it came from a clock that ran fast and must not freeze the rule (two evaluation intervals).
NEWER_PASS_WINDOW = timedelta(seconds=120)


def judged_by_newer_pass(stored: AlertState | None, rule: AlertRule, now: datetime) -> bool:
    """Whether a newer pass has evaluated the rule already (this one is an older pass running
    late; judging again would move the state back in time). A stored time far in the future
    came from a fast clock: it is logged and the rule is evaluated anyway."""
    evaluated = None if stored is None else stored.last_evaluated_at
    if evaluated is None or evaluated < now:
        return False
    if evaluated - now < NEWER_PASS_WINDOW:
        return True
    ahead = (evaluated - now).total_seconds()
    logger.warning("alert_state_from_future", rule_id=str(rule.id), seconds_ahead=ahead)
    return False


def fired_last_period(stored: AlertState | None, budget: Budget, now: datetime) -> bool:
    """Whether the budget's rule is firing since before the current period began.

    Such an alert ends on the new period's first pass whatever that pass reads: spend that is
    unknown (spans, none priced, as blocked calls are) never transitions on its own.
    """
    if stored is None or stored.state is not RuleStateName.FIRING or stored.since is None:
        return False
    return stored.since < period_start(budget.period, now)


def last_reading(
    stored: AlertState, event: AlertEvent | None, now: datetime, value: Decimal | None
) -> tuple[Decimal | None, datetime]:
    """The value a resolve reports and when it was measured: `value` measured `now` when given,
    else the state's last value at its last evaluation, else the event's value at its start."""
    if value is not None:
        return value, now
    if stored.last_value is not None:
        return stored.last_value, stored.last_evaluated_at or now
    if event is not None:
        return event.value, event.started_at
    return None, now
