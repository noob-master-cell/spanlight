"""What a detector returns: findings, their evidence and the vocabulary around them. Pure."""

from datetime import datetime, timedelta
from decimal import Decimal
from enum import StrEnum
from typing import Annotated

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    Strict,
    StrictInt,
    StrictStr,
    model_validator,
)

from app.core.decimals import decimal_to_str

MAX_EVIDENCE_TRACES = 20


# No silent float or bool coercion: a detector rounds to Decimal before it builds evidence. In JSON
# a Decimal is written in the canonical form (`"0.05"`, never `"0.0500"` or `"0E-8"`), so the
# stored evidence, the API and the `insight.opened` payload all agree; integers, strings and None
# are written unchanged.
def _metric_json(value: Decimal | int | str | None) -> str | int | None:
    return decimal_to_str(value) if isinstance(value, Decimal) else value


MetricValue = Annotated[
    Annotated[Decimal, Strict()] | StrictInt | StrictStr | None,
    PlainSerializer(_metric_json, when_used="json"),
]


class Severity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class InsightStatus(StrEnum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    MUTED = "muted"


class FailureLayer(StrEnum):
    """Where a problem lives."""

    CLIENT = "client"  # how the app calls the model API
    REQUEST = "request"  # what the app sends: prompts, parameters, context
    AGENT = "agent"  # tool orchestration
    PROVIDER = "provider"  # the model provider
    PLATFORM = "platform"  # Spanlight setup, such as prices
    TRAFFIC = "traffic"  # an aggregate symptom whose cause is still open


class Certainty(StrEnum):
    """How sure a finding is: it restates numbers, or a pattern that suggests the cause."""

    MEASURED = "measured"
    INFERRED = "inferred"


class Window(BaseModel):
    """A half-open time range: a span belongs to it when `start <= started_at < end`.

    The same convention as the traces API and the rollups, so evidence round-trips to the
    Traces page.
    """

    model_config = ConfigDict(frozen=True)

    start: AwareDatetime
    end: AwareDatetime

    @model_validator(mode="after")
    def _ordered(self) -> "Window":
        if self.end < self.start:
            raise ValueError("window end is before its start")
        return self

    @classmethod
    def ending_at(cls, end: datetime, length: timedelta) -> "Window":
        return cls(start=end - length, end=end)

    def contains(self, moment: datetime) -> bool:
        return self.start <= moment < self.end


class Evidence(BaseModel):
    """The traces and numbers behind a finding. Traces are the most recent first."""

    model_config = ConfigDict(frozen=True)

    trace_ids: list[str] = Field(default_factory=list, max_length=MAX_EVIDENCE_TRACES)
    metrics: dict[str, MetricValue]
    window: Window


class Finding(BaseModel):
    """One problem a detector found. It carries values, not prose.

    `fingerprint_key` identifies the problem within its kind (see `fingerprint`), and `params`
    are the formatted values the catalogue's title and summary templates need.
    """

    model_config = ConfigDict(frozen=True)

    kind: str = Field(min_length=1)
    severity: Severity
    fingerprint_key: str = Field(min_length=1)
    evidence: Evidence
    params: dict[str, str] = Field(default_factory=dict)
