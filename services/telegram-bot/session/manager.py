"""
ARASUL PLATFORM - Session Manager
PostgreSQL-backed session and memory management
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from dataclasses import dataclass

from .memory import StoredMessage, MemoryStrategy, TokenBasedMemory, estimate_tokens
from config import Config

logger = logging.getLogger('telegram-bot.session.manager')


@dataclass
class Session:
    """User session data."""
    id: int
    chat_id: int
    user_id: int
    provider: str
    model: Optional[str]
    created_at: datetime
    last_message_at: datetime
    message_count: int

    @property
    def is_expired(self) -> bool:
        """Check if session has expired."""
        timeout = timedelta(hours=Config.SESSION_TIMEOUT_HOURS)
        return datetime.now() - self.last_message_at > timeout


class SessionManager:
    """
    Manages user sessions and conversation memory.

    Features:
    - Session creation/retrieval per chat_id
    - Message storage with token counting
    - Context window management
    - Session reset (/new command)
    """

    def __init__(
        self,
        memory_strategy: Optional[MemoryStrategy] = None,
        max_context_tokens: Optional[int] = None,
    ):
        """
        Args:
            memory_strategy: Strategy for selecting context messages
            max_context_tokens: Maximum tokens for context window
        """
        self.memory_strategy = memory_strategy or TokenBasedMemory()
        self.max_context_tokens = max_context_tokens or Config.MAX_CONTEXT_TOKENS
        self._pool = None
        self._initialized = False

        # In-memory cache for active sessions
        self._session_cache: Dict[int, Session] = {}

    async def initialize(self) -> None:
        """Initialize database connection pool."""
        if self._initialized:
            return

        try:
            import asyncpg
            self._pool = await asyncpg.create_pool(
                Config.DATABASE_URL,
                min_size=1,
                max_size=5,
            )
            self._initialized = True
            logger.info("Session manager initialized with database connection")
        except Exception as e:
            logger.error(f"Failed to initialize session manager: {e}")
            raise

    async def close(self) -> None:
        """Close database connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
        self._initialized = False
        self._session_cache.clear()

    async def get_session(self, chat_id: int, user_id: int) -> Session:
        """
        Get or create session for chat.

        Args:
            chat_id: Telegram chat ID
            user_id: Telegram user ID

        Returns:
            Session object
        """
        # Check cache first
        if chat_id in self._session_cache:
            session = self._session_cache[chat_id]
            if not session.is_expired:
                return session
            # Session expired, will create new one
            del self._session_cache[chat_id]

        await self._ensure_initialized()

        async with self._pool.acquire() as conn:
            # Try to get existing session
            row = await conn.fetchrow(
                """
                SELECT id, chat_id, user_id, provider, model,
                       created_at, last_message_at, message_count
                FROM telegram_llm_sessions
                WHERE chat_id = $1
                """,
                chat_id
            )

            if row:
                session = Session(
                    id=row['id'],
                    chat_id=row['chat_id'],
                    user_id=row['user_id'],
                    provider=row['provider'],
                    model=row['model'],
                    created_at=row['created_at'],
                    last_message_at=row['last_message_at'],
                    message_count=row['message_count'],
                )

                # Check expiration
                if session.is_expired:
                    await self.reset_session(chat_id)
                    return await self.get_session(chat_id, user_id)

                self._session_cache[chat_id] = session
                return session

            # Create new session
            return await self._create_session(conn, chat_id, user_id)

    async def _create_session(
        self,
        conn,
        chat_id: int,
        user_id: int,
    ) -> Session:
        """Create a new session."""
        now = datetime.now()

        row = await conn.fetchrow(
            """
            INSERT INTO telegram_llm_sessions
                (chat_id, user_id, provider, created_at, last_message_at, message_count)
            VALUES ($1, $2, $3, $4, $4, 0)
            RETURNING id
            """,
            chat_id,
            user_id,
            Config.DEFAULT_LLM_PROVIDER,
            now,
        )

        session = Session(
            id=row['id'],
            chat_id=chat_id,
            user_id=user_id,
            provider=Config.DEFAULT_LLM_PROVIDER,
            model=None,
            created_at=now,
            last_message_at=now,
            message_count=0,
        )

        self._session_cache[chat_id] = session
        logger.info(f"Created new session {session.id} for chat {chat_id}")
        return session

    async def reset_session(self, chat_id: int) -> None:
        """
        Reset session (delete messages, create new session).

        Called by /new command.
        """
        await self._ensure_initialized()

        # Remove from cache
        if chat_id in self._session_cache:
            del self._session_cache[chat_id]

        async with self._pool.acquire() as conn:
            async with conn.transaction():
                # Delete messages (CASCADE should handle this, but be explicit)
                await conn.execute(
                    """
                    DELETE FROM telegram_llm_messages
                    WHERE session_id IN (
                        SELECT id FROM telegram_llm_sessions WHERE chat_id = $1
                    )
                    """,
                    chat_id
                )

                # Delete session
                await conn.execute(
                    "DELETE FROM telegram_llm_sessions WHERE chat_id = $1",
                    chat_id
                )

        logger.info(f"Reset session for chat {chat_id}")

    async def add_message(
        self,
        chat_id: int,
        role: str,
        content: str,
    ) -> StoredMessage:
        """
        Add a message to session history.

        Args:
            chat_id: Telegram chat ID
            role: Message role ('user' or 'assistant')
            content: Message content

        Returns:
            StoredMessage with ID
        """
        await self._ensure_initialized()

        # Get session
        session = self._session_cache.get(chat_id)
        if not session:
            raise ValueError(f"No session found for chat {chat_id}")

        tokens = estimate_tokens(content)
        now = datetime.now()

        async with self._pool.acquire() as conn:
            async with conn.transaction():
                # Insert message
                row = await conn.fetchrow(
                    """
                    INSERT INTO telegram_llm_messages
                        (session_id, role, content, tokens, created_at)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id
                    """,
                    session.id,
                    role,
                    content,
                    tokens,
                    now,
                )

                # Update session
                await conn.execute(
                    """
                    UPDATE telegram_llm_sessions
                    SET last_message_at = $1, message_count = message_count + 1
                    WHERE id = $2
                    """,
                    now,
                    session.id,
                )

                # Update cache
                session.last_message_at = now
                session.message_count += 1

        message = StoredMessage(
            id=row['id'],
            role=role,
            content=content,
            tokens=tokens,
            created_at=now,
        )

        logger.debug(f"Added {role} message ({tokens} tokens) to session {session.id}")
        return message

    async def get_context_messages(
        self,
        chat_id: int,
        system_prompt: Optional[str] = None,
    ) -> List[StoredMessage]:
        """
        Get messages for context window.

        Uses memory strategy to select appropriate messages.

        Args:
            chat_id: Telegram chat ID
            system_prompt: Optional system prompt (affects token budget)

        Returns:
            List of messages for context
        """
        await self._ensure_initialized()

        session = self._session_cache.get(chat_id)
        if not session:
            return []

        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, role, content, tokens, created_at
                FROM telegram_llm_messages
                WHERE session_id = $1
                ORDER BY created_at ASC
                """,
                session.id
            )

        messages = [
            StoredMessage(
                id=row['id'],
                role=row['role'],
                content=row['content'],
                tokens=row['tokens'],
                created_at=row['created_at'],
            )
            for row in rows
        ]

        # Apply memory strategy
        selected = self.memory_strategy.select_messages(
            messages,
            self.max_context_tokens,
            system_prompt,
        )

        return selected

    async def update_provider(
        self,
        chat_id: int,
        provider: str,
        model: Optional[str] = None,
    ) -> None:
        """
        Update session provider/model.

        Args:
            chat_id: Telegram chat ID
            provider: Provider name ('ollama' or 'claude')
            model: Optional model name
        """
        await self._ensure_initialized()

        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE telegram_llm_sessions
                SET provider = $1, model = $2
                WHERE chat_id = $3
                """,
                provider,
                model,
                chat_id,
            )

        # Update cache
        if chat_id in self._session_cache:
            self._session_cache[chat_id].provider = provider
            self._session_cache[chat_id].model = model

        logger.info(f"Updated session for chat {chat_id}: provider={provider}, model={model}")

    async def get_session_stats(self, chat_id: int) -> Dict[str, Any]:
        """
        Get session statistics.

        Returns:
            Dict with session stats
        """
        await self._ensure_initialized()

        session = self._session_cache.get(chat_id)
        if not session:
            return {'exists': False}

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT COUNT(*) as count, COALESCE(SUM(tokens), 0) as total_tokens
                FROM telegram_llm_messages
                WHERE session_id = $1
                """,
                session.id
            )

        return {
            'exists': True,
            'session_id': session.id,
            'provider': session.provider,
            'model': session.model,
            'message_count': row['count'],
            'total_tokens': row['total_tokens'],
            'created_at': session.created_at.isoformat(),
            'last_message_at': session.last_message_at.isoformat(),
            'max_context_tokens': self.max_context_tokens,
        }

    async def _ensure_initialized(self) -> None:
        """Ensure database connection is ready."""
        if not self._initialized:
            await self.initialize()


# Singleton instance
_session_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    """Get the global session manager instance."""
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager


async def initialize_session_manager() -> SessionManager:
    """Initialize and return the global session manager."""
    manager = get_session_manager()
    await manager.initialize()
    return manager
