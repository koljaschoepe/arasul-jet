"""
ARASUL PLATFORM - Memory Strategies
Token-based memory management for conversation context
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime

logger = logging.getLogger('telegram-bot.session.memory')


@dataclass
class StoredMessage:
    """Message stored in memory."""
    id: Optional[int]
    role: str  # 'system', 'user', 'assistant'
    content: str
    tokens: int
    created_at: datetime

    def to_dict(self) -> dict:
        return {
            'role': self.role,
            'content': self.content,
        }


class MemoryStrategy(ABC):
    """
    Abstract base class for memory strategies.

    Defines how messages are selected for context window.
    """

    @abstractmethod
    def select_messages(
        self,
        messages: List[StoredMessage],
        max_tokens: int,
        system_prompt: Optional[str] = None,
    ) -> List[StoredMessage]:
        """
        Select messages to include in context.

        Args:
            messages: All available messages (oldest first)
            max_tokens: Maximum tokens for context
            system_prompt: Optional system prompt (consumes tokens)

        Returns:
            Selected messages for context window
        """
        pass


class TokenBasedMemory(MemoryStrategy):
    """
    Token-based memory selection.

    Keeps as many recent messages as fit in the token limit.
    Always includes system prompt if provided.
    """

    def __init__(self, reserve_tokens: int = 512):
        """
        Args:
            reserve_tokens: Tokens to reserve for response
        """
        self.reserve_tokens = reserve_tokens

    def select_messages(
        self,
        messages: List[StoredMessage],
        max_tokens: int,
        system_prompt: Optional[str] = None,
    ) -> List[StoredMessage]:
        """
        Select most recent messages that fit in token limit.

        Strategy:
        1. Reserve tokens for system prompt and response
        2. Add messages from most recent to oldest
        3. Stop when token limit reached
        """
        if not messages:
            return []

        # Calculate available tokens
        available = max_tokens - self.reserve_tokens

        # Account for system prompt tokens (rough estimate: 4 chars = 1 token)
        if system_prompt:
            system_tokens = len(system_prompt) // 4 + 10
            available -= system_tokens

        if available <= 0:
            logger.warning("No tokens available after system prompt reservation")
            return []

        # Select messages from newest to oldest
        selected = []
        total_tokens = 0

        for msg in reversed(messages):
            if total_tokens + msg.tokens <= available:
                selected.insert(0, msg)  # Maintain chronological order
                total_tokens += msg.tokens
            else:
                # Can't fit more messages
                break

        logger.debug(f"Selected {len(selected)}/{len(messages)} messages ({total_tokens} tokens)")
        return selected


class SlidingWindowMemory(MemoryStrategy):
    """
    Sliding window memory with message count limit.

    Keeps the N most recent messages regardless of token count.
    """

    def __init__(self, max_messages: int = 20):
        """
        Args:
            max_messages: Maximum number of messages to keep
        """
        self.max_messages = max_messages

    def select_messages(
        self,
        messages: List[StoredMessage],
        max_tokens: int,
        system_prompt: Optional[str] = None,
    ) -> List[StoredMessage]:
        """Keep most recent N messages."""
        if not messages:
            return []

        # Simply take the most recent N messages
        selected = messages[-self.max_messages:]

        # Still respect token limit
        total_tokens = sum(m.tokens for m in selected)

        if total_tokens > max_tokens:
            # Fall back to token-based selection
            token_strategy = TokenBasedMemory()
            return token_strategy.select_messages(selected, max_tokens, system_prompt)

        return selected


class SummarizedMemory(MemoryStrategy):
    """
    Summarized memory strategy.

    Summarizes older messages to compress history.
    NOTE: Requires LLM access for summarization - placeholder for future.
    """

    def __init__(self, summary_threshold: int = 10):
        """
        Args:
            summary_threshold: Messages before summarization kicks in
        """
        self.summary_threshold = summary_threshold
        self._fallback = TokenBasedMemory()

    def select_messages(
        self,
        messages: List[StoredMessage],
        max_tokens: int,
        system_prompt: Optional[str] = None,
    ) -> List[StoredMessage]:
        """
        For now, falls back to token-based selection.

        TODO: Implement actual summarization with LLM.
        """
        # Placeholder: use token-based for now
        return self._fallback.select_messages(messages, max_tokens, system_prompt)


def estimate_tokens(text: str) -> int:
    """
    Estimate token count for text.

    Uses rough heuristic: ~4 characters per token for English.
    For more accurate counting, use tiktoken.
    """
    if not text:
        return 0

    # Try to use tiktoken if available
    try:
        import tiktoken
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except ImportError:
        pass

    # Fallback: rough estimate
    # Average English word is ~5 chars, average tokens per word is ~1.3
    # So roughly 4 chars per token
    return len(text) // 4 + 1
