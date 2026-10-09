"""The signed, five-minute challenge that carries a password-checked login to the second step."""

import base64
import json
import re
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.auth.login_challenge import (
    CHALLENGE_TTL,
    SIGNING_CONTEXT,
    Challenge,
    credential_fingerprint,
    issue_challenge,
    read_challenge,
)
from app.auth.oauth_state import _SIGNING_CONTEXT as OAUTH_STATE_CONTEXT
from app.auth.oauth_state import OAuthState, sign_state
from app.auth.signing import seal
from app.config import Settings

NOW = datetime(2026, 10, 8, 12, 0, 0, tzinfo=UTC)
USER_ID = uuid.UUID("0199d6a0-1111-7000-8000-000000000001")


def settings_with(key: str = "challenge-test-secret") -> Settings:
    return Settings(_env_file=None, secret_key=key)


PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA"  # shape only; never verified


def issue(settings: Settings, user_id: uuid.UUID = USER_ID, at: datetime = NOW) -> Challenge:
    return issue_challenge(settings, user_id, at, password_hash=PASSWORD_HASH)


def user_of(settings: Settings, token: str, at: datetime) -> uuid.UUID | None:
    claims = read_challenge(settings, token, at)
    return claims.user_id if claims else None


def body_of(token: str) -> dict[str, object]:
    encoded = token.split(".", maxsplit=1)[0]
    decoded = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    parsed: dict[str, object] = json.loads(decoded)
    return parsed


def test_a_challenge_lasts_five_minutes() -> None:
    challenge = issue(settings_with())

    assert timedelta(minutes=5) == CHALLENGE_TTL
    assert challenge.expires_at == NOW + timedelta(minutes=5)


def test_the_user_is_read_back_from_a_fresh_challenge() -> None:
    settings = settings_with()
    challenge = issue(settings)

    assert user_of(settings, challenge.token, NOW) == USER_ID
    assert user_of(settings, challenge.token, NOW + timedelta(minutes=4, seconds=59)) == USER_ID


def test_a_challenge_is_dead_from_its_expiry_instant() -> None:
    settings = settings_with()
    challenge = issue(settings)

    assert read_challenge(settings, challenge.token, challenge.expires_at) is None
    assert read_challenge(settings, challenge.token, NOW + timedelta(hours=1)) is None


def test_every_challenge_is_different_even_for_the_same_user_and_second() -> None:
    settings = settings_with()
    first = issue(settings)
    second = issue(settings)

    assert first.token != second.token
    assert body_of(first.token)["n"] != body_of(second.token)["n"]


def test_the_token_is_url_safe_for_a_fragment() -> None:
    token = issue(settings_with()).token

    assert all(char.isalnum() or char in "-_." for char in token), token


def test_a_changed_payload_is_rejected() -> None:
    settings = settings_with()
    challenge = issue(settings)
    other_user = uuid.UUID("0199d6a0-2222-7000-8000-000000000002")
    payload = {**body_of(challenge.token), "u": str(other_user)}
    forged_body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = challenge.token.split(".")[1]

    forged = f"{forged_body.rstrip(b'=').decode()}.{signature}"

    assert read_challenge(settings, forged, NOW) is None


def test_a_challenge_with_a_later_expiry_is_rejected() -> None:
    settings = settings_with()
    challenge = issue(settings)
    payload = {**body_of(challenge.token), "exp": int((NOW + timedelta(days=1)).timestamp())}
    forged_body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode())
    signature = challenge.token.split(".")[1]

    forged = f"{forged_body.rstrip(b'=').decode()}.{signature}"

    assert read_challenge(settings, forged, NOW + timedelta(hours=1)) is None


def test_a_challenge_signed_with_another_key_is_rejected() -> None:
    challenge = issue(settings_with("one-key"))

    assert read_challenge(settings_with("another-key"), challenge.token, NOW) is None


def test_a_signature_made_for_another_purpose_with_the_same_key_does_not_validate() -> None:
    settings = settings_with()
    key = settings.secret_key.get_secret_value()
    payload = {
        "u": str(USER_ID),
        "exp": int((NOW + timedelta(minutes=5)).timestamp()),
        "n": "x",
        "pw": credential_fingerprint(PASSWORD_HASH),
    }

    # The same fields, the same key, signed for the OAuth state cookie: not a challenge.
    other_purpose = seal(key, OAUTH_STATE_CONTEXT, payload)
    intended = seal(key, SIGNING_CONTEXT, payload)

    assert read_challenge(settings, other_purpose, NOW) is None
    assert user_of(settings, intended, NOW) == USER_ID


def test_an_oauth_state_cookie_is_not_a_challenge() -> None:
    settings = settings_with()
    state = OAuthState(
        state="s" * 20,
        verifier="v" * 20,
        provider="github",
        intent="sign_in",
        next="/",
        user_id=USER_ID,
        exp=NOW + timedelta(minutes=5),
    )
    cookie = sign_state(settings.secret_key.get_secret_value(), state)

    assert read_challenge(settings, cookie, NOW) is None


@pytest.mark.parametrize(
    "garbage",
    ["", ".", "..", "abc", "abc.def", "a.b.c", "!!!.???", "e30.", ".e30", "e30.AAAA"],
)
def test_garbage_is_rejected_without_raising(garbage: str) -> None:
    assert read_challenge(settings_with(), garbage, NOW) is None


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"u": str(USER_ID)},
        {"u": str(USER_ID), "exp": "soon", "n": "x", "pw": "x"},
        {"u": str(USER_ID), "exp": True, "n": "x", "pw": "x"},
        {"u": "not-a-uuid", "exp": 4_000_000_000, "n": "x", "pw": "x"},
        {"u": 5, "exp": 4_000_000_000, "n": "x", "pw": "x"},
        {"u": str(USER_ID), "exp": 4_000_000_000, "n": "", "pw": "x"},
        {"u": str(USER_ID), "exp": 4_000_000_000, "n": 7, "pw": "x"},
        {"u": str(USER_ID), "exp": 1e30, "n": "x", "pw": "x"},
        # A challenge without the password fingerprint (or with a useless one) is not accepted.
        {"u": str(USER_ID), "exp": 4_000_000_000, "n": "x"},
        {"u": str(USER_ID), "exp": 4_000_000_000, "n": "x", "pw": ""},
        {"u": str(USER_ID), "exp": 4_000_000_000, "n": "x", "pw": 7},
        {"u": str(USER_ID), "exp": 4_000_000_000, "n": "x", "pw": None},
        [],
        "text",
    ],
)
def test_a_correctly_signed_but_malformed_payload_is_rejected(payload: object) -> None:
    settings = settings_with()
    token = seal(settings.secret_key.get_secret_value(), SIGNING_CONTEXT, payload)

    assert read_challenge(settings, token, NOW) is None


# --- the password the challenge was issued for -------------------------------------------------


def test_a_challenge_carries_a_fingerprint_of_the_password_it_was_issued_for() -> None:
    settings = settings_with()
    challenge = issue(settings)

    claims = read_challenge(settings, challenge.token, NOW)

    assert claims is not None
    assert claims.user_id == USER_ID
    assert claims.credential == credential_fingerprint(PASSWORD_HASH)


def test_the_fingerprint_follows_the_stored_hash() -> None:
    other = PASSWORD_HASH.replace("aGFzaA", "b3RoZXI")

    assert credential_fingerprint(PASSWORD_HASH) == credential_fingerprint(PASSWORD_HASH)
    assert credential_fingerprint(PASSWORD_HASH) != credential_fingerprint(other)


def test_a_user_without_a_password_has_a_fingerprint_of_their_own() -> None:
    # An OAuth-only user has no hash. Setting one must change the fingerprint too.
    assert credential_fingerprint(None) == credential_fingerprint(None)
    assert credential_fingerprint(None) != credential_fingerprint(PASSWORD_HASH)
    assert credential_fingerprint(None) != credential_fingerprint("")


def test_the_fingerprint_reveals_nothing_of_the_hash() -> None:
    fingerprint = credential_fingerprint(PASSWORD_HASH)

    assert re.fullmatch(r"[0-9a-f]{32}", fingerprint)  # 16 bytes
    assert fingerprint not in PASSWORD_HASH
    token = issue(settings_with()).token
    assert PASSWORD_HASH not in token
    assert "argon2" not in json.dumps(body_of(token))
