"""The sign-in failure limit, shared by the password step and the two-factor step.

A wrong password and a wrong one-time code are the same kind of failure to the account: both
are guesses, and both are recorded as a `login_attempts` row with `succeeded` false. Counting
them together means a thief cannot get five tries at the password and five more at the code.
"""

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError, too_many_requests
from app.db.models import LoginAttempt

LOGIN_WINDOW = timedelta(minutes=15)
MAX_FAILURES_PER_EMAIL = 5
MAX_FAILURES_PER_IP = 20


async def enforce_login_throttle(
    db: AsyncSession, *, email: str, ip: str | None, now: datetime
) -> None:
    """Block once an email has 5, or an IP 20, failures in the last 15 minutes."""
    window_start = now - LOGIN_WINDOW
    failures = select(func.count(), func.min(LoginAttempt.created_at)).where(
        LoginAttempt.succeeded.is_(False), LoginAttempt.created_at > window_start
    )

    email_count, email_oldest = (
        await db.execute(failures.where(LoginAttempt.email == email))
    ).one()
    if email_count >= MAX_FAILURES_PER_EMAIL:
        raise _throttled(email_oldest, now)

    if ip is not None:
        ip_count, ip_oldest = (await db.execute(failures.where(LoginAttempt.ip == ip))).one()
        if ip_count >= MAX_FAILURES_PER_IP:
            raise _throttled(ip_oldest, now)


def _throttled(oldest_failure: datetime, now: datetime) -> ProblemError:
    retry_after = int((oldest_failure + LOGIN_WINDOW - now).total_seconds()) + 1
    return too_many_requests(retry_after, "Too many failed sign-in attempts. Try again later.")
