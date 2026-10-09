"""Which code delivers which kind of notification.

A deliverer sends one outbox row (an email, later a Slack message or a signed webhook) and
signals failure by raising. The delivery job looks the deliverer up by the row's `kind`.

Registration is explicit: the api and worker processes call `register` at startup, and
importing this module registers nothing, so tests and tools see an empty registry unless they
fill it themselves.
"""

from typing import Any, Protocol


class Deliverer(Protocol):
    async def deliver(self, target: dict[str, Any], payload: dict[str, Any]) -> None:
        """Send one notification. Raise on any failure; the outbox retries with backoff.

        `target` says where it goes (an address, a channel), `payload` what it says. Delivery
        is at-least-once, so this may be called again for a notification it already sent.
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
