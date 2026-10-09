"""The notification outbox: one row per notification waiting to be delivered, or already so."""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_id
from app.db.models.base import Base, _pg_enum


class NotificationStatus(enum.StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class NotificationOutbox(Base):
    __tablename__ = "notification_outbox"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=new_id)
    # Plain text, not an enum type: the set of kinds is owned by application code.
    kind: Mapped[str] = mapped_column(Text)
    channel_id: Mapped[uuid.UUID | None] = mapped_column(UUID)
    target: Mapped[dict[str, Any]] = mapped_column(JSONB)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[NotificationStatus] = mapped_column(
        _pg_enum(NotificationStatus, "notification_status"), server_default=text("'pending'")
    )
    attempts: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
