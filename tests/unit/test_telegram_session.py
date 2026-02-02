"""
Unit tests for Telegram Bot Session Management.

These tests are designed to run without the actual telegram-bot dependencies
installed, using mocks and import guards.
"""

import pytest
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta

# Add telegram-bot service to path for imports
TELEGRAM_BOT_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'telegram-bot')
sys.path.insert(0, TELEGRAM_BOT_PATH)


class TestStoredMessage:
    """Tests for StoredMessage."""

    def test_to_dict(self):
        """Test StoredMessage.to_dict() method."""
        try:
            from session.memory import StoredMessage
        except ImportError:
            pytest.skip('Session dependencies not available')

        msg = StoredMessage(
            id=1,
            role='user',
            content='Hello',
            tokens=5,
            created_at=datetime.now(),
        )

        result = msg.to_dict()
        assert result == {'role': 'user', 'content': 'Hello'}


class TestMemoryStrategies:
    """Tests for memory selection strategies."""

    @pytest.fixture
    def messages(self):
        """Create test messages."""
        try:
            from session.memory import StoredMessage
        except ImportError:
            pytest.skip('Session dependencies not available')

        now = datetime.now()
        return [
            StoredMessage(id=1, role='user', content='Hello', tokens=10, created_at=now),
            StoredMessage(id=2, role='assistant', content='Hi there', tokens=15, created_at=now),
            StoredMessage(id=3, role='user', content='How are you?', tokens=12, created_at=now),
            StoredMessage(id=4, role='assistant', content='I am fine, thank you!', tokens=20, created_at=now),
        ]

    def test_token_based_memory_fits_all(self, messages):
        """Test TokenBasedMemory when all messages fit."""
        try:
            from session.memory import TokenBasedMemory
        except ImportError:
            pytest.skip('Session dependencies not available')

        strategy = TokenBasedMemory(reserve_tokens=100)
        selected = strategy.select_messages(messages, max_tokens=1000)

        assert len(selected) == 4
        assert selected[0].id == 1

    def test_token_based_memory_truncates(self, messages):
        """Test TokenBasedMemory truncation."""
        try:
            from session.memory import TokenBasedMemory
        except ImportError:
            pytest.skip('Session dependencies not available')

        strategy = TokenBasedMemory(reserve_tokens=10)
        # Total tokens: 10+15+12+20 = 57, available: 50-10 = 40
        selected = strategy.select_messages(messages, max_tokens=50)

        # Should keep most recent that fit
        assert len(selected) < 4
        # Most recent messages should be included
        assert selected[-1].id == 4

    def test_token_based_memory_empty(self):
        """Test TokenBasedMemory with empty messages."""
        try:
            from session.memory import TokenBasedMemory
        except ImportError:
            pytest.skip('Session dependencies not available')

        strategy = TokenBasedMemory()
        selected = strategy.select_messages([], max_tokens=1000)

        assert len(selected) == 0

    def test_token_based_memory_with_system_prompt(self, messages):
        """Test TokenBasedMemory accounts for system prompt."""
        try:
            from session.memory import TokenBasedMemory
        except ImportError:
            pytest.skip('Session dependencies not available')

        strategy = TokenBasedMemory(reserve_tokens=100)
        long_system = "A" * 400  # ~100 tokens

        selected = strategy.select_messages(messages, max_tokens=200, system_prompt=long_system)

        # Should have fewer messages due to system prompt
        assert len(selected) < 4

    def test_sliding_window_memory(self, messages):
        """Test SlidingWindowMemory."""
        try:
            from session.memory import SlidingWindowMemory
        except ImportError:
            pytest.skip('Session dependencies not available')

        strategy = SlidingWindowMemory(max_messages=2)
        selected = strategy.select_messages(messages, max_tokens=1000)

        assert len(selected) == 2
        assert selected[0].id == 3
        assert selected[1].id == 4


class TestEstimateTokens:
    """Tests for token estimation."""

    def test_estimate_tokens_empty(self):
        """Test with empty string."""
        try:
            from session.memory import estimate_tokens
        except ImportError:
            pytest.skip('Session dependencies not available')

        assert estimate_tokens('') == 0
        assert estimate_tokens(None) == 0

    def test_estimate_tokens_short(self):
        """Test with short text."""
        try:
            from session.memory import estimate_tokens
        except ImportError:
            pytest.skip('Session dependencies not available')

        result = estimate_tokens('Hello')
        assert result > 0
        assert result < 10

    def test_estimate_tokens_long(self):
        """Test with longer text."""
        try:
            from session.memory import estimate_tokens
        except ImportError:
            pytest.skip('Session dependencies not available')

        text = 'This is a longer text with multiple words that should result in more tokens.'
        result = estimate_tokens(text)
        assert result > 10


class TestSession:
    """Tests for Session dataclass."""

    def test_is_expired_false(self):
        """Test session is not expired."""
        try:
            from session.manager import Session
        except ImportError:
            pytest.skip('Session dependencies not available')

        session = Session(
            id=1,
            chat_id=123,
            user_id=456,
            provider='ollama',
            model=None,
            created_at=datetime.now(),
            last_message_at=datetime.now(),
            message_count=5,
        )

        assert session.is_expired is False

    def test_is_expired_true(self):
        """Test session is expired."""
        try:
            from session.manager import Session
        except ImportError:
            pytest.skip('Session dependencies not available')

        # Patch the Config to have a shorter timeout
        with patch('session.manager.Config') as mock_config:
            mock_config.SESSION_TIMEOUT_HOURS = 24

            session = Session(
                id=1,
                chat_id=123,
                user_id=456,
                provider='ollama',
                model=None,
                created_at=datetime.now() - timedelta(hours=48),
                last_message_at=datetime.now() - timedelta(hours=48),
                message_count=5,
            )

            assert session.is_expired is True


class TestSessionManager:
    """Tests for SessionManager."""

    def test_init(self):
        """Test manager initialization."""
        try:
            from session.manager import SessionManager
        except ImportError:
            pytest.skip('Session dependencies not available')

        with patch('session.manager.Config') as mock_config:
            mock_config.MAX_CONTEXT_TOKENS = 4096
            manager = SessionManager(max_context_tokens=1000)

        assert manager.max_context_tokens == 1000
        assert manager._initialized is False

    def test_session_cache(self):
        """Test session caching behavior."""
        try:
            from session.manager import SessionManager, Session
        except ImportError:
            pytest.skip('Session dependencies not available')

        with patch('session.manager.Config') as mock_config:
            mock_config.MAX_CONTEXT_TOKENS = 4096
            manager = SessionManager()

        # Manually add to cache
        session = Session(
            id=1,
            chat_id=123,
            user_id=456,
            provider='ollama',
            model='test',
            created_at=datetime.now(),
            last_message_at=datetime.now(),
            message_count=0,
        )
        manager._session_cache[123] = session

        # Should be retrievable
        assert 123 in manager._session_cache
        assert manager._session_cache[123].provider == 'ollama'


class TestGetSessionManager:
    """Tests for get_session_manager singleton."""

    def test_singleton(self):
        """Test get_session_manager returns same instance."""
        try:
            from session.manager import get_session_manager, _session_manager
            import session.manager as sm
        except ImportError:
            pytest.skip('Session dependencies not available')

        with patch('session.manager.Config') as mock_config:
            mock_config.MAX_CONTEXT_TOKENS = 4096

            # Reset singleton
            sm._session_manager = None

            manager1 = get_session_manager()
            manager2 = get_session_manager()

            assert manager1 is manager2
