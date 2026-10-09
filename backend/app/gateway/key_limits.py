"""Applying a gateway key's limits to a call, and recording what the call used.

The order is fixed: the organization ceiling, then the key's requests per minute, then its tokens
per minute. The first that refuses answers `RATE_LIMITED` with `Retry-After`, and the later ones
are not consulted. A token taken from an earlier bucket stays spent when a later limit refuses.

The two buckets live in `rate_limit_buckets` and are taken on the rate-limit pool, each in a
transaction of its own (`take_token`), so a long call never holds a bucket's row lock and a
limiter that cannot run lets the call through. The tokens window is read and written on the
request's session, under the key's project binding, since `gateway_key_minutes` is under
row-level security.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.core.observability import RATE_LIMIT_REJECTIONS
from app.core.ratelimit import PostgresTokenBucket, take_token
from app.db.models import GatewayKey, GatewayKeyMinute
from app.gateway.errors import GatewayError, rate_limited
from app.gateway.key_queries import minute_tokens
from app.gateway.limits import (
    key_bucket_key,
    minute_start,
    org_bucket_key,
    per_minute_bucket,
    tpm_retry_after,
)

METRIC_SCOPE = "gateway"


@dataclass(frozen=True)
class GatewayLimiter:
    """Takes tokens from the gateway's buckets on the rate-limit pool."""

    session_factory: async_sessionmaker[AsyncSession]

    async def take(self, bucket: PostgresTokenBucket, key: str) -> float | None:
        """None when a token was taken (or the limiter could not run), else seconds to wait."""
        return await take_token(self.session_factory, bucket, key, scope=METRIC_SCOPE)


async def check_limits(
    db: AsyncSession,
    limiter: GatewayLimiter,
    *,
    key: GatewayKey,
    org_id: uuid.UUID,
    settings: Settings,
    now: datetime,
    check_tokens: bool = True,
) -> GatewayError | None:
    """The `RATE_LIMITED` error for the first limit the call exceeds, or None to let it through.

    `check_tokens=False` skips the tokens window, for a call that uses no tokens (`/models`).
    """
    error = await _first_refusal(
        db, limiter, key=key, org_id=org_id, settings=settings, now=now, check_tokens=check_tokens
    )
    if error is not None:
        RATE_LIMIT_REJECTIONS.labels(METRIC_SCOPE).inc()
    return error


async def check_tpm(db: AsyncSession, key_id: uuid.UUID, limit: int, now: datetime) -> int | None:
    """Seconds until the key's tokens window resets when this minute is full, else None."""
    used = await minute_tokens(db, key_id, minute_start(now))
    return tpm_retry_after(used, limit, now)


async def record_minute(
    db: AsyncSession, key_id: uuid.UUID, project_id: uuid.UUID, tokens: int, now: datetime
) -> None:
    """Count one call and its tokens in the key's current minute. Does not commit.

    One upsert, so concurrent calls add up instead of overwriting each other. The row lock it
    takes is held until the caller commits, so commit soon after.
    """
    statement = insert(GatewayKeyMinute).values(
        key_id=key_id,
        minute_start=minute_start(now),
        project_id=project_id,
        requests=1,
        tokens=tokens,
    )
    await db.execute(
        statement.on_conflict_do_update(
            index_elements=[GatewayKeyMinute.key_id, GatewayKeyMinute.minute_start],
            set_={
                "requests": GatewayKeyMinute.requests + 1,
                "tokens": GatewayKeyMinute.tokens + statement.excluded.tokens,
            },
        )
    )


async def _first_refusal(
    db: AsyncSession,
    limiter: GatewayLimiter,
    *,
    key: GatewayKey,
    org_id: uuid.UUID,
    settings: Settings,
    now: datetime,
    check_tokens: bool,
) -> GatewayError | None:
    ceiling = settings.gateway_org_rpm_ceiling
    if ceiling is not None:
        wait = await limiter.take(per_minute_bucket(ceiling), org_bucket_key(org_id))
        if wait is not None:
            return rate_limited("org", ceiling, wait)
    if key.rpm_limit is not None:
        wait = await limiter.take(per_minute_bucket(key.rpm_limit), key_bucket_key(key.id))
        if wait is not None:
            return rate_limited("rpm", key.rpm_limit, wait, key_prefix=key.prefix)
    if check_tokens and key.tpm_limit is not None:
        seconds = await check_tpm(db, key.id, key.tpm_limit, now)
        if seconds is not None:
            return rate_limited("tpm", key.tpm_limit, seconds, key_prefix=key.prefix)
    return None
