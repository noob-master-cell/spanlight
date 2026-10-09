"""OpenAI: chat completions, responses and the model list, with a bearer key."""

from collections.abc import Mapping
from typing import ClassVar

from app.db.models import ProviderKind
from app.gateway.adapters.base import CredentialEndpoint, HttpAdapter
from app.gateway.errors import Surface

OPENAI_API_BASE = "https://api.openai.com/v1"


class OpenAiAdapter(HttpAdapter):
    provider: ClassVar[ProviderKind] = ProviderKind.OPENAI
    paths: ClassVar[Mapping[Surface, str]] = {
        "chat_completions": "/chat/completions",
        "responses": "/responses",
        "models": "/models",
    }
    provider_headers: ClassVar[frozenset[str]] = frozenset({"openai-beta"})

    def base_url(self, credential: CredentialEndpoint) -> str:
        return OPENAI_API_BASE

    def auth_headers(self, api_key: str) -> dict[str, str]:
        return {"authorization": f"Bearer {api_key}"}
