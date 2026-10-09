"""The demo project's gateway setup: the credential, route and key its traffic uses.

The `demo_traffic` job sends its LLM calls through the gateway, like any application would.
`ensure_demo_gateway` keeps the pieces in place, so the job only needs `ANTHROPIC_API_KEY` and
`CREDENTIALS_KEYS`; nobody has to set the demo up by hand.
"""

import hmac
from dataclasses import dataclass
from datetime import UTC, datetime

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.core.crypto import CryptoNotConfigured, DecryptionFailed, Sealed, UnknownKeyId, decrypt
from app.core.ids import new_id
from app.core.security import GATEWAY_KEY_PREFIX, generate_key
from app.db.models import (
    AuditAction,
    GatewayKey,
    GatewayRoute,
    GatewayRouteVersion,
    Organization,
    ProviderCredential,
    ProviderKind,
)
from app.db.rls import bind_project
from app.gateway.credentials import seal_api_key
from app.gateway.key_context import KeyContext, load_key_context
from app.gateway.route_config import FallbackPolicy, RetryPolicy, RouteConfig, Target
from app.services.audit import record_audit
from app.services.demo import DemoWorkspace, ensure_demo_workspace

logger = structlog.get_logger(__name__)

DEMO_CREDENTIAL_NAME = "demo-anthropic"
DEMO_ROUTE_NAME = "demo"
DEMO_KEY_NAME = "demo"
DEMO_ENVIRONMENT = "demo"
DEMO_TAGS = ("demo",)
# The whole time budget of one demo call. One attempt and no fallback: a paid job never retries.
DEMO_TIMEOUT_MS = 20_000


@dataclass(frozen=True)
class DemoGateway:
    """The demo project's gateway setup; `key_context` is what the job's calls are made with."""

    workspace: DemoWorkspace
    credential: ProviderCredential
    route: GatewayRoute
    key_context: KeyContext


async def ensure_demo_gateway(db: AsyncSession, settings: Settings) -> DemoGateway:
    """Ensure the demo workspace and its gateway setup. Idempotent; the caller commits.

    - credential `demo-anthropic`, sealed from `ANTHROPIC_API_KEY`, and sealed again (a
      rotation) only when the key it holds differs from the configured one;
    - route `demo`, sending every call to that credential once: one attempt, no fallback;
    - key `demo` (environment `demo`, default tag `demo`) without rate limits, cache TTL or
      fault profile. Its secret is never kept: the job calls the gateway in process.

    Resources it creates or rotates are audited without an actor (no user did it). Raises
    `CryptoNotConfigured` without `CREDENTIALS_KEYS` or `ANTHROPIC_API_KEY`.
    """
    if settings.anthropic_api_key is None or not settings.is_crypto_configured:
        raise CryptoNotConfigured("CREDENTIALS_KEYS and ANTHROPIC_API_KEY are both required")
    api_key = settings.anthropic_api_key.get_secret_value()
    now = datetime.now(UTC)
    workspace = await ensure_demo_workspace(db)
    credential = await _ensure_credential(db, workspace.org, api_key, settings=settings, now=now)
    await bind_project(db, workspace.project.id)  # routes and keys are under row-level security
    route = await _ensure_route(db, workspace, credential, now=now)
    key = await _ensure_key(db, workspace, route, now=now)
    key_context = await load_key_context(db, key)
    if key_context is None:
        raise RuntimeError("the demo key's route or project is missing")
    return DemoGateway(
        workspace=workspace, credential=credential, route=route, key_context=key_context
    )


async def _ensure_credential(
    db: AsyncSession, org: Organization, api_key: str, *, settings: Settings, now: datetime
) -> ProviderCredential:
    """The org's `demo-anthropic` credential, holding `api_key`. Locked until commit."""
    sealed = seal_api_key(api_key, settings=settings)
    created = await db.scalar(
        insert(ProviderCredential)
        .values(
            id=new_id(),
            org_id=org.id,
            provider=ProviderKind.ANTHROPIC,
            name=DEMO_CREDENTIAL_NAME,
            ciphertext=sealed.ciphertext,
            key_id=sealed.key_id,
        )
        .on_conflict_do_nothing(index_elements=[ProviderCredential.org_id, ProviderCredential.name])
        .returning(ProviderCredential.id)
    )
    credential = (
        await db.scalars(
            select(ProviderCredential)
            .where(
                ProviderCredential.org_id == org.id,
                ProviderCredential.name == DEMO_CREDENTIAL_NAME,
            )
            .with_for_update()
        )
    ).one()
    if created is not None:
        await _audit_credential(db, credential, AuditAction.CREDENTIAL_CREATE)
        return credential
    if not _holds_key(credential, api_key, settings=settings):
        await _rotate(db, credential, sealed, now=now)
    return credential


async def _rotate(
    db: AsyncSession, credential: ProviderCredential, sealed: Sealed, *, now: datetime
) -> None:
    """Store the newly sealed key, as a rotation does: the last check was about the old key."""
    credential.ciphertext = sealed.ciphertext
    credential.key_id = sealed.key_id
    credential.rotated_at = now
    credential.last_checked_at = None
    credential.last_error = None
    await db.flush()
    logger.info("demo_credential_resealed", credential_id=str(credential.id))
    await _audit_credential(db, credential, AuditAction.CREDENTIAL_ROTATE)


def _holds_key(credential: ProviderCredential, api_key: str, *, settings: Settings) -> bool:
    """Whether the credential's sealed key is `api_key`, compared in constant time.

    A key that no longer opens (its key id left the keyring) does not hold it.
    """
    sealed = Sealed(ciphertext=credential.ciphertext, key_id=credential.key_id)
    try:
        stored = decrypt(sealed, settings=settings)
    except (UnknownKeyId, DecryptionFailed):
        return False
    return hmac.compare_digest(stored, api_key.encode())


async def _ensure_route(
    db: AsyncSession, workspace: DemoWorkspace, credential: ProviderCredential, *, now: datetime
) -> GatewayRoute:
    """The project's `demo` route, created on first use; the project's default if it has none.

    An existing route is used as it is.
    """
    config = RouteConfig(
        targets=[Target(credential_id=credential.id)],
        retry=RetryPolicy(max_attempts=1),
        fallback=FallbackPolicy(on=[]),
        timeout_ms=DEMO_TIMEOUT_MS,
    ).model_dump(mode="json")
    project_id = workspace.project.id
    has_default = await db.scalar(
        select(GatewayRoute.id).where(
            GatewayRoute.project_id == project_id, GatewayRoute.is_default
        )
    )
    # Without a target, ON CONFLICT also covers the one-default-route index.
    created = await db.scalar(
        insert(GatewayRoute)
        .values(
            id=new_id(),
            project_id=project_id,
            name=DEMO_ROUTE_NAME,
            is_default=has_default is None,
            config=config,
            version=1,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_nothing()
        .returning(GatewayRoute.id)
    )
    # Locked until commit: it orders concurrent callers for the key check that follows.
    route = (
        await db.scalars(
            select(GatewayRoute)
            .where(GatewayRoute.project_id == project_id, GatewayRoute.name == DEMO_ROUTE_NAME)
            .with_for_update()
        )
    ).one()
    if created is not None:
        await _record_new_route(db, workspace, route, now=now)
    return route


async def _record_new_route(
    db: AsyncSession, workspace: DemoWorkspace, route: GatewayRoute, *, now: datetime
) -> None:
    """Keep a new route's first version, as every route save does, and audit its creation."""
    db.add(
        GatewayRouteVersion(
            route_id=route.id,
            version=route.version,
            project_id=route.project_id,
            config=route.config,
            created_at=now,
        )
    )
    await db.flush()
    await record_audit(
        db,
        org_id=workspace.org.id,
        actor_user_id=None,
        action=AuditAction.GATEWAY_ROUTE_CREATE,
        target_type="gateway_route",
        target_id=route.id,
        metadata={"name": route.name, "version": route.version, "is_default": route.is_default},
    )


async def _ensure_key(
    db: AsyncSession, workspace: DemoWorkspace, route: GatewayRoute, *, now: datetime
) -> GatewayKey:
    """The project's active `demo` key, created if there is none.

    The caller holds the route's row lock, so concurrent callers cannot each create one.
    """
    project_id = workspace.project.id
    existing = await db.scalar(
        select(GatewayKey)
        .where(
            GatewayKey.project_id == project_id,
            GatewayKey.name == DEMO_KEY_NAME,
            GatewayKey.route_id.is_not(None),
            GatewayKey.revoked_at.is_(None),
        )
        .order_by(GatewayKey.created_at)
        .limit(1)
    )
    if existing is not None:
        return existing
    return await _create_key(db, workspace, route, now=now)


async def _create_key(
    db: AsyncSession, workspace: DemoWorkspace, route: GatewayRoute, *, now: datetime
) -> GatewayKey:
    project_id = workspace.project.id
    generated = generate_key(GATEWAY_KEY_PREFIX)  # the secret is dropped: nobody presents it
    key = GatewayKey(
        project_id=project_id,
        route_id=route.id,
        name=DEMO_KEY_NAME,
        prefix=generated.prefix,
        secret_hash=generated.secret_hash,
        environment=DEMO_ENVIRONMENT,
        allowed_models=[],
        default_tags=list(DEMO_TAGS),
        created_at=now,
    )
    db.add(key)
    await db.flush()
    await record_audit(
        db,
        org_id=workspace.org.id,
        actor_user_id=None,
        action=AuditAction.GATEWAY_KEY_CREATE,
        target_type="gateway_key",
        target_id=key.id,
        metadata={
            "name": key.name,
            "prefix": key.prefix,
            "project_id": str(project_id),
            "route_id": str(route.id),
            "environment": key.environment,
            "default_tags": key.default_tags,
        },
    )
    return key


async def _audit_credential(
    db: AsyncSession, credential: ProviderCredential, action: AuditAction
) -> None:
    await record_audit(
        db,
        org_id=credential.org_id,
        actor_user_id=None,
        action=action,
        target_type="provider_credential",
        target_id=credential.id,
        metadata={"name": credential.name, "provider": credential.provider.value},
    )
