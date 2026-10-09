"""The versioned model price table."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_id
from app.db.models.base import Base


class ModelPrice(Base):
    __tablename__ = "model_prices"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=new_id)
    provider: Mapped[str] = mapped_column(Text)
    model_pattern: Mapped[str] = mapped_column(Text)
    input_per_mtok: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    output_per_mtok: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    cached_input_per_mtok: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    version: Mapped[str] = mapped_column(Text)
