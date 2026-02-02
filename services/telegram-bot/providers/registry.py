"""
ARASUL PLATFORM - Provider Registry
Factory pattern for LLM providers
"""

import logging
from typing import Dict, Optional, Type
import os

from .base import BaseProvider, ProviderError
from .ollama import OllamaProvider
from .claude import ClaudeProvider

logger = logging.getLogger('telegram-bot.providers.registry')


class ProviderRegistry:
    """
    Registry for LLM providers.

    Manages provider instances and configuration.
    """

    # Registered provider classes
    _providers: Dict[str, Type[BaseProvider]] = {
        'ollama': OllamaProvider,
        'claude': ClaudeProvider,
    }

    # Singleton instances per provider
    _instances: Dict[str, BaseProvider] = {}

    @classmethod
    def register(cls, name: str, provider_class: Type[BaseProvider]) -> None:
        """
        Register a new provider class.

        Args:
            name: Provider identifier
            provider_class: Provider class (must extend BaseProvider)
        """
        if not issubclass(provider_class, BaseProvider):
            raise ValueError(f"{provider_class} must extend BaseProvider")
        cls._providers[name] = provider_class
        logger.info(f"Registered provider: {name}")

    @classmethod
    def get(
        cls,
        name: str,
        create_if_missing: bool = True,
        **kwargs,
    ) -> Optional[BaseProvider]:
        """
        Get a provider instance.

        Args:
            name: Provider name ('ollama', 'claude', etc.)
            create_if_missing: Create instance if not exists
            **kwargs: Arguments for provider constructor

        Returns:
            Provider instance or None
        """
        name = name.lower()

        # Return existing instance if available
        if name in cls._instances:
            return cls._instances[name]

        if not create_if_missing:
            return None

        # Create new instance
        if name not in cls._providers:
            raise ProviderError(f"Unknown provider: {name}")

        provider_class = cls._providers[name]
        instance = cls._create_instance(name, provider_class, **kwargs)
        cls._instances[name] = instance

        logger.info(f"Created provider instance: {name}")
        return instance

    @classmethod
    def _create_instance(
        cls,
        name: str,
        provider_class: Type[BaseProvider],
        **kwargs,
    ) -> BaseProvider:
        """Create provider instance with environment defaults."""

        if name == 'ollama':
            return provider_class(
                base_url=kwargs.get('base_url') or os.getenv(
                    'OLLAMA_URL',
                    os.getenv('LLM_SERVICE_URL', 'http://llm-service:11434')
                ),
                default_model=kwargs.get('default_model') or os.getenv(
                    'TELEGRAM_DEFAULT_OLLAMA_MODEL'
                ),
                timeout=float(kwargs.get('timeout') or os.getenv('OLLAMA_TIMEOUT', '120')),
            )

        elif name == 'claude':
            return provider_class(
                api_key=kwargs.get('api_key'),  # API key set separately via /apikey
                default_model=kwargs.get('default_model') or os.getenv(
                    'TELEGRAM_DEFAULT_CLAUDE_MODEL',
                    'claude-3-5-sonnet-20241022'
                ),
            )

        else:
            # Generic instantiation
            return provider_class(**kwargs)

    @classmethod
    def list_providers(cls) -> list:
        """Get list of available provider names."""
        return list(cls._providers.keys())

    @classmethod
    def get_default_provider(cls) -> BaseProvider:
        """
        Get the default provider based on configuration.
        """
        default_name = os.getenv('TELEGRAM_DEFAULT_LLM_PROVIDER', 'ollama').lower()
        return cls.get(default_name)

    @classmethod
    async def health_check_all(cls) -> Dict[str, bool]:
        """
        Check health of all instantiated providers.

        Returns:
            Dict mapping provider name to health status
        """
        results = {}
        for name, instance in cls._instances.items():
            try:
                results[name] = await instance.health_check()
            except Exception as e:
                logger.error(f"Health check failed for {name}: {e}")
                results[name] = False
        return results

    @classmethod
    async def close_all(cls) -> None:
        """Close all provider instances."""
        for name, instance in cls._instances.items():
            try:
                await instance.close()
                logger.debug(f"Closed provider: {name}")
            except Exception as e:
                logger.error(f"Error closing provider {name}: {e}")
        cls._instances.clear()

    @classmethod
    def reset(cls) -> None:
        """Reset registry (for testing)."""
        cls._instances.clear()


def get_provider(name: str = None, **kwargs) -> BaseProvider:
    """
    Convenience function to get a provider.

    Args:
        name: Provider name (defaults to TELEGRAM_DEFAULT_LLM_PROVIDER)
        **kwargs: Provider-specific arguments

    Returns:
        Provider instance
    """
    if name is None:
        return ProviderRegistry.get_default_provider()
    return ProviderRegistry.get(name, **kwargs)
