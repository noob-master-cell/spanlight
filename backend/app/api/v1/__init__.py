"""The dashboard API, served under `/api/v1`.

Breaking changes to these routes ship as `/api/v2` (see docs/decisions/0005). Ingestion
(`/v1/*`), health, Prometheus metrics and the OpenAPI document live outside this package and
keep their paths.
"""

from fastapi import APIRouter

from app.api.v1 import (
    auth,
    demo,
    exports,
    gateway,
    gateway_credentials,
    gateway_keys,
    gateway_lab,
    gateway_routes,
    keys,
    metrics,
    oauth,
    orgs,
    price_overrides,
    prices,
    projects,
    tokens,
    totp,
    traces,
)

# Every domain router, in mount order. The route inventory test walks this tuple, so a router
# that is mounted some other way would escape it: add routers here.
DOMAIN_ROUTERS = (
    auth.router,
    totp.router,
    tokens.router,
    oauth.router,
    orgs.router,
    projects.router,
    keys.router,
    traces.router,
    exports.router,
    metrics.router,
    prices.router,
    price_overrides.router,
    gateway.router,
    gateway_credentials.router,
    gateway_routes.router,
    gateway_keys.router,
    gateway_lab.router,
    demo.router,
)

router = APIRouter(prefix="/api/v1")

for _domain in DOMAIN_ROUTERS:
    router.include_router(_domain)
