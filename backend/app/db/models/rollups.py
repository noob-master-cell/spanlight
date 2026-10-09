"""Hourly rollups of spans and traces, rebuilt from the raw rows by the rollup job."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.base import Base, _pg_enum
from app.db.models.telemetry import SpanKind


class SpanRollupHourly(Base):
    """Span metrics for one project, hour and (environment, provider, model, kind) group.

    Unknown dimensions are NULL. `cost_usd` is NULL when every span in the row is unpriced.
    The histograms hold 32 buckets (see `app.rollups.buckets`). The migration has the
    unique constraint over the dimensions.
    """

    __tablename__ = "span_rollups_hourly"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    environment: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[SpanKind] = mapped_column(_pg_enum(SpanKind, "span_kind"))
    span_count: Mapped[int] = mapped_column(BigInteger)
    errors: Mapped[int] = mapped_column(BigInteger)
    input_tokens: Mapped[int] = mapped_column(BigInteger)
    output_tokens: Mapped[int] = mapped_column(BigInteger)
    cached_tokens: Mapped[int] = mapped_column(BigInteger)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric)
    unpriced_calls: Mapped[int] = mapped_column(BigInteger)
    latency_buckets: Mapped[list[int]] = mapped_column(ARRAY(Integer))
    ttft_buckets: Mapped[list[int]] = mapped_column(ARRAY(Integer))
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class TraceRollupHourly(Base):
    """Trace counts for one project, hour and environment (NULL when unknown)."""

    __tablename__ = "trace_rollups_hourly"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    bucket_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    environment: Mapped[str | None] = mapped_column(Text)
    traces: Mapped[int] = mapped_column(BigInteger)
    errored_traces: Mapped[int] = mapped_column(BigInteger)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
