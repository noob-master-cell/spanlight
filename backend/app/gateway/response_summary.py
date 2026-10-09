"""What a complete (non-streaming) provider response says: usage, model, finish reason, output.

Pure: bytes in, a `StreamSummary` out, in the same shape the stream observers produce, so a span
looks the same whether the call streamed or not. A body that is not the JSON the surface
documents gives an empty summary; nothing here raises.
"""

from typing import Any

from app.gateway.errors import Surface
from app.gateway.sse import StreamSummary, as_str, dict_at, json_object
from app.gateway.usage import anthropic_usage, chat_usage, responses_usage


def summarize_response(surface: Surface, body: bytes) -> StreamSummary:
    """The summary of a provider's JSON answer on `surface`."""
    parsed = _parse(body)
    if parsed is None:
        return StreamSummary()
    if surface == "chat_completions":
        return _chat(parsed)
    if surface == "responses":
        return _responses(parsed)
    if surface == "messages":
        return _messages(parsed)
    return StreamSummary(model=as_str(parsed.get("model")))


def upstream_error_detail(body: bytes) -> tuple[str | None, str | None]:
    """The provider's error type and message, read from either envelope (`error.type`)."""
    parsed = _parse(body)
    error = dict_at(parsed, "error")
    return as_str(error.get("type")), as_str(error.get("message"))


def _parse(body: bytes) -> dict[str, Any] | None:
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return json_object(text)


def _chat(body: dict[str, Any]) -> StreamSummary:
    choices = body.get("choices")
    first = choices[0] if isinstance(choices, list) and choices else None
    first = first if isinstance(first, dict) else {}
    message = dict_at(first, "message")
    return StreamSummary(
        usage=chat_usage(dict_at(body, "usage")),
        model=as_str(body.get("model")),
        finish_reason=as_str(first.get("finish_reason")),
        output=message or None,
        response_id=as_str(body.get("id")),
    )


def _responses(body: dict[str, Any]) -> StreamSummary:
    output = body.get("output")
    return StreamSummary(
        usage=responses_usage(dict_at(body, "usage")),
        model=as_str(body.get("model")),
        finish_reason=as_str(body.get("status")),
        output={"output": output} if isinstance(output, list) else None,
        response_id=as_str(body.get("id")),
    )


def _messages(body: dict[str, Any]) -> StreamSummary:
    content = body.get("content")
    return StreamSummary(
        usage=anthropic_usage(dict_at(body, "usage")),
        model=as_str(body.get("model")),
        finish_reason=as_str(body.get("stop_reason")),
        output={"role": "assistant", "content": content} if isinstance(content, list) else None,
        response_id=as_str(body.get("id")),
    )
