"""Trace explorer: trace list and detail, sessions and filter values.

All queries run in a transaction bound to the project (row-level security)
and also filter on `project_id` explicitly, which keeps index usage obvious.
"""

import uuid
from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select, tuple_
from sqlalchemy.orm import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

from app.api.deps import DbSession, ReadAccess, require, utcnow
from app.api.schemas import (
    FiltersOut,
    Page,
    SessionSummaryOut,
    SpanOut,
    TraceDetailOut,
    TraceSummaryOut,
)
from app.api.window import Window
from app.core.errors import not_found
from app.core.pagination import DEFAULT_PAGE_SIZE, PageLimit, decode_cursor, encode_cursor
from app.core.permissions import Permission
from app.db.models import Span, Trace
from app.explorer.trace_queries import escape_like, has_span, summary_select, trace_spans
from app.ingest.error_class import ErrorClass

router = APIRouter(prefix="/projects/{project_id}", tags=["traces"])

# Also readable by an API key with `traces:read`, for the project it belongs to.
ProjectReader = Annotated[ReadAccess, Depends(require(Permission.PROJECT_READ, allow_api_key=True))]
OptionalText = Annotated[str | None, Query(max_length=256)]

FILTER_LOOKBACK = timedelta(days=30)
MAX_FILTER_VALUES = 100
MAX_ERROR_MESSAGE_LENGTH = 500


def _summary(
    trace: Trace, models: list[str] | None, error_message: str | None, error_class: str | None
) -> TraceSummaryOut:
    return TraceSummaryOut(
        trace_id=trace.trace_id,
        name=trace.name,
        environment=trace.environment,
        release=trace.release,
        external_user_id=trace.external_user_id,
        session_id=trace.session_id,
        tags=list(trace.tags),
        started_at=trace.started_at,
        ended_at=trace.ended_at,
        duration_ms=(trace.ended_at - trace.started_at).total_seconds() * 1000,
        span_count=trace.span_count,
        error_count=trace.error_count,
        input_tokens=trace.input_tokens,
        output_tokens=trace.output_tokens,
        cost_usd=trace.cost_usd,
        has_unpriced=trace.has_unpriced,
        models=sorted(models or []),
        error_message=error_message[:MAX_ERROR_MESSAGE_LENGTH] if error_message else None,
        error_class=ErrorClass(error_class) if error_class else None,
    )


@router.get("/traces", response_model=Page[TraceSummaryOut])
async def list_traces(
    project_id: uuid.UUID,
    access: ProjectReader,
    db: DbSession,
    window: Window,
    environment: OptionalText = None,
    release: OptionalText = None,
    model: OptionalText = None,
    status: Literal["ok", "error"] | None = None,
    error_class: ErrorClass | None = None,
    user_id: OptionalText = None,
    session_id: OptionalText = None,
    tag: OptionalText = None,
    q: OptionalText = None,
    limit: PageLimit = DEFAULT_PAGE_SIZE,
    cursor: Annotated[str | None, Query()] = None,
) -> Page[TraceSummaryOut]:
    project = access.require_project()
    query = (
        summary_select()
        .where(
            Trace.project_id == project.id,
            Trace.started_at >= window.start,
            Trace.started_at < window.end,
        )
        .order_by(Trace.started_at.desc(), Trace.trace_id.desc())
        .limit(limit + 1)
    )

    if environment is not None:
        query = query.where(Trace.environment == environment)
    if release is not None:
        query = query.where(Trace.release == release)
    if user_id is not None:
        query = query.where(Trace.external_user_id == user_id)
    if session_id is not None:
        query = query.where(Trace.session_id == session_id)
    if tag is not None:
        query = query.where(Trace.tags.contains([tag]))
    if status == "error":
        query = query.where(Trace.error_count > 0)
    elif status == "ok":
        query = query.where(Trace.error_count == 0)
    if model is not None:
        query = query.where(has_span(Span.model == model))
    if error_class is not None:
        query = query.where(has_span(Span.error_class == error_class.value))
    if q:
        query = query.where(
            or_(
                Trace.name.ilike(f"%{escape_like(q)}%", escape="\\"),
                Trace.trace_id == q.lower(),
            )
        )
    if cursor:
        started_at, trace_id = decode_cursor(cursor)
        query = query.where(
            or_(
                Trace.started_at < started_at,
                and_(Trace.started_at == started_at, Trace.trace_id < trace_id),
            )
        )

    rows = (await db.execute(query)).all()
    page = rows[:limit]
    next_cursor = None
    if len(rows) > limit:
        last = page[-1][0]
        next_cursor = encode_cursor(last.started_at, last.trace_id)
    return Page[TraceSummaryOut](
        items=[_summary(*row) for row in page],
        next_cursor=next_cursor,
    )


@router.get("/traces/{trace_id}", response_model=TraceDetailOut)
async def get_trace(
    project_id: uuid.UUID, trace_id: str, access: ProjectReader, db: DbSession
) -> TraceDetailOut:
    project = access.require_project()
    row = (
        await db.execute(
            summary_select().where(
                Trace.project_id == project.id, Trace.trace_id == trace_id.lower()
            )
        )
    ).one_or_none()
    if row is None:
        raise not_found()
    summary = _summary(*row)
    spans = await trace_spans(db, project.id, summary.trace_id)
    return TraceDetailOut(
        **summary.model_dump(),
        spans=[SpanOut.model_validate(span, from_attributes=True) for span in spans],
    )


@router.get("/sessions", response_model=Page[SessionSummaryOut])
async def list_sessions(
    project_id: uuid.UUID,
    access: ProjectReader,
    db: DbSession,
    window: Window,
    limit: PageLimit = DEFAULT_PAGE_SIZE,
    cursor: Annotated[str | None, Query()] = None,
) -> Page[SessionSummaryOut]:
    project = access.require_project()
    last_at = func.max(Trace.ended_at)
    query = (
        select(
            Trace.session_id,
            func.count().label("trace_count"),
            func.min(Trace.started_at).label("first_at"),
            last_at.label("last_at"),
            func.sum(Trace.cost_usd).label("cost_usd"),
            func.sum(Trace.error_count).label("error_count"),
        )
        .where(
            Trace.project_id == project.id,
            Trace.session_id.is_not(None),
            Trace.started_at >= window.start,
            Trace.started_at < window.end,
        )
        .group_by(Trace.session_id)
        .order_by(last_at.desc(), Trace.session_id.desc())
        .limit(limit + 1)
    )
    if cursor:
        cursor_last_at, cursor_session_id = decode_cursor(cursor)
        query = query.having(
            tuple_(last_at, Trace.session_id) < tuple_(cursor_last_at, cursor_session_id)
        )

    rows = (await db.execute(query)).all()
    page = rows[:limit]
    next_cursor = None
    if len(rows) > limit:
        last = page[-1]
        next_cursor = encode_cursor(last.last_at, last.session_id)
    items = [
        SessionSummaryOut(
            session_id=row.session_id,
            trace_count=row.trace_count,
            first_at=row.first_at,
            last_at=row.last_at,
            cost_usd=row.cost_usd,
            error_count=row.error_count,
        )
        for row in page
    ]
    return Page[SessionSummaryOut](items=items, next_cursor=next_cursor)


@router.get("/filters", response_model=FiltersOut)
async def list_filter_values(
    project_id: uuid.UUID, access: ProjectReader, db: DbSession
) -> FiltersOut:
    project = access.require_project()
    since = utcnow() - FILTER_LOOKBACK
    recent_traces = and_(Trace.project_id == project.id, Trace.started_at >= since)

    async def distinct_values(
        column: InstrumentedAttribute[str | None], *conditions: ColumnElement[bool]
    ) -> list[str]:
        result = await db.scalars(
            select(column)
            .where(*conditions, column.is_not(None))
            .distinct()
            .order_by(column)
            .limit(MAX_FILTER_VALUES)
        )
        return [value for value in result.all() if value is not None]

    recent_tags = select(func.unnest(Trace.tags).label("tag")).where(recent_traces).subquery()
    tags = await db.scalars(
        select(recent_tags.c.tag).distinct().order_by(recent_tags.c.tag).limit(MAX_FILTER_VALUES)
    )

    return FiltersOut(
        environments=await distinct_values(Trace.environment, recent_traces),
        releases=await distinct_values(Trace.release, recent_traces),
        models=await distinct_values(
            Span.model, Span.project_id == project.id, Span.started_at >= since
        ),
        tags=list(tags.all()),
    )
