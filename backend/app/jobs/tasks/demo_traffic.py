"""Real demo traffic: a three-step support bot calling Claude, traced end to end.

Flow: classify the question (LLM) → look up a built-in FAQ entry (retrieval)
→ answer from that entry (LLM). Every span records what really happened:
timestamps, the model the API reports, token usage from the response, and
errors. Nothing is simulated; without an ANTHROPIC_API_KEY the job is skipped.

Spans are written through the ingestion pipeline function directly, so the
demo exercises exactly the same validation, redaction and costing as SDK data.

Spend is capped by DEMO_MONTHLY_BUDGET_USD using the costs recorded on the
demo project's spans this calendar month.
"""

import random
import secrets
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import anthropic
import structlog
from anthropic.types import Message
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Span, SpanKind
from app.db.rls import bind_project
from app.ingest.pipeline import IngestTarget, ingest_spans
from app.jobs.context import TaskContext
from app.jobs.outcome import JobOutcome
from app.services.demo import ensure_demo_workspace

logger = structlog.get_logger(__name__)

DEMO_MODEL = "claude-haiku-4-5"
REQUEST_TIMEOUT_SECONDS = 20.0

CATEGORIES = ("billing", "shipping", "account", "other")

FAQ: dict[str, str] = {
    "billing": (
        "Invoices are emailed on the 1st of each month. Refunds for annual plans are "
        "prorated and issued within 5 business days to the original payment method."
    ),
    "shipping": (
        "Orders ship within 2 business days. Standard delivery takes 3-5 days; tracking "
        "links are sent by email once the parcel leaves the warehouse."
    ),
    "account": (
        "Passwords can be reset from the sign-in page. Two-factor authentication can be "
        "enabled under Settings → Security. Accounts can be deleted from Settings → Account."
    ),
    "other": "For anything else, our support team replies within one business day.",
}

QUESTIONS = (
    "I was charged twice this month, can I get one of the payments back?",
    "When will my order arrive? I ordered it on Monday.",
    "How do I turn on two-factor authentication?",
    "Do you have an office in Berlin I could visit?",
    "I cancelled my annual plan halfway through. Do I get anything back?",
    "My tracking link doesn't work yet, is that normal?",
    "I forgot my password and can't log in.",
)

CLASSIFY_SYSTEM = (
    "Classify the customer's support question into exactly one category: "
    "billing, shipping, account or other. Reply with the category word only."
)
ANSWER_SYSTEM = (
    "You are a concise, friendly support agent. Answer the customer in at most three "
    "sentences using only the FAQ entry provided. If it does not cover the question, "
    "say a human will follow up."
)


def make_client(api_key: str) -> anthropic.AsyncAnthropic:
    """Separate so tests can substitute a client on a mock transport."""
    return anthropic.AsyncAnthropic(api_key=api_key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=1)


async def run_demo_traffic(context: TaskContext, _: dict[str, Any]) -> JobOutcome | None:
    settings = context.settings
    if settings.anthropic_api_key is None:
        logger.info("demo_traffic_skipped", reason="ANTHROPIC_API_KEY is not set")
        return JobOutcome.SKIPPED_NOT_CONFIGURED
    if not settings.is_demo_enabled:
        logger.info("demo_traffic_skipped", reason="demo is disabled")
        return JobOutcome.SKIPPED_NOT_CONFIGURED

    async with context.session_factory() as db:
        workspace = await ensure_demo_workspace(db)
        await db.commit()
        spent, unpriced = await month_to_date_spend(db, workspace.project.id, datetime.now(UTC))

    budget = settings.demo_monthly_budget_usd
    if unpriced:
        # Without recorded costs the budget cannot be enforced, so do not spend.
        logger.warning("demo_traffic_skipped", reason="unpriced demo calls this month")
        return JobOutcome.SKIPPED_BUDGET
    if spent >= budget:
        logger.info("demo_traffic_skipped", reason="monthly budget reached", spent=str(spent))
        return JobOutcome.SKIPPED_BUDGET

    await context.heartbeat()  # make sure we still own the job before paying for calls
    client = make_client(settings.anthropic_api_key.get_secret_value())
    async with client:
        question = random.choice(QUESTIONS)  # noqa: S311 - not security-sensitive
        recorder = await run_support_flow(client, question)

    async with context.session_factory() as db:
        outcome = await ingest_spans(
            db,
            IngestTarget(project_id=workspace.project.id, capture_payloads=True),
            recorder.spans,
        )
        await db.commit()
    logger.info(
        "demo_traffic_recorded",
        trace_id=recorder.trace_id,
        accepted=outcome.accepted,
        rejected=len(outcome.rejected),
    )
    if recorder.error is not None:
        raise recorder.error
    return JobOutcome.OK


async def month_to_date_spend(
    db: AsyncSession, project_id: uuid.UUID, now: datetime
) -> tuple[Decimal, int]:
    """Recorded demo spend this month, and how many billed LLM calls lack a cost.

    Failed calls without usage are not billed, so they do not count as unpriced.
    """
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    await bind_project(db, project_id)
    row = (
        await db.execute(
            select(
                func.coalesce(func.sum(Span.cost_usd), 0),
                func.count().filter(
                    Span.kind == SpanKind.LLM,
                    Span.input_tokens.is_not(None),
                    Span.cost_usd.is_(None),
                ),
            ).where(Span.project_id == project_id, Span.started_at >= month_start)
        )
    ).one()
    spent, unpriced = row
    return spent if spent is not None else Decimal(0), int(unpriced)


@dataclass
class FlowRecorder:
    """Collects native-format spans for one support-bot trace."""

    question: str
    trace_id: str = field(default_factory=lambda: secrets.token_hex(16))
    session_id: str = field(default_factory=lambda: f"demo-{secrets.token_hex(4)}")
    user_id: str = field(default_factory=lambda: f"visitor-{secrets.randbelow(50):02d}")
    spans: list[dict[str, Any]] = field(default_factory=list)
    tags: list[str] = field(default_factory=lambda: ["demo"])
    error: Exception | None = None

    def trace_fields(self) -> dict[str, Any]:
        return {
            "name": "support-bot",
            "environment": "demo",
            "release": "demo-v1",
            "user_id": self.user_id,
            "session_id": self.session_id,
            "tags": self.tags,
        }

    def add(self, span: dict[str, Any]) -> None:
        self.spans.append({**span, "trace_id": self.trace_id, "trace": self.trace_fields()})


def _iso(moment: datetime) -> str:
    return moment.isoformat()


def _message_text(message: Message) -> str:
    return "".join(block.text for block in message.content if block.type == "text").strip()


def _llm_span(
    *,
    name: str,
    parent_span_id: str,
    started: datetime,
    ended: datetime,
    request: dict[str, Any],
    response: Message | None,
    error: Exception | None,
) -> dict[str, Any]:
    span: dict[str, Any] = {
        "span_id": secrets.token_hex(8),
        "parent_span_id": parent_span_id,
        "name": name,
        "kind": "llm",
        "start_time": _iso(started),
        "end_time": _iso(ended),
        "provider": "anthropic",
        "model": DEMO_MODEL,
        "input": request,
        "attributes": {"max_tokens": request["max_tokens"]},
    }
    if response is not None:
        usage = response.usage
        cache_read = usage.cache_read_input_tokens or 0
        cache_write = usage.cache_creation_input_tokens or 0
        span.update(
            status="ok",
            model=response.model,
            # Native convention: input includes cached tokens (see app/pricing/cost.py).
            usage={
                "input_tokens": usage.input_tokens + cache_read + cache_write,
                "output_tokens": usage.output_tokens,
                "cached_tokens": cache_read,
            },
            output={"role": "assistant", "content": _message_text(response)},
        )
        span["attributes"]["stop_reason"] = response.stop_reason
    else:
        span.update(status="error", status_message=f"{type(error).__name__}: {error}")
    return span


async def _call_claude(
    client: anthropic.AsyncAnthropic,
    recorder: FlowRecorder,
    *,
    name: str,
    parent_span_id: str,
    system: str,
    user_content: str,
    max_tokens: int,
) -> Message | None:
    request = {
        "model": DEMO_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user_content}],
    }
    started = datetime.now(UTC)
    response: Message | None = None
    error: Exception | None = None
    try:
        response = await client.messages.create(
            model=DEMO_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
    except anthropic.APIError as exc:
        error = exc
        recorder.error = exc
    ended = datetime.now(UTC)
    recorder.add(
        _llm_span(
            name=name,
            parent_span_id=parent_span_id,
            started=started,
            ended=ended,
            request=request,
            response=response,
            error=error,
        )
    )
    return response


async def run_support_flow(client: anthropic.AsyncAnthropic, question: str) -> FlowRecorder:
    recorder = FlowRecorder(question=question)
    root_span_id = secrets.token_hex(8)
    started = datetime.now(UTC)
    answer: str | None = None

    classification = await _call_claude(
        client,
        recorder,
        name="classify",
        parent_span_id=root_span_id,
        system=CLASSIFY_SYSTEM,
        user_content=question,
        max_tokens=10,
    )
    if classification is not None:
        word = _message_text(classification).lower().strip(" .")
        category = word if word in CATEGORIES else "other"
        recorder.tags.append(category)

        retrieval_started = datetime.now(UTC)
        faq_entry = FAQ[category]
        recorder.add(
            {
                "span_id": secrets.token_hex(8),
                "parent_span_id": root_span_id,
                "name": "faq-lookup",
                "kind": "retrieval",
                "status": "ok",
                "start_time": _iso(retrieval_started),
                "end_time": _iso(datetime.now(UTC)),
                "input": {"category": category},
                "output": {"entry": faq_entry},
            }
        )

        response = await _call_claude(
            client,
            recorder,
            name="answer",
            parent_span_id=root_span_id,
            system=ANSWER_SYSTEM,
            user_content=f"FAQ entry:\n{faq_entry}\n\nCustomer question:\n{question}",
            max_tokens=300,
        )
        if response is not None:
            answer = _message_text(response)

    root: dict[str, Any] = {
        "span_id": root_span_id,
        "name": "support-bot",
        "kind": "chain",
        "status": "error" if recorder.error else "ok",
        "start_time": _iso(started),
        "end_time": _iso(datetime.now(UTC)),
        "input": {"question": question},
        "output": {"answer": answer} if answer is not None else None,
    }
    if recorder.error is not None:
        root["status_message"] = f"{type(recorder.error).__name__}: {recorder.error}"
    recorder.add(root)
    return recorder
