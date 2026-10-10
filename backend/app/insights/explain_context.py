"""The gateway context of an explanation: one credential, a route built in memory, no key.

Pure: builds values only. An explanation is not a call through one of the project's routes (the
organization's oldest Anthropic credential may serve no route at all), so the route is made here
rather than read with `app.gateway.in_process.context_for_project`: a single target on that
credential, one attempt and no fallbacks (the budget reserves the cost of exactly one call, and a
retry after a dropped connection could be billed twice). `key=None` means no cache, no faults and
no key limits; the project's `block` budgets still apply, since the call is spend in the project.
"""

import uuid

from app.db.models import Project, ProviderCredential
from app.gateway.context import GatewayContext, GatewayServices, SpanSink, new_rng
from app.gateway.route_config import FallbackPolicy, RetryPolicy, RouteConfig, Target

ENVIRONMENT = "doctor"
ROUTE_NAME = "doctor-explain"
# The in-memory route has no row. The id only feeds the cache key, and a call without a key is
# never cached, so a fixed value is enough.
ROUTE_ID = uuid.UUID(int=0)
ROUTE_VERSION = 1


def explain_context(
    services: GatewayServices,
    project: Project,
    credential: ProviderCredential,
    *,
    span_sink: SpanSink,
) -> GatewayContext:
    """The context of one explanation call in `project`, sent with `credential`."""
    route = RouteConfig(
        targets=[Target(credential_id=credential.id)],
        retry=RetryPolicy(max_attempts=1),
        fallback=FallbackPolicy(on=[]),
    )
    return GatewayContext(
        key=None,
        project_id=project.id,
        org_id=project.org_id,
        environment=ENVIRONMENT,
        route=route,
        route_id=ROUTE_ID,
        route_name=ROUTE_NAME,
        route_version=ROUTE_VERSION,
        credentials={credential.id: credential},
        capture_payloads=project.capture_payloads,
        budget_guard=services.budget_guard,
        cache=services.cache,
        http=services.http,
        sessions=services.sessions,
        settings=services.settings,
        rng=new_rng(),
        span_sink=span_sink,
    )
