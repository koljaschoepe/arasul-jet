"""
Unit tests for Telegram Bot LLM Providers.

These tests are designed to run without the actual telegram-bot dependencies
installed, using mocks and import guards.
"""

import pytest
import sys
import os
from unittest.mock import MagicMock, patch

# Add telegram-bot service to path for imports
TELEGRAM_BOT_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'telegram-bot')
sys.path.insert(0, TELEGRAM_BOT_PATH)


class TestBaseProvider:
    """Tests for BaseProvider classes."""

    def test_message_to_dict(self):
        """Test Message.to_dict() method."""
        try:
            from providers.base import Message
        except ImportError:
            pytest.skip('Provider dependencies not available')

        msg = Message(role='user', content='Hello')
        result = msg.to_dict()

        assert result == {'role': 'user', 'content': 'Hello'}

    def test_chat_response_total_tokens(self):
        """Test ChatResponse.total_tokens property."""
        try:
            from providers.base import ChatResponse
        except ImportError:
            pytest.skip('Provider dependencies not available')

        response = ChatResponse(
            content='Test',
            model='test-model',
            tokens_prompt=100,
            tokens_completion=50,
        )

        assert response.total_tokens == 150

    def test_model_info_str(self):
        """Test ModelInfo.__str__() method."""
        try:
            from providers.base import ModelInfo
        except ImportError:
            pytest.skip('Provider dependencies not available')

        model = ModelInfo(name='llama3', provider='ollama', size='8GB')
        assert str(model) == 'llama3 (8GB)'

        model_no_size = ModelInfo(name='llama3', provider='ollama')
        assert str(model_no_size) == 'llama3'

    def test_provider_error_classes(self):
        """Test error class hierarchy."""
        try:
            from providers.base import (
                ProviderError,
                ProviderConnectionError,
                ProviderAuthError,
                ProviderRateLimitError,
            )
        except ImportError:
            pytest.skip('Provider dependencies not available')

        assert issubclass(ProviderConnectionError, ProviderError)
        assert issubclass(ProviderAuthError, ProviderError)
        assert issubclass(ProviderRateLimitError, ProviderError)


class TestOllamaProvider:
    """Tests for OllamaProvider."""

    @pytest.fixture
    def provider(self):
        """Create OllamaProvider instance."""
        try:
            from providers.ollama import OllamaProvider
            return OllamaProvider(
                base_url='http://localhost:11434',
                default_model='llama3:8b',
            )
        except ImportError:
            pytest.skip('Provider dependencies not available')

    def test_init(self, provider):
        """Test provider initialization."""
        assert provider.name == 'ollama'
        assert provider.default_model == 'llama3:8b'
        assert provider.base_url == 'http://localhost:11434'

    def test_get_model_with_default(self, provider):
        """Test _get_model with default."""
        assert provider._get_model(None) == 'llama3:8b'
        assert provider._get_model('custom') == 'custom'

    def test_get_model_no_default_raises(self):
        """Test _get_model raises when no default set."""
        try:
            from providers.ollama import OllamaProvider
            from providers.base import ProviderError
        except ImportError:
            pytest.skip('Provider dependencies not available')

        provider = OllamaProvider(base_url='http://localhost:11434')
        with pytest.raises(ProviderError, match='No model specified'):
            provider._get_model(None)

    def test_validate_messages_empty(self, provider):
        """Test message validation with empty list."""
        try:
            from providers.base import ProviderError
        except ImportError:
            pytest.skip('Provider dependencies not available')

        with pytest.raises(ProviderError, match='cannot be empty'):
            provider._validate_messages([])

    def test_validate_messages_invalid_role(self, provider):
        """Test message validation with invalid role."""
        try:
            from providers.base import Message, ProviderError
        except ImportError:
            pytest.skip('Provider dependencies not available')

        messages = [Message(role='invalid', content='test')]
        with pytest.raises(ProviderError, match='Invalid message role'):
            provider._validate_messages(messages)

    def test_validate_messages_valid(self, provider):
        """Test message validation with valid messages."""
        try:
            from providers.base import Message
        except ImportError:
            pytest.skip('Provider dependencies not available')

        messages = [
            Message(role='system', content='You are helpful'),
            Message(role='user', content='Hello'),
            Message(role='assistant', content='Hi there'),
        ]
        # Should not raise
        provider._validate_messages(messages)


class TestClaudeProvider:
    """Tests for ClaudeProvider."""

    @pytest.fixture
    def provider(self):
        """Create ClaudeProvider instance."""
        try:
            from providers.claude import ClaudeProvider
            return ClaudeProvider(
                api_key='sk-ant-test-key',
                default_model='claude-3-sonnet-20240229',
            )
        except ImportError:
            pytest.skip('Provider dependencies not available')

    def test_init(self, provider):
        """Test provider initialization."""
        assert provider.name == 'claude'
        assert provider.default_model == 'claude-3-sonnet-20240229'

    def test_set_api_key(self, provider):
        """Test setting API key."""
        provider.set_api_key('new-key')
        assert provider._api_key == 'new-key'
        # Client should be reset
        assert provider._client is None

    @pytest.mark.asyncio
    async def test_health_check_no_key(self, provider):
        """Test health check without API key."""
        provider._api_key = None
        result = await provider.health_check()
        assert result is False

    @pytest.mark.asyncio
    async def test_health_check_invalid_key_format(self, provider):
        """Test health check with invalid key format."""
        provider._api_key = 'invalid-key'
        result = await provider.health_check()
        assert result is False

    @pytest.mark.asyncio
    async def test_health_check_valid_key_format(self, provider):
        """Test health check with valid key format."""
        provider._api_key = 'sk-ant-valid-key-123456'
        result = await provider.health_check()
        assert result is True

    @pytest.mark.asyncio
    async def test_get_models(self, provider):
        """Test getting available models."""
        models = await provider.get_models()
        assert len(models) > 0
        assert all(m.provider == 'claude' for m in models)
        # Check known model is present
        model_names = [m.name for m in models]
        assert any('claude-3' in name for name in model_names)

    def test_convert_messages(self, provider):
        """Test message conversion to Anthropic format."""
        try:
            from providers.base import Message
        except ImportError:
            pytest.skip('Provider dependencies not available')

        messages = [
            Message(role='system', content='You are helpful'),
            Message(role='user', content='Hello'),
            Message(role='assistant', content='Hi'),
        ]

        system, converted = provider._convert_messages(messages)

        assert system == 'You are helpful'
        assert len(converted) == 2
        assert converted[0] == {'role': 'user', 'content': 'Hello'}
        assert converted[1] == {'role': 'assistant', 'content': 'Hi'}


class TestProviderRegistry:
    """Tests for ProviderRegistry."""

    def test_list_providers(self):
        """Test listing available providers."""
        try:
            from providers.registry import ProviderRegistry
        except ImportError:
            pytest.skip('Provider dependencies not available')

        providers = ProviderRegistry.list_providers()
        assert 'ollama' in providers
        assert 'claude' in providers

    def test_get_creates_instance(self):
        """Test getting provider creates instance."""
        try:
            from providers.registry import ProviderRegistry
        except ImportError:
            pytest.skip('Provider dependencies not available')

        ProviderRegistry.reset()
        provider = ProviderRegistry.get('ollama')
        assert provider is not None
        assert provider.name == 'ollama'

    def test_get_returns_cached(self):
        """Test getting provider returns cached instance."""
        try:
            from providers.registry import ProviderRegistry
        except ImportError:
            pytest.skip('Provider dependencies not available')

        ProviderRegistry.reset()
        provider1 = ProviderRegistry.get('ollama')
        provider2 = ProviderRegistry.get('ollama')
        assert provider1 is provider2

    def test_get_unknown_provider(self):
        """Test getting unknown provider raises error."""
        try:
            from providers.registry import ProviderRegistry
            from providers.base import ProviderError
        except ImportError:
            pytest.skip('Provider dependencies not available')

        with pytest.raises(ProviderError, match='Unknown provider'):
            ProviderRegistry.get('unknown_provider')

    @pytest.mark.asyncio
    async def test_close_all(self):
        """Test closing all providers."""
        try:
            from providers.registry import ProviderRegistry
        except ImportError:
            pytest.skip('Provider dependencies not available')

        ProviderRegistry.reset()
        ProviderRegistry.get('ollama')

        # Should not raise
        await ProviderRegistry.close_all()

        # Instances should be cleared
        assert len(ProviderRegistry._instances) == 0

    def test_reset(self):
        """Test reset clears instances."""
        try:
            from providers.registry import ProviderRegistry
        except ImportError:
            pytest.skip('Provider dependencies not available')

        ProviderRegistry.get('ollama')
        assert len(ProviderRegistry._instances) > 0

        ProviderRegistry.reset()
        assert len(ProviderRegistry._instances) == 0


class TestGetProvider:
    """Tests for get_provider convenience function."""

    def test_get_provider_default(self):
        """Test get_provider returns default provider."""
        try:
            from providers.registry import get_provider, ProviderRegistry
        except ImportError:
            pytest.skip('Provider dependencies not available')

        ProviderRegistry.reset()
        # Mock environment variable
        with patch.dict(os.environ, {'TELEGRAM_DEFAULT_LLM_PROVIDER': 'ollama'}):
            provider = get_provider()
            assert provider.name == 'ollama'

    def test_get_provider_by_name(self):
        """Test get_provider by explicit name."""
        try:
            from providers.registry import get_provider, ProviderRegistry
        except ImportError:
            pytest.skip('Provider dependencies not available')

        ProviderRegistry.reset()
        provider = get_provider('claude')
        assert provider.name == 'claude'
