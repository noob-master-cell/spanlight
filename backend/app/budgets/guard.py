"""The gateway's budget guard: block a call while a `block` budget's rule is firing.

`StateBudgetGuard` reads the evaluated state; it never sums spend per call. A budget's hidden
alert rule measures the spend every evaluation interval, so a block lags the spend by up to that
interval (60 seconds) and a small overrun is possible (ADR 0012). A budget blocks only while its
firing state began in the current UTC period, so a period rollover unblocks at once. A `model`
budget applies to a call when its name matches the requested model or any target's model, with
the snapshot rule of `app.core.model_match`. The check is one indexed query in the gateway's
short transaction, which already runs under the project binding, so row-level security on
`budgets` and `alert_states` applies. Ingestion never calls the guard.
"""

from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import ColumnElement, and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.formatting import format_money
from app.alerts.types import RuleStateName
from app.budgets.periods import period_start
from app.budgets.types import BudgetAction, BudgetPeriod, BudgetScope
from app.config import Settings
from app.core.model_match import SNAPSHOT_SUFFIX_REGEX
from app.core.observability import BUDGET_BLOCKS
from app.db.models.alerts import AlertState
from app.db.models.budgets import Budget
from app.gateway.budget import BudgetDecision, BudgetGuard

_PERIOD_WORDS = {BudgetPeriod.DAILY: "today", BudgetPeriod.MONTHLY: "this month"}


def _model_budget_matches(models: Sequence[str]) -> ColumnElement[bool]:
    """A `model` budget's name equals one of `models` or is that name minus a snapshot suffix.

    The rule of `app.core.model_match`, with the configured name in the column: `starts_with`
    and the suffix check are plain functions of the bound name, so nothing needs escaping.
    """
    return or_(
        *(
            or_(
                Budget.scope_id == name,
                and_(
                    func.starts_with(name, Budget.scope_id),
                    func.substr(name, func.length(Budget.scope_id) + 1).op("~")(
                        SNAPSHOT_SUFFIX_REGEX
                    ),
                ),
            )
            for name in models
        )
    )


def _scope_match(
    key_id: UUID | None, models: Sequence[str], external_user_id: str | None
) -> ColumnElement[bool]:
    """The condition selecting the budgets that apply to one call.

    A scope whose value is unknown (no key, no end user) is left out: `scope_id = NULL` would
    match nothing anyway, and leaving it out keeps the query plain.
    """
    clauses = [
        Budget.scope == BudgetScope.PROJECT,
        and_(Budget.scope == BudgetScope.MODEL, _model_budget_matches(models)),
    ]
    if key_id is not None:
        clauses.append(
            and_(Budget.scope == BudgetScope.GATEWAY_KEY, Budget.scope_id == str(key_id))
        )
    if external_user_id is not None:
        clauses.append(and_(Budget.scope == BudgetScope.USER, Budget.scope_id == external_user_id))
    return or_(*clauses)


def _current_period_start(now: datetime) -> ColumnElement[datetime]:
    """When the budget's current UTC day or month began, by its own period.

    A firing state older than that belongs to a period that has ended and is only waiting for
    the next evaluation to resolve it, so it must not block. A state with no `since` never does.
    """
    return case(
        (Budget.period == BudgetPeriod.DAILY, period_start(BudgetPeriod.DAILY, now)),
        else_=period_start(BudgetPeriod.MONTHLY, now),
    )


def blocked_reason(name: str, period: BudgetPeriod, spent: Decimal | None, amount: Decimal) -> str:
    """The client-facing sentence for an exhausted budget, without a trailing period."""
    when = _PERIOD_WORDS[period]
    head = f'Budget "{name}" is exhausted'
    cap = format_money(amount, plain=True)
    if spent is None:
        return f"{head}: the {cap} limit is reached {when}"
    return f"{head}: {format_money(spent, plain=True)} of {cap} spent {when}"


class StateBudgetGuard:
    """Blocks a call when an enabled `block` budget that applies to it is firing."""

    async def check(
        self,
        db: AsyncSession,
        project_id: UUID,
        key_id: UUID | None,
        model: str,
        external_user_id: str | None,
        now: datetime,
        target_models: Sequence[str] = (),
    ) -> BudgetDecision:
        # The model asked for, then each target's name after its alias, without repeats.
        models = list(dict.fromkeys([model, *target_models]))
        statement = (
            select(Budget.id, Budget.name, Budget.period, Budget.amount_usd, AlertState.last_value)
            .join(AlertState, AlertState.rule_id == Budget.rule_id)
            .where(
                Budget.project_id == project_id,
                Budget.enabled.is_(True),
                Budget.action == BudgetAction.BLOCK,
                AlertState.state == RuleStateName.FIRING,
                AlertState.since >= _current_period_start(now),
                _scope_match(key_id, models, external_user_id),
            )
            .order_by(Budget.amount_usd, Budget.id)
            .limit(1)
        )
        row = (await db.execute(statement)).first()
        if row is None:
            return BudgetDecision(allowed=True)
        BUDGET_BLOCKS.inc()
        return BudgetDecision(
            allowed=False,
            budget_id=row.id,
            reason=blocked_reason(row.name, row.period, row.last_value, row.amount_usd),
        )


def get_budget_guard(settings: Settings) -> BudgetGuard:
    """The guard the gateway runtime uses. Settings are accepted for a future switch; none yet."""
    return StateBudgetGuard()
