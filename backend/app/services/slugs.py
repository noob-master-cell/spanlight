"""URL slugs derived from display names."""

import re
import secrets

_NON_SLUG = re.compile(r"[^a-z0-9]+")


def slugify(name: str, *, fallback: str) -> str:
    slug = _NON_SLUG.sub("-", name.lower()).strip("-")[:48].strip("-")
    return slug or fallback


def with_random_suffix(slug: str) -> str:
    return f"{slug}-{secrets.token_hex(3)}"
