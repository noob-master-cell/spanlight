"""A careful LLM client, for the Spanlight Integration Lab: the naive client with its habits fixed.

It waits out `Retry-After` on 429 and backs off on 5xx, each for at most three attempts; it never
retries a 400, 401 or 403; it refuses a stream that ends without a `finish_reason`; and it gives a
slow call 60 seconds and does not ask again. The same fault profiles that make the naive client
trip the Doctor leave this one alone.

    python examples/corrected_client.py --scenario rate_limited --rounds 5
"""

import random
import sys
import time

import httpx
import openai

from lab_common import (
    DEFAULT_MODEL,
    Completion,
    IncompleteStreamError,
    RoundContext,
    RunReport,
    main,
    run_rounds,
)

__all__ = ["IncompleteStreamError", "run"]

VARIANT = "corrected"
MAX_ATTEMPTS = 3
TIMEOUT_S = 60.0
MAX_RETRY_AFTER_S = 30.0
RETRY_AFTER_PAD_S = 0.1
DEFAULT_RETRY_AFTER_S = 1.0
BACKOFF_BASE_S = 1.0
JITTER = 0.25


def run(
    scenario: str,
    *,
    base_url: str,
    api_key: str,
    rounds: int,
    model: str = DEFAULT_MODEL,
    http_client: httpx.Client | None = None,
) -> RunReport:
    """Play `rounds` rounds of `scenario` with the corrected policy."""
    return run_rounds(
        VARIANT,
        _play_round,
        scenario=scenario,
        base_url=base_url,
        api_key=api_key,
        rounds=rounds,
        timeout_s=TIMEOUT_S,
        model=model,
        http_client=http_client,
        ends_run=_ends_run,
    )


def _ends_run(exc: Exception) -> bool:
    """400, 401, 403 and an incomplete stream are bugs to fix, not conditions to carry on past."""
    if isinstance(exc, IncompleteStreamError):
        return True
    return isinstance(exc, openai.APIStatusError) and exc.status_code in (400, 401, 403)


def _play_round(ctx: RoundContext) -> None:
    messages = ctx.opening_messages()
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            reply = ctx.send(messages, ctx.extra_body)
        except openai.APIStatusError as exc:
            delay = _delay_before_retry(exc, attempt)
            if delay is None:
                raise
            time.sleep(delay)
            continue
        _require_whole_answer(ctx, reply)
        return


def _delay_before_retry(exc: openai.APIStatusError, attempt: int) -> float | None:
    """Seconds to wait before the next attempt, or `None` when the error is not worth one.

    Only 429 and 5xx are retried, and never past `MAX_ATTEMPTS`. A 429 waits the full
    `Retry-After` plus a small pad, and a `Retry-After` over the cap is not waited for at all
    (the error is raised); a 5xx backs off 1 s, then 2 s, with a little jitter.
    """
    if attempt >= MAX_ATTEMPTS:
        return None
    if exc.status_code == 429:
        wait = _retry_after_s(exc)
        return wait + RETRY_AFTER_PAD_S if wait <= MAX_RETRY_AFTER_S else None
    if exc.status_code >= 500:
        base: float = BACKOFF_BASE_S * (2.0 ** (attempt - 1))
        return base * (1 + random.uniform(0, JITTER))
    return None


def _retry_after_s(exc: openai.APIStatusError) -> float:
    raw: str = exc.response.headers.get("retry-after", "")
    try:
        return max(0.0, float(raw))
    except ValueError:
        return DEFAULT_RETRY_AFTER_S


def _require_whole_answer(ctx: RoundContext, reply: Completion) -> None:
    if ctx.stream and reply.finish_reason is None:
        raise IncompleteStreamError(
            f"stream ended after {len(reply.text)} characters without a finish_reason"
        )


if __name__ == "__main__":
    sys.exit(main(VARIANT, run, __doc__.splitlines()[0] if __doc__ else VARIANT))
