"""
ARASUL PLATFORM - Base LLM Provider
Abstract base class for all LLM providers
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Optional, AsyncGenerator
import logging

logger = logging.getLogger('telegram-bot.providers')


class ProviderError(Exception):
    """Base exception for provider errors."""
    pass


class ProviderConnectionError(ProviderError):
    """Connection to provider failed."""
    pass


class ProviderAuthError(ProviderError):
    """Authentication with provider failed."""
    pass


class ProviderRateLimitError(ProviderError):
    """Provider rate limit exceeded."""
    pass


@dataclass
class Message:
    """Chat message structure."""
    role: str  # 'system', 'user', 'assistant'
    content: str

    def to_dict(self) -> Dict:
        return {'role': self.role, 'content': self.content}


@dataclass
class ChatResponse:
    """Response from chat completion."""
    content: str
    model: str
    tokens_prompt: int = 0
    tokens_completion: int = 0
    finish_reason: str = 'stop'

    @property
    def total_tokens(self) -> int:
        return self.tokens_prompt + self.tokens_completion


@dataclass
class ModelInfo:
    """Information about an available model."""
    name: str
    provider: str
    size: Optional[str] = None
    modified_at: Optional[str] = None
    capabilities: List[str] = field(default_factory=list)

    def __str__(self) -> str:
        if self.size:
            return f"{self.name} ({self.size})"
        return self.name


class BaseProvider(ABC):
    """
    Abstract base class for LLM providers.

    All providers must implement these methods:
    - chat(): Synchronous chat completion
    - stream_chat(): Streaming chat completion
    - get_models(): List available models
    - health_check(): Check if provider is available
    """

    name: str = "base"

    def __init__(self, default_model: Optional[str] = None):
        self.default_model = default_model
        self._initialized = False

    @abstractmethod
    async def chat(
        self,
        messages: List[Message],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> ChatResponse:
        """
        Synchronous chat completion.

        Args:
            messages: List of Message objects (system, user, assistant)
            model: Model to use (falls back to default_model)
            temperature: Sampling temperature (0.0-1.0)
            max_tokens: Maximum tokens in response

        Returns:
            ChatResponse with content and metadata
        """
        pass

    @abstractmethod
    async def stream_chat(
        self,
        messages: List[Message],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        """
        Streaming chat completion.

        Yields tokens as they are generated.

        Args:
            messages: List of Message objects
            model: Model to use
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response

        Yields:
            String tokens as they are generated
        """
        pass

    @abstractmethod
    async def get_models(self) -> List[ModelInfo]:
        """
        Get list of available models.

        Returns:
            List of ModelInfo objects
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Check if provider is available and responding.

        Returns:
            True if provider is healthy, False otherwise
        """
        pass

    def _get_model(self, model: Optional[str]) -> str:
        """Get model to use, with fallback to default."""
        if model:
            return model
        if self.default_model:
            return self.default_model
        raise ProviderError(f"No model specified and no default model set for {self.name}")

    def _validate_messages(self, messages: List[Message]) -> None:
        """Validate message list."""
        if not messages:
            raise ProviderError("Messages list cannot be empty")

        for msg in messages:
            if msg.role not in ('system', 'user', 'assistant'):
                raise ProviderError(f"Invalid message role: {msg.role}")
            if not msg.content:
                raise ProviderError("Message content cannot be empty")

    async def initialize(self) -> None:
        """Optional initialization hook."""
        self._initialized = True

    async def close(self) -> None:
        """Optional cleanup hook."""
        self._initialized = False

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(default_model={self.default_model})>"
