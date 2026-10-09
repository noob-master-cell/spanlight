"""The parameters of each fault scenario, as models. Pure: no database, no I/O.

A fault profile's `params` are a discriminated union on its `scenario`: the scenario names the
model, and the model decides what is allowed. A parameter that does not belong to the scenario
is rejected (`extra="forbid"`), as are values outside the bounds below, so `params.<name>` is
the field of any error. Integers are strict, so `true` or `2.0` is not a count. The defaults make
`{}` a valid choice for every scenario.

The bounds follow the Integration Lab spec; `timeout`'s hold and `slow_response`'s delay are
further capped at call time by the route's time budget.
"""

import re
from collections.abc import Mapping
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.db.models import FaultScenario

PARAM_NAME = re.compile(r"^[a-z_][a-z0-9_.]*$")


class _Params(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AuthExpiredParams(_Params):
    """401 `invalid_api_key`; takes no parameters."""


class ScopeDeniedParams(_Params):
    """403 `insufficient_permissions`; takes no parameters."""


class RateLimitedParams(_Params):
    """429 with `Retry-After: retry_after_s`."""

    retry_after_s: Annotated[int, Field(strict=True, ge=1, le=3_600)] = 2


class UnsupportedParameterParams(_Params):
    """400 naming `param` as unsupported by the model."""

    param: Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=PARAM_NAME)] = (
        "temperature"
    )


class Provider5xxParams(_Params):
    """The provider's error at `status`."""

    status: Literal[500, 502, 503, 529] = 500


class MalformedJsonParams(_Params):
    """A 200 whose body is cut to `keep_fraction` of its length; non-streaming calls only."""

    keep_fraction: Annotated[float, Field(strict=True, ge=0.1, le=0.9)] = 0.6


class TruncatedStreamParams(_Params):
    """A stream closed after `after_chunks` frames, without its end marker."""

    after_chunks: Annotated[int, Field(strict=True, ge=1, le=100)] = 3


class SlowResponseParams(_Params):
    """The first byte of the response delayed by `delay_ms`."""

    delay_ms: Annotated[int, Field(strict=True, ge=100, le=60_000)] = 5_000


class TimeoutParams(_Params):
    """The call held for `hold_ms`, or what is left of the route's budget, then timed out."""

    hold_ms: Annotated[int, Field(strict=True, ge=1_000, le=120_000)] = 30_000


FaultParams = (
    AuthExpiredParams
    | ScopeDeniedParams
    | RateLimitedParams
    | UnsupportedParameterParams
    | Provider5xxParams
    | MalformedJsonParams
    | TruncatedStreamParams
    | SlowResponseParams
    | TimeoutParams
)

PARAMS_BY_SCENARIO: dict[FaultScenario, type[_Params]] = {
    FaultScenario.AUTH_EXPIRED: AuthExpiredParams,
    FaultScenario.SCOPE_DENIED: ScopeDeniedParams,
    FaultScenario.RATE_LIMITED: RateLimitedParams,
    FaultScenario.UNSUPPORTED_PARAMETER: UnsupportedParameterParams,
    FaultScenario.PROVIDER_5XX: Provider5xxParams,
    FaultScenario.MALFORMED_JSON: MalformedJsonParams,
    FaultScenario.TRUNCATED_STREAM: TruncatedStreamParams,
    FaultScenario.SLOW_RESPONSE: SlowResponseParams,
    FaultScenario.TIMEOUT: TimeoutParams,
}


def parse_params(scenario: FaultScenario, raw: Any) -> FaultParams:
    """The params model of `scenario` for `raw`, with defaults filled in.

    Raises pydantic's `ValidationError`, whose locations are the param names. Called with a
    stored dict, it also loads a profile written under earlier rules.
    """
    model = PARAMS_BY_SCENARIO[scenario]
    parsed: FaultParams = model.model_validate(raw)  # type: ignore[assignment]
    return parsed


def load_stored_params(scenario: FaultScenario, stored: Mapping[str, Any]) -> FaultParams:
    """The params of a stored profile, built without validating them again.

    Every stored value passed its model when it was saved; only the bounds may have tightened
    since, and a read must not fail for that. Saving again goes through `parse_params` and meets
    today's rules.
    """
    model = PARAMS_BY_SCENARIO[scenario]
    loaded: FaultParams = model.model_construct(**stored)  # type: ignore[assignment]
    return loaded


def stored_params(params: FaultParams) -> dict[str, Any]:
    """The JSON object saved for `params`: every field, defaults included."""
    return params.model_dump(mode="json")


def default_params(scenario: FaultScenario) -> FaultParams:
    return parse_params(scenario, {})


__all__ = [
    "PARAMS_BY_SCENARIO",
    "AuthExpiredParams",
    "FaultParams",
    "FaultScenario",
    "MalformedJsonParams",
    "Provider5xxParams",
    "RateLimitedParams",
    "ScopeDeniedParams",
    "SlowResponseParams",
    "TimeoutParams",
    "TruncatedStreamParams",
    "UnsupportedParameterParams",
    "default_params",
    "load_stored_params",
    "parse_params",
    "stored_params",
]
