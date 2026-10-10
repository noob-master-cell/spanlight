"""SQL for the trace list and trace detail (`app.api.v1.traces`).

Every statement filters on `project_id` explicitly as well as through row-level security, which
keeps index usage obvious.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, distinct, exists, func, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.db.models import Span, SpanStatus, Trace


def summary_select() -> Select[Trace, list[str] | None, str | None, str | None]:
    """Each trace with its models and the earliest failed span's status message and error class.

    The caller adds the filters.

    The earliest failed span (ties broken by span id) is one `LEFT JOIN LATERAL … LIMIT 1` on the
    spans primary key (project_id, trace_id, …), so the message and the class are always the
    same span's.
    """
    models = (
        select(func.array_agg(distinct(Span.model)).filter(Span.model.is_not(None)))
        .where(Span.project_id == Trace.project_id, Span.trace_id == Trace.trace_id)
        .scalar_subquery()
    )
    earliest_failed = (
        select(Span.status_message, Span.error_class)
        .where(
            Span.project_id == Trace.project_id,
            Span.trace_id == Trace.trace_id,
            Span.status == SpanStatus.ERROR,
        )
        .order_by(Span.started_at, Span.span_id)
        .limit(1)
        .lateral("earliest_failed")
    )
    return select(
        Trace, models, earliest_failed.c.status_message, earliest_failed.c.error_class
    ).outerjoin(earliest_failed, true())


def has_span(condition: ColumnElement[bool]) -> ColumnElement[bool]:
    """The trace has at least one span matching `condition`."""
    return exists().where(
        Span.project_id == Trace.project_id, Span.trace_id == Trace.trace_id, condition
    )


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def trace_spans(db: AsyncSession, project_id: uuid.UUID, trace_id: str) -> Sequence[Span]:
    """One trace's spans in start order."""
    result = await db.scalars(
        select(Span)
        .where(Span.project_id == project_id, Span.trace_id == trace_id)
        .order_by(Span.started_at, Span.span_id)
    )
    return result.all()
