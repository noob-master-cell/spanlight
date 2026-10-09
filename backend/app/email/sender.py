"""The email sending interface and the choice of provider."""

from typing import Protocol

from app.config import Settings
from app.email.message import EmailMessage
from app.email.providers.console import ConsoleEmailSender
from app.email.providers.resend import ResendEmailSender
from app.email.providers.smtp import SmtpEmailSender


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None:
        """Send `message` or raise `EmailDeliveryError`. Returning means the provider took it."""
        ...


def get_email_sender(settings: Settings) -> EmailSender:
    """The sender for `settings.email_provider`.

    `Settings` refuses to load without what a provider needs, so the checks below only guard a
    `Settings` that was built some other way.
    """
    match settings.email_provider:
        case "console":
            return ConsoleEmailSender(settings.email_console_file)
        case "resend":
            if settings.resend_api_key is None or settings.email_from is None:
                raise ValueError("EMAIL_PROVIDER=resend requires RESEND_API_KEY, EMAIL_FROM")
            return ResendEmailSender(settings.resend_api_key, settings.email_from)
        case "smtp":
            if settings.smtp_host is None or settings.email_from is None:
                raise ValueError("EMAIL_PROVIDER=smtp requires SMTP_HOST, EMAIL_FROM")
            return SmtpEmailSender(
                host=settings.smtp_host,
                port=settings.smtp_port,
                from_address=settings.email_from,
                username=settings.smtp_username,
                password=settings.smtp_password,
                starttls=settings.smtp_starttls,
            )
