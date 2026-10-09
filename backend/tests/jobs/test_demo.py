"""The public demo: visitor sessions and the real-traffic demo job.

The demo job is exercised with the real Anthropic SDK on a mock HTTP
transport (no network, no spend), so the response parsing and usage
recording are the production code paths.
"""

import json
from decimal import Decimal
from typing import Any

import anthropic
import httpx
import httpx2
import pytest
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.db.models import Span, Trace
from app.db.rls import bypass_rls
from app.jobs.context import TaskContext
from app.jobs.queue import ClaimedJob, claim_next, enqueue
from app.jobs.tasks import demo_traffic
from app.main import create_app
from app.services.demo import ensure_demo_workspace

SessionFactory = async_sessionmaker[AsyncSession]


async def test_demo_session_is_read_only_viewer(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/demo/session")
    assert response.status_code == 200
    me = (await client.get("/api/v1/auth/me")).json()
    (membership,) = me["memberships"]
    assert membership["role"] == "viewer"
    assert membership["org"]["is_demo"] is True

    org_id = membership["org"]["id"]
    projects = (await client.get(f"/api/v1/orgs/{org_id}/projects")).json()
    csrf = {"X-CSRF-Token": client.cookies["spl_csrf"]}
    create_key = await client.post(
        f"/api/v1/projects/{projects[0]['id']}/keys", json={"name": "x"}, headers=csrf
    )
    assert create_key.status_code == 403


async def test_demo_session_expires_within_an_hour(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/demo/session")
    cookie = response.headers["set-cookie"]
    assert "Max-Age=3600" in cookie


async def test_demo_session_rate_limited_per_ip(client: httpx.AsyncClient) -> None:
    statuses = [(await client.post("/api/v1/demo/session")).status_code for _ in range(11)]
    assert statuses == [200] * 10 + [429]


async def test_demo_session_404_when_disabled(settings: Settings) -> None:
    disabled = settings.model_copy(update={"demo_enabled": False})
    app = create_app(disabled)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
        headers={"Origin": "http://testserver"},
    ) as client:
        assert (await client.post("/api/v1/demo/session")).status_code == 404
    await app.state.engine.dispose()


async def _context(session_factory: SessionFactory, settings: Settings) -> TaskContext:
    async with session_factory() as db:
        await enqueue(db, "demo_traffic", max_attempts=1)
        await db.commit()
        job = await claim_next(db)
    assert isinstance(job, ClaimedJob)
    return TaskContext(job=job, settings=settings, session_factory=session_factory)


async def _span_count(session_factory: SessionFactory) -> int:
    async with session_factory() as db:
        await bypass_rls(db)
        return int(await db.scalar(select(func.count()).select_from(Span)) or 0)


async def test_demo_traffic_skips_without_api_key(
    session_factory: SessionFactory, settings: Settings
) -> None:
    context = await _context(session_factory, settings)  # settings has no key
    await demo_traffic.run_demo_traffic(context, {})
    assert await _span_count(session_factory) == 0


def _anthropic_reply(text: str, input_tokens: int, output_tokens: int) -> dict[str, Any]:
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": "claude-haiku-4-5-20251001",
        "content": [{"type": "text", "text": text}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0,
        },
    }


@pytest.fixture
def mock_anthropic(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    requests: list[dict[str, Any]] = []
    replies = [
        _anthropic_reply("billing", 40, 1),
        _anthropic_reply("Refunds are prorated and issued within 5 business days.", 120, 18),
    ]

    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append(json.loads(request.content))
        return httpx2.Response(200, json=replies[len(requests) - 1])

    def make_client(api_key: str) -> anthropic.AsyncAnthropic:
        return anthropic.AsyncAnthropic(
            api_key=api_key,
            http_client=anthropic.DefaultAsyncHttpxClient(transport=httpx2.MockTransport(handler)),
        )

    monkeypatch.setattr(demo_traffic, "make_client", make_client)
    return requests


async def test_demo_traffic_records_real_usage(
    session_factory: SessionFactory, settings: Settings, mock_anthropic: list[dict[str, Any]]
) -> None:
    keyed = settings.model_copy(
        update={"anthropic_api_key": SecretStr("sk-ant-test-key-1234567890")}
    )
    await demo_traffic.run_demo_traffic(await _context(session_factory, keyed), {})

    assert [request["model"] for request in mock_anthropic] == ["claude-haiku-4-5"] * 2
    async with session_factory() as db:
        await bypass_rls(db)
        spans = {span.name: span for span in (await db.scalars(select(Span))).all()}
        trace = (await db.scalars(select(Trace))).one()

    assert set(spans) == {"support-bot", "classify", "faq-lookup", "answer"}
    answer = spans["answer"]
    assert (answer.input_tokens, answer.output_tokens) == (120, 18)
    assert answer.model == "claude-haiku-4-5-20251001"
    # 120 * $1 + 18 * $5 per 1M tokens
    assert answer.cost_usd == Decimal("0.00021000")
    assert spans["faq-lookup"].kind.value == "retrieval"
    assert spans["classify"].parent_span_id == spans["support-bot"].span_id
    assert trace.environment == "demo" and "billing" in trace.tags
    # classify: 40 * $1 + 1 * $5; answer: 120 * $1 + 18 * $5 (per 1M tokens)
    assert trace.cost_usd == Decimal("0.00025500")


async def test_demo_traffic_respects_monthly_budget(
    session_factory: SessionFactory, settings: Settings, mock_anthropic: list[dict[str, Any]]
) -> None:
    keyed = settings.model_copy(
        update={
            "anthropic_api_key": SecretStr("sk-ant-test-key-1234567890"),
            "demo_monthly_budget_usd": Decimal("0.0002"),
        }
    )
    await demo_traffic.run_demo_traffic(await _context(session_factory, keyed), {})
    assert await _span_count(session_factory) == 4  # the first run spends $0.000255

    await demo_traffic.run_demo_traffic(await _context(session_factory, keyed), {})
    assert await _span_count(session_factory) == 4  # budget reached: skipped, no API calls
    assert len(mock_anthropic) == 2


async def test_demo_workspace_is_idempotent(session_factory: SessionFactory) -> None:
    async with session_factory() as db:
        first = await ensure_demo_workspace(db)
        second = await ensure_demo_workspace(db)
        await db.commit()
    assert first.project.id == second.project.id
    assert first.user.id == second.user.id
