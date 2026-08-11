"""
Lightweight OpenAI-compatible Chat Completions client.

Talks to the app's configured LLM endpoint (VoiceOwl APIM gateway by
default) so email generation, call replies, summaries, and agent chat call a
real model. The API key and endpoint come from ``llm_config`` (Settings DB +
env), not a mock.
"""
import os
from dataclasses import dataclass


@dataclass
class UserMessage:
    text: str


class _Chat:
    def __init__(self, api_key=None, session_id=None, system_message=None):
        self.api_key = (api_key or "").strip() or os.environ.get("OPENAI_API_KEY", "").strip()
        self.session_id = session_id
        self.system_message = system_message
        self.provider = "openai"
        self.model = "gpt-5.4-mini"

    def with_model(self, provider=None, model=None):
        if provider:
            self.provider = provider
        if model:
            self.model = model
        return self

    async def send_message(self, message):
        import llm_config as cfg

        key = self.api_key or await cfg.get_api_key()
        if not key:
            raise RuntimeError("No OpenAI API key configured. Add one in Settings.")

        client = await cfg.build_async_client(key)
        try:
            messages = []
            if self.system_message:
                messages.append({"role": "system", "content": self.system_message})
            messages.append({"role": "user", "content": message.text})

            kwargs = {
                "model": self.model,
                "messages": messages,
                "temperature": 0.7,
                "max_completion_tokens": 1200,
            }

            resp = await client.chat.completions.create(**kwargs)
            return (resp.choices[0].message.content or "").strip()
        finally:
            await client.close()


def LlmChat(*args, **kwargs):
    return _Chat(*args, **kwargs)
