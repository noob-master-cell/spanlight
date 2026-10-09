"""Prefixed credentials (`spl_live_…`, `spl_pat_…`): one format, one parser, one comparison."""

import hashlib

import pytest

from app.core.security import (
    ANY_KEY_PATTERN,
    API_KEY_PREFIX,
    GATEWAY_KEY_PREFIX,
    KEY_PREFIXES,
    PAT_PREFIX,
    generate_key,
    key_secret_matches,
    parse_key,
)

PREFIXES = list(KEY_PREFIXES)


def test_the_known_prefixes() -> None:
    assert API_KEY_PREFIX == "spl_live_"
    assert PAT_PREFIX == "spl_pat_"
    assert GATEWAY_KEY_PREFIX == "spl_gw_"
    assert KEY_PREFIXES == (API_KEY_PREFIX, PAT_PREFIX, GATEWAY_KEY_PREFIX)


@pytest.mark.parametrize("prefix", PREFIXES)
def test_the_any_key_pattern_matches_exactly_what_the_generator_makes(prefix: str) -> None:
    for _ in range(50):
        key = generate_key(prefix).plaintext
        assert ANY_KEY_PATTERN.fullmatch(key)
        assert parse_key(key, prefix) is not None


@pytest.mark.parametrize("prefix", PREFIXES)
def test_a_generated_key_has_the_documented_shape(prefix: str) -> None:
    key = generate_key(prefix)

    head, secret = key.plaintext.rsplit("_", 1)
    assert head == key.prefix
    assert key.prefix.startswith(prefix)
    assert len(key.prefix) == len(prefix) + 12
    assert len(secret) == 32
    assert set(key.prefix.removeprefix(prefix) + secret) <= set("abcdefghijklmnopqrstuvwxyz234567")


@pytest.mark.parametrize("prefix", PREFIXES)
def test_only_the_sha256_of_the_secret_is_kept(prefix: str) -> None:
    key = generate_key(prefix)

    secret = key.plaintext.rsplit("_", 1)[1]
    assert key.secret_hash == hashlib.sha256(secret.encode()).digest()
    assert secret.encode() not in key.secret_hash


@pytest.mark.parametrize("prefix", PREFIXES)
def test_generated_keys_do_not_repeat(prefix: str) -> None:
    keys = {generate_key(prefix).plaintext for _ in range(50)}

    assert len(keys) == 50


@pytest.mark.parametrize("prefix", PREFIXES)
def test_parsing_gives_back_the_stored_prefix_and_the_secret(prefix: str) -> None:
    key = generate_key(prefix)

    parsed = parse_key(key.plaintext, prefix)

    assert parsed is not None
    assert parsed.prefix == key.prefix
    assert key_secret_matches(parsed.secret, key.secret_hash)


def test_a_key_only_parses_under_its_own_prefix() -> None:
    api_key = generate_key(API_KEY_PREFIX).plaintext
    token = generate_key(PAT_PREFIX).plaintext

    assert parse_key(api_key, PAT_PREFIX) is None
    assert parse_key(token, API_KEY_PREFIX) is None


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "spl_pat_",
        "spl_pat_" + "a" * 12,
        "spl_pat_" + "a" * 12 + "_",
        "spl_pat_" + "a" * 12 + "_" + "a" * 31,
        "spl_pat_" + "a" * 12 + "_" + "a" * 33,
        "spl_pat_" + "a" * 11 + "_" + "a" * 32,
        "spl_pat_" + "a" * 13 + "_" + "a" * 32,
        "spl_pat_" + "A" * 12 + "_" + "a" * 32,  # base32 here is lowercase
        "spl_pat_" + "1" * 12 + "_" + "a" * 32,  # 0, 1, 8 and 9 are not in the alphabet
        "spl_pat_" + "a" * 12 + "_" + "a" * 31 + "!",
        "SPL_PAT_" + "a" * 12 + "_" + "a" * 32,
        " spl_pat_" + "a" * 12 + "_" + "a" * 32,
        "sk-not-ours",
    ],
)
def test_a_malformed_key_does_not_parse(raw: str) -> None:
    assert parse_key(raw, PAT_PREFIX) is None


def test_a_wrong_secret_does_not_match() -> None:
    key = generate_key(PAT_PREFIX)

    assert not key_secret_matches("a" * 32, key.secret_hash)
    assert not key_secret_matches("", key.secret_hash)
