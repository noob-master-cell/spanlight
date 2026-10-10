"""Seed a Spanlight database for the alert-evaluation load test.

Creates `--projects` projects (default 50), each in an organization of its own, and gives every
one the same set of 20 alert evaluations (18 rules and 2 budgets, see `seed_alert_rules.py`)
and `--spans-per-project` spans spread over the last `--days` days (default 7). The spans go
through the real ingestion pipeline and the hourly rollups are built with `backfill_rollups`, so
the evaluation reads exactly what it reads in production: rollups for the whole hours of a window
and raw spans for the rest. Rules and budgets are created through the same services the API uses.

    cd backend
    export LOAD_DATABASE_URL=postgresql+psycopg://postgres:...@127.0.0.1:55433/spanlight
    uv run python load/seed_alerts.py

Then measure a pass with `spanlight alerts evaluate` (see `alerts.md`).

Connect as the database owner (the `postgres` user of the Compose stack). This is a test harness,
not a product path. It refuses a database that already has alert rules, so it never mixes two
seeds; run it against a fresh stack.
"""

import argparse
import asyncio
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.alerts.rules_service import create_rule
from app.budgets.service import create_budget
from app.db.rls import bind_project
from app.db.session import create_engine, create_session_factory
from app.ingest.pipeline import IngestTarget, ingest_spans
from app.ingest.schemas import MAX_SPANS_PER_BATCH
from app.rollups.compute import backfill_rollups
from seed import vacuum_analyze
from seed_alert_rules import EVALUATIONS_PER_PROJECT, budget_specs, rule_specs
from seed_data import build_batch
from seed_workspace import Workspace, WorkspaceError, create_workspace

PROJECTS_IN_PARALLEL = 4

RULE_COUNT = text("SELECT count(*) FROM alert_rules")
COUNTS = text(
    """
    SELECT (SELECT count(*) FROM alert_rules) AS rules,
           (SELECT count(*) FROM budgets) AS budgets,
           (SELECT count(*) FROM spans) AS spans,
           (SELECT count(*) FROM span_rollups_hourly) AS rollup_rows
    """
)


class SeedError(Exception):
    """The seeding cannot continue; the message is printed and the exit status is 1."""


@dataclass(frozen=True)
class Options:
    projects: int
    spans_per_project: int
    days: int
    seed: int

    @property
    def spread(self) -> timedelta:
        return timedelta(days=self.days)


def say(message: str) -> None:
    print(f"seed-alerts: {message}", flush=True)


async def store_spans(
    session_factory: async_sessionmaker[AsyncSession],
    workspace: Workspace,
    project_seed: int,
    options: Options,
    now: datetime,
) -> None:
    """The project's spans, oldest slice first, through the ingestion pipeline."""
    target = IngestTarget(
        project_id=workspace.project_id, capture_payloads=False, org_id=workspace.org_id
    )
    batches = -(-options.spans_per_project // MAX_SPANS_PER_BATCH)
    remaining = options.spans_per_project
    for index in range(batches):
        count = min(MAX_SPANS_PER_BATCH, remaining)
        remaining -= count
        raw = build_batch(project_seed, index, count, now, batches, options.spread)
        async with session_factory() as session:
            outcome = await ingest_spans(session, target, raw, now=now)
            if outcome.rejected or outcome.accepted != count:
                first = outcome.rejected[0].reason if outcome.rejected else "none reported"
                raise SeedError(f"{outcome.accepted} of {count} spans accepted ({first})")
            await session.commit()


async def build_rollups(
    session_factory: async_sessionmaker[AsyncSession],
    project_id: uuid.UUID,
    options: Options,
    now: datetime,
) -> None:
    async with session_factory() as session:
        start = now - options.spread - timedelta(hours=1)
        if await backfill_rollups(session, project_id, start, now) == 0:
            # Without rollups the longer windows would read nothing and the run would measure
            # an empty database.
            raise SeedError(f"the rollup backfill wrote no rows for project {project_id}")


async def add_rules(
    session_factory: async_sessionmaker[AsyncSession], workspace: Workspace, now: datetime
) -> None:
    """The project's rules and budgets, through the services the API calls."""
    async with session_factory() as session:
        await bind_project(session, workspace.project_id)
        for spec in rule_specs():
            await create_rule(
                session, workspace.org_id, workspace.project_id, workspace.owner_id, spec, now=now
            )
        for budget in budget_specs():
            await create_budget(
                session,
                workspace.org_id,
                workspace.project_id,
                workspace.owner_id,
                budget,
                now=now,
            )
        await session.commit()


async def seed_project(
    session_factory: async_sessionmaker[AsyncSession], number: int, options: Options, now: datetime
) -> None:
    workspace = await create_workspace(session_factory)
    # A seed of its own per project, so the projects differ in shape and not only in id.
    await store_spans(session_factory, workspace, options.seed * 10_000 + number, options, now)
    await build_rollups(session_factory, workspace.project_id, options, now)
    await add_rules(session_factory, workspace, now)


async def seed_all(
    session_factory: async_sessionmaker[AsyncSession], options: Options, now: datetime
) -> None:
    gate = asyncio.Semaphore(PROJECTS_IN_PARALLEL)
    done = 0

    async def one(number: int) -> None:
        nonlocal done
        async with gate:
            await seed_project(session_factory, number, options, now)
        done += 1
        if done % 10 == 0 or done == options.projects:
            say(f"{done} of {options.projects} projects seeded")

    # A TaskGroup cancels the other projects as soon as one fails.
    async with asyncio.TaskGroup() as group:
        for number in range(options.projects):
            group.create_task(one(number))


def parse_options(argv: list[str]) -> Options:
    parser = argparse.ArgumentParser(
        description="Seed a database for the alert-evaluation load test."
    )
    parser.add_argument("--projects", type=int, default=50, help="projects to create (default 50)")
    parser.add_argument(
        "--spans-per-project", type=int, default=5000, help="spans per project (default 5000)"
    )
    parser.add_argument("--days", type=int, default=7, help="days of spans (default 7)")
    parser.add_argument("--seed", type=int, default=1, help="same seed, same data shape")
    args = parser.parse_args(argv)
    if args.projects < 1:
        parser.error("--projects must be at least 1")
    if args.spans_per_project < 1000:
        parser.error("--spans-per-project must be at least 1000, or most windows have no calls")
    if not 2 <= args.days <= 28:
        parser.error("--days must be between 2 and 28")
    return Options(
        projects=args.projects,
        spans_per_project=args.spans_per_project,
        days=args.days,
        seed=args.seed,
    )


async def run(options: Options, database_url: str) -> None:
    engine = create_engine(database_url, pool_size=PROJECTS_IN_PARALLEL + 2)
    session_factory = create_session_factory(engine)
    now = datetime.now(UTC)
    try:
        async with session_factory() as session:
            existing = (await session.execute(RULE_COUNT)).scalar_one()
        if existing:
            raise SeedError(
                f"the database already has {existing} alert rules; seed a fresh stack "
                "(docker compose down --volumes)"
            )
        say(
            f"{options.projects} projects, {EVALUATIONS_PER_PROJECT} evaluations and "
            f"{options.spans_per_project:,} spans each over {options.days} days"
        )
        await seed_all(session_factory, options, now)
        await vacuum_analyze(engine)
        async with session_factory() as session:
            counts = (await session.execute(COUNTS)).one()
        say(
            f"{counts.rules} alert rules (budget rules included), {counts.budgets} budgets, "
            f"{counts.spans:,} spans, {counts.rollup_rows:,} rollup rows"
        )
    finally:
        await engine.dispose()


def main() -> None:
    options = parse_options(sys.argv[1:])
    # Deliberately not DATABASE_URL, as in seed.py.
    database_url = os.environ.get("LOAD_DATABASE_URL", "")
    if not database_url:
        sys.exit("seed-alerts: set LOAD_DATABASE_URL to the owner URL of the database to fill")
    try:
        asyncio.run(run(options, database_url))
    except* (SeedError, WorkspaceError) as errors:
        failure = str(errors.exceptions[0])
    else:
        return
    sys.exit(f"seed-alerts: {failure}")


if __name__ == "__main__":
    main()
