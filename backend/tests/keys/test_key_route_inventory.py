"""Every `/api/v1` route refuses an API key, except the ones that opt in.

The inventory is built from the routers, not from a list in this file, so a route added later is
covered the day it exists. A route that forgets to say what it does with a key fails here.
"""

import uuid

import httpx
import pytest
from fastapi.routing import APIRoute

from app.api import v1
from scripts.update_openapi import build_app
from tests.helpers import bearer
from tests.keys.conftest import World

SKIPPED_METHODS = {"HEAD", "OPTIONS"}

# The only routes an API key may use, and only with `traces:read`, for its own project. Adding to
# this set is the decision to let keys into a route: it belongs in a review, not in a refactor.
KEY_READABLE = {
    ("GET", "/api/v1/projects/{project_id}/traces"),
    ("GET", "/api/v1/projects/{project_id}/traces/{trace_id}"),
    ("GET", "/api/v1/projects/{project_id}/sessions"),
    ("GET", "/api/v1/projects/{project_id}/filters"),
    ("GET", "/api/v1/projects/{project_id}/metrics/overview"),
    ("GET", "/api/v1/projects/{project_id}/metrics/timeseries"),
    ("GET", "/api/v1/projects/{project_id}/metrics/models"),
}


def _declared_routes() -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for router in v1.DOMAIN_ROUTERS:
        for route in router.routes:
            assert isinstance(route, APIRoute), route
            routes.update(
                (method, f"/api/v1{route.path}") for method in route.methods - SKIPPED_METHODS
            )
    return routes


def _documented_routes() -> set[tuple[str, str]]:
    paths = build_app().openapi()["paths"]
    return {
        (method.upper(), path)
        for path, operations in paths.items()
        if path.startswith("/api/v1/")
        for method in operations
    }


def test_the_inventory_matches_what_the_api_serves() -> None:
    declared = _declared_routes()

    assert len(declared) >= 40  # a broken walk must not pass by finding nothing
    assert declared >= KEY_READABLE
    assert declared == _documented_routes()


def _fill(template: str, world: World, *, project_id: str, trace_id: str) -> str:
    values = {
        "project_id": project_id,
        "org_id": world.workspace.org_id,
        "trace_id": trace_id,
        "provider": "github",
    }
    names = [part[1:-1] for part in template.split("/") if part.startswith("{")]
    return template.format(**{name: values.get(name, str(uuid.uuid4())) for name in names})


def _is_key_scope(response: httpx.Response) -> bool:
    body = response.json() if response.content else None
    return (
        response.status_code == 403 and isinstance(body, dict) and body.get("code") == "KEY_SCOPE"
    )


async def _call(
    client: httpx.AsyncClient, method: str, path: str, **headers: str
) -> httpx.Response:
    response = await client.request(
        method,
        path,
        json={} if method in {"POST", "PUT", "PATCH", "DELETE"} else None,
        params={"token": "x"} if path.endswith("/invites/preview") else None,
        headers=headers,
    )
    assert "set-cookie" not in response.headers, (method, path)
    return response


async def test_an_api_key_is_refused_everywhere_except_the_key_readable_routes(
    bare_client: httpx.AsyncClient, world: World
) -> None:
    """With no Origin header, as a script holding a key would send it."""
    mismatches: list[str] = []
    for method, template in sorted(_declared_routes()):
        own = _fill(template, world, project_id=world.workspace.project_id, trace_id=world.trace_id)
        other = _fill(
            template, world, project_id=world.other_project_id, trace_id=world.other_trace_id
        )
        read_own = await _call(bare_client, method, own, **bearer(world.read_key))
        read_other = await _call(bare_client, method, other, **bearer(world.read_key))
        ingest_own = await _call(bare_client, method, own, **bearer(world.workspace.api_key))

        if (method, template) in KEY_READABLE:
            # Its own project with `traces:read`; a 404 for any other project, whatever the scope.
            checks = {
                "read key on its own project": read_own.status_code == 200,
                "read key on another project": read_other.status_code == 404,
                "ingest-only key on its own project": _is_key_scope(ingest_own),
            }
        else:
            checks = {
                "read key on its own project": _is_key_scope(read_own),
                "read key on another project": _is_key_scope(read_other),
                "ingest-only key on its own project": _is_key_scope(ingest_own),
            }
        mismatches.extend(f"{method} {template}: {name}" for name, ok in checks.items() if not ok)
    assert mismatches == []


@pytest.mark.parametrize(
    "authorization",
    ["Bearer sk-not-ours", "Bearer", f"Bearer spl_live_{'a' * 12}_{'a' * 32}"],
)
async def test_a_bearer_that_is_not_a_live_key_is_unauthorized_everywhere(
    bare_client: httpx.AsyncClient, world: World, authorization: str
) -> None:
    mismatches: list[str] = []
    for method, template in sorted(_declared_routes()):
        path = _fill(
            template, world, project_id=world.workspace.project_id, trace_id=world.trace_id
        )
        response = await _call(bare_client, method, path, Authorization=authorization)
        body = response.json() if response.content else None
        code = body.get("code") if isinstance(body, dict) else None
        if (response.status_code, code) != (401, "UNAUTHORIZED"):
            mismatches.append(f"{method} {template}: {response.status_code} {code}")
    assert mismatches == []
