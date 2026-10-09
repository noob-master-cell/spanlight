"""Sending email: a message, a sender per provider, and the outbox deliverer that uses them."""

from app.email.deliverer import EmailDeliverer
from app.email.message import EmailDeliveryError, EmailMessage
from app.email.sender import EmailSender, get_email_sender

__all__ = [
    "EmailDeliverer",
    "EmailDeliveryError",
    "EmailMessage",
    "EmailSender",
    "get_email_sender",
]
