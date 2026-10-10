"""The dashboard API, served under `/api/v1`.

Breaking changes to these routes ship as `/api/v2` (see docs/decisions/0005). Ingestion
(`/v1/*`), health, Prometheus metrics and the OpenAPI document live outside this package and
keep their paths.
"""

from fastapi import APIRouter

from app.api.v1 import (
    alert_deliveries,
    alert_events,
    alert_rules,
    alerts,
    auth,
    budgets,
    demo,
    end_users,
    exports,
    gateway,
    gateway_credentials,
    gateway_keys,
    gateway_lab,
    gateway_routes,
    insights,
    keys,
    metrics,
    oauth,
    orgs,
    price_overrides,
    prices,
    projects,
    releases,
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
    alerts.router,
    alert_deliveries.router,
    alert_rules.router,
    alert_events.router,
    budgets.router,
    releases.router,
    end_users.router,
    insights.router,
    demo.router,
)

router = APIRouter(prefix="/api/v1")

for _domain in DOMAIN_ROUTERS:
    router.include_router(_domain)
