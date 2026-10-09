"""Email verification: the link, and the email that carries it."""

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.email_tokens import issue_token
from app.config import Settings
from app.db.models import EmailTokenKind, User
from app.email.templates import render_verify_email
from app.notifications import NotificationKind, enqueue

VERIFY_TOKEN_TTL = timedelta(hours=24)


def verification_url(settings: Settings, raw_token: str) -> str:
    """The link in the email. The token is in the fragment, which browsers send neither to the
    server nor in a `Referer` header, so it stays out of access logs; the page reads it and
    posts it to the confirm route.
    """
    return f"{settings.app_base_url}/verify-email#token={raw_token}"


async def enqueue_verification_email(db: AsyncSession, settings: Settings, user: User) -> None:
    """Issue a verification token and queue the email that carries it, in the caller's transaction.

    The token and the outbox row commit together: there is never a link nobody was sent, or an
    email whose link does not work. The caller checks `settings.is_email_configured` first.
    """
    raw_token = await issue_token(db, user.id, EmailTokenKind.VERIFY, VERIFY_TOKEN_TTL)
    message = render_verify_email(user.name, verification_url(settings, raw_token))
    await enqueue(
        db,
        NotificationKind.EMAIL,
        target={"to": user.email},
        payload={"subject": message.subject, "text": message.text, "html": message.html},
    )
