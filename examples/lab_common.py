"""Shared pieces of the Integration Lab example clients.

The two clients (`naive_client.py` and `corrected_client.py`) call a Spanlight gateway key that
has a fault profile attached (Gateway > Integration Lab). The gateway injects the failure; what
the client does about it is what the Doctor judges. This module holds everything the two share:
the scenario list, the OpenAI client factory, the `x-spanlight-*` headers, one HTTP attempt, the
round loop and the command line. Each client file holds only its own retry policy.
"""

import argparse
import os
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, cast

import httpx
import openai
from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam

SCENARIOS = (
    "healthy",
    "auth_expired",
    "scope_denied",
    "rate_limited",
    "unsupported_parameter",
    "provider_5xx",
    "malformed_json",
    "truncated_stream",
    "slow_response",
    "timeout",
)
"""The failure a run is set up for. The gateway key's fault profile decides what really fails."""

STREAMING_SCENARIOS = frozenset({"truncated_stream"})
"""Scenarios that call with `stream=True`; the gateway only truncates streams."""

UNSUPPORTED_PARAM = "top_k"
"""The request parameter the `unsupported_parameter` scenario sends (and the fault names)."""

DEFAULT_BASE_URL = "http://localhost:8000/gw/v1"
DEFAULT_MODEL = "gpt-4o-mini"
API_KEY_ENV = "SPANLIGHT_GATEWAY_KEY"

SESSION_HEADER = "x-spanlight-session"
TRACE_ID_HEADER = "x-spanlight-trace-id"
TAGS_HEADER = "x-spanlight-tags"


class IncompleteStreamError(RuntimeError):
    """A stream ended without a terminal `finish_reason`: the answer is cut off."""


class StreamInterrupted(RuntimeError):
    """The connection broke while a stream was being read."""


@dataclass(frozen=True)
class Completion:
    """What one successful attempt returned."""

    text: str
    finish_reason: str | None


@dataclass(frozen=True)
class RunReport:
    """The outcome of a run.

    `attempts` counts every HTTP request sent, retries included. `errors` counts rounds that
    ended in a failure; `outcomes` has one line per round.
    """

    session_id: str
    attempts: int
    errors: int
    outcomes: tuple[str, ...] = ()


@dataclass
class RoundContext:
    """One round: a trace id, the OpenAI client and a count of the attempts made."""

    client: OpenAI
    scenario: str
    model: str
    index: int
    trace_id: str
    attempts: int = 0
    headers: dict[str, str] = field(init=False)

    def __post_init__(self) -> None:
        self.headers = {TRACE_ID_HEADER: self.trace_id}

    @property
    def stream(self) -> bool:
        return self.scenario in STREAMING_SCENARIOS

    @property
    def extra_body(self) -> dict[str, Any] | None:
        """Request fields the OpenAI SDK has no argument for; `top_k` for its scenario."""
        return {UNSUPPORTED_PARAM: 40} if self.scenario == "unsupported_parameter" else None

    def opening_messages(self) -> list[ChatCompletionMessageParam]:
        """The round's first request. The trace id makes each round's request distinct."""
        prompt = (
            "In two or three sentences, explain what a retry budget is. "
            f"(lab round {self.index}, ref {self.trace_id[:8]})"
        )
        return [{"role": "user", "content": prompt}]

    def send(
        self, messages: list[ChatCompletionMessageParam], extra_body: dict[str, Any] | None
    ) -> Completion:
        """One HTTP attempt, no retry. Streams are read to their end."""
        self.attempts += 1
        if self.stream:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
                extra_body=extra_body,
                extra_headers=self.headers,
            )
            text: list[str] = []
            finish_reason: str | None = None
            try:
                for chunk in stream:
                    for choice in chunk.choices:
                        if choice.delta.content:
                            text.append(choice.delta.content)
                        if choice.finish_reason:
                            finish_reason = choice.finish_reason
            except openai.OpenAIError:
                raise
            except Exception as exc:  # a transport error from the HTTP library, whichever it is
                raise StreamInterrupted(f"stream broke: {type(exc).__name__}") from exc
            finally:
                stream.close()
            return Completion("".join(text), finish_reason)
        reply = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            extra_body=extra_body,
            extra_headers=self.headers,
        )
        first = reply.choices[0] if reply.choices else None
        if first is None:
            return Completion("", None)
        return Completion(first.message.content or "", first.finish_reason)


Round = Callable[[RoundContext], None]
"""One round of a client: calls `ctx.send` under the client's retry policy, raising on failure."""


def make_client(
    *,
    base_url: str,
    api_key: str,
    variant: str,
    session_id: str,
    timeout_s: float,
    http_client: httpx.Client | None = None,
) -> OpenAI:
    """An OpenAI client with its own retries off, so the client's policy is the only one."""
    return OpenAI(
        base_url=base_url,
        api_key=api_key,
        max_retries=0,
        timeout=timeout_s,
        # Any: newer openai releases type this as an `httpx2` client but still accept an
        # `httpx.Client` at runtime; older ones want `httpx.Client`.
        http_client=cast(Any, http_client),
        default_headers={SESSION_HEADER: session_id, TAGS_HEADER: f"lab:{variant}"},
    )


def run_rounds(
    variant: str,
    play: Round,
    *,
    scenario: str,
    base_url: str,
    api_key: str,
    rounds: int,
    timeout_s: float,
    model: str = DEFAULT_MODEL,
    http_client: httpx.Client | None = None,
    ends_run: Callable[[Exception], bool] | None = None,
) -> RunReport:
    """Play `rounds` rounds of `scenario`: one session for the run, one trace per round.

    A failed round is counted and the run goes on, unless `ends_run(exc)` says the failure ends
    the run: then the exception is raised out of here, and no later round is sent.
    """
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario {scenario!r}; choose one of {', '.join(SCENARIOS)}")
    session_id = f"lab-{variant}-{uuid.uuid4().hex[:12]}"
    client = make_client(
        base_url=base_url,
        api_key=api_key,
        variant=variant,
        session_id=session_id,
        timeout_s=timeout_s,
        http_client=http_client,
    )
    attempts = errors = 0
    outcomes: list[str] = []
    for index in range(1, rounds + 1):
        ctx = RoundContext(client, scenario, model, index, uuid.uuid4().hex)
        try:
            play(ctx)
        except Exception as exc:  # a failed round is reported, and the run goes on
            if ends_run is not None and ends_run(exc):
                raise
            errors += 1
            outcomes.append(
                f"round {index}: failed after {ctx.attempts} attempts: {_describe(exc)}"
            )
        else:
            outcomes.append(f"round {index}: ok after {ctx.attempts} attempts")
        attempts += ctx.attempts
    return RunReport(session_id, attempts, errors, tuple(outcomes))


def _describe(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {str(exc)[:200]}"


def main(
    variant: str,
    run: Callable[..., RunReport],
    description: str,
    argv: Sequence[str] | None = None,
) -> int:
    """The command line shared by both clients."""
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--scenario", choices=SCENARIOS, default="healthy")
    parser.add_argument("--rounds", type=int, default=5)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="the gateway's /gw/v1 URL")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument(
        "--api-key", default=os.environ.get(API_KEY_ENV), help=f"gateway key (or set {API_KEY_ENV})"
    )
    args = parser.parse_args(argv)
    if not args.api_key:
        parser.error(f"a gateway key is required: pass --api-key or set {API_KEY_ENV}")
    if args.rounds < 1:
        parser.error("--rounds must be at least 1")
    report: RunReport = run(
        args.scenario,
        base_url=args.base_url,
        api_key=args.api_key,
        rounds=args.rounds,
        model=args.model,
    )
    for line in report.outcomes:
        print(line)
    print(
        f"{variant} / {args.scenario}: {args.rounds} rounds, {report.attempts} attempts, "
        f"{report.errors} failed rounds, session {report.session_id}"
    )
    return 0
