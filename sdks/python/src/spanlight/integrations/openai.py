"""Instrumentation for the official ``openai`` Python SDK.

:func:`wrap_openai` patches ``chat.completions.create`` and
``responses.create`` on one client instance (sync or async). Streaming calls
are supported; the providers' ``.stream()`` helpers go through ``create`` and
are therefore traced too.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, TypeVar

from .._span import Span
from ._common import (
    ClientGetter,
    Endpoint,
    StreamAccumulator,
    as_int,
    client_getter,
    get_field,
    patch_method,
    wrap_async_method,
    wrap_sync_method,
)

if TYPE_CHECKING:
    from .._client import Spanlight

logger = logging.getLogger("spanlight")

ClientT = TypeVar("ClientT")


def wrap_openai(
    client: ClientT, *, spanlight: Spanlight | None = None, provider: str = "openai"
) -> ClientT:
    """Instrument an ``OpenAI``/``AsyncOpenAI`` client (or Azure variant) in place.

    Every ``chat.completions.create`` and ``responses.create`` call becomes an
    ``llm`` span with the model, token usage, time-to-first-token (streams),
    sanitized request parameters and the response. Errors are recorded and
    re-raised unchanged. Wrapping the same client twice is harmless.

    Args:
        client: The OpenAI client to instrument.
        spanlight: Spanlight client to report to; defaults to the global client at call time.
        provider: Provider name recorded on spans. Override it when pointing the
            OpenAI SDK at a compatible API (e.g. ``"openrouter"``).

    Returns:
        The same client object, for convenient chaining.
    """
    try:
        _instrument(client, spanlight, provider)
    except Exception:
        logger.warning("Spanlight: could not instrument OpenAI client", exc_info=True)
    return client


def _instrument(client: Any, spanlight: Spanlight | None, provider: str) -> None:
    from openai import AsyncStream, Stream
    from openai.resources.chat.completions import AsyncCompletions
    from openai.resources.responses import AsyncResponses

    get_client = client_getter(spanlight)
    stream_types = (Stream, AsyncStream)
    endpoints: list[tuple[Any, Endpoint]] = [
        (client.chat.completions, ChatCompletionsEndpoint(provider, stream_types)),
        (client.responses, ResponsesEndpoint(provider, stream_types)),
    ]
    async_resources = (AsyncCompletions, AsyncResponses)
    for resource, endpoint in endpoints:
        _patch_create(
            resource, endpoint, get_client, is_async=isinstance(resource, async_resources)
        )


def _patch_create(
    resource: Any,
    endpoint: Endpoint,
    get_client: ClientGetter,
    *,
    is_async: bool,
) -> None:
    wrap = wrap_async_method if is_async else wrap_sync_method
    patch_method(resource, "create", lambda original: wrap(original, endpoint, get_client))


# ---------------------------------------------------------------------- #
# Chat Completions
# ---------------------------------------------------------------------- #


class ChatCompletionsEndpoint(Endpoint):
    """``chat.completions.create``."""

    operation = "chat"

    def __init__(self, provider: str, stream_types: tuple[type, ...]) -> None:
        super().__init__(provider)
        self._stream_types = stream_types

    def is_stream(self, result: Any) -> bool:
        return isinstance(result, self._stream_types)

    def new_accumulator(self) -> StreamAccumulator:
        return _ChatStreamAccumulator(self.provider)

    def record_response(self, span: Span, response: Any) -> None:
        span.set_model(get_field(response, "model"), provider=self.provider)
        _record_chat_usage(span, get_field(response, "usage"))
        _record_response_id(span, response)

        choices = get_field(response, "choices") or []
        messages = [get_field(choice, "message") for choice in choices]
        finish_reasons = [get_field(choice, "finish_reason") for choice in choices]
        if finish_reasons:
            span.set_attribute("response.finish_reasons", finish_reasons)
        span.set_output(messages[0] if len(messages) == 1 else messages)


def _record_chat_usage(span: Span, usage: Any) -> None:
    if usage is None:
        return
    span.set_usage(
        input_tokens=as_int(get_field(usage, "prompt_tokens")),
        output_tokens=as_int(get_field(usage, "completion_tokens")),
        cached_tokens=as_int(get_field(usage, "prompt_tokens_details", "cached_tokens")),
    )
    reasoning = as_int(get_field(usage, "completion_tokens_details", "reasoning_tokens"))
    if reasoning:
        span.set_attribute("usage.reasoning_tokens", reasoning)


def _record_response_id(span: Span, response: Any) -> None:
    response_id = get_field(response, "id")
    if isinstance(response_id, str):
        span.set_attribute("response.id", response_id)


class _ChoiceState:
    """Accumulated content of one streamed choice."""

    def __init__(self) -> None:
        self.role = "assistant"
        self.content: list[str] = []
        self.refusal: list[str] = []
        self.tool_calls: dict[int, dict[str, Any]] = {}
        self.finish_reason: str | None = None

    def apply(self, delta: Any) -> bool:
        """Merge one delta; return whether it carried generated output."""
        produced = False
        role = get_field(delta, "role")
        if isinstance(role, str):
            self.role = role
        content = get_field(delta, "content")
        if isinstance(content, str) and content:
            self.content.append(content)
            produced = True
        refusal = get_field(delta, "refusal")
        if isinstance(refusal, str) and refusal:
            self.refusal.append(refusal)
            produced = True
        for tool_call in get_field(delta, "tool_calls") or []:
            self._apply_tool_call(tool_call)
            produced = True
        return produced

    def _apply_tool_call(self, tool_call: Any) -> None:
        index = as_int(get_field(tool_call, "index")) or 0
        state = self.tool_calls.setdefault(
            index,
            {"id": None, "type": "function", "function": {"name": "", "arguments": ""}},
        )
        call_id = get_field(tool_call, "id")
        if isinstance(call_id, str):
            state["id"] = call_id
        name = get_field(tool_call, "function", "name")
        if isinstance(name, str):
            state["function"]["name"] += name
        arguments = get_field(tool_call, "function", "arguments")
        if isinstance(arguments, str):
            state["function"]["arguments"] += arguments

    def to_message(self) -> dict[str, Any]:
        message: dict[str, Any] = {"role": self.role, "content": "".join(self.content) or None}
        if self.refusal:
            message["refusal"] = "".join(self.refusal)
        if self.tool_calls:
            message["tool_calls"] = [self.tool_calls[index] for index in sorted(self.tool_calls)]
        return message


class _ChatStreamAccumulator(StreamAccumulator):
    """Rebuilds a chat completion from ``ChatCompletionChunk`` events."""

    def __init__(self, provider: str) -> None:
        self._provider = provider
        self._model: str | None = None
        self._response_id: str | None = None
        self._usage: Any = None
        self._choices: dict[int, _ChoiceState] = {}

    def on_event(self, event: Any, span: Span) -> None:
        model = get_field(event, "model")
        if isinstance(model, str) and model:
            self._model = model
        response_id = get_field(event, "id")
        if isinstance(response_id, str):
            self._response_id = response_id
        usage = get_field(event, "usage")
        if usage is not None:
            self._usage = usage

        for choice in get_field(event, "choices") or []:
            index = as_int(get_field(choice, "index")) or 0
            state = self._choices.setdefault(index, _ChoiceState())
            if state.apply(get_field(choice, "delta")):
                span.mark_first_token()
            finish_reason = get_field(choice, "finish_reason")
            if isinstance(finish_reason, str):
                state.finish_reason = finish_reason

    def finish(self, span: Span) -> None:
        span.set_model(self._model, provider=self._provider)
        _record_chat_usage(span, self._usage)
        if self._usage is None:
            span.set_attribute("usage.missing_reason", "stream_options.include_usage not set")
        if self._response_id:
            span.set_attribute("response.id", self._response_id)

        states = [self._choices[index] for index in sorted(self._choices)]
        if not states:
            return
        span.set_attribute("response.finish_reasons", [state.finish_reason for state in states])
        messages = [state.to_message() for state in states]
        span.set_output(messages[0] if len(messages) == 1 else messages)


# ---------------------------------------------------------------------- #
# Responses API
# ---------------------------------------------------------------------- #


class ResponsesEndpoint(Endpoint):
    """``responses.create``."""

    operation = "responses"

    def __init__(self, provider: str, stream_types: tuple[type, ...]) -> None:
        super().__init__(provider)
        self._stream_types = stream_types

    def is_stream(self, result: Any) -> bool:
        return isinstance(result, self._stream_types)

    def new_accumulator(self) -> StreamAccumulator:
        return _ResponsesStreamAccumulator(self)

    def record_response(self, span: Span, response: Any) -> None:
        span.set_model(get_field(response, "model"), provider=self.provider)
        _record_response_id(span, response)

        usage = get_field(response, "usage")
        if usage is not None:
            span.set_usage(
                input_tokens=as_int(get_field(usage, "input_tokens")),
                output_tokens=as_int(get_field(usage, "output_tokens")),
                cached_tokens=as_int(get_field(usage, "input_tokens_details", "cached_tokens")),
            )
            reasoning = as_int(get_field(usage, "output_tokens_details", "reasoning_tokens"))
            if reasoning:
                span.set_attribute("usage.reasoning_tokens", reasoning)

        status = get_field(response, "status")
        if isinstance(status, str):
            span.set_attribute("response.status", status)
        if status == "failed":
            message = get_field(response, "error", "message")
            span.record_error(message if isinstance(message, str) else "response failed")

        span.set_output(_responses_output(response))


def _responses_output(response: Any) -> dict[str, Any]:
    """Summarize a ``Response`` as an assistant message plus any non-text items."""
    text_parts: list[str] = []
    other_items: list[Any] = []
    for item in get_field(response, "output") or []:
        if get_field(item, "type") != "message":
            other_items.append(item)
            continue
        for part in get_field(item, "content") or []:
            text = get_field(part, "text")
            if isinstance(text, str):
                text_parts.append(text)

    output: dict[str, Any] = {"role": "assistant", "content": "".join(text_parts) or None}
    if other_items:
        output["items"] = other_items
    return output


class _ResponsesStreamAccumulator(StreamAccumulator):
    """Tracks Responses API stream events; the final event carries the full response."""

    def __init__(self, endpoint: ResponsesEndpoint) -> None:
        self._endpoint = endpoint
        self._final_response: Any = None
        self._text: list[str] = []
        self._model: str | None = None
        self._error: str | None = None

    def on_event(self, event: Any, span: Span) -> None:
        event_type = get_field(event, "type")
        if not isinstance(event_type, str):
            return
        if event_type.endswith(".delta"):
            span.mark_first_token()
        if event_type == "response.output_text.delta":
            delta = get_field(event, "delta")
            if isinstance(delta, str):
                self._text.append(delta)

        response = get_field(event, "response")
        if response is not None:
            model = get_field(response, "model")
            if isinstance(model, str):
                self._model = model
            if event_type in {"response.completed", "response.incomplete", "response.failed"}:
                self._final_response = response
        if event_type == "error":
            message = get_field(event, "message")
            self._error = message if isinstance(message, str) else "stream error"

    def finish(self, span: Span) -> None:
        if self._final_response is not None:
            self._endpoint.record_response(span, self._final_response)
        else:
            span.set_model(self._model, provider=self._endpoint.provider)
            span.set_output({"role": "assistant", "content": "".join(self._text) or None})
        if self._error is not None:
            span.record_error(self._error)


__all__ = ["wrap_openai"]
