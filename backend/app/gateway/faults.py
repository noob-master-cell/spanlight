"""Whether a gateway call gets a fault from its key's fault profile. Pure: no database, no I/O.

`decide_fault` is the only place that reads a profile at call time. A fault fires only when
every rule below holds, in this order:

1. the key has a profile, it is enabled, and it has not expired (`expires_at` is in the future
   or unset);
2. the key's environment is not `production`, whatever its case or padding (also enforced
   when a profile is attached and when a key's environment changes; checked again here so no
   path can skip it);
3. the scenario can apply to the request: `malformed_json` needs a non-streaming call and
   `truncated_stream` a streaming one (a scenario that cannot apply does not fire, so the call
   is neither faulted nor tagged `lab:<scenario>`);
4. one draw of the request's seeded `random.Random` is below the profile's probability.

The random number is drawn only once rules 1 to 3 have passed. A request the profile cannot
touch therefore leaves the generator untouched, and for a given seed the sequence of decisions
over the applicable requests is fixed, which is what makes the tests deterministic.

A fired fault is identified everywhere by its scenario: `spanlight_code` `FAULT_<SCENARIO>`
(upper snake case, which later detectors use to tell faults from real provider errors), the
`X-Spanlight-Fault: <scenario>` header and the trace tag `lab:<scenario>`.
"""

import random
import uuid
from dataclasses import dataclass
from datetime import datetime

from app.db.models import FaultProfile, FaultScenario
from app.gateway.fault_params import FaultParams, parse_params
from app.gateway.key_schemas import is_production_environment

FAULT_HEADER = "X-Spanlight-Fault"

BEFORE_SCENARIOS = frozenset(
    {
        FaultScenario.AUTH_EXPIRED,
        FaultScenario.SCOPE_DENIED,
        FaultScenario.RATE_LIMITED,
        FaultScenario.UNSUPPORTED_PARAMETER,
        FaultScenario.PROVIDER_5XX,
        FaultScenario.TIMEOUT,
    }
)
"""Scenarios answered by the gateway instead of calling the provider."""

AROUND_SCENARIOS = frozenset(
    {
        FaultScenario.MALFORMED_JSON,
        FaultScenario.TRUNCATED_STREAM,
        FaultScenario.SLOW_RESPONSE,
    }
)
"""Scenarios that alter the provider's real response on its way back to the client."""

_STREAM_ONLY = frozenset({FaultScenario.TRUNCATED_STREAM})
_NON_STREAM_ONLY = frozenset({FaultScenario.MALFORMED_JSON})


@dataclass(frozen=True)
class AppliedFault:
    """A fault that fired for one call: what to inject, and which profile asked for it."""

    scenario: FaultScenario
    profile_id: uuid.UUID
    params: FaultParams


def fault_code(scenario: FaultScenario) -> str:
    """The `spanlight_code` of a fault error, such as `FAULT_PROVIDER_5XX`."""
    return f"FAULT_{scenario.value.upper()}"


def lab_tag(scenario: FaultScenario) -> str:
    """The trace tag of a faulted call, such as `lab:truncated_stream`."""
    return f"lab:{scenario.value}"


def applies_to(scenario: FaultScenario, *, stream: bool) -> bool:
    """Whether `scenario` can be injected into a call that is (or is not) streaming."""
    if stream:
        return scenario not in _NON_STREAM_ONLY
    return scenario not in _STREAM_ONLY


def decide_fault(
    profile: FaultProfile | None,
    environment: str,
    *,
    stream: bool,
    rng: random.Random,
    now: datetime,
) -> AppliedFault | None:
    """The fault this call gets, or `None` (see the module docstring for the rules).

    `now` must be timezone-aware, like `expires_at`. The stored params are parsed with the
    scenario's model; they were validated when the profile was saved, so a row that no longer
    parses is a bug and raises pydantic's `ValidationError` instead of being skipped silently.
    """
    if profile is None or not profile.enabled:
        return None
    if profile.expires_at is not None and profile.expires_at <= now:
        return None
    if is_production_environment(environment):
        return None
    if not applies_to(profile.scenario, stream=stream):
        return None
    # The only draw from `rng`, made after every check that does not need it.
    if rng.random() >= float(profile.probability):
        return None
    params = parse_params(profile.scenario, profile.params)
    return AppliedFault(scenario=profile.scenario, profile_id=profile.id, params=params)


__all__ = [
    "AROUND_SCENARIOS",
    "BEFORE_SCENARIOS",
    "FAULT_HEADER",
    "AppliedFault",
    "applies_to",
    "decide_fault",
    "fault_code",
    "lab_tag",
]
