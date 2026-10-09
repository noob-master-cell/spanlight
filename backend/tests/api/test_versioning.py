"""The dashboard API lives under `/api/v1`; ingest, health, metrics and docs keep their paths."""

from typing import Any

import httpx

from tests.helpers import Browser


async def test_unversioned_api_paths_are_gone(client: httpx.AsyncClient) -> None:
    for path in ("/api/auth/me", "/api/orgs/00000000-0000-0000-0000-000000000000"):
        response = await client.get(path)
        assert response.status_code == 404, path
        assert response.headers["content-type"].startswith("application/problem+json")


async def test_versioned_paths_serve(client: httpx.AsyncClient, browser_factory: Any) -> None:
    assert (await client.get("/api/v1/auth/me")).status_code == 401

    # The Origin middleware rejects first and an anonymous request gets 401, so the CSRF
    # check is only reachable with a session and an allowed Origin. Only the token is missing.
    browser: Browser = await browser_factory("ada@example.com")
    logout = await browser.http.post("/api/v1/auth/logout")
    assert logout.status_code == 403
    assert logout.json()["code"] == "CSRF_FAILED"


async def test_docs_paths_unchanged(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/openapi.json")).status_code == 200
    assert (await client.get("/api/docs")).status_code == 200


async def test_openapi_lists_only_versioned_dashboard_and_ingest_paths(
    client: httpx.AsyncClient,
) -> None:
    paths = (await client.get("/api/openapi.json")).json()["paths"]
    assert "/v1/traces" in paths
    assert "/v1/otlp/traces" in paths
    assert "/api/v1/auth/me" in paths
    assert "/api/v1/projects/{project_id}/traces" in paths
    unversioned = [p for p in paths if p.startswith("/api/") and not p.startswith("/api/v1/")]
    assert unversioned == []
