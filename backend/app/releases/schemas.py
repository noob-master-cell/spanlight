"""What the release queries return and `compare` consumes, before it becomes a response."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelCount:
    """LLM calls of one release that answered from one model (`None`: the span named none)."""

    model: str | None
    calls: int


@dataclass(frozen=True)
class ErrorClassCount:
    """Failed spans of one release with one error class (`None`: no class was recorded)."""

    error_class: str | None
    count: int
