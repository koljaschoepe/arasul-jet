"""
Database Connection Pool
Standardized PostgreSQL connection pooling for all services
"""

import os
import time
import logging
from typing import Dict, Any, Optional
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


def get_db_config() -> Dict[str, Any]:
    """Get database configuration from environment variables"""
    return {
        'host': os.getenv('POSTGRES_HOST', 'postgres-db'),
        'port': int(os.getenv('POSTGRES_PORT', '5432')),
        'user': os.getenv('POSTGRES_USER', 'arasul'),
        'password': os.getenv('POSTGRES_PASSWORD', ''),
        'database': os.getenv('POSTGRES_DB', 'arasul_db'),
    }


class DatabasePool:
    """
    Thread-safe PostgreSQL connection pool with retry logic.

    Usage:
        db = DatabasePool(min_conn=2, max_conn=10)

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM users")
                rows = cur.fetchall()
    """

    def __init__(
        self,
        min_conn: int = 2,
        max_conn: int = 10,
        max_retries: int = 5,
        retry_delay: float = 5.0,
        config: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize database connection pool.

        Args:
            min_conn: Minimum connections to keep open
            max_conn: Maximum connections allowed
            max_retries: Number of connection retry attempts
            retry_delay: Seconds to wait between retries
            config: Optional custom database configuration
        """
        self._pool: Optional[pool.ThreadedConnectionPool] = None
        self.min_conn = min_conn
        self.max_conn = max_conn
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.config = config or get_db_config()
        self._init_pool()

    def _init_pool(self):
        """Initialize the connection pool with retry logic"""
        for attempt in range(self.max_retries):
            try:
                self._pool = pool.ThreadedConnectionPool(
                    self.min_conn,
                    self.max_conn,
                    host=self.config['host'],
                    port=self.config['port'],
                    user=self.config['user'],
                    password=self.config['password'],
                    database=self.config['database']
                )
                logger.info(
                    f"Database connection pool initialized "
                    f"(min={self.min_conn}, max={self.max_conn})"
                )
                return
            except psycopg2.OperationalError as e:
                logger.warning(
                    f"Database connection attempt {attempt + 1}/{self.max_retries} failed: {e}"
                )
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                else:
                    logger.error("Failed to connect to database after all retries")
                    raise

    @contextmanager
    def get_connection(self, autocommit: bool = False):
        """
        Get a connection from the pool.

        Args:
            autocommit: If True, enable autocommit mode

        Yields:
            psycopg2 connection object

        Example:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
        """
        conn = None
        try:
            conn = self._pool.getconn()
            if autocommit:
                conn.autocommit = True
            yield conn
            if not autocommit:
                conn.commit()
        except Exception as e:
            if conn and not autocommit:
                conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            if conn:
                conn.autocommit = False
                self._pool.putconn(conn)

    @contextmanager
    def get_cursor(self, dict_cursor: bool = True):
        """
        Convenience method to get a cursor directly.

        Args:
            dict_cursor: If True, return results as dictionaries

        Yields:
            psycopg2 cursor object

        Example:
            with db.get_cursor() as cur:
                cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
                user = cur.fetchone()
        """
        cursor_factory = RealDictCursor if dict_cursor else None
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=cursor_factory) as cur:
                yield cur

    def execute(
        self,
        query: str,
        params: tuple = None,
        fetch: str = 'all'
    ) -> Any:
        """
        Execute a query and return results.

        Args:
            query: SQL query string
            params: Query parameters
            fetch: 'all', 'one', 'none', or 'rowcount'

        Returns:
            Query results based on fetch parameter
        """
        with self.get_cursor() as cur:
            cur.execute(query, params)
            if fetch == 'all':
                return cur.fetchall()
            elif fetch == 'one':
                return cur.fetchone()
            elif fetch == 'rowcount':
                return cur.rowcount
            return None

    def execute_many(self, query: str, params_list: list) -> int:
        """
        Execute a query with multiple parameter sets.

        Args:
            query: SQL query string
            params_list: List of parameter tuples

        Returns:
            Total rows affected
        """
        with self.get_cursor(dict_cursor=False) as cur:
            cur.executemany(query, params_list)
            return cur.rowcount

    def health_check(self) -> bool:
        """Check if database connection is healthy"""
        try:
            with self.get_cursor() as cur:
                cur.execute("SELECT 1")
                return cur.fetchone() is not None
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False

    def close(self):
        """Close all connections in the pool"""
        if self._pool:
            self._pool.closeall()
            logger.info("Database connection pool closed")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False


# Global instance (lazy initialization)
_db_instance: Optional[DatabasePool] = None


def get_database(
    min_conn: int = 2,
    max_conn: int = 10
) -> DatabasePool:
    """
    Get global database pool instance (creates if needed).

    Args:
        min_conn: Minimum connections (only used on first call)
        max_conn: Maximum connections (only used on first call)

    Returns:
        DatabasePool instance
    """
    global _db_instance
    if _db_instance is None:
        _db_instance = DatabasePool(min_conn=min_conn, max_conn=max_conn)
    return _db_instance
