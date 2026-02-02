"""
ARASUL PLATFORM - Ollama LLM Provider
Local LLM inference via Ollama API
"""

import logging
from typing import List, Optional, AsyncGenerator
import httpx

from .base import (
    BaseProvider,
    Message,
    ChatResponse,
    ModelInfo,
    ProviderError,
    ProviderConnectionError,
)

logger = logging.getLogger('telegram-bot.providers.ollama')

# Default configuration
DEFAULT_OLLAMA_URL = "http://llm-service:11434"
DEFAULT_TIMEOUT = 120.0  # Ollama can be slow for first inference


class OllamaProvider(BaseProvider):
    """
    Ollama LLM Provider.

    Connects to local Ollama instance for LLM inference.
    """

    name = "ollama"

    def __init__(
        self,
        base_url: str = DEFAULT_OLLAMA_URL,
        default_model: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        super().__init__(default_model)
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.timeout),
            )
        return self._client

    async def chat(
        self,
        messages: List[Message],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> ChatResponse:
        """
        Synchronous chat completion via Ollama.
        """
        self._validate_messages(messages)
        model_name = self._get_model(model)

        client = await self._get_client()

        try:
            response = await client.post(
                "/api/chat",
                json={
                    "model": model_name,
                    "messages": [m.to_dict() for m in messages],
                    "stream": False,
                    "options": {
                        "temperature": temperature,
                        "num_predict": max_tokens,
                    },
                },
            )
            response.raise_for_status()
            data = response.json()

            return ChatResponse(
                content=data.get("message", {}).get("content", ""),
                model=data.get("model", model_name),
                tokens_prompt=data.get("prompt_eval_count", 0),
                tokens_completion=data.get("eval_count", 0),
                finish_reason=data.get("done_reason", "stop"),
            )

        except httpx.ConnectError as e:
            logger.error(f"Failed to connect to Ollama: {e}")
            raise ProviderConnectionError(f"Cannot connect to Ollama at {self.base_url}")
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama HTTP error: {e}")
            raise ProviderError(f"Ollama request failed: {e.response.status_code}")
        except Exception as e:
            logger.error(f"Unexpected error in Ollama chat: {e}")
            raise ProviderError(f"Ollama chat failed: {str(e)}")

    async def stream_chat(
        self,
        messages: List[Message],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        """
        Streaming chat completion via Ollama.
        """
        self._validate_messages(messages)
        model_name = self._get_model(model)

        client = await self._get_client()

        try:
            async with client.stream(
                "POST",
                "/api/chat",
                json={
                    "model": model_name,
                    "messages": [m.to_dict() for m in messages],
                    "stream": True,
                    "options": {
                        "temperature": temperature,
                        "num_predict": max_tokens,
                    },
                },
            ) as response:
                response.raise_for_status()

                import json
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if data.get("done", False):
                            break
                    except json.JSONDecodeError:
                        continue

        except httpx.ConnectError as e:
            logger.error(f"Failed to connect to Ollama for streaming: {e}")
            raise ProviderConnectionError(f"Cannot connect to Ollama at {self.base_url}")
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama streaming HTTP error: {e}")
            raise ProviderError(f"Ollama streaming failed: {e.response.status_code}")

    async def get_models(self) -> List[ModelInfo]:
        """
        Get list of available models from Ollama.
        """
        client = await self._get_client()

        try:
            response = await client.get("/api/tags")
            response.raise_for_status()
            data = response.json()

            models = []
            for model_data in data.get("models", []):
                name = model_data.get("name", "")
                size_bytes = model_data.get("size", 0)

                # Convert bytes to human-readable
                if size_bytes > 1e9:
                    size_str = f"{size_bytes / 1e9:.1f}GB"
                elif size_bytes > 1e6:
                    size_str = f"{size_bytes / 1e6:.1f}MB"
                else:
                    size_str = f"{size_bytes}B"

                models.append(ModelInfo(
                    name=name,
                    provider=self.name,
                    size=size_str,
                    modified_at=model_data.get("modified_at"),
                ))

            return models

        except httpx.ConnectError as e:
            logger.error(f"Failed to connect to Ollama for model list: {e}")
            raise ProviderConnectionError(f"Cannot connect to Ollama at {self.base_url}")
        except Exception as e:
            logger.error(f"Failed to get Ollama models: {e}")
            raise ProviderError(f"Failed to list models: {str(e)}")

    async def health_check(self) -> bool:
        """
        Check if Ollama is available.
        """
        try:
            client = await self._get_client()
            response = await client.get("/", timeout=5.0)
            return response.status_code == 200
        except Exception as e:
            logger.debug(f"Ollama health check failed: {e}")
            return False

    async def pull_model(self, model_name: str) -> AsyncGenerator[dict, None]:
        """
        Pull a model from Ollama registry.

        Yields progress updates.
        """
        client = await self._get_client()

        try:
            async with client.stream(
                "POST",
                "/api/pull",
                json={"name": model_name, "stream": True},
                timeout=None,  # No timeout for large downloads
            ) as response:
                response.raise_for_status()

                import json
                async for line in response.aiter_lines():
                    if line:
                        try:
                            yield json.loads(line)
                        except json.JSONDecodeError:
                            continue

        except Exception as e:
            logger.error(f"Failed to pull model {model_name}: {e}")
            raise ProviderError(f"Failed to pull model: {str(e)}")

    async def close(self) -> None:
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
        await super().close()
