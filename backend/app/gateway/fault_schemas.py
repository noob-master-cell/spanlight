"""What a fault profile is created and edited from. Pure: no database, no I/O.

The bounds match the database CHECKs of migration 0204. `params` are checked against the
`scenario` they are sent with (`app.gateway.fault_params`), so an error names `params.<field>`.
`expires_at` must be in the future when set, which needs the clock; the service checks it.
Unknown fields are rejected.
"""

from datetime import datetime
from typing import Annotated, Any

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationInfo,
    field_validator,
)
from pydantic_core import PydanticCustomError

from app.db.models import FaultScenario
from app.gateway.fault_params import FaultParams, parse_params

PROBABILITY_DECIMALS = 3

ProfileName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def _three_decimals(value: float) -> float:
    if round(value, PROBABILITY_DECIMALS) != value:
        raise ValueError(f"must have at most {PROBABILITY_DECIMALS} decimals")
    return value


Probability = Annotated[float, Field(strict=True, ge=0, le=1), AfterValidator(_three_decimals)]
"""The chance, from 0 to 1 with three decimals, that a call gets the fault."""


def _params_for_scenario(value: Any, info: ValidationInfo) -> FaultParams:
    """`value` as the params model of the scenario sent with it.

    A ValidationError raised here is merged into the field's errors, so its locations come out
    as `params.<name>`.
    """
    scenario = info.data.get("scenario")
    if scenario is None:
        raise PydanticCustomError(
            "params_need_scenario", "must be sent together with a valid scenario"
        )
    return parse_params(scenario, value)


class FaultProfileCreate(BaseModel):
    """A new fault profile. Omitted `params` are the scenario's defaults."""

    model_config = ConfigDict(extra="forbid")

    name: ProfileName
    scenario: FaultScenario
    params: FaultParams = Field(default={}, validate_default=True)
    probability: Probability = 1.0
    enabled: bool = True
    expires_at: AwareDatetime | None = None

    @field_validator("params", mode="before")
    @classmethod
    def _per_scenario(cls, value: Any, info: ValidationInfo) -> FaultParams:
        return _params_for_scenario(value, info)


class FaultProfileUpdate(BaseModel):
    """A partial edit: only the fields sent change.

    `params` must be sent with `scenario` (they are only meaningful together); a `scenario`
    sent without `params` resets the params to that scenario's defaults. `expires_at` is cleared
    by sending `null`; every other field must have a value when it is sent. `changes()` tells an
    absent field from one sent as `null`.
    """

    model_config = ConfigDict(extra="forbid")

    name: ProfileName | None = None
    scenario: FaultScenario | None = None
    params: FaultParams | None = None
    probability: Probability | None = None
    enabled: bool | None = None
    expires_at: AwareDatetime | None = None

    @field_validator("name", "scenario", "probability", "enabled")
    @classmethod
    def _not_null(cls, value: Any) -> Any:
        # Runs only for a value that was sent: an absent field keeps its default untouched.
        if value is None:
            raise ValueError("must not be null")
        return value

    @field_validator("params", mode="before")
    @classmethod
    def _per_scenario(cls, value: Any, info: ValidationInfo) -> FaultParams:
        if value is None:
            raise ValueError("must not be null")
        return _params_for_scenario(value, info)

    def changes(self) -> dict[str, Any]:
        """The fields that were sent, with their values."""
        return {name: getattr(self, name) for name in self.model_fields_set}


def is_active(enabled: bool, expires_at: datetime | None, now: datetime) -> bool:
    """Whether a profile with these settings can fire at `now`: enabled and not yet expired."""
    return enabled and (expires_at is None or expires_at > now)
