"""What the gateway route service raises. Routers map each one to a problem response."""

from app.core.errors import FieldError


class RouteNotFoundError(Exception):
    """No route with this id in the project."""


class RouteVersionNotFoundError(Exception):
    """The route has no saved version with this number."""

    def __init__(self, version: int) -> None:
        super().__init__(f"no version {version}")
        self.version = version


class RouteNameTakenError(Exception):
    """Another route in the project already has this name."""


class RouteVersionConflictError(Exception):
    """The route was saved after the version an edit started from."""

    def __init__(self, current_version: int) -> None:
        super().__init__(f"the route is at version {current_version}")
        self.current_version = current_version


class RouteInUseError(Exception):
    """A gateway key sends its calls through the route, so it cannot be deleted."""

    def __init__(self, route_name: str, key_name: str) -> None:
        super().__init__(f"{route_name} is used by gateway key {key_name}")
        self.route_name = route_name
        self.key_name = key_name


class InvalidRouteConfigError(Exception):
    """A config the route cannot be saved with, one field error per problem.

    Either a target's credential is not the organization's, or a saved version being reverted to
    no longer passes rules that have tightened since.
    """

    def __init__(self, errors: list[FieldError]) -> None:
        super().__init__("; ".join(f"{error['field']}: {error['message']}" for error in errors))
        self.errors = errors
