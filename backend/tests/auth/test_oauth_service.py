"""The sign-in rules at the service level, including two callbacks racing for one new user."""

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth import oauth_service
from app.auth.oauth_providers import OAuthProfile
from app.auth.oauth_service import (
    LastSignInMethodError,
    OAuthCode,
    OAuthRefused,
    link_identity,
    sign_in_with_profile,
    unlink_identity,
)
from app.db.models import OAuthIdentity, User
from app.services.demo import DEMO_USER_EMAIL, ensure_demo_workspace

SessionFactory = async_sessionmaker[AsyncSession]


def _profile(**overrides: object) -> OAuthProfile:
    fields: dict[str, object] = {
        "provider": "github",
        "subject": "1001",
        "email": "ada@example.com",
        "email_verified": True,
        "name": "Ada Lovelace",
    }
    fields.update(overrides)
    return OAuthProfile(**fields)  # type: ignore[arg-type]


async def _sign_in(factory: SessionFactory, profile: OAuthProfile) -> User | OAuthRefused:
    async with factory() as db:
        try:
            user = await sign_in_with_profile(db, profile)
        except OAuthRefused as refused:
            await db.rollback()
            return refused
        await db.commit()
        return user


async def test_two_first_sign_ins_for_one_account_make_one_user(
    session_factory: SessionFactory,
) -> None:
    results = await asyncio.gather(
        *(_sign_in(session_factory, _profile()) for _ in range(4)), return_exceptions=True
    )

    users = [r for r in results if isinstance(r, User)]
    assert len(users) == 4, results
    assert len({user.id for user in users}) == 1
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(User)) == 1
        assert await db.scalar(select(func.count()).select_from(OAuthIdentity)) == 1


async def test_two_providers_with_one_verified_email_make_one_user(
    session_factory: SessionFactory,
) -> None:
    # The second provider finds the user the first one created, and links to it.
    results = await asyncio.gather(
        _sign_in(session_factory, _profile(provider="github", subject="1")),
        _sign_in(session_factory, _profile(provider="google", subject="g-1")),
        return_exceptions=True,
    )

    assert all(isinstance(r, User) for r in results), results
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(User)) == 1
        assert await db.scalar(select(func.count()).select_from(OAuthIdentity)) == 2


async def test_the_shared_demo_account_cannot_be_signed_into(
    session_factory: SessionFactory,
) -> None:
    async with session_factory() as db:
        await ensure_demo_workspace(db)
        await db.execute(
            update(User).where(User.email == DEMO_USER_EMAIL).values(email_verified_at=func.now())
        )
        await db.commit()

    result = await _sign_in(session_factory, _profile(email=DEMO_USER_EMAIL))

    assert isinstance(result, OAuthRefused)
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(OAuthIdentity)) == 0


async def test_a_long_name_is_cut_to_the_length_names_may_have(
    session_factory: SessionFactory,
) -> None:
    result = await _sign_in(session_factory, _profile(name="N" * 300))

    assert isinstance(result, User)
    assert len(result.name) == 100


async def test_a_missing_name_falls_back_to_the_email_local_part(
    session_factory: SessionFactory,
) -> None:
    result = await _sign_in(session_factory, _profile(name=None))

    assert isinstance(result, User)
    assert result.name == "ada"


async def test_unlinks_for_one_user_wait_for_each_other(session_factory: SessionFactory) -> None:
    # Two requests each remove one of the user's two sign-in methods. The second must wait for
    # the first to finish and then see that only one method is left; if it did not wait, both
    # would count two and the account would end up with none.
    async with session_factory() as setup:
        user = User(email="ada@example.com", password_hash=None, name="Ada")
        setup.add(user)
        await setup.flush()
        setup.add_all(
            [
                OAuthIdentity(user_id=user.id, provider="github", subject="1"),
                OAuthIdentity(user_id=user.id, provider="google", subject="2"),
            ]
        )
        await setup.commit()
        user_id = user.id

    async with session_factory() as first, session_factory() as second:
        first_user = await first.get(User, user_id)
        second_user = await second.get(User, user_id)
        assert first_user is not None
        assert second_user is not None
        await unlink_identity(first, first_user, "github")  # not committed yet

        waiting = asyncio.create_task(unlink_identity(second, second_user, "google"))
        await asyncio.sleep(0.3)
        assert not waiting.done()

        await first.commit()
        with pytest.raises(LastSignInMethodError):
            await waiting


# --- who may link ------------------------------------------------------------------------------


async def _user(factory: SessionFactory, email: str, *, verified: bool) -> User:
    async with factory() as db:
        user = User(
            email=email,
            password_hash=None,
            name="Test",
            email_verified_at=datetime.now(UTC) if verified else None,
        )
        db.add(user)
        await db.commit()
        return user


async def _link(
    factory: SessionFactory, user: User, *, require_verified_email: bool
) -> OAuthRefused | None:
    async with factory() as db:
        try:
            await link_identity(db, user, _profile(), require_verified_email=require_verified_email)
        except OAuthRefused as refused:
            await db.rollback()
            return refused
        await db.commit()
        return None


async def _identity_count(factory: SessionFactory) -> int:
    async with factory() as db:
        return int(await db.scalar(select(func.count()).select_from(OAuthIdentity)) or 0)


async def test_an_unverified_user_cannot_link_when_verification_is_required(
    session_factory: SessionFactory,
) -> None:
    user = await _user(session_factory, "ada@example.com", verified=False)

    refused = await _link(session_factory, user, require_verified_email=True)

    assert refused is not None
    assert refused.code == OAuthCode.ACCOUNT_EMAIL_UNVERIFIED
    assert await _identity_count(session_factory) == 0


async def test_an_unverified_user_can_link_when_verification_is_not_required(
    session_factory: SessionFactory,
) -> None:
    user = await _user(session_factory, "ada@example.com", verified=False)

    assert await _link(session_factory, user, require_verified_email=False) is None
    assert await _identity_count(session_factory) == 1


async def test_a_verified_user_can_link_either_way(session_factory: SessionFactory) -> None:
    user = await _user(session_factory, "ada@example.com", verified=True)

    assert await _link(session_factory, user, require_verified_email=True) is None
    assert await _identity_count(session_factory) == 1


@pytest.mark.parametrize("require_verified_email", [True, False])
async def test_the_demo_account_cannot_be_linked(
    session_factory: SessionFactory, require_verified_email: bool
) -> None:
    async with session_factory() as db:
        demo = (await ensure_demo_workspace(db)).user
        await db.commit()

    refused = await _link(session_factory, demo, require_verified_email=require_verified_email)

    assert refused is not None
    assert refused.code == OAuthCode.ACCOUNT_EMAIL_UNVERIFIED
    assert await _identity_count(session_factory) == 0


# --- which database errors mean "someone else got there first" -----------------------------------


def _integrity_error(constraint: str | None) -> IntegrityError:
    diag = SimpleNamespace(constraint_name=constraint)
    return IntegrityError("INSERT ...", {}, _DbError(diag))


class _DbError(Exception):
    def __init__(self, diag: Any) -> None:
        super().__init__("duplicate key")
        self.diag = diag


@pytest.mark.parametrize(
    "constraint",
    ["oauth_identities_provider_subject_key", "oauth_identities_user_id_provider_key"],
)
async def test_losing_a_race_to_link_means_already_linked(
    session_factory: SessionFactory, monkeypatch: pytest.MonkeyPatch, constraint: str
) -> None:
    async def lose(*args: object, **kwargs: object) -> None:
        raise _integrity_error(constraint)

    monkeypatch.setattr(oauth_service, "_attach", lose)
    user = await _user(session_factory, "ada@example.com", verified=True)

    refused = await _link(session_factory, user, require_verified_email=True)

    assert refused is not None
    assert refused.code == OAuthCode.ALREADY_LINKED


@pytest.mark.parametrize("constraint", ["audit_events_action_check", "users_pkey", None])
async def test_other_integrity_errors_while_linking_are_not_hidden(
    session_factory: SessionFactory, monkeypatch: pytest.MonkeyPatch, constraint: str | None
) -> None:
    async def fail(*args: object, **kwargs: object) -> None:
        raise _integrity_error(constraint)

    monkeypatch.setattr(oauth_service, "_attach", fail)
    user = await _user(session_factory, "ada@example.com", verified=True)

    with pytest.raises(IntegrityError):
        await _link(session_factory, user, require_verified_email=True)


async def test_other_integrity_errors_while_signing_in_are_not_retried(
    session_factory: SessionFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = 0

    async def fail(*args: object, **kwargs: object) -> None:
        nonlocal calls
        calls += 1
        raise _integrity_error("audit_events_action_check")

    monkeypatch.setattr(oauth_service, "_resolve", fail)

    with pytest.raises(IntegrityError):
        await _sign_in(session_factory, _profile())
    assert calls == 1
