"""Alert channels: create, edit and delete them. Callers commit.

Every write takes the organization's write lock first (`lock_org_for_write`), then the channel
row, then writes the audit event: the lock order of `app.services.deletion`, so a concurrent
organization deletion waits instead of deadlocking. The lock conflicts with itself, so two
creates in one organization run one after the other and cannot both pass the channel limit.
Checks that can take seconds (DNS for a webhook URL) run before any lock is taken.

The clear secret lives only in the request body, the one-time response and the local variables
here. It is never stored unsealed, logged or audited: the audit metadata holds the channel's
name, kind and the names of the fields that changed, never a recipient, a URL or a secret.
"""

import uuid
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts import queries
from app.alerts.channels.errors import (
    ChannelLimitError,
    ChannelNameTakenError,
    ChannelNotFoundError,
    RecipientNotMemberError,
)
from app.alerts.channels.secrets import generate_webhook_secret, seal_secret
from app.alerts.channels.urls import check_webhook_url
from app.alerts.schemas import (
    ChannelConfig,
    ChannelCreate,
    ChannelUpdate,
    EmailConfig,
    WebhookConfig,
    field_problem,
    parse_config,
    parse_secret,
)
from app.config import Settings
from app.core.crypto import CryptoNotConfigured
from app.core.egress import Resolver
from app.db.errors import violated_constraint
from app.db.models import AlertChannel, AlertChannelKind, AuditAction
from app.services.audit import record_audit
from app.services.deletion import lock_org_for_write

NAME_CONSTRAINT = "alert_channels_org_name_key"
MAX_CHANNELS_PER_ORG = 20
# The kinds whose secret is sealed with CREDENTIALS_KEYS.
SECRET_KINDS = frozenset(
    {AlertChannelKind.SLACK, AlertChannelKind.WEBHOOK, AlertChannelKind.PAGERDUTY}
)


def _require_crypto(settings: Settings) -> None:
    # Before anything else: it is the operator's state, not something about the request.
    if not settings.is_crypto_configured:
        raise CryptoNotConfigured("CREDENTIALS_KEYS is not set")


async def allowed_recipients(
    db: AsyncSession, org_id: uuid.UUID, addresses: list[str], *, settings: Settings
) -> list[str]:
    """The addresses an email channel may send to, in order: verified members only.

    Every address when `ALERT_EMAIL_ANY_RECIPIENT` is on.
    """
    if settings.alert_email_any_recipient:
        return list(addresses)
    members = await queries.verified_member_emails(db, org_id, addresses)
    return [address for address in addresses if address in members]


async def _check_config(
    db: AsyncSession,
    org_id: uuid.UUID,
    config: ChannelConfig,
    *,
    settings: Settings,
    resolver: Resolver | None,
) -> None:
    """The rules a config's values must follow beyond their shape.

    Raises `RecipientNotMemberError` and `UnsafeUrlError`.
    """
    if isinstance(config, EmailConfig):
        allowed = set(await allowed_recipients(db, org_id, config.to, settings=settings))
        refused = [address for address in config.to if address not in allowed]
        if refused:
            raise RecipientNotMemberError(refused)
    elif isinstance(config, WebhookConfig):
        await check_webhook_url(
            config.url, allow_private=settings.webhook_allow_private_targets, resolver=resolver
        )


def _first_secret(channel: AlertChannel, data: ChannelCreate, *, settings: Settings) -> str | None:
    """Seal the new channel's secret. Returns it when it is shown once (a webhook's)."""
    if data.kind is AlertChannelKind.WEBHOOK:
        generated = generate_webhook_secret()
        seal_secret(channel, generated, settings=settings)
        return generated
    if data.secret is not None:
        seal_secret(channel, data.secret.get_secret_value(), settings=settings)
    return None


async def create_channel(
    db: AsyncSession,
    org_id: uuid.UUID,
    actor_id: uuid.UUID,
    data: ChannelCreate,
    *,
    settings: Settings,
    now: datetime,
    ip: str | None = None,
    resolver: Resolver | None = None,
) -> tuple[AlertChannel, str | None]:
    """Store a new channel and return it with the webhook secret to show once (else None).

    Raises `CryptoNotConfigured` (a secret-bearing kind without CREDENTIALS_KEYS),
    `RecipientNotMemberError`, `UnsafeUrlError`, `ChannelNotFoundError` (the organization is
    gone), `ChannelLimitError` and `ChannelNameTakenError`.
    """
    if data.kind in SECRET_KINDS:
        _require_crypto(settings)
    await _check_config(db, org_id, data.config, settings=settings, resolver=resolver)
    if not await lock_org_for_write(db, org_id):
        raise ChannelNotFoundError
    if await queries.count_channels(db, org_id) >= MAX_CHANNELS_PER_ORG:
        raise ChannelLimitError(MAX_CHANNELS_PER_ORG)

    channel = AlertChannel(
        org_id=org_id,
        kind=data.kind,
        name=data.name,
        config=data.config.model_dump(mode="json"),
        created_by=actor_id,
        created_at=now,
        updated_at=now,
    )
    shown = _first_secret(channel, data, settings=settings)
    try:
        async with db.begin_nested():
            db.add(channel)
    except IntegrityError as error:
        if violated_constraint(error) == NAME_CONSTRAINT:
            raise ChannelNameTakenError from None
        raise
    await _audit(db, channel, AuditAction.ALERT_CHANNEL_CREATE, actor_id, ip=ip)
    return channel, shown


async def update_channel(
    db: AsyncSession,
    org_id: uuid.UUID,
    channel_id: uuid.UUID,
    actor_id: uuid.UUID,
    data: ChannelUpdate,
    *,
    settings: Settings,
    now: datetime,
    ip: str | None = None,
    resolver: Resolver | None = None,
) -> tuple[AlertChannel, str | None]:
    """Apply a partial edit and return the channel with a rotated webhook secret (else None).

    Raises `ChannelNotFoundError`, `InvalidChannelError`, `CryptoNotConfigured`,
    `RecipientNotMemberError`, `UnsafeUrlError` and `ChannelNameTakenError`.
    """
    found = await queries.get_channel(db, org_id, channel_id)
    if found is None:
        raise ChannelNotFoundError
    config, new_secret = await _validate_update(
        db, org_id, found.kind, data, settings=settings, resolver=resolver
    )
    if not await lock_org_for_write(db, org_id):
        raise ChannelNotFoundError
    channel = await queries.lock_channel(db, org_id, channel_id)
    if channel is None:
        raise ChannelNotFoundError
    changed = _apply_update(channel, data.name, config, new_secret, settings=settings)
    if not changed:
        return channel, None
    channel.updated_at = now
    try:
        async with db.begin_nested():
            await db.flush()
    except IntegrityError as error:
        if violated_constraint(error) == NAME_CONSTRAINT:
            raise ChannelNameTakenError from None
        raise
    await _audit(db, channel, AuditAction.ALERT_CHANNEL_UPDATE, actor_id, ip=ip, changed=changed)
    return channel, new_secret if data.rotate_secret else None


async def _validate_update(
    db: AsyncSession,
    org_id: uuid.UUID,
    kind: AlertChannelKind,
    data: ChannelUpdate,
    *,
    settings: Settings,
    resolver: Resolver | None,
) -> tuple[ChannelConfig | None, str | None]:
    """The edit's config parsed for `kind` and the clear secret to seal, each None when unchanged.

    A rotation generates the new webhook secret here. Runs before any lock: it may resolve DNS.
    """
    config = parse_config(kind, data.config) if data.config is not None else None
    new_secret: str | None = None
    if data.secret is not None:
        new_secret = parse_secret(kind, data.secret).get_secret_value()
    if data.rotate_secret:
        if kind is not AlertChannelKind.WEBHOOK:
            raise field_problem("rotate_secret", "applies to webhook channels only")
        new_secret = generate_webhook_secret()
    if new_secret is not None:
        _require_crypto(settings)
    if config is not None:
        await _check_config(db, org_id, config, settings=settings, resolver=resolver)
    return config, new_secret


def _apply_update(
    channel: AlertChannel,
    name: str | None,
    config: ChannelConfig | None,
    new_secret: str | None,
    *,
    settings: Settings,
) -> list[str]:
    """Change the locked channel and return the names of the fields that changed.

    A new config or secret clears `verified_at`: the last test reached the old target.
    """
    changed: list[str] = []
    if name is not None and name != channel.name:
        channel.name = name
        changed.append("name")
    if config is not None and (dumped := config.model_dump(mode="json")) != channel.config:
        channel.config = dumped
        changed.append("config")
    if new_secret is not None:
        seal_secret(channel, new_secret, settings=settings)
        changed.append("secret")
    if "config" in changed or "secret" in changed:
        channel.verified_at = None
    return changed


async def delete_channel(
    db: AsyncSession,
    org_id: uuid.UUID,
    channel_id: uuid.UUID,
    actor_id: uuid.UUID,
    *,
    ip: str | None = None,
) -> None:
    """Delete the channel. Rules that name it keep the id; evaluation skips a missing channel.

    Raises `ChannelNotFoundError`.
    """
    if not await lock_org_for_write(db, org_id):
        raise ChannelNotFoundError
    channel = await queries.lock_channel(db, org_id, channel_id)
    if channel is None:
        raise ChannelNotFoundError
    await _audit(db, channel, AuditAction.ALERT_CHANNEL_DELETE, actor_id, ip=ip)
    await db.delete(channel)
    await db.flush()


async def _audit(
    db: AsyncSession,
    channel: AlertChannel,
    action: AuditAction,
    actor_id: uuid.UUID,
    *,
    ip: str | None,
    changed: list[str] | None = None,
) -> None:
    """The audit event for a channel write: its name and kind, never its config or secret."""
    metadata: dict[str, object] = {"name": channel.name, "kind": channel.kind.value}
    if changed is not None:
        metadata["changed"] = changed
    await record_audit(
        db,
        org_id=channel.org_id,
        actor_user_id=actor_id,
        action=action,
        target_type="alert_channel",
        target_id=channel.id,
        ip=ip,
        metadata=metadata,
    )
