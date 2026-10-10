"""The `run_detectors` job: run every detector over every active project, every 15 minutes.

One query, with row-level security bypassed, lists the projects that have a span in the last
24 hours; each project then runs in a session of its own, bound to it alone (see `engine.py`).
All projects of a pass share one `now`.

The job has a single attempt: the next pass is the retry. A pass stops starting projects after
`RUN_BUDGET_SECONDS` so it ends inside the worker's task timeout; the projects whose detectors
ran longest ago go first, so the ones a slow pass did not reach lead the next one.

Each project also runs under its own time bound, so one slow project cannot hold the pass until
the worker kills it (and, never recording a run, come first again on every pass). A project
that fails or runs out of time gets an error row for each detector that had not recorded one;
it moves to the back of the order and the failure shows in detector health. The pass goes on
with the others.
"""

import asyncio
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.observability import DETECTOR_PROJECTS_SKIPPED, INSIGHTS_OPEN
from app.insights.engine import (
    DETECTORS,
    DetectorRunResult,
    error_text,
    record_failed_runs,
    run_project,
)
from app.insights.job_queries import active_project_ids, open_insights_by_severity
from app.jobs.context import TaskContext

if TYPE_CHECKING:
    from app.config import Settings

logger = structlog.get_logger(__name__)

# The worker cancels a task after 50 s. No project starts after 40 s, and none runs past 45 s,
# which leaves time to record a timed-out project's error rows and refresh the gauge.
RUN_BUDGET_SECONDS = 40.0
HARD_STOP_SECONDS = 45.0
PROJECT_TIMEOUT_SECONDS = 30.0
ACTIVE_WINDOW = timedelta(hours=24)


@dataclass(slots=True)
class DetectorPass:
    projects: int = 0
    projects_failed: int = 0
    projects_gone: int = 0
    projects_left: int = 0
    runs: int = 0
    errors: int = 0
    opened: int = 0
    notified: int = 0

    def add(self, results: list[DetectorRunResult]) -> None:
        if not results:  # deleted since the project list was read
            self.projects_gone += 1
            return
        self.projects += 1
        self.runs += len(results)
        self.errors += sum(1 for result in results if result.error is not None)
        self.opened += sum(result.opened for result in results)
        self.notified += sum(result.notified for result in results)


async def run_detectors(context: TaskContext, _: dict[str, Any]) -> None:
    run = await detect_all(
        context.session_factory,
        context.settings,
        now=datetime.now(UTC),
        heartbeat=context.heartbeat,
    )
    await _refresh_open_gauge(context.session_factory)
    logger.info(
        "detectors_ran",
        projects=run.projects,
        projects_failed=run.projects_failed,
        projects_gone=run.projects_gone,
        projects_left=run.projects_left,
        runs=run.runs,
        errors=run.errors,
        opened=run.opened,
        notified=run.notified,
    )


async def detect_all(
    session_factory: async_sessionmaker[AsyncSession],
    settings: "Settings",
    *,
    now: datetime,
    heartbeat: Callable[[], Awaitable[None]] | None = None,
    budget_seconds: float = RUN_BUDGET_SECONDS,
    hard_stop_seconds: float = HARD_STOP_SECONDS,
) -> DetectorPass:
    """Run the detectors over every active project at `now`. `heartbeat` runs between projects."""
    started = time.monotonic()
    deadline = started + budget_seconds
    hard_stop = started + hard_stop_seconds
    async with session_factory() as db:
        project_ids = await active_project_ids(db, now - ACTIVE_WINDOW, now)
    run = DetectorPass()
    for index, project_id in enumerate(project_ids):
        if heartbeat is not None:
            await heartbeat()
        # Checked after the heartbeat, so a project that starts has at least the gap between the
        # budget and the hard stop.
        if time.monotonic() >= deadline:
            run.projects_left = len(project_ids) - index
            DETECTOR_PROJECTS_SKIPPED.inc(run.projects_left)
            logger.warning("detectors_out_of_time", projects_left=run.projects_left)
            break
        time_limit = min(PROJECT_TIMEOUT_SECONDS, hard_stop - time.monotonic())
        results = await _run_one_project(session_factory, settings, project_id, now, time_limit)
        if results is None:
            run.projects_failed += 1
        else:
            run.add(results)
    return run


async def _run_one_project(
    session_factory: async_sessionmaker[AsyncSession],
    settings: "Settings",
    project_id: uuid.UUID,
    now: datetime,
    time_limit: float,
) -> list[DetectorRunResult] | None:
    """The project's run results, or None when the project failed or ran out of `time_limit`
    seconds (logged, and recorded by `_record_project_failure`).

    Detector failures are recorded inside; this only catches a failure around them, such as the
    context read or the connection failing, so one project cannot end the pass for the others.
    """
    started = time.monotonic()
    progress: list[DetectorRunResult] = []
    try:
        async with asyncio.timeout(time_limit), session_factory() as db:
            return await run_project(
                db, project_id, now, DETECTORS, settings=settings, progress=progress
            )
    except TimeoutError as exc:
        error = f"TimeoutError: the project's run took longer than {time_limit:.0f} s"
        logger.error("detector_project_timed_out", project_id=str(project_id), exc_info=exc)
    except Exception as exc:  # isolate the project; the next pass tries it again
        error = error_text(exc)
        logger.error(
            "detector_project_failed",
            project_id=str(project_id),
            error_type=type(exc).__name__,
            exc_info=exc,
        )
    elapsed_ms = round((time.monotonic() - started) * 1000)
    await _record_project_failure(session_factory, project_id, now, progress, error, elapsed_ms)
    return None


async def _record_project_failure(
    session_factory: async_sessionmaker[AsyncSession],
    project_id: uuid.UUID,
    now: datetime,
    progress: list[DetectorRunResult],
    error: str,
    elapsed_ms: int,
) -> None:
    """Error rows for the detectors of a failed project that had not recorded a run."""
    recorded = {result.detector for result in progress if result.recorded}
    missing = [detector for detector in DETECTORS if detector.kind not in recorded]
    if not missing:
        return
    try:
        async with session_factory() as db:
            await record_failed_runs(db, project_id, now, missing, error, elapsed_ms)
    except Exception as exc:  # e.g. the project was deleted; nothing more to record
        logger.error(
            "detector_project_failure_not_recorded",
            project_id=str(project_id),
            error_type=type(exc).__name__,
            exc_info=exc,
        )


async def _refresh_open_gauge(session_factory: async_sessionmaker[AsyncSession]) -> None:
    """Set `spanlight_insights_open` from one count over every project. A failure only leaves
    the gauge at its previous value."""
    try:
        async with session_factory() as db:
            counts = await open_insights_by_severity(db)
    except Exception as exc:  # the gauge is a convenience; the pass itself succeeded
        logger.warning("insights_open_gauge_failed", error_type=type(exc).__name__, exc_info=exc)
        return
    for severity, count in counts.items():
        INSIGHTS_OPEN.labels(severity=severity.value).set(count)
