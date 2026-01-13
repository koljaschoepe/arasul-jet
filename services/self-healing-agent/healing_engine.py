#!/usr/bin/env python3
"""
ARASUL PLATFORM - Self-Healing Engine
Autonomous service monitoring and recovery with advanced failure tracking
"""

import os
import time
import logging
import psycopg2
from psycopg2 import pool
import docker
import psutil
import requests
import json
import subprocess
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional

# Import GPU Recovery Module
try:
    from gpu_recovery import GPURecovery, GPURecoveryAction
    GPU_RECOVERY_AVAILABLE = True
except ImportError:
    GPU_RECOVERY_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('self-healing')

# Configuration
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'postgres-db')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_USER = os.getenv('POSTGRES_USER', 'arasul')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD')
POSTGRES_DB = os.getenv('POSTGRES_DB', 'arasul_db')

HEALING_INTERVAL = int(os.getenv('SELF_HEALING_INTERVAL', '10'))
ENABLED = os.getenv('SELF_HEALING_ENABLED', 'true').lower() == 'true'
REBOOT_ENABLED = os.getenv('SELF_HEALING_REBOOT_ENABLED', 'false').lower() == 'true'

METRICS_COLLECTOR_URL = f"http://{os.getenv('METRICS_COLLECTOR_HOST', 'metrics-collector')}:9100"
LLM_SERVICE_URL = f"http://{os.getenv('LLM_SERVICE_HOST', 'llm-service')}:{os.getenv('LLM_SERVICE_MANAGEMENT_PORT', '11436')}"  # Management API port
N8N_URL = f"http://{os.getenv('N8N_HOST', 'n8n')}:5678"

# Thresholds
DISK_WARNING = int(os.getenv('DISK_WARNING_PERCENT', '80'))
DISK_CLEANUP = int(os.getenv('DISK_CLEANUP_PERCENT', '90'))
DISK_CRITICAL = int(os.getenv('DISK_CRITICAL_PERCENT', '95'))
DISK_REBOOT = int(os.getenv('DISK_REBOOT_PERCENT', '97'))

CPU_OVERLOAD_THRESHOLD = 90
RAM_OVERLOAD_THRESHOLD = 90
GPU_OVERLOAD_THRESHOLD = 95
TEMP_THROTTLE_THRESHOLD = 83
TEMP_RESTART_THRESHOLD = 85

# Failure tracking windows
FAILURE_WINDOW_MINUTES = 10
CRITICAL_WINDOW_MINUTES = 30
MAX_FAILURES_IN_WINDOW = 3
MAX_CRITICAL_EVENTS = 3

# Application services (excluding system services)
APPLICATION_SERVICES = [
    'llm-service',
    'embedding-service',
    'n8n',
    'dashboard-backend',
    'dashboard-frontend'
]

# App Store apps managed via dashboard (should not auto-restart if intentionally stopped)
# This will be dynamically checked via database


class SelfHealingEngine:
    """Advanced self-healing engine with database-backed failure tracking and connection pooling"""

    def __init__(self):
        self.docker_client = docker.from_env()
        self.connection_pool = None
        self.pool_stats = {
            'total_queries': 0,
            'total_errors': 0,
            'start_time': time.time()
        }
        self.connect_db()
        self.last_overload_actions = {}
        self.check_count = 0
        self.last_action = None

        # Initialize GPU Recovery
        self.gpu_recovery = None
        if GPU_RECOVERY_AVAILABLE:
            try:
                self.gpu_recovery = GPURecovery(docker_client=self.docker_client)
                logger.info("GPU Recovery initialized")
            except Exception as e:
                logger.warning(f"GPU Recovery init failed: {e}")

        # State tracking for metrics failure
        self.metrics_down_since = None

        # Cooldown for critical actions
        self.last_critical_action_time = 0

        logger.info("Self-Healing Engine initialized")

    def connect_db(self):
        """Initialize database connection pool with retry logic"""
        max_retries = 10
        retry_delay = 5

        # Pool configuration
        min_connections = int(os.getenv('POSTGRES_POOL_MIN', '1'))
        max_connections = int(os.getenv('POSTGRES_POOL_MAX', '3'))

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
                    options='-c statement_timeout=30000'  # 30 second statement timeout
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
            cursor = conn.cursor()
            cursor.execute(query, params)
            result = cursor.fetchone() if fetch else None
            conn.commit()
            cursor.close()
            return result
        except Exception as e:
            self.pool_stats['total_errors'] += 1
            logger.error(f"Database query failed: {e}")
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass  # PHASE1-FIX: Explicit Exception type
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
        """Check if a container is an App Store app that was intentionally stopped.

        Returns True if the container is in app_installations with status 'installed' (stopped)
        Returns False if:
        - Container is not in app_installations (not a Store app)
        - Container is in app_installations with status 'running' (should be running)
        """
        try:
            result = self.execute_query(
                """SELECT status FROM app_installations
                   WHERE container_name = %s OR app_id = %s""",
                (container_name, container_name),
                fetch=True
            )

            if result:
                db_status = result[0]
                # If status is 'installed', the app was intentionally stopped
                if db_status == 'installed':
                    logger.debug(f"Container {container_name} is a Store app intentionally stopped (status: {db_status})")
                    return True
                # If status is 'running', it should be running - allow self-healing
                logger.debug(f"Container {container_name} is a Store app that should be running (status: {db_status})")
                return False

            # Not in app_installations - not a Store app
            return False

        except Exception as e:
            logger.warning(f"Failed to check Store app status for {container_name}: {e}")
            return False  # Default to allowing self-healing

    def record_recovery_action(self, action_type: str, service_name: str, reason: str,
                              success: bool, duration_ms: int = None, error_message: str = None):
        """Record recovery action in database"""
        self.execute_query(
            "SELECT record_recovery_action(%s, %s, %s, %s, %s, %s, NULL)",
            (action_type, service_name, reason, success, duration_ms, error_message)
        )

    def get_metrics(self) -> Dict:
        """Get current system metrics"""
        try:
            response = requests.get(f"{METRICS_COLLECTOR_URL}/metrics", timeout=2)
            return response.json()
        except Exception as e:
            logger.error(f"Failed to get metrics: {e}")
            return None

    def check_service_health(self) -> Dict[str, Dict]:
        """Check health of all services"""
        services_status = {}

        try:
            containers = self.docker_client.containers.list(all=True)

            for container in containers:
                name = container.name
                status = container.status
                health = 'unknown'

                # Get health status if available
                try:
                    inspect = container.attrs
                    if 'Health' in inspect.get('State', {}):
                        health = inspect['State']['Health']['Status']
                except Exception:
                    pass  # PHASE1-FIX: Explicit Exception type

                services_status[name] = {
                    'status': status,
                    'health': health,
                    'container': container
                }

        except Exception as e:
            logger.error(f"Failed to check services: {e}")

        return services_status

    # ========================================================================
    # CATEGORY A: SERVICE DOWN
    # ========================================================================

    def handle_category_a_service_down(self, service_name: str, container):
        """Category A: Service Down - tiered restart strategies with DB tracking"""

        # Record failure in database
        self.record_failure(service_name, 'unhealthy', 'down')

        # Check if in cooldown
        if self.is_in_cooldown(service_name):
            logger.warning(f"Service {service_name} is in cooldown, skipping recovery")
            return

        # Get failure count from database
        failure_count = self.get_failure_count(service_name)
        logger.warning(f"Service {service_name} unhealthy (failures in window: {failure_count})")

        start_time = time.time()

        try:
            if failure_count == 1:
                # First attempt: simple restart
                logger.info(f"Attempting restart of {service_name} (attempt 1/3)")
                container.restart()
                duration_ms = int((time.time() - start_time) * 1000)

                self.log_event(
                    'service_restart',
                    'WARNING',
                    f'{service_name} unhealthy, performing restart',
                    'container.restart()',
                    service_name,
                    True
                )
                self.record_recovery_action(
                    'service_restart', service_name,
                    f'Health check failed (1/{MAX_FAILURES_IN_WINDOW})',
                    True, duration_ms
                )

            elif failure_count == 2:
                # Second attempt: stop and start
                logger.info(f"Attempting stop and start of {service_name} (attempt 2/3)")
                container.stop(timeout=10)
                time.sleep(2)
                container.start()
                duration_ms = int((time.time() - start_time) * 1000)

                self.log_event(
                    'service_stop_start',
                    'WARNING',
                    f'{service_name} still unhealthy, performing stop+start',
                    'container.stop() + container.start()',
                    service_name,
                    True
                )
                self.record_recovery_action(
                    'service_restart', service_name,
                    f'Health check failed after restart (2/{MAX_FAILURES_IN_WINDOW})',
                    True, duration_ms
                )

            elif failure_count >= MAX_FAILURES_IN_WINDOW:
                # Third+ attempt: escalate to Category C
                logger.error(f"Service {service_name} failed {failure_count} times in {FAILURE_WINDOW_MINUTES}min window, escalating")
                self.log_event(
                    'service_escalation',
                    'CRITICAL',
                    f'{service_name} failed {failure_count} times, escalating to hard recovery',
                    'Triggering Category C recovery',
                    service_name,
                    True
                )
                self.handle_category_c_critical(
                    f"Service {service_name} failed {failure_count} times in {FAILURE_WINDOW_MINUTES} minutes"
                )

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(f"Failed to recover {service_name}: {e}")
            self.log_event(
                'service_recovery_failed',
                'CRITICAL',
                f'Failed to recover {service_name}: {str(e)}',
                'Escalating to critical',
                service_name,
                False
            )
            self.record_recovery_action(
                'service_restart', service_name,
                f'Recovery attempt failed: {str(e)}',
                False, duration_ms, str(e)
            )

    # ========================================================================
    # CATEGORY B: OVERLOAD
    # ========================================================================

    def clear_llm_cache(self) -> bool:
        """Clear LLM service cache"""
        try:
            logger.info("Clearing LLM cache")
            # Ollama does not have a cache clear endpoint, use unload API
            # This unloads the model from memory, effectively clearing cache
            response = requests.post(
                f"{LLM_SERVICE_URL}/api/generate",
                json={"model": "", "keep_alive": 0},
                timeout=5
            )
            if response.status_code in [200, 404]:  # 404 is ok if no model loaded
                logger.info("LLM cache cleared via model unload")
                return True
        except Exception as e:
            logger.warning(f"Could not clear LLM cache via API: {e}")

        # Fallback: restart LLM service to clear memory
        try:
            container = self.docker_client.containers.get('llm-service')
            container.restart()
            logger.info("Restarted LLM service to clear cache")
            return True
        except Exception as e:
            logger.error(f"Failed to restart LLM service: {e}")
            return False

    def reset_gpu_session(self) -> bool:
        """Reset GPU session for LLM service"""
        try:
            logger.info("Resetting GPU session")
            # Ollama doesn't have a session reset endpoint
            # Unload all models to free GPU memory
            response = requests.post(
                f"{LLM_SERVICE_URL}/api/generate",
                json={"model": "", "keep_alive": 0},
                timeout=5
            )
            if response.status_code in [200, 404]:
                logger.info("GPU session reset via model unload")
                time.sleep(2)  # Wait for GPU to fully release
                return True
        except Exception:
            pass  # PHASE1-FIX: Explicit Exception type

        # Fallback: restart service
        try:
            container = self.docker_client.containers.get('llm-service')
            container.restart()
            logger.info("Restarted LLM service to reset GPU session")
            return True
        except Exception as e:
            logger.error(f"Failed to reset GPU session: {e}")
            return False

    def throttle_gpu(self) -> bool:
        """Apply GPU throttling for thermal management"""
        try:
            logger.warning("Applying GPU throttling for Jetson")
            # Jetson AGX Orin uses nvpmodel for power/thermal management
            # Try to set to lower power mode (MODE_15W or MODE_30W)
            result = subprocess.run(
                ['nvpmodel', '-m', '2'],  # Mode 2 is typically 30W mode
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                logger.info("GPU throttling applied via nvpmodel (30W mode)")
                return True
            else:
                logger.warning(f"nvpmodel failed, trying jetson_clocks: {result.stderr}")
                # Fallback: disable jetson_clocks (allows dynamic frequency scaling)
                result2 = subprocess.run(
                    ['jetson_clocks', '--restore'],
                    capture_output=True, text=True, timeout=5
                )
                if result2.returncode == 0:
                    logger.info("GPU throttling enabled via jetson_clocks restore")
                    return True
                else:
                    logger.error(f"GPU throttling failed: {result2.stderr}")
                    return False
        except Exception as e:
            logger.error(f"Failed to apply GPU throttling: {e}")
            return False

    def pause_n8n_workflows(self) -> bool:
        """Pause n8n workflows to reduce RAM usage"""
        try:
            logger.info("Attempting to pause n8n workflows")
            # This would require n8n API integration
            # For now, just restart n8n to clear memory
            container = self.docker_client.containers.get('n8n')
            container.restart()
            logger.info("Restarted n8n to free RAM")
            return True
        except Exception as e:
            logger.error(f"Failed to restart n8n: {e}")
            return False

    def handle_category_b_overload(self, metrics: Dict):
        """Category B: System Overload - automated resource management"""
        current_time = time.time()

        cpu = metrics.get('cpu', 0)
        ram = metrics.get('ram', 0)
        gpu = metrics.get('gpu', 0)
        temp = metrics.get('temperature', 0)

        # CPU Overload: Clear LLM cache
        if cpu > CPU_OVERLOAD_THRESHOLD:
            action_key = 'cpu_overload'
            last_action = self.last_overload_actions.get(action_key, 0)

            # Only act once every 5 minutes
            if current_time - last_action > 300:
                logger.warning(f"CPU overload detected: {cpu}% - clearing LLM cache")
                success = self.clear_llm_cache()

                self.log_event(
                    'cpu_overload',
                    'WARNING',
                    f'CPU usage at {cpu}%',
                    'Cleared LLM cache' if success else 'Failed to clear cache',
                    'llm-service',
                    success
                )
                self.record_recovery_action(
                    'llm_cache_clear', 'llm-service',
                    f'CPU overload: {cpu}%',
                    success
                )
                self.last_overload_actions[action_key] = current_time

        # RAM Overload: Restart n8n or clear caches
        if ram > RAM_OVERLOAD_THRESHOLD:
            action_key = 'ram_overload'
            last_action = self.last_overload_actions.get(action_key, 0)

            if current_time - last_action > 300:
                logger.warning(f"RAM overload detected: {ram}% - restarting n8n")
                success = self.pause_n8n_workflows()

                self.log_event(
                    'ram_overload',
                    'WARNING',
                    f'RAM usage at {ram}%',
                    'Restarted n8n to free memory' if success else 'Failed to free memory',
                    'n8n',
                    success
                )
                self.record_recovery_action(
                    'service_restart', 'n8n',
                    f'RAM overload: {ram}%',
                    success
                )
                self.last_overload_actions[action_key] = current_time

        # GPU Overload: Reset session
        if gpu > GPU_OVERLOAD_THRESHOLD:
            action_key = 'gpu_overload'
            last_action = self.last_overload_actions.get(action_key, 0)

            if current_time - last_action > 300:
                logger.warning(f"GPU overload detected: {gpu}% - resetting GPU session")
                success = self.reset_gpu_session()

                self.log_event(
                    'gpu_overload',
                    'CRITICAL',
                    f'GPU usage at {gpu}%',
                    'Reset GPU session' if success else 'Failed to reset session',
                    'llm-service',
                    success
                )
                self.record_recovery_action(
                    'gpu_session_reset', 'llm-service',
                    f'GPU overload: {gpu}%',
                    success
                )
                self.last_overload_actions[action_key] = current_time

        # Temperature Management
        if temp > TEMP_RESTART_THRESHOLD:
            # Critical temperature: restart LLM service
            action_key = 'temp_critical'
            last_action = self.last_overload_actions.get(action_key, 0)

            if current_time - last_action > 600:  # 10 minutes cooldown
                logger.critical(f"Critical temperature: {temp}°C - restarting LLM service")
                try:
                    container = self.docker_client.containers.get('llm-service')
                    container.restart()
                    success = True
                except Exception as e:
                    logger.error(f"Failed to restart LLM service: {e}")
                    success = False

                self.log_event(
                    'thermal_critical',
                    'CRITICAL',
                    f'System temperature at {temp}°C (threshold: {TEMP_RESTART_THRESHOLD}°C)',
                    'Restarted LLM service' if success else 'Failed to restart service',
                    'llm-service',
                    success
                )
                self.record_recovery_action(
                    'service_restart', 'llm-service',
                    f'Critical temperature: {temp}°C',
                    success
                )
                self.last_overload_actions[action_key] = current_time

        elif temp > TEMP_THROTTLE_THRESHOLD:
            # High temperature: throttle GPU
            action_key = 'temp_throttle'
            last_action = self.last_overload_actions.get(action_key, 0)

            if current_time - last_action > 300:
                logger.warning(f"High temperature: {temp}°C - throttling GPU")
                success = self.throttle_gpu()

                self.log_event(
                    'thermal_warning',
                    'WARNING',
                    f'System temperature at {temp}°C (threshold: {TEMP_THROTTLE_THRESHOLD}°C)',
                    'Applied GPU throttling' if success else 'Failed to throttle GPU',
                    None,
                    success
                )
                self.record_recovery_action(
                    'gpu_throttle', None,
                    f'High temperature: {temp}°C',
                    success
                )
                self.last_overload_actions[action_key] = current_time

    # ========================================================================
    # CATEGORY C: CRITICAL ERRORS
    # ========================================================================

    def hard_restart_application_services(self) -> bool:
        """Hard restart all application services"""
        logger.critical("Performing hard restart of application services")
        success_count = 0

        for service_name in APPLICATION_SERVICES:
            try:
                container = self.docker_client.containers.get(service_name)
                logger.info(f"Hard restarting {service_name}")
                container.stop(timeout=5)
                time.sleep(1)
                container.start()
                success_count += 1
                logger.info(f"Successfully restarted {service_name}")
            except Exception as e:
                logger.error(f"Failed to hard restart {service_name}: {e}")

        success = success_count == len(APPLICATION_SERVICES)
        self.record_recovery_action(
            'service_restart', 'all-applications',
            'Critical failure - hard restart all services',
            success
        )
        return success

    def perform_disk_cleanup(self) -> bool:
        """Comprehensive disk cleanup"""
        logger.info("Starting comprehensive disk cleanup")
        success = True

        # PHASE1-FIX (HIGH-P05): Security note - all paths are hardcoded to prevent command injection
        # Never use user-supplied paths in subprocess calls

        try:
            # Clean old logs (older than 7 days)
            # Path hardcoded to /arasul/logs for security
            logger.info("Cleaning old logs")
            result = subprocess.run(
                ['find', '/arasul/logs', '-name', '*.log.*', '-mtime', '+7', '-delete'],
                capture_output=True, timeout=30
            )
            logger.info("Old logs cleaned")

            # Docker system prune
            logger.info("Running Docker system prune")
            result = subprocess.run(
                ['docker', 'system', 'prune', '-af', '--volumes'],
                capture_output=True, timeout=120
            )
            logger.info(f"Docker cleanup: {result.stdout.decode()}")

            # Clean Docker build cache
            logger.info("Cleaning Docker build cache")
            subprocess.run(
                ['docker', 'builder', 'prune', '-af'],
                capture_output=True, timeout=60
            )

            # Run database metrics cleanup
            if self.connection_pool:
                logger.info("Running database cleanup")
                self.execute_query("SELECT cleanup_old_metrics()")
                self.execute_query("SELECT cleanup_service_failures()")

            logger.info("Disk cleanup completed successfully")

        except Exception as e:
            logger.error(f"Disk cleanup failed: {e}")
            success = False

        self.record_recovery_action(
            'disk_cleanup', None,
            'Scheduled or critical disk cleanup',
            success
        )
        return success

    def perform_db_vacuum(self) -> bool:
        """Force database vacuum"""
        logger.info("Performing database VACUUM ANALYZE")
        try:
            # Get dedicated connection for VACUUM (requires autocommit)
            conn = psycopg2.connect(
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                database=POSTGRES_DB
            )
            conn.set_isolation_level(0)  # AUTOCOMMIT
            cursor = conn.cursor()
            cursor.execute("VACUUM ANALYZE;")
            cursor.close()
            conn.close()

            # Reconnect regular connection
            self.connect_db()

            logger.info("Database VACUUM completed successfully")
            self.record_recovery_action(
                'db_vacuum', 'postgres-db',
                'Critical recovery - database vacuum',
                True
            )
            return True

        except Exception as e:
            logger.error(f"Database VACUUM failed: {e}")
            self.connect_db()  # Ensure we reconnect
            self.record_recovery_action(
                'db_vacuum', 'postgres-db',
                'Critical recovery - database vacuum',
                False, None, str(e)
            )
            return False

    def perform_gpu_reset(self) -> bool:
        """Reset GPU/Tegra system on Jetson"""
        logger.warning("Performing GPU reset (Jetson: full Tegra restart required)")
        try:
            # On Jetson, GPU is integrated in Tegra SoC - no isolated GPU reset
            # Best we can do is restart GPU-heavy services
            logger.info("Restarting LLM and Embedding services to reset GPU state")

            services_to_restart = ['llm-service', 'embedding-service']
            success_count = 0

            for service_name in services_to_restart:
                try:
                    container = self.docker_client.containers.get(service_name)
                    container.stop(timeout=10)
                    time.sleep(2)
                    container.start()
                    success_count += 1
                    logger.info(f"Restarted {service_name} for GPU reset")
                except Exception as e:
                    logger.error(f"Failed to restart {service_name}: {e}")

            success = success_count == len(services_to_restart)

            if success:
                logger.info("GPU reset completed via service restart")
                time.sleep(5)  # Wait for GPU to reinitialize

            self.record_recovery_action(
                'gpu_reset', 'llm-service,embedding-service',
                'Critical recovery - GPU reset via service restart',
                success
            )
            return success

        except Exception as e:
            logger.error(f"GPU reset failed: {e}")
            self.record_recovery_action(
                'gpu_reset', None,
                'Critical recovery - GPU reset',
                False, None, str(e)
            )
            return False

    def handle_category_c_critical(self, reason: str):
        """Category C: Critical Errors - aggressive recovery"""
        
        # Check cooldown to prevent infinite escalation loops
        current_time = time.time()
        if current_time - self.last_critical_action_time < 3600:  # 1 hour cooldown
            logger.warning(f"Category C recovery triggered but in cooldown (last action < 1h ago). Reason: {reason}")
            return

        logger.critical(f"CRITICAL EVENT: {reason}")

        self.log_event(
            'critical_event',
            'CRITICAL',
            reason,
            'Initiating Category C recovery',
            None,
            True
        )

        # Check critical events count
        critical_count = self.get_critical_events_count()
        logger.info(f"Critical events in last {CRITICAL_WINDOW_MINUTES}min: {critical_count}")

        # Perform critical recovery actions
        logger.critical("Executing critical recovery sequence")

        # 1. Hard restart application services
        self.hard_restart_application_services()
        time.sleep(5)

        # 2. Disk cleanup
        self.perform_disk_cleanup()

        # 3. Database vacuum
        self.perform_db_vacuum()

        # 4. GPU reset if GPU-related issue
        if 'gpu' in reason.lower() or 'llm' in reason.lower():
            self.perform_gpu_reset()
            
        # Update last action time
        self.last_critical_action_time = time.time()

        # Check if we need to escalate to Category D (reboot)
        if critical_count >= MAX_CRITICAL_EVENTS:
            logger.critical(f"Multiple critical events detected ({critical_count}), escalating to reboot")
            self.handle_category_d_reboot(f"Multiple critical failures: {critical_count} events in {CRITICAL_WINDOW_MINUTES}min")

    # ========================================================================
    # CATEGORY D: SYSTEM REBOOT
    # ========================================================================

    def save_reboot_state(self, reason: str) -> int:
        """Save system state before reboot"""
        logger.info("Saving pre-reboot system state")

        try:
            # Collect current system state
            services_state = {}
            containers = self.docker_client.containers.list(all=True)
            for container in containers:
                services_state[container.name] = {
                    'status': container.status,
                    'image': container.image.tags[0] if container.image.tags else 'unknown'
                }

            metrics = self.get_metrics()

            pre_reboot_state = {
                'timestamp': datetime.now().isoformat(),
                'reason': reason,
                'services': services_state,
                'metrics': metrics,
                'disk_usage': psutil.disk_usage('/').percent,
                'critical_events': self.get_critical_events_count()
            }

            # Store in database
            result = self.execute_query(
                """INSERT INTO reboot_events (reason, pre_reboot_state, reboot_completed)
                   VALUES (%s, %s, false) RETURNING id""",
                (reason, json.dumps(pre_reboot_state)),
                fetch=True
            )

            reboot_id = result[0] if result else None
            logger.info(f"Pre-reboot state saved with ID: {reboot_id}")
            return reboot_id

        except Exception as e:
            logger.error(f"Failed to save reboot state: {e}")
            return None

    def handle_category_d_reboot(self, reason: str):
        """Category D: System Reboot - ultima ratio"""
        logger.critical(f"SYSTEM REBOOT TRIGGERED: {reason}")

        self.log_event(
            'system_reboot',
            'EMERGENCY',
            f'System reboot triggered: {reason}',
            'Saving state and initiating reboot',
            None,
            True
        )

        # Safety checks before reboot
        if not self.perform_reboot_safety_checks(reason):
            logger.error("Reboot safety checks failed - aborting reboot")
            return

        # Save pre-reboot state
        reboot_id = self.save_reboot_state(reason)

        if REBOOT_ENABLED:
            logger.critical("Initiating system reboot in 10 seconds...")
            time.sleep(10)  # Grace period

            try:
                # Execute reboot
                subprocess.run(['sudo', 'reboot'], timeout=5)
            except Exception as e:
                logger.error(f"Reboot command failed: {e}")
                logger.critical("MANUAL REBOOT REQUIRED")
        else:
            logger.critical("REBOOT DISABLED - Manual intervention required")
            logger.critical(f"Reboot would be triggered for: {reason}")
            logger.critical("Enable reboots by setting SELF_HEALING_REBOOT_ENABLED=true")

    def perform_reboot_safety_checks(self, reason: str) -> bool:
        """Perform safety checks before initiating reboot"""
        logger.info("Performing reboot safety checks...")

        # Check 1: Verify reboot is not due to a bug (too frequent reboots)
        try:
            recent_reboots_query = """
                SELECT COUNT(*) FROM reboot_events
                WHERE timestamp >= NOW() - INTERVAL '1 hour'
            """
            conn = None
            try:
                conn = self.get_connection()
                result = conn.cursor()
                result.execute(recent_reboots_query)
                recent_count = result.fetchone()[0]
                result.close()

                if recent_count >= 3:
                    logger.error(f"Safety check failed: {recent_count} reboots in last hour (max 2)")
                    self.log_event(
                        'reboot_safety_check_failed',
                        'CRITICAL',
                        f'Too many recent reboots: {recent_count} in last hour',
                        'Reboot aborted - possible reboot loop',
                        None,
                        False
                    )
                    return False
            finally:
                if conn:
                    self.release_connection(conn)

        except Exception as e:
            logger.warning(f"Failed to check recent reboots: {e}")

        # Check 2: Verify database is accessible (to save state)
        try:
            conn = None
            try:
                test_query = "SELECT 1"
                conn = self.get_connection()
                cursor = conn.cursor()
                cursor.execute(test_query)
                cursor.fetchone()
                cursor.close()
            finally:
                if conn:
                    self.release_connection(conn)
        except Exception as e:
            logger.error(f"Safety check failed: Database not accessible - {e}")
            return False

        # Check 3: Check if critical update is in progress
        try:
            update_state_file = '/arasul/updates/update_state.json'
            if os.path.exists(update_state_file):
                with open(update_state_file, 'r') as f:
                    update_state = json.load(f)
                    if update_state.get('status') == 'in_progress':
                        logger.error("Safety check failed: Update in progress")
                        return False
        except Exception as e:
            logger.warning(f"Failed to check update state: {e}")

        # Check 4: Verify sufficient disk space for logs
        try:
            disk = psutil.disk_usage('/')
            if disk.percent >= 98:
                logger.error("Safety check failed: Disk almost full (98%+)")
                # Still allow reboot if reason is disk-related
                if 'disk' not in reason.lower():
                    return False
        except Exception as e:
            logger.warning(f"Failed to check disk space: {e}")

        # Check 5: Wait for any active workflows to complete
        try:
            active_workflows_query = """
                SELECT COUNT(*) FROM workflow_activity
                WHERE status = 'running'
                AND timestamp >= NOW() - INTERVAL '5 minutes'
            """
            conn = None
            try:
                conn = self.get_connection()
                result = conn.cursor()
                result.execute(active_workflows_query)
                active_count = result.fetchone()[0]
                result.close()

                if active_count > 0:
                    logger.warning(f"Active workflows detected: {active_count}. Waiting 30s...")
                    time.sleep(30)
            finally:
                if conn:
                    self.release_connection(conn)
        except Exception as e:
            logger.warning(f"Failed to check active workflows: {e}")

        logger.info("All reboot safety checks passed")
        return True

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

    # ========================================================================
    # DISK MANAGEMENT
    # ========================================================================

    def check_disk_usage(self):
        """Monitor disk usage and trigger appropriate actions"""
        try:
            disk = psutil.disk_usage('/')
            percent = disk.percent

            if percent >= DISK_REBOOT:
                logger.critical(f"Disk usage critical for reboot: {percent}%")
                self.handle_category_d_reboot(f"Disk usage at {percent}%")

            elif percent >= DISK_CRITICAL:
                logger.critical(f"Disk usage critical: {percent}%")
                self.log_event(
                    'disk_critical',
                    'CRITICAL',
                    f'Disk usage at {percent}%',
                    'Performing emergency cleanup',
                    None,
                    True
                )
                self.perform_disk_cleanup()

            elif percent >= DISK_CLEANUP:
                logger.warning(f"Disk usage high: {percent}% - starting cleanup")
                self.perform_disk_cleanup()

            elif percent >= DISK_WARNING:
                logger.warning(f"Disk usage warning: {percent}%")

        except Exception as e:
            logger.error(f"Failed to check disk usage: {e}")

    # ========================================================================
    # HEARTBEAT & MONITORING
    # ========================================================================

    def update_heartbeat(self):
        """Update heartbeat file for health check monitoring"""
        try:
            heartbeat_data = {
                'timestamp': datetime.now().isoformat(),
                'check_count': self.check_count,
                'last_action': self.last_action,
            }

            heartbeat_file = '/tmp/self_healing_heartbeat.json'
            with open(heartbeat_file, 'w') as f:
                json.dump(heartbeat_data, f)

            self.check_count += 1

        except Exception as e:
            logger.warning(f"Failed to update heartbeat: {e}")

    # ========================================================================
    # MAIN HEALING CYCLE
    # ========================================================================

    def handle_gpu_errors(self):
        """Handle GPU-specific errors and recovery"""
        if not self.gpu_recovery:
            return

        try:
            # Detect GPU errors
            has_error, error_type, error_msg = self.gpu_recovery.detect_gpu_error()

            if not has_error:
                return

            # Log GPU error event
            severity = 'CRITICAL' if error_type in ['critical_health', 'gpu_hang'] else 'WARNING'
            self.log_event(
                'gpu_error_detected',
                severity,
                f'GPU Error: {error_type}',
                error_msg or 'GPU error detected',
                'llm-service',
                True
            )

            # Get recovery recommendation
            action = self.gpu_recovery.recommend_recovery_action(error_type)

            logger.warning(f"GPU Error: {error_type} - Action: {action.value}")

            # Execute recovery action
            start_time = time.time()
            success = self.gpu_recovery.execute_recovery(action)
            duration_ms = int((time.time() - start_time) * 1000)

            # Map GPU recovery action to our recovery action types
            action_type_map = {
                'clear_cache': 'llm_cache_clear',
                'reset_session': 'gpu_session_reset',
                'throttle': 'gpu_throttle',
                'reset_gpu': 'gpu_reset',
                'restart_llm': 'service_restart',
                'stop_llm': 'service_restart'
            }

            action_type = action_type_map.get(action.value, 'gpu_reset')

            # Record recovery action
            self.record_recovery_action(
                action_type,
                'llm-service',
                f'GPU {error_type}',
                success,
                duration_ms
            )

            # Log result
            if success:
                self.log_event(
                    'gpu_recovery_success',
                    'INFO',
                    f'GPU recovery successful: {action.value}',
                    f'Recovered from {error_type} in {duration_ms}ms',
                    'llm-service',
                    True
                )
            else:
                self.log_event(
                    'gpu_recovery_failed',
                    'ERROR',
                    f'GPU recovery failed: {action.value}',
                    f'Failed to recover from {error_type}',
                    'llm-service',
                    False
                )

        except Exception as e:
            logger.error(f"Error in GPU error handling: {e}")

    def run_healing_cycle(self):
        """Main healing cycle - executed every HEALING_INTERVAL seconds"""
        logger.debug("Running healing cycle")

        try:
            # Update heartbeat at start of cycle
            self.update_heartbeat()

            # Get metrics
            metrics = self.get_metrics()
            
            # Handle metrics failure
            if metrics is None:
                if self.metrics_down_since is None:
                    self.metrics_down_since = time.time()
                    logger.warning("Metrics collection failed - entering warning state")
                
                # Check if down for too long (> 1 minute)
                elif time.time() - self.metrics_down_since > 60:
                    logger.error("Metrics collector down for > 1 minute - attempting restart")
                    try:
                        container = self.docker_client.containers.get('metrics-collector')
                        container.restart()
                        self.metrics_down_since = time.time()  # Reset timer to give it time to come up
                        self.log_event(
                            'metrics_recovery',
                            'WARNING',
                            'Metrics collector down > 1min',
                            'Restarted metrics-collector',
                            'metrics-collector',
                            True
                        )
                    except Exception as e:
                        logger.error(f"Failed to restart metrics-collector: {e}")
                
                # Skip category B checks as we have no metrics
                metrics = {} # Empty dict to avoid errors in other checks if they don't check for None
            else:
                # Metrics healthy
                if self.metrics_down_since is not None:
                    logger.info("Metrics collection recovered")
                    self.metrics_down_since = None

            # GPU Error Handling (check GPU health first)
            self.handle_gpu_errors()

            # Check disk usage first (most critical)
            self.check_disk_usage()

            # Check service health
            services = self.check_service_health()

            # Category A: Check for unhealthy services
            for service_name, service_info in services.items():
                # Skip self-healing-agent to prevent restart loops
                if service_name == 'self-healing-agent':
                    continue

                # Skip Store apps that were intentionally stopped
                if self.is_store_app_intentionally_stopped(service_name):
                    logger.debug(f"Skipping {service_name} - Store app intentionally stopped")
                    continue

                if service_info['health'] == 'unhealthy':
                    self.handle_category_a_service_down(
                        service_name,
                        service_info['container']
                    )

            # Category B: Check for overload conditions
            if metrics:
                self.handle_category_b_overload(metrics)

            # Periodic cleanup (every 100 cycles = ~16 minutes at 10s interval)
            if self.check_count % 100 == 0 and self.check_count > 0:
                logger.info("Running periodic cleanup (every 100 cycles)")
                self.execute_query("SELECT cleanup_service_failures()")

        except Exception as e:
            logger.error(f"Error in healing cycle: {e}")


def main():
    """Main entry point"""
    logger.info("=" * 60)
    logger.info("ARASUL SELF-HEALING ENGINE v2.0")
    logger.info("=" * 60)
    logger.info(f"Healing interval: {HEALING_INTERVAL} seconds")
    logger.info(f"Self-healing enabled: {ENABLED}")
    logger.info(f"Reboot enabled: {REBOOT_ENABLED}")
    logger.info(f"Failure window: {FAILURE_WINDOW_MINUTES} minutes")
    logger.info(f"Max failures in window: {MAX_FAILURES_IN_WINDOW}")
    logger.info("=" * 60)

    if not ENABLED:
        logger.warning("Self-healing is DISABLED - monitoring only mode")

    # Run post-reboot validation if needed
    logger.info("Checking for pending reboot validation...")
    try:
        import post_reboot_validation
        post_reboot_validation.main()
    except Exception as e:
        logger.warning(f"Post-reboot validation check failed (this is normal on first start): {e}")

    engine = SelfHealingEngine()

    # Log startup
    engine.log_event(
        'engine_started',
        'INFO',
        'Self-Healing Engine v2.0 started successfully',
        'Monitoring all services with advanced failure tracking',
        None,
        True
    )

    cycle_count = 0
    try:
        while True:
            try:
                if ENABLED:
                    engine.run_healing_cycle()
                    cycle_count += 1
                else:
                    logger.debug("Healing cycle skipped (disabled)")

                time.sleep(HEALING_INTERVAL)

            except KeyboardInterrupt:
                logger.info("Self-Healing Engine stopped by user")
                engine.log_event(
                    'engine_stopped',
                    'INFO',
                    'Self-Healing Engine stopped by user',
                    f'Completed {cycle_count} healing cycles',
                    None,
                    True
                )
                break
            except Exception as e:
                logger.error(f"Unexpected error in main loop: {e}")
                time.sleep(HEALING_INTERVAL)
    finally:
        # HIGH-013 FIX: Gracefully close connection pool with proper error handling
        logger.info("Shutting down Self-Healing Engine...")
        try:
            logger.info("Closing database connection pool...")
            engine.close_pool()

            # Give connections time to close gracefully
            logger.debug("Waiting for connections to close...")
            time.sleep(1)

            logger.info("Connection pool closed successfully")
        except Exception as e:
            logger.error(f"Error closing connection pool: {e}")
            logger.warning("Some database connections may not have closed cleanly")

        logger.info("Self-Healing Engine shutdown complete")


if __name__ == '__main__':
    main()
