"""The authorization matrix: every role (and non-members) against every route."""

from dataclasses import dataclass
from typing import Any

import pytest

from tests.helpers import Browser, Workspace, create_workspace, join_with_role

ROLES = ("owner", "admin", "member", "viewer", "outsider")


@dataclass(frozen=True)
class Case:
    method: str
    path: str
    expected: dict[str, int]
    body: dict[str, Any] | None = None


def _everyone(status: int) -> dict[str, int]:
    return {"owner": status, "admin": status, "member": status, "viewer": status, "outsider": 404}


def _at_least(role: str, success: int) -> dict[str, int]:
    order = ["viewer", "member", "admin", "owner"]
    allowed = set(order[order.index(role) :])
    return {
        **{name: success if name in allowed else 403 for name in order},
        "outsider": 404,
    }


CASES = (
    Case("GET", "/api/v1/orgs/{org}", _everyone(200)),
    Case("PATCH", "/api/v1/orgs/{org}", _at_least("admin", 200), {"name": "Renamed"}),
    Case("GET", "/api/v1/orgs/{org}/members", _everyone(200)),
    Case("GET", "/api/v1/orgs/{org}/audit", _at_least("admin", 200)),
    Case("GET", "/api/v1/orgs/{org}/invites", _at_least("admin", 200)),
    Case("POST", "/api/v1/orgs/{org}/invites", _at_least("admin", 201), {"role": "viewer"}),
    Case("GET", "/api/v1/orgs/{org}/projects", _everyone(200)),
    Case("POST", "/api/v1/orgs/{org}/projects", _at_least("admin", 201), {"name": "Another"}),
    Case("GET", "/api/v1/projects/{project}", _everyone(200)),
    Case("PATCH", "/api/v1/projects/{project}", _at_least("admin", 200), {"retention_days": 7}),
    Case("GET", "/api/v1/projects/{project}/keys", _everyone(200)),
    Case("POST", "/api/v1/projects/{project}/keys", _at_least("member", 201), {"name": "k"}),
    Case("GET", "/api/v1/projects/{project}/onboarding", _everyone(200)),
    Case("GET", "/api/v1/projects/{project}/traces", _everyone(200)),
    Case("GET", "/api/v1/projects/{project}/traces/" + "a" * 32, {**_everyone(404)}),
    Case("GET", "/api/v1/projects/{project}/sessions", _everyone(200)),
    Case("GET", "/api/v1/projects/{project}/filters", _everyone(200)),
    Case("GET", "/api/v1/projects/{project}/metrics/overview", _everyone(200)),
    Case("GET", "/api/v1/projects/{project}/metrics/timeseries", _everyone(200)),
    Case("GET", "/api/v1/projects/{project}/metrics/models", _everyone(200)),
)


@pytest.fixture
async def actors(browser_factory: Any) -> tuple[Workspace, dict[str, Browser]]:
    owner: Browser = await browser_factory("owner@example.com")
    workspace = await create_workspace(owner)
    browsers = {"owner": owner}
    for role in ("admin", "member", "viewer"):
        browser: Browser = await browser_factory(f"{role}@example.com")
        await join_with_role(owner, browser, workspace.org_id, role)
        browsers[role] = browser
    outsider: Browser = await browser_factory("outsider@example.com")
    await create_workspace(outsider, org_name="Other")
    browsers["outsider"] = outsider
    return workspace, browsers


async def test_authorization_matrix(actors: tuple[Workspace, dict[str, Browser]]) -> None:
    workspace, browsers = actors
    mismatches = []
    for case in CASES:
        path = case.path.format(org=workspace.org_id, project=workspace.project_id)
        for role in ROLES:
            browser = browsers[role]
            if case.method == "GET":
                response = await browser.get(path)
            elif case.method == "POST":
                response = await browser.post(path, json=case.body)
            else:
                response = await browser.patch(path, json=case.body)
            if response.status_code != case.expected[role]:
                mismatches.append(
                    f"{case.method} {case.path} as {role}: "
                    f"expected {case.expected[role]}, got {response.status_code}"
                )
    assert mismatches == []


async def test_non_member_gets_404_not_403_for_existing_org(
    actors: tuple[Workspace, dict[str, Browser]],
) -> None:
    workspace, browsers = actors
    response = await browsers["outsider"].get(f"/api/v1/orgs/{workspace.org_id}")
    assert response.status_code == 404
    unknown = await browsers["outsider"].get("/api/v1/orgs/00000000-0000-0000-0000-000000000000")
    assert unknown.json()["code"] == response.json()["code"] == "NOT_FOUND"


async def test_malformed_ids_are_404(actors: tuple[Workspace, dict[str, Browser]]) -> None:
    _, browsers = actors
    assert (await browsers["owner"].get("/api/v1/projects/not-a-uuid")).status_code == 404


async def test_unauthenticated_requests_get_401(client: Any) -> None:
    response = await client.get("/api/v1/orgs/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"
