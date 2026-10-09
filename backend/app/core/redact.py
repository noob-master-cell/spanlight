"""Secret redaction for captured payloads.

Applied to every string inside span input/output/attributes before storage.
Patterns are deliberately conservative: a missed secret is worse than a
redacted harmless string, but we avoid patterns broad enough to eat ordinary
prose (e.g. bare 40-char strings are not treated as AWS secrets unless they
are labelled as such).
"""

import re
from typing import Any

from app.core.security import ANY_KEY_PATTERN

REDACTED = "[REDACTED]"

_SECRET_PATTERNS: tuple[re.Pattern[str], ...] = (
    # Spanlight credentials of every kind (API keys, personal access tokens, gateway keys). A
    # payload readable by project viewers and read keys must never hold one: a token there would
    # hand its owner's access to everyone who can read spans. The shape comes from `security`.
    ANY_KEY_PATTERN,
    # Anthropic keys (must precede the generic sk- pattern).
    re.compile(r"sk-ant-[A-Za-z0-9_\-]{10,}"),
    # OpenAI-style keys, including sk-proj-… and sk-svcacct-….
    re.compile(r"sk-[A-Za-z0-9_\-]{16,}"),
    # Authorization header values.
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=\-]{8,}"),
    # AWS access key ids.
    re.compile(r"\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b"),
    # Labelled AWS secret access keys, e.g. `aws_secret_access_key = …`.
    re.compile(r"(?i)aws_secret_access_key[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9/+=]{40}"),
)

# 13-19 digits, optionally separated by single spaces or dashes.
_CARD_CANDIDATE = re.compile(r"\b\d(?:[ \-]?\d){12,18}\b")

MAX_DEPTH = 64


def luhn_valid(digits: str) -> bool:
    total = 0
    for index, char in enumerate(reversed(digits)):
        digit = int(char)
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def _redact_card(match: re.Match[str]) -> str:
    digits = re.sub(r"[ \-]", "", match.group(0))
    return REDACTED if luhn_valid(digits) else match.group(0)


def redact_text(value: str) -> str:
    for pattern in _SECRET_PATTERNS:
        value = pattern.sub(REDACTED, value)
    return _CARD_CANDIDATE.sub(_redact_card, value)


def redact_json(value: Any, *, depth: int = 0) -> Any:
    """Return a copy of a JSON-compatible value with secrets in strings replaced."""
    if isinstance(value, str):
        return redact_text(value)
    if depth >= MAX_DEPTH:
        return "[MAX_DEPTH]"
    if isinstance(value, dict):
        return {
            redact_text(str(key)): redact_json(item, depth=depth + 1) for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_json(item, depth=depth + 1) for item in value]
    return value
