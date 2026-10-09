"""The attempt loop: send a call to the route's targets until one answers or the plan gives up.

`run_attempts` walks the planned targets in order. Each attempt is bounded by what is left of the
route's `timeout_ms`; after a failure `routing.next_action` decides between a retry (after a
wait), a fallback to the next target, or giving up. Everything happens before the first byte
reaches the client: a non-streaming answer is read whole inside the attempt, and a stream's
first chunk is awaited inside it, so a provider that accepts the request and then says nothing
is a timeout that can still be retried or fallen back from.

How one attempt ends is `single_attempt.attempt_once`'s concern. A request body that cannot be
sent as strict JSON is `INVALID_REQUEST` with no attempt made.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import structlog

from app.core.crypto import CryptoError
from app.core.observability import GATEWAY_ATTEMPTS, GATEWAY_UPSTREAM_DURATION
from app.db.models import ProviderCredential
from app.gateway.adapters import (
    InvalidUpstreamBody,
    ProviderAdapter,
    UpstreamRequest,
    UpstreamResponse,
    adapter_for,
)
from app.gateway.context import Attempt, GatewayContext, GatewayRequest
from app.gateway.credentials import decrypt_api_key
from app.gateway.errors import (
    GatewayError,
    internal,
    invalid_request,
    upstream_timeout,
    upstream_unreachable,
)
from app.gateway.faults import AppliedFault
from app.gateway.routing import Fallback, Retry, next_action
from app.gateway.single_attempt import AttemptEnd, attempt_once

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class RoutePlan:
    """The targets to try, in order, and the request body before per-target model aliases."""

    model: str
    order: list[int]
    body: dict[str, Any]


@dataclass
class Waits:
    """Seconds spent waiting on purpose (backoff, a fault's hold), kept out of the overhead."""

    context: GatewayContext
    total_s: float = 0.0

    async def sleep(self, seconds: float) -> None:
        started = self.context.monotonic()
        try:
            await self.context.sleep(seconds)
        finally:
            self.total_s += self.context.monotonic() - started


@dataclass
class LoopResult:
    """How the loop ended. `error` is set unless the last attempt got a response to pass on."""

    attempts: list[Attempt] = field(default_factory=list)
    target_index: int | None = None
    status: int | None = None
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes | None = None
    stream: AsyncIterator[bytes] | None = None
    response: UpstreamResponse | None = None  # a stream's provider response, to close it
    error: GatewayError | None = None
    upstream_s: float = 0.0
    first_byte_at: float | None = None  # `context.monotonic()` when a stream's first byte came

    @property
    def succeeded(self) -> bool:
        return self.status is not None and 200 <= self.status < 300


async def run_attempts(
    request: GatewayRequest,
    context: GatewayContext,
    plan: RoutePlan,
    fault: AppliedFault | None,
    *,
    deadline: float,
    waits: Waits,
) -> LoopResult:
    """Try the plan's targets until one answers; see the module docstring for the endings."""
    result = LoopResult()
    for position, index in enumerate(plan.order):
        target = context.route.targets[index]
        credential = context.credentials[target.credential_id]
        adapter = adapter_for(credential.provider)
        upstream = _prepare(request, context, plan, index, credential, adapter)
        if isinstance(upstream, GatewayError):
            if upstream.spanlight_code == "INVALID_REQUEST":
                result.error = upstream
                return result
            # The credential cannot be opened: try the next target; the last real failure, if
            # there was one, stays the answer.
            if not result.attempts:
                result.error = upstream
            continue
        tries = 0
        while True:
            remaining = deadline - context.monotonic()
            if remaining <= 0:
                return _timed_out(result, context)
            tries += 1
            before = (context.monotonic(), waits.total_s)
            step = await attempt_once(
                request, context, adapter, upstream, fault, deadline=deadline, sleep=waits.sleep
            )
            duration = context.monotonic() - before[0]
            _count(
                result, credential, index, step, duration, duration - (waits.total_s - before[1])
            )
            if step.outcome is None:
                result.first_byte_at = context.monotonic() if request.stream else None
                return result
            action = next_action(
                context.route,
                step.outcome,
                tries,
                targets_left=len(plan.order) - position - 1,
                remaining_s=deadline - context.monotonic(),
            )
            if isinstance(action, Retry):
                await waits.sleep(action.after_s)
                continue
            if isinstance(action, Fallback):
                break
            return result
    return result


def _prepare(
    request: GatewayRequest,
    context: GatewayContext,
    plan: RoutePlan,
    index: int,
    credential: ProviderCredential,
    adapter: ProviderAdapter,
) -> UpstreamRequest | GatewayError:
    target = context.route.targets[index]
    body = {**plan.body, "model": target.model_aliases.get(plan.model, plan.model)}
    try:
        api_key = decrypt_api_key(credential, settings=context.settings)
    except CryptoError as failure:
        logger.warning(
            "gateway.credential_unreadable",
            credential_id=str(credential.id),
            error_type=type(failure).__name__,
        )
        return internal(request.request_id)
    try:
        return adapter.prepare(credential, request.surface, body, request.client_headers, api_key)
    except InvalidUpstreamBody:
        message = "Request body must be strict JSON: NaN and infinite numbers are not allowed."
        return invalid_request(message, param=None)


def _count(
    result: LoopResult,
    credential: ProviderCredential,
    index: int,
    step: AttemptEnd,
    duration_s: float,
    upstream_s: float,
) -> None:
    """Fold one attempt into the loop's result and the metrics."""
    outcome = step.outcome
    error_kind: str | None = (
        None if outcome is None or outcome.error_kind == "status" else outcome.error_kind
    )
    if step.label is not None:
        error_kind = step.label
    retry_after = outcome.retry_after_s if outcome is not None else None
    result.attempts.append(
        Attempt(
            target_index=index,
            credential_id=credential.id,
            status=step.status,
            error=error_kind,
            duration_ms=round(duration_s * 1000, 3),
            retry_after=retry_after,
        )
    )
    result.upstream_s += max(0.0, upstream_s)
    result.target_index = index
    result.status, result.headers = step.status, step.headers
    result.body, result.stream, result.response = step.body, step.stream, step.response
    result.error = step.error
    if error_kind == "connection_error":
        result.error = upstream_unreachable(len(result.attempts))
    provider = credential.provider.value
    label = str(step.status) if step.status is not None else (error_kind or "unknown")
    GATEWAY_ATTEMPTS.labels(provider, label).inc()
    GATEWAY_UPSTREAM_DURATION.labels(provider).observe(duration_s)


def _timed_out(result: LoopResult, context: GatewayContext) -> LoopResult:
    """The budget ran out between attempts: the last failure stands, else a timeout."""
    if not result.attempts:
        result.error = upstream_timeout(context.route.timeout_ms)
    return result
