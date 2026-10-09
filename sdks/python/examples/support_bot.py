"""A tiny customer-support bot instrumented with Spanlight.

The bot runs a three-step flow for each question:

1. ``classify`` - ask the model which FAQ topic the question is about;
2. ``retrieve`` - look the topic up in a small built-in FAQ;
3. ``answer``   - stream a grounded answer back to the user.

Every step becomes a span; the LLM calls become ``llm`` child spans with the
model, token usage, latency and time-to-first-token.

Run it against a real provider (requires a running Spanlight API and a
project key)::

    export SPANLIGHT_API_KEY=spl_live_...        # from your project's settings
    export SPANLIGHT_HOST=http://localhost:8000  # where the API runs
    export ANTHROPIC_API_KEY=sk-ant-...          # or OPENAI_API_KEY=sk-...
    uv run --extra anthropic --extra openai python examples/support_bot.py "How do refunds work?"
"""

from __future__ import annotations

import logging
import os
import sys
import uuid
from collections.abc import Iterator
from typing import Any

import spanlight

ANTHROPIC_MODEL = "claude-haiku-4-5"
OPENAI_MODEL = "gpt-4o-mini"

FAQ = {
    "refunds": "Refunds are available within 30 days of purchase and take 5-7 business days.",
    "shipping": "Orders ship within 2 business days; tracking links arrive by email.",
    "account": "Reset your password from the sign-in page using 'Forgot password'.",
    "other": "A human agent will follow up by email within one business day.",
}

SYSTEM_PROMPT = "You are a concise, friendly support agent. Answer in at most two sentences."


class SupportBot:
    """Answers support questions with whichever provider has an API key configured."""

    def __init__(self) -> None:
        if os.environ.get("ANTHROPIC_API_KEY"):
            import anthropic

            self.provider = "anthropic"
            self.client: Any = spanlight.wrap_anthropic(anthropic.Anthropic())
        elif os.environ.get("OPENAI_API_KEY"):
            import openai

            self.provider = "openai"
            self.client = spanlight.wrap_openai(openai.OpenAI())
        else:
            raise SystemExit("Set ANTHROPIC_API_KEY or OPENAI_API_KEY to run this example.")

    def _complete(self, prompt: str, *, max_tokens: int) -> str:
        """Single non-streaming completion."""
        if self.provider == "anthropic":
            message = self.client.messages.create(
                model=ANTHROPIC_MODEL,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return "".join(block.text for block in message.content if block.type == "text")

        completion = self.client.chat.completions.create(
            model=OPENAI_MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return completion.choices[0].message.content or ""

    @spanlight.observe(kind="chain")
    def classify(self, question: str) -> str:
        topics = ", ".join(FAQ)
        prompt = (
            f"Classify this support question into exactly one of: {topics}.\n"
            f"Reply with the single topic word only.\n\nQuestion: {question}"
        )
        topic = self._complete(prompt, max_tokens=5).strip().lower()
        return topic if topic in FAQ else "other"

    @spanlight.observe(kind="retrieval")
    def retrieve(self, topic: str) -> str:
        return FAQ[topic]

    @spanlight.observe(kind="chain")
    def answer(self, question: str, context: str) -> Iterator[str]:
        """Stream the answer; the span stays open until the last token."""
        prompt = f"Context: {context}\n\nCustomer question: {question}"
        if self.provider == "anthropic":
            with self.client.messages.stream(
                model=ANTHROPIC_MODEL,
                max_tokens=200,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                yield from stream.text_stream
            return

        stream = self.client.chat.completions.create(
            model=OPENAI_MODEL,
            max_tokens=200,
            stream=True,
            stream_options={"include_usage": True},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    @spanlight.observe(name="support-request")
    def handle(self, question: str, *, user_id: str, session_id: str) -> str:
        spanlight.update_trace(
            user_id=user_id, session_id=session_id, tags=["example", self.provider]
        )
        topic = self.classify(question)
        context = self.retrieve(topic)

        pieces: list[str] = []
        for piece in self.answer(question, context):
            print(piece, end="", flush=True)
            pieces.append(piece)
        print()
        return "".join(pieces)


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    tracer = spanlight.init(environment=os.environ.get("SPANLIGHT_ENVIRONMENT", "development"))
    if not tracer.enabled:
        print("Spanlight is disabled (no SPANLIGHT_API_KEY); the bot will still run.")

    question = " ".join(sys.argv[1:]) or "How long do refunds take?"
    bot = SupportBot()
    bot.handle(question, user_id="example-user", session_id=f"session-{uuid.uuid4().hex[:8]}")

    drained = spanlight.flush(timeout=10)
    if tracer.exporter is not None:
        delivered = drained and tracer.exporter.failed_count == 0
        status = "delivered" if delivered else "NOT delivered (see warnings above)"
        print(f"\nTrace {status}. Open {tracer.config.host} to inspect it.")


if __name__ == "__main__":
    main()
