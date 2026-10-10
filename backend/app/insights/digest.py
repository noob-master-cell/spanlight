"""The weekly digest's Insights section.

"{n} open insights ({c} critical, {w} warning).", then up to five open insights, critical first
and newest first, as "{label}: {title}". A project with no open insight and none first seen that
week gets no section. `insights_section` is pure; `insights_digest_section` is what the digest
job calls, in its transaction bound to the project.
"""

import uuid
from typing import Final

from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.digest import DigestSection
from app.api.window import TimeWindow
from app.insights import digest_queries as queries
from app.insights.catalogue import KIND_INFO
from app.insights.digest_queries import OpenInsightRow
from app.insights.schemas import Severity

TITLE: Final = "Insights"
MAX_LISTED: Final = 5


async def insights_digest_section(
    db: AsyncSession, project_id: uuid.UUID, week: TimeWindow
) -> DigestSection | None:
    """The section for `project_id`, or None when it has nothing to say for `week`."""
    counts = await queries.open_counts(db, project_id)
    if not counts and not await queries.any_first_seen(db, project_id, week.start, week.end):
        return None
    listed = await queries.top_open(db, project_id, MAX_LISTED) if counts else []
    return insights_section(counts, listed)


def insights_section(counts: dict[Severity, int], listed: list[OpenInsightRow]) -> DigestSection:
    total = sum(counts.values())
    noun = "insight" if total == 1 else "insights"
    critical = counts.get(Severity.CRITICAL, 0)
    warning = counts.get(Severity.WARNING, 0)
    lines = [f"{total:,} open {noun} ({critical:,} critical, {warning:,} warning)."]
    lines.extend(f"{_label(row.kind)}: {row.title}" for row in listed[:MAX_LISTED])
    return DigestSection(title=TITLE, paragraphs=lines)


def _label(kind: str) -> str:
    info = KIND_INFO.get(kind)
    return info.label if info is not None else kind
