"""The spans the load-test seeder stores. Pure: no database, no clock, no files.

`build_batch` returns raw span dicts in the native ingestion format (`POST /v1/traces`), as the
pipeline's validation expects them. The same seed and batch index always give the same spans, so
a run can be repeated.
"""

import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

# Traces start somewhere in the 28 days before `now`, which is when the seeder started. A project
# keeps 30 days by default and the retention job deletes anything older, so this leaves two days
# before seeded data could be deleted. The newest trace starts five minutes before `now` and the
# longest trace lasts under four, so no span ends in the future, which the pipeline rejects.
SPREAD = timedelta(days=28)
MIN_AGE = timedelta(minutes=5)

ERROR_RATE = 0.02  # share of spans that fail


@dataclass(frozen=True)
class ModelChoice:
    provider: str
    model: str
    weight: int


# Mostly models with a published price (`app.pricing.prices`) and one without, so the cost of
# those spans stays unknown as it would in production.
MODELS = (
    ModelChoice("anthropic", "claude-haiku-4-5", 35),
    ModelChoice("openai", "gpt-4o-mini", 25),
    ModelChoice("anthropic", "claude-sonnet-4-5", 15),
    ModelChoice("openai", "gpt-4.1", 10),
    ModelChoice("openai", "gpt-4o", 8),
    ModelChoice("ollama", "llama3.2", 7),
)
MODEL_WEIGHTS = [choice.weight for choice in MODELS]

SPAN_NAMES = {
    "llm": "chat completion",
    "tool": "lookup",
    "retrieval": "search",
    "chain": "agent run",
}
CHILD_KINDS = ("llm", "tool", "retrieval")
CHILD_WEIGHTS = (70, 20, 10)
TRACE_NAMES = ("support-agent", "rag-answer", "summarize-ticket", "classify-intent", "draft-reply")
RELEASES = ("2026.09.1", "2026.09.2", "2026.10.0")
TAGS = ("beta", "vip", "eval", "retry")
ERROR_MESSAGES = ("upstream timeout", "rate limited by the provider", "context length exceeded")

_SENTENCES = (
    "The customer asks for a refund on the last invoice and says the card was charged twice.",
    "Please confirm the shipping address before the order leaves the warehouse tomorrow.",
    "The subscription renews on the first of the month unless the plan is cancelled before then.",
    "Summarize the ticket history and list the open questions for the account owner.",
    "The password reset link expired, so the agent sends a new one to the registered email.",
    "Search the policy documents for the warranty terms that apply to this product.",
    "The delivery is late because the carrier lost the parcel, so a replacement ships today.",
    "Escalate the issue to the billing team and keep the customer updated about the status.",
    "Based on the retrieved context, the exchange window is thirty days from the delivery date.",
    "The model answers in two short paragraphs and cites the source document it relied on.",
    "Classify the request as a payment problem, a delivery problem or a question about the plan.",
    "Draft a polite reply that apologizes for the delay and offers a discount on the next order.",
)
# Payload text is cut from one fixed text instead of being generated per span: it is the cheapest
# way to get varied payloads of a chosen length, and it is the same on every run.
_CORPUS = " ".join(
    random.Random("spanlight-load-corpus").choices(_SENTENCES, k=200)  # noqa: S311 - test data
)


def _hex(rng: random.Random, bits: int) -> str:
    # `| 1` keeps the identifier non-zero, which the schema rejects.
    return f"{rng.getrandbits(bits) | 1:0{bits // 4}x}"


def _text(rng: random.Random, low: int, high: int) -> str:
    length = rng.randint(low, high)
    start = rng.randrange(len(_CORPUS) - high)
    return _CORPUS[start : start + length]


def _lognormal(rng: random.Random, median: float, sigma: float, low: float, high: float) -> float:
    return min(max(rng.lognormvariate(math.log(median), sigma), low), high)


def _duration_ms(rng: random.Random, kind: str) -> float:
    if kind == "llm":
        return _lognormal(rng, 1200.0, 0.7, 80.0, 45_000.0)
    if kind == "tool":
        return _lognormal(rng, 150.0, 0.8, 20.0, 800.0)
    return _lognormal(rng, 60.0, 0.6, 15.0, 300.0)


def _span(
    rng: random.Random,
    trace_id: str,
    parent_id: str | None,
    kind: str,
    start: datetime,
    duration_ms: float,
    span_id: str | None = None,
) -> dict[str, Any]:
    """The fields every kind of span has. About `ERROR_RATE` of them fail and have no output."""
    failed = rng.random() < ERROR_RATE
    return {
        "trace_id": trace_id,
        "span_id": span_id or _hex(rng, 64),
        "parent_span_id": parent_id,
        "name": SPAN_NAMES[kind],
        "kind": kind,
        "status": "error" if failed else "ok",
        "status_message": rng.choice(ERROR_MESSAGES) if failed else None,
        "start_time": start.isoformat(),
        "end_time": (start + timedelta(milliseconds=duration_ms)).isoformat(),
        "input": _text(rng, 200, 780),
        "output": None if failed else _text(rng, 200, 780),
    }


def _add_llm_fields(rng: random.Random, span: dict[str, Any], duration_ms: float) -> None:
    choice = rng.choices(MODELS, weights=MODEL_WEIGHTS)[0]
    span["provider"] = choice.provider
    span["model"] = choice.model
    if span["status"] == "error":
        return  # a failed call reports no usage, so its cost stays unknown
    input_tokens = int(_lognormal(rng, 900.0, 0.9, 20.0, 30_000.0))
    cached = int(input_tokens * rng.uniform(0.2, 0.8)) if rng.random() < 0.3 else 0
    span["usage"] = {
        "input_tokens": input_tokens,
        "output_tokens": int(_lognormal(rng, 250.0, 0.8, 5.0, 4_000.0)),
        "cached_tokens": cached,
    }
    if rng.random() < 0.7:
        span["time_to_first_token_ms"] = duration_ms * rng.uniform(0.05, 0.35)


def _trace_fields(rng: random.Random) -> dict[str, Any]:
    return {
        "name": rng.choice(TRACE_NAMES),
        "environment": rng.choices(("production", "staging"), weights=(80, 20))[0],
        "release": rng.choice(RELEASES),
        "user_id": f"user-{rng.randrange(2000)}",
        "session_id": f"session-{rng.randrange(60_000)}",
        "tags": rng.sample(TAGS, k=rng.randrange(3)),
    }


def _build_trace(rng: random.Random, size: int, started_at: datetime) -> list[dict[str, Any]]:
    """One trace of `size` spans: a single LLM call, or a root span with `size - 1` children."""
    trace_id = _hex(rng, 128)
    if size == 1:
        duration_ms = _duration_ms(rng, "llm")
        only = _span(rng, trace_id, None, "llm", started_at, duration_ms)
        _add_llm_fields(rng, only, duration_ms)
        only["trace"] = _trace_fields(rng)
        return [only]

    root_id = _hex(rng, 64)
    children: list[dict[str, Any]] = []
    cursor = started_at + timedelta(milliseconds=rng.randint(5, 40))
    for _ in range(size - 1):
        kind = rng.choices(CHILD_KINDS, weights=CHILD_WEIGHTS)[0]
        duration_ms = _duration_ms(rng, kind)
        child = _span(rng, trace_id, root_id, kind, cursor, duration_ms)
        if kind == "llm":
            _add_llm_fields(rng, child, duration_ms)
        children.append(child)
        cursor += timedelta(milliseconds=duration_ms + rng.randint(1, 30))
    total_ms = (cursor - started_at).total_seconds() * 1000
    root = _span(rng, trace_id, None, "chain", started_at, total_ms, span_id=root_id)
    root["trace"] = _trace_fields(rng)
    return [root, *children]


def build_batch(seed: int, index: int, count: int, now: datetime) -> list[dict[str, Any]]:
    """`count` spans in whole traces (the last one is cut short), the same for the same inputs."""
    rng = random.Random(f"{seed}:{index}")  # noqa: S311 - reproducible test data, not a secret
    newest_start = now - MIN_AGE
    spans: list[dict[str, Any]] = []
    while len(spans) < count:
        size = min(rng.randint(1, 6), count - len(spans))
        started_at = newest_start - timedelta(seconds=rng.uniform(0, SPREAD.total_seconds()))
        spans.extend(_build_trace(rng, size, started_at))
    return spans
