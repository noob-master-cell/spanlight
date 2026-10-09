"""What the gateway key service raises. The router maps each one to a problem response."""


class KeyNotFoundError(Exception):
    """No active gateway key with this id in the project."""


class NoDefaultRouteError(Exception):
    """The key names no route, and the project has no default route to give it."""


class KeyRouteNotFoundError(Exception):
    """The route the key names is not a route of the key's project."""


class KeyFaultProfileNotFoundError(Exception):
    """The fault profile the key is to run is not a profile of the key's project."""


class FaultProfileOnProductionKeyError(Exception):
    """A fault profile would be attached to a `production` key, or a key with one moved there."""
