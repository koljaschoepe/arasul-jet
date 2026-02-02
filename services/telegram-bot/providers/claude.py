"""
ARASUL PLATFORM - Claude LLM Provider
Claude API via Anthropic SDK
"""

import logging
from typing import List, Optional, AsyncGenerator

from .base import (
    BaseProvider,
    Message,
    ChatResponse,
    ModelInfo,
    ProviderError,
    ProviderConnectionError,
    ProviderAuthError,
    ProviderRateLimitError,
)

logger = logging.getLogger('telegram-bot.providers.claude')

# Available Claude models
CLAUDE_MODELS = [
    ModelInfo(
        name="claude-3-5-sonnet-20241022",
        provider="claude",
        capabilities=["chat", "vision", "tools"],
    ),
    ModelInfo(
        name="claude-3-5-haiku-20241022",
        provider="claude",
        capabilities=["chat", "vision", "tools"],
    ),
    ModelInfo(
        name="claude-3-opus-20240229",
        provider="claude",
        capabilities=["chat", "vision", "tools"],
    ),
    ModelInfo(
        name="claude-3-sonnet-20240229",
        provider="claude",
        capabilities=["chat", "vision", "tools"],
    ),
    ModelInfo(
        name="claude-3-haiku-20240307",
        provider="claude",
        capabilities=["chat", "vision", "tools"],
    ),
]

DEFAULT_CLAUDE_MODEL = "claude-3-5-sonnet-20241022"


class ClaudeProvider(BaseProvider):
    """
    Claude LLM Provider.

    Uses Anthropic's Claude API for chat completions.
    Requires API key to be set.
    """

    name = "claude"

    def __init__(
        self,
        api_key: Optional[str] = None,
        default_model: str = DEFAULT_CLAUDE_MODEL,
    ):
        super().__init__(default_model)
        self._api_key = api_key
        self._client = None

    def set_api_key(self, api_key: str) -> None:
        """Set or update API key."""
        self._api_key = api_key
        # Reset client to use new key
        self._client = None

    def _ensure_api_key(self) -> str:
        """Ensure API key is set."""
        if not self._api_key:
            raise ProviderAuthError(
                "Claude API key not configured. Use /apikey set claude <key>"
            )
        return self._api_key

    async def _get_client(self):
        """Get or create Anthropic client."""
        if self._client is None:
            try:
                import anthropic
            except ImportError:
                raise ProviderError(
                    "anthropic package not installed. Run: pip install anthropic"
                )

            api_key = self._ensure_api_key()
            self._client = anthropic.AsyncAnthropic(api_key=api_key)

        return self._client

    def _convert_messages(self, messages: List[Message]) -> tuple:
        """
        Convert messages to Anthropic format.

        Returns (system_prompt, messages_list)
        """
        system_prompt = None
        anthropic_messages = []

        for msg in messages:
            if msg.role == "system":
                # Anthropic uses system as a separate parameter
                system_prompt = msg.content
            else:
                anthropic_messages.append({
                    "role": msg.role,
                    "content": msg.content,
                })

        return system_prompt, anthropic_messages

    async def chat(
        self,
        messages: List[Message],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> ChatResponse:
        """
        Synchronous chat completion via Claude API.
        """
        self._validate_messages(messages)
        model_name = self._get_model(model)

        client = await self._get_client()
        system_prompt, anthropic_messages = self._convert_messages(messages)

        try:
            kwargs = {
                "model": model_name,
                "messages": anthropic_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            if system_prompt:
                kwargs["system"] = system_prompt

            response = await client.messages.create(**kwargs)

            # Extract text content
            content = ""
            for block in response.content:
                if hasattr(block, "text"):
                    content += block.text

            return ChatResponse(
                content=content,
                model=response.model,
                tokens_prompt=response.usage.input_tokens,
                tokens_completion=response.usage.output_tokens,
                finish_reason=response.stop_reason or "stop",
            )

        except Exception as e:
            error_msg = str(e)

            # Check for specific error types
            if "authentication" in error_msg.lower() or "api key" in error_msg.lower():
                raise ProviderAuthError("Invalid Claude API key")
            elif "rate limit" in error_msg.lower():
                raise ProviderRateLimitError("Claude API rate limit exceeded")
            elif "connection" in error_msg.lower():
                raise ProviderConnectionError("Cannot connect to Claude API")
            else:
                logger.error(f"Claude chat error: {e}")
                raise ProviderError(f"Claude chat failed: {error_msg}")

    async def stream_chat(
        self,
        messages: List[Message],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        """
        Streaming chat completion via Claude API.
        """
        self._validate_messages(messages)
        model_name = self._get_model(model)

        client = await self._get_client()
        system_prompt, anthropic_messages = self._convert_messages(messages)

        try:
            kwargs = {
                "model": model_name,
                "messages": anthropic_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            if system_prompt:
                kwargs["system"] = system_prompt

            async with client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield text

        except Exception as e:
            error_msg = str(e)

            if "authentication" in error_msg.lower() or "api key" in error_msg.lower():
                raise ProviderAuthError("Invalid Claude API key")
            elif "rate limit" in error_msg.lower():
                raise ProviderRateLimitError("Claude API rate limit exceeded")
            else:
                logger.error(f"Claude streaming error: {e}")
                raise ProviderError(f"Claude streaming failed: {error_msg}")

    async def get_models(self) -> List[ModelInfo]:
        """
        Get list of available Claude models.

        Note: Claude doesn't have a models endpoint, so we return known models.
        """
        return CLAUDE_MODELS.copy()

    async def health_check(self) -> bool:
        """
        Check if Claude API is available.

        Note: We can't really check without making a billable request,
        so we just verify the API key is set and looks valid.
        """
        if not self._api_key:
            return False

        # Basic format check for Anthropic API key
        if not self._api_key.startswith("sk-ant-"):
            return False

        return True

    async def close(self) -> None:
        """Close client."""
        self._client = None
        await super().close()
