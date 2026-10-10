"""Reads of the `run_detectors` job that span every project.

Both hold nothing but ids and counts, so they run with row-level security bypassed, each in a
transaction of its own that they end themselves (the bypass is local to it).
"""

import uuid
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.rls import bypass_rls
from app.insights.schemas import Severity

# Projects with a span in [since, until). The project whose detectors ran longest ago comes
# first and a project never run comes before all of them, so the projects a pass cut short by
# its run budget did not reach lead the next pass.
_ACTIVE_PROJECTS = text(
    """
    SELECT p.id
    FROM projects AS p
    LEFT JOIN LATERAL (
        SELECT max(r.ran_at) AS last_ran_at FROM detector_runs AS r WHERE r.project_id = p.id
    ) AS last_run ON true
    WHERE EXISTS (
        SELECT 1 FROM spans AS s
        WHERE s.project_id = p.id AND s.started_at >= :since AND s.started_at < :until
    )
    ORDER BY last_run.last_ran_at ASC NULLS FIRST, p.id
    """
)

_OPEN_BY_SEVERITY = text(
    "SELECT severity, count(*) AS open_count FROM insights WHERE status = 'open' GROUP BY severity"
)


async def active_project_ids(db: AsyncSession, since: datetime, until: datetime) -> list[uuid.UUID]:
    """Projects with a span started in `[since, until)`, stalest detector run first."""
    await bypass_rls(db)
    rows = (await db.execute(_ACTIVE_PROJECTS, {"since": since, "until": until})).scalars().all()
    await db.commit()
    return [uuid.UUID(str(project_id)) for project_id in rows]


async def open_insights_by_severity(db: AsyncSession) -> dict[Severity, int]:
    """Open insights across every project, per severity; a severity with none is 0."""
    await bypass_rls(db)
    rows = (await db.execute(_OPEN_BY_SEVERITY)).all()
    await db.commit()
    counts = dict.fromkeys(Severity, 0)
    for row in rows:
        counts[Severity(row.severity)] = int(row.open_count)
    return counts
