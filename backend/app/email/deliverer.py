"""Delivers `email` outbox rows through an `EmailSender`."""

from typing import Any

from app.email.message import EmailDeliveryError, EmailMessage
from app.email.sender import EmailSender


class EmailDeliverer:
    """The outbox `Deliverer` for the `email` kind.

    A row's target is `{"to": address}` and its payload `{"subject", "text", "html"}`, with
    `html` optional. A sender's failure propagates, which is how the outbox learns to retry.
    """

    def __init__(self, sender: EmailSender) -> None:
        self._sender = sender

    async def deliver(self, target: dict[str, Any], payload: dict[str, Any]) -> None:
        await self._sender.send(
            EmailMessage(
                to=_required_text(target, "to"),
                subject=_required_text(payload, "subject"),
                text=_required_text(payload, "text"),
                html=_optional_text(payload, "html"),
            )
        )


# The errors below name the field and never quote the value, which can be an address or the
# body of the email.


def _required_text(source: dict[str, Any], key: str) -> str:
    value = source.get(key)
    if not isinstance(value, str) or not value:
        raise EmailDeliveryError(f"email notification needs a non-empty text '{key}'")
    return value


def _optional_text(source: dict[str, Any], key: str) -> str | None:
    value = source.get(key)
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise EmailDeliveryError(f"email notification '{key}' must be text")
    return value
