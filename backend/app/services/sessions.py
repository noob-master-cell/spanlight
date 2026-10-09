"""Browser sessions: opaque cookie token, stored as its SHA-256 digest.

Sessions slide: each use extends `expires_at` by the idle timeout, capped by
`absolute_expires_at`. To avoid a write on every request, the sliding update
happens at most once per `TOUCH_INTERVAL`.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import new_token, token_digest
from app.db.models import Session, User

IDLE_TIMEOUT = timedelta(days=7)
ABSOLUTE_LIFETIME = timedelta(days=30)
DEMO_ABSOLUTE_LIFETIME = timedelta(hours=1)
TOUCH_INTERVAL = timedelta(minutes=5)


@dataclass(frozen=True)
class IssuedSession:
    session: Session
    token: str  # plaintext; only ever placed in the cookie


@dataclass(frozen=True)
class ActiveSession:
    session: Session
    user: User
    token: str


async def create_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    now: datetime,
    ip: str | None,
    user_agent: str | None,
    absolute_lifetime: timedelta = ABSOLUTE_LIFETIME,
) -> IssuedSession:
    token = new_token()
    absolute_expires_at = now + absolute_lifetime
    session = Session(
        user_id=user_id,
        token_hash=token_digest(token),
        created_at=now,
        last_seen_at=now,
        expires_at=min(now + IDLE_TIMEOUT, absolute_expires_at),
        absolute_expires_at=absolute_expires_at,
        ip=ip,
        user_agent=user_agent[:512] if user_agent else None,
    )
    db.add(session)
    await db.flush()
    return IssuedSession(session=session, token=token)


async def resolve_session(db: AsyncSession, token: str, *, now: datetime) -> ActiveSession | None:
    """Look up a live session. May commit (see TOUCH_INTERVAL), so call it first."""
    row = (
        await db.execute(
            select(Session, User)
            .join(User, User.id == Session.user_id)
            .where(Session.token_hash == token_digest(token))
        )
    ).one_or_none()
    if row is None:
        return None
    session, user = row
    if session.expires_at <= now or session.absolute_expires_at <= now:
        return None

    if now - session.last_seen_at >= TOUCH_INTERVAL:
        session.last_seen_at = now
        session.expires_at = min(now + IDLE_TIMEOUT, session.absolute_expires_at)
        # Committed immediately: read-only requests never commit, and the touch
        # must persist regardless of what the handler does next.
        await db.commit()
    return ActiveSession(session=session, user=user, token=token)


async def revoke_session(db: AsyncSession, session_id: uuid.UUID) -> None:
    await db.execute(delete(Session).where(Session.id == session_id))


async def revoke_all_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(delete(Session).where(Session.user_id == user_id))


async def revoke_other_sessions(db: AsyncSession, user_id: uuid.UUID, *, keep: uuid.UUID) -> int:
    """Delete every session of the user except `keep`; returns how many were deleted."""
    ended = await db.scalars(
        delete(Session).where(Session.user_id == user_id, Session.id != keep).returning(Session.id)
    )
    return len(ended.all())
