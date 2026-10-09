"""Record the gateway contract-test fixtures from the real provider APIs.

Run from `backend/`, by hand, once per fixture refresh. It never runs in CI and refuses to start
when the `CI` environment variable is set:

    ANTHROPIC_API_KEY=... uv run python scripts/record_gateway_fixtures.py --max-usd 0.05
    OPENAI_API_KEY=... uv run python scripts/record_gateway_fixtures.py --max-usd 0.05 --openai

It sends a handful of tiny requests with raw httpx (so streaming bytes are captured verbatim),
writes the responses under `tests/gateway/fixtures/<provider>/` and scrubs provider ids on the
way out. The API keys come from the environment only and are never written anywhere; a fixture
that still contains a key-shaped string aborts the run.

Spend is capped. `--max-usd` is required and may not exceed `HARD_CAP_USD`. Before every call the
script estimates the worst case (input size, plus `max_tokens` priced as output) and stops
without calling when that would pass the cap; after every call it adds the cost computed from the
returned usage, priced from the same seed table the app uses. `--dry-run` prints the plan and the
worst-case total without calling anything.

The Anthropic `error_529.json` and the OpenAI `error_429.json` fixtures are constructed by hand
(an overloaded or rate-limited response cannot be triggered on demand); this script leaves them
alone. `--openai` replaces the constructed OpenAI success fixtures with recordings: update
`tests/gateway/fixtures/README.md` to match.
"""

import argparse
import base64
import json
import math
import os
import re
import shutil
import struct
import sys
import tempfile
import zlib
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import httpx

from app.pricing.prices import SEED_PRICES, SeedPrice

HARD_CAP_USD = Decimal("0.10")
FIXTURE_ROOT = Path(__file__).resolve().parent.parent / "tests" / "gateway" / "fixtures"
ANTHROPIC_MODEL = "claude-haiku-4-5"
OPENAI_MODEL = "gpt-4.1-mini"
ANTHROPIC_VERSION = "2023-06-01"
TIMEOUT_SECONDS = 60.0
# Worst-case allowance for the tool definitions the provider adds to the prompt.
TOOL_PROMPT_OVERHEAD_TOKENS = 700
# Anthropic bills prompt-cache writes at 1.25x the input rate.
CACHE_WRITE_MULTIPLIER = Decimal("1.25")
MILLION = Decimal(1_000_000)

PROMPT = "Say hello in five words."
TOOL_PROMPT = "What is the weather in Paris and in Tokyo? Call the tool once for each city."
VISION_PROMPT = "Describe this image in one short sentence."
WEATHER_DESCRIPTION = "Get the current weather for a city."
WEATHER_PARAMETERS: dict[str, Any] = {
    "type": "object",
    "properties": {
        "city": {"type": "string", "description": "City name"},
        "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
    },
    "required": ["city", "unit"],
}

# Provider ids that carry no meaning in a fixture. Group 1 is the prefix, group 2 the separator.
_ID_PATTERN = re.compile(
    r"\b(msg|toolu|req|resp|call|chatcmpl|fp|rs|fc|ws|org)([_-])(?!test)[A-Za-z0-9]{6,}"
)
_KEY_PATTERN = re.compile(r"sk-[A-Za-z0-9_-]{16,}")


@dataclass(frozen=True)
class Provider:
    name: str
    url: str
    key_env: str
    headers: Callable[[str], dict[str, str]]
    model: str


@dataclass(frozen=True)
class Case:
    provider: Provider
    filename: str
    body: dict[str, Any]
    stream: bool
    max_output_tokens: int
    tools: bool = False


@dataclass(frozen=True)
class Tokens:
    """Billable token counts, split so `input` never includes cached tokens."""

    input: int
    cache_write: int
    cache_read: int
    output: int


ANTHROPIC = Provider(
    name="anthropic",
    url="https://api.anthropic.com/v1/messages",
    key_env="ANTHROPIC_API_KEY",
    headers=lambda key: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
    },
    model=ANTHROPIC_MODEL,
)
OPENAI_CHAT = Provider(
    name="openai",
    url="https://api.openai.com/v1/chat/completions",
    key_env="OPENAI_API_KEY",
    headers=lambda key: {"authorization": f"Bearer {key}", "content-type": "application/json"},
    model=OPENAI_MODEL,
)
OPENAI_RESPONSES = Provider(
    name="openai",
    url="https://api.openai.com/v1/responses",
    key_env="OPENAI_API_KEY",
    headers=OPENAI_CHAT.headers,
    model=OPENAI_MODEL,
)


def tiny_png_base64() -> str:
    """An 8x8 solid red PNG, built in code so no image file lives in the repo."""
    width = height = 8
    rows = b"".join(b"\x00" + b"\xff\x00\x00" * width for _ in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )
    return base64.b64encode(png).decode("ascii")


def anthropic_cases() -> list[Case]:
    image = {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/png", "data": tiny_png_base64()},
    }
    tool = {
        "name": "get_weather",
        "description": WEATHER_DESCRIPTION,
        "input_schema": WEATHER_PARAMETERS,
    }

    def body(max_tokens: int, content: Any, *, stream: bool = False, tools: bool = False) -> Case:
        payload: dict[str, Any] = {
            "model": ANTHROPIC_MODEL,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": content}],
        }
        if stream:
            payload["stream"] = True
        if tools:
            payload["tools"] = [tool]
            payload["tool_choice"] = {"type": "any"}
        return Case(ANTHROPIC, "", payload, stream, max_tokens, tools)

    def named(filename: str, case: Case) -> Case:
        return Case(
            case.provider, filename, case.body, case.stream, case.max_output_tokens, case.tools
        )

    return [
        named("messages.json", body(32, PROMPT)),
        named("messages_stream.sse", body(32, PROMPT, stream=True)),
        named("messages_tools.json", body(200, TOOL_PROMPT, tools=True)),
        named("messages_tools_stream.sse", body(200, TOOL_PROMPT, stream=True, tools=True)),
        named(
            "messages_vision.json",
            body(48, [image, {"type": "text", "text": VISION_PROMPT}]),
        ),
    ]


def openai_cases() -> list[Case]:
    image = {
        "type": "image_url",
        "image_url": {"url": f"data:image/png;base64,{tiny_png_base64()}"},
    }
    tool = {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": WEATHER_DESCRIPTION,
            "parameters": WEATHER_PARAMETERS,
        },
    }

    def chat(
        filename: str, content: Any, max_tokens: int, *, stream: bool = False, tools: bool = False
    ) -> Case:
        payload: dict[str, Any] = {
            "model": OPENAI_MODEL,
            "max_completion_tokens": max_tokens,
            "messages": [{"role": "user", "content": content}],
        }
        if stream:
            payload["stream"] = True
            payload["stream_options"] = {"include_usage": True}
        if tools:
            payload["tools"] = [tool]
            payload["tool_choice"] = "required"
        return Case(OPENAI_CHAT, filename, payload, stream, max_tokens, tools)

    def responses(filename: str, *, stream: bool) -> Case:
        payload: dict[str, Any] = {"model": OPENAI_MODEL, "input": PROMPT, "max_output_tokens": 32}
        if stream:
            payload["stream"] = True
        return Case(OPENAI_RESPONSES, filename, payload, stream, 32)

    return [
        chat("chat.json", PROMPT, 32),
        chat("chat_stream.sse", PROMPT, 32, stream=True),
        chat("chat_tools.json", TOOL_PROMPT, 200, tools=True),
        chat("chat_tools_stream.sse", TOOL_PROMPT, 200, stream=True, tools=True),
        chat("chat_vision.json", [{"type": "text", "text": VISION_PROMPT}, image], 48),
        responses("responses.json", stream=False),
        responses("responses_stream.sse", stream=True),
    ]


def seed_price(provider: str, model: str) -> SeedPrice:
    for price in SEED_PRICES:
        if price.provider == provider and price.model_pattern == model:
            return price
    msg = f"no seed price for {provider}/{model}; add it to app/pricing/prices.py first"
    raise SystemExit(msg)


def cost_usd(price: SeedPrice, tokens: Tokens) -> Decimal:
    cached_rate = price.cached_input_per_mtok
    if cached_rate is None:
        cached_rate = price.input_per_mtok
    total = (
        Decimal(tokens.input) * price.input_per_mtok
        + Decimal(tokens.cache_write) * price.input_per_mtok * CACHE_WRITE_MULTIPLIER
        + Decimal(tokens.cache_read) * cached_rate
        + Decimal(tokens.output) * price.output_per_mtok
    )
    return total / MILLION


def worst_case_usd(case: Case, price: SeedPrice) -> Decimal:
    """Upper bound before the call: two characters per input token, `max_tokens` all output."""
    request_chars = len(json.dumps(case.body))
    input_tokens = math.ceil(request_chars / 2)
    if case.tools:
        input_tokens += TOOL_PROMPT_OVERHEAD_TOKENS
    return cost_usd(price, Tokens(input_tokens, 0, 0, case.max_output_tokens))


def sse_events(text: str) -> Iterator[dict[str, Any]]:
    for line in text.splitlines():
        if not line.startswith("data:"):
            continue
        payload = line.removeprefix("data:").strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            yield event


def _count(usage: Mapping[str, Any], key: str) -> int:
    value = usage.get(key)
    return value if isinstance(value, int) else 0


def _anthropic_tokens(usage: Mapping[str, Any]) -> Tokens:
    return Tokens(
        input=_count(usage, "input_tokens"),
        cache_write=_count(usage, "cache_creation_input_tokens"),
        cache_read=_count(usage, "cache_read_input_tokens"),
        output=_count(usage, "output_tokens"),
    )


def _openai_tokens(usage: Mapping[str, Any]) -> Tokens:
    """OpenAI counts cached tokens inside the prompt total; split them out."""
    prompt_key = "prompt_tokens" if "prompt_tokens" in usage else "input_tokens"
    output_key = "completion_tokens" if "completion_tokens" in usage else "output_tokens"
    details = usage.get("prompt_tokens_details") or usage.get("input_tokens_details") or {}
    cached = _count(details, "cached_tokens") if isinstance(details, dict) else 0
    return Tokens(
        input=max(_count(usage, prompt_key) - cached, 0),
        cache_write=0,
        cache_read=cached,
        output=_count(usage, output_key),
    )


def _usage_objects(payload: Any) -> Iterator[Mapping[str, Any]]:
    """Every `usage` object in a response body or in a stream's events, in order."""
    if isinstance(payload, dict):
        usage = payload.get("usage")
        if isinstance(usage, dict):
            yield usage
        for key in ("message", "response"):
            nested = payload.get(key)
            if isinstance(nested, dict):
                yield from _usage_objects(nested)


def extract_tokens(case: Case, text: str) -> Tokens | None:
    payloads: Sequence[Any] = list(sse_events(text)) if case.stream else [json.loads(text)]
    convert = _anthropic_tokens if case.provider.name == "anthropic" else _openai_tokens
    merged: Tokens | None = None
    for payload in payloads:
        for usage in _usage_objects(payload):
            tokens = convert(usage)
            # Anthropic splits usage across message_start (input) and message_delta (output):
            # keep the largest of each count, which is the final cumulative figure.
            merged = tokens if merged is None else _max_tokens(merged, tokens)
    return merged


def _max_tokens(first: Tokens, second: Tokens) -> Tokens:
    return Tokens(
        input=max(first.input, second.input),
        cache_write=max(first.cache_write, second.cache_write),
        cache_read=max(first.cache_read, second.cache_read),
        output=max(first.output, second.output),
    )


def scrub(text: str) -> str:
    """Replace provider ids with stable fake ones; abort when a key-shaped string survives."""
    seen: dict[str, str] = {}

    def replace(match: re.Match[str]) -> str:
        original = match.group(0)
        if original not in seen:
            seen[original] = f"{match.group(1)}{match.group(2)}test_{len(seen) + 1:04d}"
        return seen[original]

    scrubbed = _ID_PATTERN.sub(replace, text)
    if _KEY_PATTERN.search(scrubbed):
        msg = "a key-shaped string survived scrubbing; refusing to write the fixture"
        raise SystemExit(msg)
    return scrubbed


def stream_problem(case: Case, text: str) -> str | None:
    """Why a 200 stream is not a clean, complete recording, or None when it is."""
    events = list(sse_events(text))
    if any(event.get("type") == "error" or "error" in event for event in events):
        return "stream contains an error event"
    kinds = {event.get("type") for event in events}
    if case.provider.name == "anthropic":
        return None if "message_stop" in kinds else "stream ended without message_stop"
    if case.provider.url.endswith("/responses"):
        return None if "response.completed" in kinds else "stream ended without response.completed"
    done = any(line.strip() == "data: [DONE]" for line in text.splitlines())
    return None if done else "stream ended without data: [DONE]"


def render(case: Case, raw: bytes) -> str:
    text = scrub(raw.decode("utf-8").replace("\r\n", "\n"))
    if case.stream:
        return text if text.endswith("\n") else text + "\n"
    return json.dumps(json.loads(text), indent=2, ensure_ascii=False) + "\n"


def send(client: httpx.Client, case: Case, key: str) -> tuple[int, bytes]:
    headers = case.provider.headers(key)
    if case.stream:
        with client.stream("POST", case.provider.url, headers=headers, json=case.body) as response:
            return response.status_code, b"".join(response.iter_bytes())
    response = client.post(case.provider.url, headers=headers, json=case.body)
    return response.status_code, response.content


def parse_usd(value: str) -> Decimal:
    """argparse type for dollar amounts: a clean error for text, `nan` and `inf`."""
    try:
        amount = Decimal(value)
    except InvalidOperation:
        msg = f"not a number: {value!r}"
        raise argparse.ArgumentTypeError(msg) from None
    if not amount.is_finite():
        msg = f"must be a finite number: {value!r}"
        raise argparse.ArgumentTypeError(msg)
    return amount


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Record gateway contract fixtures.")
    parser.add_argument(
        "--max-usd",
        required=True,
        type=parse_usd,
        help=f"spend cap in USD; must be greater than 0 and at most {HARD_CAP_USD}",
    )
    parser.add_argument("--openai", action="store_true", help="also re-record the OpenAI fixtures")
    parser.add_argument(
        "--dry-run", action="store_true", help="print the plan and worst-case cost, call nothing"
    )
    return parser.parse_args(argv)


def check_cap(max_usd: Decimal) -> None:
    if max_usd <= 0 or max_usd > HARD_CAP_USD:
        msg = f"--max-usd must be greater than 0 and at most {HARD_CAP_USD}; got {max_usd}"
        raise SystemExit(msg)


def plan(with_openai: bool) -> list[Case]:
    cases = anthropic_cases()
    if with_openai:
        cases += openai_cases()
    return cases


def run(cases: Sequence[Case], cap: Decimal, keys: Mapping[str, str]) -> int:
    """Record every case into a temp dir; move the set into place only if all succeeded."""
    spent = Decimal(0)
    recorded: list[str] = []
    with (
        httpx.Client(timeout=TIMEOUT_SECONDS) as client,
        tempfile.TemporaryDirectory(prefix="gateway-fixtures-") as staging,
    ):
        for case in cases:
            price = seed_price(case.provider.name, case.provider.model)
            worst = worst_case_usd(case, price)
            if spent + worst > cap:
                print(f"STOP before {case.filename}: spent ${spent:.6f} + worst ${worst:.6f} > cap")
                break
            status, raw = send(client, case, keys[case.provider.key_env])
            if status != 200:
                detail = scrub(raw.decode("utf-8", "replace"))[:300]
                print(f"STOP at {case.filename}: HTTP {status}: {detail}")
                break
            text = raw.decode("utf-8")
            problem = stream_problem(case, text) if case.stream else None
            tokens = extract_tokens(case, text)
            # No usage, or a broken stream whose usage is partial: charge the worst case.
            spent += cost_usd(price, tokens) if tokens and not problem else worst
            if problem:
                print(f"STOP at {case.filename}: {problem}; nothing written for it")
                break
            target = Path(staging) / case.provider.name / case.filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(render(case, raw), encoding="utf-8", newline="\n")
            recorded.append(f"{case.provider.name}/{case.filename}")
            print(f"recorded {recorded[-1]}  (running spend ${spent:.6f})")
        complete = len(recorded) == len(cases)
        if complete:
            for name in recorded:
                destination = FIXTURE_ROOT / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(Path(staging) / name, destination)
    stamp = datetime.now(UTC).date().isoformat()
    print(f"\nestimated spend ${spent:.6f} of ${cap} cap; {len(recorded)}/{len(cases)} recorded")
    if not complete:
        print("run incomplete: no fixture was written; existing fixtures are untouched")
        return 1
    for name in recorded:
        print(f"README provenance: {name} recorded {stamp}")
    return 0


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    check_cap(args.max_usd)
    if os.environ.get("CI"):
        print("refusing to run in CI: this script spends real money", file=sys.stderr)
        return 2
    cases = plan(args.openai)
    if args.dry_run:
        total = Decimal(0)
        for case in cases:
            worst = worst_case_usd(case, seed_price(case.provider.name, case.provider.model))
            total += worst
            print(f"{case.provider.name}/{case.filename}: worst case ${worst:.6f}")
        print(f"worst-case total ${total:.6f} against cap ${args.max_usd}")
        return 0
    keys = {case.provider.key_env: os.environ.get(case.provider.key_env, "") for case in cases}
    missing = sorted(name for name, value in keys.items() if not value)
    if missing:
        print(f"missing environment variable(s): {', '.join(missing)}", file=sys.stderr)
        return 2
    return run(cases, args.max_usd, keys)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
