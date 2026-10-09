"""What an email is, and how sending one fails."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class EmailMessage:
    """One email to one recipient. `html` is the optional rich alternative to `text`."""

    to: str
    subject: str
    text: str
    html: str | None = None


class EmailDeliveryError(Exception):
    """A message could not be sent, or an outbox row cannot be turned into a message.

    The outbox stores this text in `last_error` and logs it, so providers keep it short and
    never put the request body, a credential or a provider's free-text reply in it.
    """
