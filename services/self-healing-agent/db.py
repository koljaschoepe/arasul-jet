"""
ARASUL PLATFORM - Self-Healing Database Mixin
Connection pooling, query execution, and event/failure tracking.
"""

import time
import os
import psycopg2
from psycopg2 import pool

from config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
    FAILURE_WINDOW_MINUTES, CRITICAL_WINDOW_MINUTES, logger
)


class DatabaseMixin:
    """Database operations mixin for SelfHealingEngine"""

    def connect_db(self):
        """Initialize database connection pool with retry logic"""
        max_retries = 10
        retry_delay = 5

        min_connections = int(os.getenv('POSTGRES_POOL_MIN', '1'))
        max_connections = int(os.getenv('POSTGRES_POOL_MAX', '10'))

        for attempt in range(max_retries):
            try:
                self.connection_pool = pool.ThreadedConnectionPool(
                    minconn=min_connections,
                    maxconn=max_connections,
                    host=POSTGRES_HOST,
                    port=POSTGRES_PORT,
                    user=POSTGRES_USER,
                    password=POSTGRES_PASSWORD,
                    database=POSTGRES_DB,
                    connect_timeout=10,
                    application_name='arasul-self-healing',
                    options='-c statement_timeout=30000'
                )
                logger.info(f"Connection pool initialized: {POSTGRES_HOST}:{POSTGRES_PORT} (min={min_connections}, max={max_connections})")
                return
            except Exception as e:
                logger.error(f"Connection pool initialization attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)

        logger.error("Failed to initialize connection pool, continuing without persistence")

    def get_connection(self):
        """Get a connection from the pool"""
        if not self.connection_pool:
            raise Exception("Connection pool not initialized")
        return self.connection_pool.getconn()

    def release_connection(self, conn):
        """Return connection to the pool"""
        if self.connection_pool and conn:
            self.connection_pool.putconn(conn)

    def execute_query(self, query: str, params: tuple = None, fetch: bool = False):
        """Execute a database query using connection pool"""
        if not self.connection_pool:
            logger.warning("Connection pool not initialized")
            return None

        conn = None
        try:
            self.pool_stats['total_queries'] += 1
            conn = self.get_connection()
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                result = cursor.fetchone() if fetch else None
                conn.commit()
                return result
        except Exception as e:
            self.pool_stats['total_errors'] += 1
            logger.error(f"Database query failed: {e}")
            if conn:
                try:
                    conn.rollback()
                except Exception as rb_err:
                    logger.debug(f"Non-critical error during rollback: {rb_err}")
            return None
        finally:
            if conn:
                self.release_connection(conn)

    def log_event(self, event_type: str, severity: str, description: str,
                  action_taken: str, service_name: str = None, success: bool = True):
        """Log self-healing event to database"""
        self.execute_query(
            """INSERT INTO self_healing_events
               (event_type, severity, description, action_taken, service_name, success)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (event_type, severity, description, action_taken, service_name, success)
        )
        logger.info(f"Event logged: {event_type} - {description}")

    def record_failure(self, service_name: str, failure_type: str, health_status: str = None):
        """Record service failure in database"""
        result = self.execute_query(
            "SELECT record_service_failure(%s, %s, %s)",
            (service_name, failure_type, health_status),
            fetch=True
        )
        if result:
            logger.debug(f"Recorded failure for {service_name}: {failure_type}")

    def get_failure_count(self, service_name: str, minutes: int = FAILURE_WINDOW_MINUTES) -> int:
        """Get failure count for service in time window"""
        result = self.execute_query(
            "SELECT get_service_failure_count(%s, %s)",
            (service_name, minutes),
            fetch=True
        )
        return result[0] if result else 0

    def is_in_cooldown(self, service_name: str, minutes: int = 5) -> bool:
        """Check if service is in cooldown period"""
        result = self.execute_query(
            "SELECT is_service_in_cooldown(%s, %s)",
            (service_name, minutes),
            fetch=True
        )
        return result[0] if result else False

    def get_critical_events_count(self, minutes: int = CRITICAL_WINDOW_MINUTES) -> int:
        """Get count of critical events in time window"""
        result = self.execute_query(
            "SELECT get_critical_events_count(%s)",
            (minutes,),
            fetch=True
        )
        return result[0] if result else 0

    def is_store_app_intentionally_stopped(self, container_name: str) -> bool:
        """Check if a container is an App Store app that was intentionally stopped."""
        try:
            result = self.execute_query(
                """SELECT status FROM app_installations
                   WHERE container_name = %s OR app_id = %s""",
                (container_name, container_name),
                fetch=True
            )

            if result:
                db_status = result[0]
                if db_status == 'installed':
                    logger.debug(f"Container {container_name} is a Store app intentionally stopped (status: {db_status})")
                    return True
                logger.debug(f"Container {container_name} is a Store app that should be running (status: {db_status})")
                return False

            return False

        except Exception as e:
            logger.warning(f"Failed to check Store app status for {container_name}: {e}")
            return False

    def record_recovery_action(self, action_type: str, service_name: str, reason: str,
                              success: bool, duration_ms: int = None, error_message: str = None):
        """Record recovery action in database"""
        self.execute_query(
            "SELECT record_recovery_action(%s, %s, %s, %s, %s, %s, NULL)",
            (action_type, service_name, reason, success, duration_ms, error_message)
        )

    def get_pool_stats(self):
        """Get connection pool statistics"""
        uptime = time.time() - self.pool_stats['start_time']
        queries_per_second = self.pool_stats['total_queries'] / uptime if uptime > 0 else 0

        return {
            'total_queries': self.pool_stats['total_queries'],
            'total_errors': self.pool_stats['total_errors'],
            'queries_per_second': round(queries_per_second, 2),
            'error_rate': f"{(self.pool_stats['total_errors'] / max(self.pool_stats['total_queries'], 1)) * 100:.2f}%",
            'uptime_seconds': int(uptime)
        }

    def close_pool(self):
        """Close all connections in the pool"""
        if self.connection_pool:
            try:
                self.connection_pool.closeall()
                logger.info("Connection pool closed")
            except Exception as e:
                logger.error(f"Error closing connection pool: {e}")
