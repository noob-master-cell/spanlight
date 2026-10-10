"""One alert evaluation pass for `spanlight alerts evaluate`, outside the worker.

It runs the job's own `evaluate_all` with the wall clock and one `MetricCache`, so it does what
the next scheduled pass would do. A dry run wraps the pass in a transaction that is rolled back:
every rule still commits in a savepoint of its own, so the work (and the time) is the same, but
nothing is kept and no notification is queued.
"""

import math
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from prometheus_client import REGISTRY
from sqlalchemy import Connection, event, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import Session, SessionTransaction

from app.alerts.evaluation import RuleOutcome
from app.alerts.jobs import EvaluationRun, evaluate_all
from app.db.session import create_engine, create_session_factory

if TYPE_CHECKING:
    from app.config import Settings

_RULES_METRIC = "spanlight_alert_rules_evaluated_total"


@dataclass(frozen=True, slots=True)
class EvaluationReport:
    """What one pass did. `ok + no_data + errors == rules`."""

    projects: int
    projects_failed: int
    rules: int
    ok: int
    no_data: int
    errors: int
    transitions: int
    seconds: float
    dry_run: bool

    @property
    def failed(self) -> bool:
        return self.errors > 0 or self.projects_failed > 0


class _DryRunSession(Session):
    """A session class of its own, so the event below applies to dry runs only."""


def _reset_bypass(_: Session, __: SessionTransaction, connection: Connection) -> None:
    """Start every session with row-level security enforced again.

    In a dry run all sessions share one transaction, and a transaction-local setting outlives
    the session that made it. The job lists its projects with the bypass on; without this, the
    evaluation of every project after that would run with it on too.
    """
    connection.execute(text("SELECT set_config('app.bypass_rls', '', true)"))


@asynccontextmanager
async def _rolled_back(engine: AsyncEngine) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """Session factory whose sessions all end up rolled back with the transaction around them."""
    event.listen(_DryRunSession, "after_begin", _reset_bypass)
    async with engine.connect() as connection:
        outer = await connection.begin()
        try:
            yield async_sessionmaker(
                bind=connection,
                class_=AsyncSession,
                sync_session_class=_DryRunSession,
                expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            )
        finally:
            await outer.rollback()
            event.remove(_DryRunSession, "after_begin", _reset_bypass)


def _evaluated(outcome: RuleOutcome) -> float:
    value = REGISTRY.get_sample_value(_RULES_METRIC, {"outcome": outcome.value})
    return 0.0 if value is None else value


async def evaluate_once(settings: "Settings", *, dry_run: bool) -> EvaluationReport:
    """Evaluate every project with enabled rules once, at the current time."""
    engine = create_engine(settings.database_url, pool_size=2)
    before = {outcome: _evaluated(outcome) for outcome in RuleOutcome}
    try:
        started = time.perf_counter()
        if dry_run:
            async with _rolled_back(engine) as session_factory:
                run = await _pass(session_factory, settings)
        else:
            run = await _pass(create_session_factory(engine), settings)
        seconds = time.perf_counter() - started
    finally:
        await engine.dispose()
    counted = {outcome: int(_evaluated(outcome) - before[outcome]) for outcome in RuleOutcome}
    return EvaluationReport(
        projects=run.projects,
        projects_failed=run.projects_failed,
        rules=run.rules,
        ok=counted[RuleOutcome.OK],
        no_data=counted[RuleOutcome.NO_DATA],
        errors=counted[RuleOutcome.ERROR],
        transitions=run.transitions,
        seconds=seconds,
        dry_run=dry_run,
    )


async def _pass(
    session_factory: async_sessionmaker[AsyncSession], settings: "Settings"
) -> EvaluationRun:
    # No time limit: the worker stops starting projects after 40 s so its task ends inside the
    # task timeout, but a person measuring a pass wants all of it.
    return await evaluate_all(
        session_factory, settings, now=datetime.now(UTC), budget_seconds=math.inf
    )
