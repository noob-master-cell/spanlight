"""A project with a read key, shared by the tests that exercise API keys over HTTP."""

from dataclasses import dataclass
from typing import Any

import httpx
import pytest

from tests.helpers import (
    Browser,
    Workspace,
    bearer,
    create_api_key,
    create_project,
    create_workspace,
    new_trace_id,
    span,
)

# The routes a `traces:read` key may call, for its own project only. `{trace}` is a trace id.
READ_ROUTES = [
    "/api/v1/projects/{project}/traces",
    "/api/v1/projects/{project}/traces/{trace}",
    "/api/v1/projects/{project}/sessions",
    "/api/v1/projects/{project}/filters",
    "/api/v1/projects/{project}/metrics/overview",
    "/api/v1/projects/{project}/metrics/timeseries",
    "/api/v1/projects/{project}/metrics/models",
]

TRACE_FIELDS = {"name": "answer", "environment": "prod", "session_id": "s1"}


@dataclass
class World:
    """One owner with two projects, each holding one trace, and a read key for the first."""

    owner: Browser
    workspace: Workspace  # the first project, with its default ingest key
    other_project_id: str
    read_key: str
    trace_id: str
    other_trace_id: str

    def path(
        self, template: str, *, project_id: str | None = None, trace: str | None = None
    ) -> str:
        return template.format(
            project=project_id or self.workspace.project_id, trace=trace or self.trace_id
        )


@pytest.fixture
async def world(browser_factory: Any, client: httpx.AsyncClient) -> World:
    owner: Browser = await browser_factory("owner@example.com")
    workspace = await create_workspace(owner)
    other_project_id = await create_project(owner, workspace.org_id, "Other")
    other_ingest = await create_api_key(owner, other_project_id)
    read = await create_api_key(owner, workspace.project_id, scopes=["traces:read"])

    trace_id, other_trace_id = new_trace_id(), new_trace_id()
    for api_key, trace in ((workspace.api_key, trace_id), (other_ingest["secret"], other_trace_id)):
        response = await client.post(
            "/v1/traces",
            json={"spans": [span(trace_id=trace, trace=TRACE_FIELDS)]},
            headers=bearer(api_key),
        )
        assert response.status_code == 200, response.text
    return World(owner, workspace, other_project_id, read["secret"], trace_id, other_trace_id)
