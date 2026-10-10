"""Shared alert vocabulary. Pure: no database or framework imports."""

import uuid
from dataclasses import dataclass
from enum import StrEnum


class Metric(StrEnum):
    ERROR_RATE = "error_rate"
    P95_MS = "p95_ms"
    TTFT_P95_MS = "ttft_p95_ms"
    COST_USD = "cost_usd"
    LLM_CALLS = "llm_calls"
    TOKENS = "tokens"
    SPEND = "spend"


class Comparator(StrEnum):
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"


class AlertRuleKind(StrEnum):
    THRESHOLD = "threshold"
    ANOMALY = "anomaly"
    BUDGET = "budget"


class RuleStateName(StrEnum):
    OK = "ok"
    FIRING = "firing"


@dataclass(frozen=True, slots=True)
class MetricFilters:
    """Which spans a metric reads. Every field is an exact match; ``None`` means any value.

    ``environment`` is the trace's environment. ``source_key_id`` (the gateway key a call came
    through) and ``external_user_id`` (the trace's user) exist only on the raw rows, so either
    one makes the whole window read raw spans. Frozen and hashable: it is part of a cache key.
    """

    environment: str | None = None
    provider: str | None = None
    model: str | None = None
    source_key_id: uuid.UUID | None = None
    external_user_id: str | None = None

    @property
    def forces_raw(self) -> bool:
        return self.source_key_id is not None or self.external_user_id is not None
