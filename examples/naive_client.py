"""A deliberately careless LLM client, for the Spanlight Integration Lab.

It does what hurried code often does: retries at once on almost any error and ignores
`Retry-After`, drops a rejected parameter and resends, takes the end of a stream for the end of
the answer, and gives up on a slow call after two seconds only to ask again. Run it against a
gateway key with a fault profile and the Doctor flags each habit.

    python examples/naive_client.py --scenario rate_limited --rounds 5
"""

import re
import sys
from typing import Any

import httpx
import openai
from openai.types.chat import ChatCompletionMessageParam

from lab_common import (
    DEFAULT_MODEL,
    Completion,
    RoundContext,
    RunReport,
    StreamInterrupted,
    main,
    run_rounds,
)

VARIANT = "naive"
# Five attempts is what makes `retry_storm` fire on an error that repeats (five identical requests
# within a minute). `unsupported_parameter` stays under it on purpose: the first attempt carries
# `top_k`, the other four do not and share a hash, so the Doctor sees four same-request spans and
# reports only `unsupported_parameter_retried`. Changing this number changes that scenario.
MAX_ATTEMPTS = 5
TIMEOUT_S = 2.0
_QUOTED_NAME = re.compile(r"'([A-Za-z_][\w.]*)'")


def run(
    scenario: str,
    *,
    base_url: str,
    api_key: str,
    rounds: int,
    model: str = DEFAULT_MODEL,
    http_client: httpx.Client | None = None,
) -> RunReport:
    """Play `rounds` rounds of `scenario` with the naive policy."""
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
    )


def _play_round(ctx: RoundContext) -> None:
    messages = ctx.opening_messages()
    reply = _send_until_it_works(ctx, messages, ctx.extra_body)
    if ctx.stream:
        # The stream ended, so the answer must be whole: carry on with the next question.
        messages = [
            *messages,
            {"role": "assistant", "content": reply.text},
            {"role": "user", "content": "Thanks. Now give one concrete example."},
        ]
        _send_until_it_works(ctx, messages, None)


def _send_until_it_works(
    ctx: RoundContext,
    messages: list[ChatCompletionMessageParam],
    extra_body: dict[str, Any] | None,
) -> Completion:
    """Resend at once after any failure, up to `MAX_ATTEMPTS` attempts in all."""
    last: Exception | None = None
    for _ in range(MAX_ATTEMPTS):
        try:
            return ctx.send(messages, extra_body)
        except (openai.APIConnectionError, StreamInterrupted) as exc:
            last = exc  # a timeout, a refused or dropped connection
        except openai.APIStatusError as exc:
            if not _retryable(exc.status_code):
                raise
            last = exc
            rejected = _unsupported_parameter(exc)
            if rejected and extra_body and rejected in extra_body:
                extra_body = {k: v for k, v in extra_body.items() if k != rejected} or None
        except (openai.APIResponseValidationError, ValueError) as exc:
            last = exc  # a body that would not parse
    assert last is not None
    raise last


def _retryable(status: int) -> bool:
    return status in (400, 401, 403, 429) or status >= 500


def _unsupported_parameter(exc: openai.APIStatusError) -> str | None:
    """The parameter an `unsupported_parameter` error names, else `None`."""
    if exc.code != "unsupported_parameter":
        return None
    if isinstance(exc.param, str) and exc.param:
        return exc.param
    match = _QUOTED_NAME.search(exc.message)
    return match.group(1) if match else None


if __name__ == "__main__":
    sys.exit(main(VARIANT, run, __doc__.splitlines()[0] if __doc__ else VARIANT))
