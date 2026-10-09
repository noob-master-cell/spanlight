"""The price catalogue and the models a project has used without a price."""

from datetime import datetime

from app.api.schemas.common import ApiModel, Money


class PriceOut(ApiModel):
    provider: str
    model_pattern: str
    input_per_mtok: Money
    output_per_mtok: Money
    cached_input_per_mtok: Money | None
    effective_from: datetime
    version: str


class UnpricedModelOut(ApiModel):
    provider: str | None
    model: str
    llm_calls: int
    input_tokens: int
    output_tokens: int
