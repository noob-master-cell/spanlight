"""Which code delivers which kind of notification.

A deliverer sends one outbox row (an email, a Slack message, a signed webhook, a PagerDuty
event) and signals failure by raising: `PermanentDeliveryError` when a retry cannot succeed,
`RetryableDeliveryError` or anything else when it might. Only the message of a `DeliveryError`
is stored; any other exception is recorded by its class name alone, because its text can hold a
URL, and a Slack webhook URL is itself a secret. The delivery job looks the deliverer up by the
row's `kind`.

Registration is explicit: the api and worker processes call `register` at startup, and
importing this module registers nothing, so tests and tools see an empty registry unless they
fill it themselves.
"""

from typing import Any, Protocol


class DeliveryError(Exception):
    """A failure whose message the deliverer composed to be stored and shown.

    The message becomes the row's `last_error`, which the people who own the channel can read
    and which is logged, so the deliverer builds it itself (for example
    `"503 Service Unavailable: <start of the response body>"`) and never puts a URL, a secret or
    a routing key in it.
    """


class PermanentDeliveryError(DeliveryError):
    """A delivery failure that no retry can fix, so the row is marked `failed` at once.

    For example a 4xx other than 408 and 429, a redirect, an egress block, a deleted channel
    or a secret that cannot be decrypted.
    """


class RetryableDeliveryError(DeliveryError):
    """A delivery failure a later attempt may get past: 408, 429, 5xx, a timeout."""


class Deliverer(Protocol):
    async def deliver(self, target: dict[str, Any], payload: dict[str, Any]) -> None:
        """Send one notification. Raise on any failure; the outbox retries with backoff.

        `target` says where it goes (an address, a channel) and always carries `delivery_id`,
        the outbox row's id, which receivers can use to drop a repeat. `payload` says what it
        says. Delivery is at-least-once, so this may be called again for a notification it
        already sent.
        """
        ...


class DelivererRegistry:
    def __init__(self) -> None:
        self._deliverers: dict[str, Deliverer] = {}

    def register(self, kind: str, deliverer: Deliverer) -> None:
        """Set the deliverer for `kind`. Registering a kind again replaces the previous one,
        so startup code may run more than once in a process (tests build many apps)."""
        self._deliverers[str(kind)] = deliverer

    def get(self, kind: str) -> Deliverer | None:
        return self._deliverers.get(kind)

    def kinds(self) -> list[str]:
        return sorted(self._deliverers)


# The registry the worker's delivery job uses. Tests pass their own `DelivererRegistry` to
# `deliver_due` instead of registering fakes here, so nothing leaks between tests.
DELIVERERS = DelivererRegistry()


def register(kind: str, deliverer: Deliverer) -> None:
    DELIVERERS.register(kind, deliverer)
