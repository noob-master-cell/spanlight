"""Provider adapters: one per `ProviderKind`, looked up with `adapter_for`."""

from app.db.models import ProviderKind
from app.gateway.adapters.anthropic import AnthropicAdapter
from app.gateway.adapters.base import (
    UPSTREAM_REQUEST_ID_HEADER,
    CredentialEndpoint,
    InvalidUpstreamBody,
    ProviderAdapter,
    UnsupportedSurface,
    UpstreamRequest,
    UpstreamResponse,
)
from app.gateway.adapters.openai import OpenAiAdapter
from app.gateway.adapters.openai_compatible import OpenAiCompatibleAdapter

_ADAPTERS: dict[ProviderKind, ProviderAdapter] = {
    ProviderKind.OPENAI: OpenAiAdapter(),
    ProviderKind.ANTHROPIC: AnthropicAdapter(),
    ProviderKind.OPENAI_COMPATIBLE: OpenAiCompatibleAdapter(),
}


def adapter_for(provider: ProviderKind) -> ProviderAdapter:
    return _ADAPTERS[provider]


__all__ = [
    "UPSTREAM_REQUEST_ID_HEADER",
    "CredentialEndpoint",
    "InvalidUpstreamBody",
    "ProviderAdapter",
    "UnsupportedSurface",
    "UpstreamRequest",
    "UpstreamResponse",
    "adapter_for",
]
