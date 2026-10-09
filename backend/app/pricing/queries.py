"""Read queries over prices and the spans that found none."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ModelPrice

# Models listed at most; a project cannot make the answer unbounded by sending arbitrary names.
UNPRICED_MODELS_LIMIT = 100

# An LLM span is unpriced for want of a price when it reports both token counts (so a cost could
# be computed) and a model, yet its stored cost is NULL: the model matched no price at ingestion.
# Spans that lack a token count or a model are unpriced for another reason and are not listed.
# Runs under the caller's row-level security binding; the `project_id` filter is for the index.
_UNPRICED_MODELS = text(
    """
    SELECT s.provider,
           s.model,
           count(*)                           AS llm_calls,
           coalesce(sum(s.input_tokens), 0)   AS input_tokens,
           coalesce(sum(s.output_tokens), 0)  AS output_tokens
    FROM spans AS s
    WHERE s.project_id = :project_id
      AND s.started_at >= :start
      AND s.started_at < :end
      AND s.kind = 'llm'
      AND s.cost_usd IS NULL
      AND s.model IS NOT NULL
      AND s.input_tokens IS NOT NULL
      AND s.output_tokens IS NOT NULL
    GROUP BY s.provider, s.model
    ORDER BY llm_calls DESC, s.provider NULLS LAST, s.model
    LIMIT :limit
    """
)


@dataclass(frozen=True)
class UnpricedModel:
    provider: str | None
    model: str
    llm_calls: int
    input_tokens: int
    output_tokens: int


async def list_prices(db: AsyncSession) -> list[ModelPrice]:
    """Every row of the price table, in a stable order."""
    rows = await db.scalars(
        select(ModelPrice).order_by(
            ModelPrice.provider, ModelPrice.model_pattern, ModelPrice.effective_from
        )
    )
    return list(rows)


async def list_unpriced_models(
    db: AsyncSession, project_id: uuid.UUID, *, start: datetime, end: datetime
) -> list[UnpricedModel]:
    """Models a project called in `[start, end)` that no price covered, most-called first."""
    rows = await db.execute(
        _UNPRICED_MODELS,
        {"project_id": project_id, "start": start, "end": end, "limit": UNPRICED_MODELS_LIMIT},
    )
    return [
        UnpricedModel(
            provider=row.provider,
            model=row.model,
            llm_calls=row.llm_calls,
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
        )
        for row in rows
    ]
