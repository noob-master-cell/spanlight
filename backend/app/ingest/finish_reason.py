"""Why a model stopped, in one vocabulary for every provider. Pure.

The span keeps the provider's raw value in its attributes; the `finish_reason` column holds the
canonical one: `stop`, `length`, `tool_calls`, `content_filter` or `other`.

The raw value comes from the first of these that is present: the span's own `finish_reason`
field, the gateway's `finish_reason` attribute, the SDK's `response.finish_reasons[0]` (OpenAI)
or `response.stop_reason` (Anthropic), and the OpenTelemetry `gen_ai.response.finish_reasons[0]`.
"""

from collections.abc import Mapping
from typing import Any

FINISH_REASONS = ("stop", "length", "tool_calls", "content_filter", "other")

_CANONICAL = {
    # OpenAI
    "stop": "stop",
    "length": "length",
    "tool_calls": "tool_calls",
    "function_call": "tool_calls",
    "content_filter": "content_filter",
    # Anthropic
    "end_turn": "stop",
    "stop_sequence": "stop",
    "max_tokens": "length",
    "tool_use": "tool_calls",
    "refusal": "content_filter",
    "pause_turn": "other",
}

# Where a span's attributes carry the raw value, in source order; True marks a list of reasons
# (one per choice), whose first element is the span's.
_ATTRIBUTE_SOURCES = (
    ("finish_reason", False),
    ("response.finish_reasons", True),
    ("response.stop_reason", False),
    ("gen_ai.response.finish_reasons", True),
)


def canonical_finish_reason(raw: str | None) -> str | None:
    """The canonical value of a provider's finish reason; None stays None."""
    if raw is None:
        return None
    return _CANONICAL.get(raw.strip().lower(), "other")


def raw_finish_reason(declared: str | None, attributes: Mapping[str, Any]) -> str | None:
    """The span's raw finish reason: its own field first, then the attributes in source order."""
    if declared:
        return declared
    for key, is_list in _ATTRIBUTE_SOURCES:
        value = attributes.get(key)
        if is_list:
            value = value[0] if isinstance(value, list) and value else None
        if isinstance(value, str) and value:
            return value
    return None
