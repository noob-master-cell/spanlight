"""A fake OpenAI-compatible provider for the gateway load test.

It answers `POST /v1/chat/completions` and `GET /v1/models` with fixed bodies, after
FAKE_PROVIDER_DELAY_MS milliseconds (default 0), and checks nothing about the request. The gateway
overhead is the time a call spends in Spanlight, so the provider has to add as little and as
steady a time as possible: no model, no network, no randomness.

    uvicorn fake_provider:app --host 0.0.0.0 --port 9000

The load Compose file runs it in the backend image with this file mounted in.
"""

import asyncio
import json
import os

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

MODEL = "gpt-4o-mini"

CHAT_COMPLETION = json.dumps(
    {
        "id": "chatcmpl-load-test",
        "object": "chat.completion",
        "created": 1_700_000_000,
        "model": MODEL,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "This is a canned answer."},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 24, "completion_tokens": 6, "total_tokens": 30},
    }
).encode()

MODEL_LIST = json.dumps(
    {"object": "list", "data": [{"id": MODEL, "object": "model", "owned_by": "load-test"}]}
).encode()


def delay_seconds() -> float:
    """FAKE_PROVIDER_DELAY_MS as seconds: blank or unset is 0, and a bad value stops the start."""
    raw = os.environ.get("FAKE_PROVIDER_DELAY_MS", "").strip() or "0"
    milliseconds = float(raw)
    if milliseconds < 0:
        raise ValueError("FAKE_PROVIDER_DELAY_MS must not be negative")
    return milliseconds / 1000


DELAY_SECONDS = delay_seconds()


async def chat_completions(request: Request) -> Response:
    # The body is not read: a canned answer does not depend on it, and parsing would add time.
    if DELAY_SECONDS:
        await asyncio.sleep(DELAY_SECONDS)
    return Response(CHAT_COMPLETION, media_type="application/json")


async def models(request: Request) -> Response:
    return Response(MODEL_LIST, media_type="application/json")


app = Starlette(
    routes=[
        Route("/v1/chat/completions", chat_completions, methods=["POST"]),
        Route("/v1/models", models, methods=["GET"]),
    ]
)
