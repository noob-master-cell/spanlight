"""Seed a Spanlight database for the gateway overhead load test.

Creates a workspace (the same organization, owner and project `seed_workspace.py` builds for the
other scripts), then the three pieces a call through the gateway needs: an `openai_compatible`
credential on the fake provider (`fake_provider.py`, run by `compose.load.yaml`), a route that
sends every call to it once, and a gateway key without limits or cache. The fake provider's API
key is sealed with the keyring the stack runs with, so the gateway opens it the way it opens any
credential.

The gateway key is written to a JSON file only the current user can read and is never printed.

    cd backend
    export LOAD_DATABASE_URL=postgresql+psycopg://postgres:...@127.0.0.1:55433/spanlight
    uv run python load/seed_gateway.py --credentials-file ../.local/load/gateway-credentials.json

Connect as the database owner (the `postgres` user of the Compose stack), as `seed.py` does: this
is a test harness, not a product path, so it does not go through row-level security.

The keyring must be the one the api and worker run with. `compose.load.yaml` gives them
LOAD_CREDENTIALS_KEYS, or the test keyring below when that is unset, and this script reads the
same variable with the same default. The keyring seals nothing but a made-up key for the fake
provider.
"""

import argparse
import asyncio
import json
import os
import secrets
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.core.security import GATEWAY_KEY_PREFIX, generate_key
from app.db.models import (
    GatewayKey,
    GatewayRoute,
    GatewayRouteVersion,
    ProviderCredential,
    ProviderKind,
)
from app.db.session import create_engine, create_session_factory
from app.gateway.credentials import base_url_for, seal_api_key
from app.gateway.route_config import FallbackPolicy, RetryPolicy, RouteConfig, Target
from seed_workspace import WorkspaceError, create_workspace

# The keyring of the load stack: key id `load`, then 32 bytes of ASCII text in base64. Public on
# purpose, like the other throwaway values of a load run; keep it equal to the default of
# LOAD_CREDENTIALS_KEYS in compose.load.yaml.
DEFAULT_CREDENTIALS_KEYS = "load:c3BhbmxpZ2h0LWxvYWQtdGVzdC1vbmx5LWtleS0wMDE="
# Where the api container reaches the fake provider. The adapter appends `/chat/completions`.
DEFAULT_PROVIDER_BASE_URL = "http://fake-provider:9000/v1"
# The model the fake provider's canned answer names; the k6 script requests it.
MODEL = "gpt-4o-mini"
ENVIRONMENT = "load-test"


@dataclass(frozen=True)
class Options:
    credentials_file: Path
    provider_base_url: str
    credentials_keys: str


def say(message: str) -> None:
    print(f"seed-gateway: {message}", flush=True)


def write_credentials(path: Path, gateway_key: str) -> None:
    """Write the key where only the current user can read it."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)  # the mode below only applies to a file that is created
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump({"gateway_key": gateway_key, "model": MODEL}, handle)


async def add_gateway(
    session_factory: async_sessionmaker[AsyncSession],
    org_id: uuid.UUID,
    project_id: uuid.UUID,
    options: Options,
) -> str:
    """Add the credential, the route and the key; returns the key's plaintext."""
    settings = Settings(credentials_keys=SecretStr(options.credentials_keys))
    base_url = base_url_for(
        ProviderKind.OPENAI_COMPATIBLE, options.provider_base_url, allow_insecure=True
    )
    sealed = seal_api_key(secrets.token_urlsafe(24), settings=settings)
    now = datetime.now(UTC)
    async with session_factory() as session:
        credential = ProviderCredential(
            org_id=org_id,
            provider=ProviderKind.OPENAI_COMPATIBLE,
            name="fake-provider",
            base_url=base_url,
            ciphertext=sealed.ciphertext,
            key_id=sealed.key_id,
        )
        session.add(credential)
        await session.flush()
        # One attempt and no fallback: the fake provider never fails, and a retry would hide a
        # slow call instead of showing it.
        config = RouteConfig(
            targets=[Target(credential_id=credential.id)],
            retry=RetryPolicy(max_attempts=1),
            fallback=FallbackPolicy(on=[]),
        ).model_dump(mode="json")
        route = GatewayRoute(
            project_id=project_id,
            name="load-test",
            is_default=True,
            config=config,
            version=1,
            created_at=now,
            updated_at=now,
        )
        session.add(route)
        await session.flush()
        session.add(
            GatewayRouteVersion(
                route_id=route.id,
                version=route.version,
                project_id=project_id,
                config=config,
                created_at=now,
            )
        )
        generated = generate_key(GATEWAY_KEY_PREFIX)
        # No rpm or tpm limit, no model list and no cache TTL: nothing may throttle the run, and
        # a cached answer would measure the cache instead of the gateway.
        session.add(
            GatewayKey(
                project_id=project_id,
                route_id=route.id,
                name="load-test",
                prefix=generated.prefix,
                secret_hash=generated.secret_hash,
                environment=ENVIRONMENT,
                allowed_models=[],
                default_tags=[],
                created_at=now,
            )
        )
        await session.commit()
    return generated.plaintext


def parse_options(argv: list[str]) -> Options:
    parser = argparse.ArgumentParser(description="Seed a database for the gateway load test.")
    parser.add_argument(
        "--credentials-file", type=Path, required=True, help="where to write the key (JSON)"
    )
    parser.add_argument(
        "--provider-base-url",
        default=DEFAULT_PROVIDER_BASE_URL,
        help=f"the fake provider as the api reaches it (default: {DEFAULT_PROVIDER_BASE_URL})",
    )
    args = parser.parse_args(argv)
    return Options(
        credentials_file=args.credentials_file,
        provider_base_url=args.provider_base_url,
        # A blank value is unset, as it is for the settings of the api.
        credentials_keys=os.environ.get("LOAD_CREDENTIALS_KEYS", "").strip()
        or DEFAULT_CREDENTIALS_KEYS,
    )


async def run(options: Options, database_url: str) -> None:
    engine = create_engine(database_url, pool_size=2)
    session_factory = create_session_factory(engine)
    try:
        workspace = await create_workspace(session_factory)
        say(f"project {workspace.project_id} created")
        gateway_key = await add_gateway(
            session_factory, workspace.org_id, workspace.project_id, options
        )
        write_credentials(options.credentials_file, gateway_key)
        say(f"credential, route and key added; key written to {options.credentials_file}")
    finally:
        await engine.dispose()


def main() -> None:
    options = parse_options(sys.argv[1:])
    # Deliberately not DATABASE_URL, as in seed.py.
    database_url = os.environ.get("LOAD_DATABASE_URL", "")
    if not database_url:
        sys.exit("seed-gateway: set LOAD_DATABASE_URL to the owner URL of the database to fill")
    try:
        asyncio.run(run(options, database_url))
    except WorkspaceError as error:
        sys.exit(f"seed-gateway: {error}")


if __name__ == "__main__":
    main()
