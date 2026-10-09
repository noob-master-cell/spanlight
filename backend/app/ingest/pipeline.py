"""The ingestion pipeline: validate → normalize → upsert → recompute rollups.

Idempotent by construction: spans are upserted on their primary key and every
trace rollup is recomputed from the stored spans, so replaying a batch (SDK
retries, OTLP re-export) leaves exactly the same rows behind.

Concurrency: the trace upsert takes a row lock on each affected trace, so two
batches touching the same trace serialize; rows are written in sorted key
order so batches touching several traces cannot deadlock each other.
"""

import json
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError
from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Span, Trace
from app.db.rls import bind_project
from app.ingest.jsondepth import MAX_JSON_DEPTH, exceeds_depth
from app.ingest.normalize import NormalizedSpan, SpanRejectedError, normalize_span
from app.ingest.schemas import RejectedSpan, SpanIn
from app.pricing.cost import load_price_book


@dataclass(frozen=True)
class IngestTarget:
    project_id: uuid.UUID
    capture_payloads: bool


@dataclass
class IngestOutcome:
    accepted: int = 0
    rejected: list[RejectedSpan] = field(default_factory=list)


class InvalidJsonError(ValueError):
    pass


class ProjectGoneError(LookupError):
    """The target project was deleted before the batch could be written."""


# A shared lock on the project row, taken before any trace or span is written. The span INSERT
# needs it anyway (its foreign key check takes it at the end of the statement), but by then the
# trace upsert holds row locks on existing traces, which a project or organization deletion
# cascades into. The deletion holds the project row exclusively and waits for those traces, the
# batch holds the traces and waits for the project: a deadlock that fails one of the two requests.
# Taking the project first follows the lock order in `app.services.deletion`: a running deletion
# makes the batch wait and then find no project, and a running batch makes the deletion wait.
_KEY_SHARE_PROJECT = text("SELECT id FROM projects WHERE id = :project_id FOR KEY SHARE")


def parse_json_body(body: bytes) -> Any:
    """Parse JSON strictly (no NaN/Infinity) and strip NUL characters.

    Postgres rejects both in jsonb and text columns, and one bad value would
    otherwise abort the whole batch's transaction.
    """

    def reject_constant(name: str) -> Any:
        raise InvalidJsonError(f"{name} is not valid JSON")

    try:
        parsed = json.loads(body, parse_constant=reject_constant)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidJsonError("request body is not valid JSON") from exc
    except RecursionError as exc:  # nested deeper than the parser can follow
        raise InvalidJsonError(_TOO_DEEP) from exc
    if exceeds_depth(parsed):
        raise InvalidJsonError(_TOO_DEEP)
    return _strip_nul(parsed)


_TOO_DEEP = f"request body is nested more than {MAX_JSON_DEPTH} levels deep"


def _strip_nul(value: Any) -> Any:
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, list):
        return [_strip_nul(item) for item in value]
    if isinstance(value, dict):
        return {_strip_nul(key): _strip_nul(item) for key, item in value.items()}
    return value


async def ingest_spans(
    session: AsyncSession,
    target: IngestTarget,
    raw_spans: Sequence[Any],
    *,
    now: datetime | None = None,
) -> IngestOutcome:
    """Validate and store a batch of spans in one transaction. The caller commits.

    Raises `ProjectGoneError` when the project no longer exists; nothing is written then.
    """
    now = now or datetime.now(UTC)
    await bind_project(session, target.project_id)
    project = await session.execute(_KEY_SHARE_PROJECT, {"project_id": target.project_id})
    if project.scalar_one_or_none() is None:
        raise ProjectGoneError(str(target.project_id))
    prices = await load_price_book(session)

    outcome = IngestOutcome()
    accepted: dict[tuple[str, str], tuple[int, NormalizedSpan]] = {}

    for index, raw in enumerate(raw_spans):
        try:
            validated = SpanIn.model_validate(raw)
            normalized = normalize_span(
                validated, capture_payloads=target.capture_payloads, prices=prices, now=now
            )
        except ValidationError as exc:
            outcome.rejected.append(
                RejectedSpan(index=index, span_id=_raw_span_id(raw), reason=_first_error(exc))
            )
            continue
        except SpanRejectedError as exc:
            outcome.rejected.append(
                RejectedSpan(index=index, span_id=_raw_span_id(raw), reason=str(exc))
            )
            continue

        key = (normalized.trace_id, normalized.span_id)
        previous = accepted.get(key)
        if previous is not None:
            outcome.rejected.append(
                RejectedSpan(
                    index=previous[0],
                    span_id=normalized.span_id,
                    reason="duplicate span_id in batch; the later occurrence was kept",
                )
            )
        accepted[key] = (index, normalized)

    spans = [span for _, span in sorted(accepted.values(), key=lambda item: item[0])]
    if spans:
        await _write(session, target.project_id, spans)
    outcome.accepted = len(spans)
    outcome.rejected.sort(key=lambda rejection: rejection.index)
    return outcome


def _raw_span_id(raw: Any) -> str | None:
    if isinstance(raw, dict):
        span_id = raw.get("span_id")
        if isinstance(span_id, str):
            return span_id[:64]
    return None


def _first_error(exc: ValidationError) -> str:
    error = exc.errors()[0]
    location = ".".join(str(part) for part in error["loc"]) or "span"
    return f"{location}: {error['msg']}"


@dataclass
class _TraceRow:
    trace_id: str
    started_at: datetime
    ended_at: datetime
    name: str | None = None
    environment: str | None = None
    release: str | None = None
    external_user_id: str | None = None
    session_id: str | None = None
    tags: set[str] = field(default_factory=set)

    def merge(self, span: NormalizedSpan) -> None:
        """Trace-level fields: within a batch, the last non-null value wins."""
        self.started_at = min(self.started_at, span.started_at)
        self.ended_at = max(self.ended_at, span.ended_at)
        fields = span.trace
        self.name = fields.name or self.name
        self.environment = fields.environment or self.environment
        self.release = fields.release or self.release
        self.external_user_id = fields.external_user_id or self.external_user_id
        self.session_id = fields.session_id or self.session_id
        self.tags.update(fields.tags)


def _merge_traces(spans: Sequence[NormalizedSpan]) -> list[_TraceRow]:
    rows: dict[str, _TraceRow] = {}
    for span in spans:
        row = rows.get(span.trace_id)
        if row is None:
            row = _TraceRow(span.trace_id, span.started_at, span.ended_at)
            rows[span.trace_id] = row
        row.merge(span)
    return [rows[trace_id] for trace_id in sorted(rows)]


async def _write(
    session: AsyncSession, project_id: uuid.UUID, spans: Sequence[NormalizedSpan]
) -> None:
    traces = _merge_traces(spans)
    await _upsert_traces(session, project_id, traces)
    await _upsert_spans(session, project_id, spans)
    await _recompute_rollups(session, project_id, [trace.trace_id for trace in traces])


async def _upsert_traces(
    session: AsyncSession, project_id: uuid.UUID, traces: Sequence[_TraceRow]
) -> None:
    statement = insert(Trace).values(
        [
            {
                "project_id": project_id,
                "trace_id": trace.trace_id,
                "name": trace.name,
                "environment": trace.environment,
                "release": trace.release,
                "external_user_id": trace.external_user_id,
                "session_id": trace.session_id,
                "tags": sorted(trace.tags),
                "started_at": trace.started_at,
                "ended_at": trace.ended_at,
            }
            for trace in traces
        ]
    )
    excluded = statement.excluded
    statement = statement.on_conflict_do_update(
        index_elements=[Trace.project_id, Trace.trace_id],
        set_={
            "name": func.coalesce(excluded.name, Trace.name),
            "environment": func.coalesce(excluded.environment, Trace.environment),
            "release": func.coalesce(excluded.release, Trace.release),
            "external_user_id": func.coalesce(excluded.external_user_id, Trace.external_user_id),
            "session_id": func.coalesce(excluded.session_id, Trace.session_id),
            "tags": text(
                "ARRAY(SELECT DISTINCT tag FROM unnest(traces.tags || excluded.tags) AS tag "
                "ORDER BY tag)"
            ),
            "started_at": func.least(Trace.started_at, excluded.started_at),
            "ended_at": func.greatest(Trace.ended_at, excluded.ended_at),
        },
    )
    await session.execute(statement)


_SPAN_COLUMNS = (
    "parent_span_id",
    "kind",
    "name",
    "status",
    "status_message",
    "started_at",
    "ended_at",
    "provider",
    "model",
    "input_tokens",
    "output_tokens",
    "cached_tokens",
    "cost_usd",
    "pricing_version",
    "time_to_first_token_ms",
    "input",
    "output",
    "attributes",
    "truncated",
)


async def _upsert_spans(
    session: AsyncSession, project_id: uuid.UUID, spans: Sequence[NormalizedSpan]
) -> None:
    ordered = sorted(spans, key=lambda span: (span.trace_id, span.span_id))
    statement = insert(Span).values(
        [
            {
                "project_id": project_id,
                "trace_id": span.trace_id,
                "span_id": span.span_id,
                **{column: getattr(span, column) for column in _SPAN_COLUMNS},
            }
            for span in ordered
        ]
    )
    update_columns: dict[str, Any] = {
        column: statement.excluded[column] for column in _SPAN_COLUMNS
    }
    update_columns["ingested_at"] = func.now()
    statement = statement.on_conflict_do_update(
        index_elements=[Span.project_id, Span.trace_id, Span.span_id],
        set_=update_columns,
    )
    await session.execute(statement)


_RECOMPUTE_ROLLUPS = text(
    """
    UPDATE traces AS t
    SET span_count    = s.span_count,
        error_count   = s.error_count,
        input_tokens  = s.input_tokens,
        output_tokens = s.output_tokens,
        cost_usd      = s.cost_usd,
        has_unpriced  = s.has_unpriced,
        started_at    = s.started_at,
        ended_at      = s.ended_at
    FROM (
        SELECT trace_id,
               count(*)                                   AS span_count,
               count(*) FILTER (WHERE status = 'error')   AS error_count,
               coalesce(sum(input_tokens), 0)             AS input_tokens,
               coalesce(sum(output_tokens), 0)            AS output_tokens,
               sum(cost_usd)                              AS cost_usd,
               coalesce(
                   bool_or((kind = 'llm' OR model IS NOT NULL) AND cost_usd IS NULL),
                   false
               )                                          AS has_unpriced,
               min(started_at)                            AS started_at,
               max(ended_at)                              AS ended_at
        FROM spans
        WHERE project_id = :project_id AND trace_id = ANY(:trace_ids)
        GROUP BY trace_id
    ) AS s
    WHERE t.project_id = :project_id AND t.trace_id = s.trace_id
    """
)


async def _recompute_rollups(
    session: AsyncSession, project_id: uuid.UUID, trace_ids: Sequence[str]
) -> None:
    await session.execute(
        _RECOMPUTE_ROLLUPS, {"project_id": project_id, "trace_ids": list(trace_ids)}
    )
