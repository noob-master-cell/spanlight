"""Traces and spans: the product's core data."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Computed,
    DateTime,
    Double,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.base import Base, _pg_enum


class SpanKind(enum.StrEnum):
    LLM = "llm"
    TOOL = "tool"
    RETRIEVAL = "retrieval"
    CHAIN = "chain"
    HTTP = "http"
    OTHER = "other"


class SpanStatus(enum.StrEnum):
    OK = "ok"
    ERROR = "error"
    UNSET = "unset"


class Trace(Base):
    __tablename__ = "traces"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    trace_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str | None] = mapped_column(Text)
    environment: Mapped[str | None] = mapped_column(Text)
    release: Mapped[str | None] = mapped_column(Text)
    external_user_id: Mapped[str | None] = mapped_column(Text)
    session_id: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    span_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    error_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    input_tokens: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    output_tokens: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(14, 8))
    has_unpriced: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))


class Span(Base):
    __tablename__ = "spans"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "trace_id"],
            ["traces.project_id", "traces.trace_id"],
            ondelete="CASCADE",
        ),
        # The windowed reads (overview, time series, models, rollups) are answered from this index
        # alone. Migration 0016 creates it; keep the two column lists in step. The migration also
        # sets the table's autovacuum insert triggers, which the model does not describe.
        Index(
            "spans_project_started_cov_idx",
            "project_id",
            "started_at",
            postgresql_include=[
                "trace_id",
                "kind",
                "status",
                "duration_ms",
                "cost_usd",
                "input_tokens",
                "output_tokens",
                "cached_tokens",
                "provider",
                "model",
                "time_to_first_token_ms",
            ],
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    trace_id: Mapped[str] = mapped_column(Text, primary_key=True)
    span_id: Mapped[str] = mapped_column(Text, primary_key=True)
    parent_span_id: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[SpanKind] = mapped_column(_pg_enum(SpanKind, "span_kind"))
    name: Mapped[str] = mapped_column(Text)
    status: Mapped[SpanStatus] = mapped_column(_pg_enum(SpanStatus, "span_status"))
    status_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[float] = mapped_column(
        Double,
        Computed("EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000", persisted=True),
    )
    provider: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    cached_tokens: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(14, 8))
    pricing_version: Mapped[str | None] = mapped_column(Text)
    time_to_first_token_ms: Mapped[float | None] = mapped_column(Double)
    # none_as_null: Python None must become SQL NULL ("not captured"), not JSON null.
    input: Mapped[Any | None] = mapped_column(JSONB(none_as_null=True))
    output: Mapped[Any | None] = mapped_column(JSONB(none_as_null=True))
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    truncated: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
