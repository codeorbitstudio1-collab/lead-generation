"""
Central LLM endpoint configuration.

The app can talk to any OpenAI-compatible chat endpoint. By default it uses
the VoiceOwl APIM gateway, which authenticates with an ``api-key`` header
instead of ``Authorization: Bearer`` and expects ``max_output_tokens`` rather
than ``max_tokens``.

Resolution priority (each value):
  1. Env var
  2. Setting stored in MongoDB (Settings page)
  3. Built-in default below
"""
import os
from typing import Dict

from openai import AsyncOpenAI, OpenAI

from database import db

DEFAULT_BASE_URL = "https://voiceowl-ai-apim-gateway.azure-api.net/openai/v1"
OPENAI_PLATFORM_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-5.4-mini"
DEFAULT_AUTH_HEADER = "api-key"
DEFAULT_TIMEOUT = 60.0


def is_plain_openai_key(key: str) -> bool:
    """True for a standard OpenAI platform key (``sk-...``), which must talk to
    api.openai.com with Authorization instead of the VoiceOwl APIM gateway."""
    return (key or "").strip().startswith("sk-")


async def _env_or_setting(env_key: str, setting_key: str, default: str = "") -> str:
    value = os.environ.get(env_key, "").strip()
    if value:
        return value
    try:
        doc = await db.settings.find_one({"key": setting_key})
        value = ((doc or {}).get("value") or "").strip()
    except Exception:
        value = ""
    return value or default


async def get_base_url() -> str:
    """Resolve the chat completions base URL (env → Settings → auto)."""
    base = await _env_or_setting("LLM_BASE_URL", "llm_base_url", "")
    if base:
        return base
    if is_plain_openai_key(await get_api_key()):
        return OPENAI_PLATFORM_BASE_URL
    return DEFAULT_BASE_URL


async def get_api_key() -> str:
    """Resolve the API key (env → Settings ``openai_api_key``)."""
    value = os.environ.get("OPENAI_API_KEY", "").strip() or os.environ.get("LLM_API_KEY", "").strip()
    if value:
        return value
    return await _env_or_setting("LLM_API_KEY", "openai_api_key", "")


async def get_auth_header() -> str:
    """Header used to carry the API key (``api-key`` or ``Authorization``)."""
    value = os.environ.get("LLM_AUTH_HEADER", "").strip()
    if value:
        return value
    doc = None
    try:
        doc = await db.settings.find_one({"key": "llm_auth_header"})
    except Exception:
        pass
    stored = ((doc or {}).get("value") or "").strip()
    if stored:
        return stored
    # Plain OpenAI keys authenticate with ``Authorization: Bearer``; the VoiceOwl
    # APIM gateway uses the ``api-key`` header.
    if is_plain_openai_key(await get_api_key()):
        return "Authorization"
    return DEFAULT_AUTH_HEADER

async def is_apim() -> bool:
    """True when talking to the VoiceOwl APIM gateway (api-key header + max_output_tokens)."""
    base = await get_base_url()
    if "azure-api.net" in base or "voiceowl" in base:
        return True
    header = await get_auth_header()
    return header.lower() == "api-key"


def build_headers(api_key: str, header: str) -> Dict[str, str]:
    """Return extra headers for the OpenAI client."""
    if header.lower() == "api-key":
        return {"api-key": api_key}
    return {}


async def build_async_client(api_key: str = "", timeout: float = DEFAULT_TIMEOUT) -> AsyncOpenAI:
    """Build a configured AsyncOpenAI client for the resolved endpoint."""
    key = api_key or await get_api_key()
    base_url = await get_base_url()
    header = await get_auth_header()
    return AsyncOpenAI(
        api_key=key,
        base_url=base_url,
        timeout=timeout,
        default_headers=build_headers(key, header),
    )


async def build_sync_client(api_key: str = "", timeout: float = DEFAULT_TIMEOUT) -> OpenAI:
    """Build a configured synchronous OpenAI client for the resolved endpoint."""
    key = api_key or await get_api_key()
    base_url = await get_base_url()
    header = await get_auth_header()
    return OpenAI(
        api_key=key,
        base_url=base_url,
        timeout=timeout,
        default_headers=build_headers(key, header),
    )
