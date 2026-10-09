"""What the fault profile service raises. The router maps each one to a problem response."""

from app.core.errors import FieldError


class FaultProfileNotFoundError(Exception):
    """No fault profile with this id in the project."""


class FaultProfileNameTakenError(Exception):
    """Another fault profile in the project already has this name."""


class InvalidFaultProfileError(Exception):
    """A profile the service cannot save as sent, one field error per problem."""

    def __init__(self, errors: list[FieldError]) -> None:
        super().__init__("; ".join(f"{error['field']}: {error['message']}" for error in errors))
        self.errors = errors
