"""The save-time rules for a webhook channel's URL.

A webhook channel makes the worker POST to a URL the organization chose, from inside the
deployment. Without a check, `http://169.254.169.254/` (cloud metadata) or an internal service
would be reachable that way. So a URL must be `https://` and its host must resolve only to
public addresses, unless `WEBHOOK_ALLOW_PRIVATE_TARGETS` is on (a self-hosted receiver inside
the network). This is the save-time check only: every delivery connects through
`app.core.egress.VettedNetworkBackend`, which checks the addresses again when it connects.

`UnsafeUrlError` messages are safe to show: they describe the rule, never the URL.
"""

from urllib.parse import urlsplit

import httpx

from app.core.egress import (
    BlockedAddress,
    Resolver,
    UnresolvableHost,
    default_port,
    resolve_checked,
    scheme_allowed,
)

# How long saving a channel waits for DNS before reporting the host as unresolvable.
RESOLVE_TIMEOUT_SECONDS = 5.0


class UnsafeUrlError(ValueError):
    """The webhook URL breaks a rule. The message says which, and is safe to show."""


def validate_webhook_url(url: str, *, allow_private: bool) -> tuple[str, int]:
    """The host and port `url` connects to, or `UnsafeUrlError`.

    `https://` only (`http://` too when `allow_private`), with a host and without userinfo: a
    request must not go to a host hidden behind `user@`. A fragment is refused, since it is
    never sent and only hides what the URL is. Parsed by httpx, the parser requests are sent
    with, so the host checked is the host connected to.
    """
    if any(character.isspace() or not character.isprintable() for character in url):
        raise UnsafeUrlError("The URL must not contain spaces or control characters.")
    try:
        parsed = httpx.URL(url)
    except httpx.InvalidURL:
        raise UnsafeUrlError("The URL is not valid.") from None
    if not scheme_allowed(parsed.scheme, allow_insecure=allow_private):
        raise UnsafeUrlError(
            "The URL must start with https:// or http://."
            if allow_private
            else "The URL must start with https://."
        )
    # Any `@` before the path counts, an empty user name (`https://@host/`) included, and in
    # either parser's reading of the authority.
    if parsed.userinfo or "@" in urlsplit(url).netloc:
        raise UnsafeUrlError("The URL must not contain a user name or password.")
    if parsed.fragment:
        raise UnsafeUrlError("The URL must not contain a fragment.")
    try:
        host = parsed.raw_host.decode("ascii")
    except UnicodeDecodeError:
        raise UnsafeUrlError("The URL's host is not valid.") from None
    if not host:
        raise UnsafeUrlError("The URL must include a host.")
    return host, parsed.port or default_port(parsed.scheme)


async def check_webhook_url(
    url: str, *, allow_private: bool, resolver: Resolver | None = None
) -> None:
    """Apply `validate_webhook_url`, then resolve the host and refuse blocked addresses.

    Raises `UnsafeUrlError` for every refusal, including a host that does not resolve within
    `RESOLVE_TIMEOUT_SECONDS`. With `allow_private` only an unresolvable host is refused.
    """
    host, port = validate_webhook_url(url, allow_private=allow_private)
    try:
        await resolve_checked(
            host,
            port,
            allow_private=allow_private,
            resolver=resolver,
            dns_timeout_s=RESOLVE_TIMEOUT_SECONDS,
        )
    except BlockedAddress:
        raise UnsafeUrlError(
            "The URL's host resolves to a private, local or reserved address. "
            "Ask your administrator to set WEBHOOK_ALLOW_PRIVATE_TARGETS for one inside "
            "your network."
        ) from None
    except UnresolvableHost:
        raise UnsafeUrlError("The URL's host could not be resolved.") from None
