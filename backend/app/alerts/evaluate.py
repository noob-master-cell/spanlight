"""Alert state machine. Pure: the caller loads the state and applies the transition.

One machine serves every rule kind. Threshold and budget rules pass their stored
threshold; anomaly rules compute theirs first (see `anomaly.py`).
"""

import operator
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from app.alerts.types import Comparator, RuleStateName

_COMPARE: dict[Comparator, Callable[[Decimal, Decimal], bool]] = {
    Comparator.GT: operator.gt,
    Comparator.GTE: operator.ge,
    Comparator.LT: operator.lt,
    Comparator.LTE: operator.le,
}


@dataclass(frozen=True, slots=True)
class RuleCondition:
    """What the state machine needs from a rule."""

    comparator: Comparator
    threshold: Decimal
    cooldown_minutes: int


@dataclass(frozen=True, slots=True)
class RuleState:
    """Current state of a rule.

    `since` is when the rule entered `state`; for `ok` after a resolve that is
    the resolve time. A rule with no stored row is `RuleState(ok, None, None)`,
    which never blocks a fire.
    """

    state: RuleStateName
    since: datetime | None
    last_value: Decimal | None


NO_STATE = RuleState(RuleStateName.OK, None, None)


@dataclass(frozen=True, slots=True)
class Transition:
    to_state: RuleStateName
    value: Decimal
    threshold: Decimal
    at: datetime


def is_breach(comparator: Comparator, value: Decimal, threshold: Decimal) -> bool:
    return _COMPARE[comparator](value, threshold)


def evaluate_rule(
    rule: RuleCondition,
    value: Decimal | None,
    state: RuleState,
    now: datetime,
) -> Transition | None:
    """Return the state change for one evaluation, or `None` to stay put.

    An unknown value (`None`) never changes state. `ok -> firing` needs a breach
    and no resolve inside the cooldown; `firing -> ok` happens on the first
    non-breach.
    """
    if value is None:
        return None
    breached = is_breach(rule.comparator, value, rule.threshold)
    if state.state is RuleStateName.FIRING:
        if breached:
            return None
        return Transition(RuleStateName.OK, value, rule.threshold, now)
    if not breached or _in_cooldown(state, rule.cooldown_minutes, now):
        return None
    return Transition(RuleStateName.FIRING, value, rule.threshold, now)


def _in_cooldown(state: RuleState, cooldown_minutes: int, now: datetime) -> bool:
    if state.since is None:
        return False
    return now - state.since < timedelta(minutes=cooldown_minutes)
