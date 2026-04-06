#!/usr/bin/env python3
"""
ARASUL PLATFORM - Self-Healing Engine
Autonomous service monitoring and recovery with advanced failure tracking.

Architecture: Composed via mixins from:
  - db.py: Database connection pooling, query execution, event tracking
  - recovery_actions.py: Concrete recovery primitives (cache clear, GPU reset, etc.)
  - category_handlers.py: Escalation handlers (Categories A-D)
"""

import time
import json
import requests
from datetime import datetime
from typing import Dict

from config import (
    HEALING_INTERVAL, ENABLED, REBOOT_ENABLED, EXCLUDED_CONTAINERS,
    FAILURE_WINDOW_MINUTES, MAX_FAILURES_IN_WINDOW, CRITICAL_WINDOW_MINUTES,
    METRICS_COLLECTOR_URL, logger
)
from db import DatabaseMixin
from recovery_actions import RecoveryActionsMixin
from category_handlers import CategoryHandlersMixin

# Import GPU Recovery Module
try:
    from gpu_recovery import GPURecovery, GPURecoveryAction
    GPU_RECOVERY_AVAILABLE = True
except ImportError:
    GPU_RECOVERY_AVAILABLE = False


class SelfHealingEngine(DatabaseMixin, RecoveryActionsMixin, CategoryHandlersMixin):
    """Advanced self-healing engine with database-backed failure tracking and connection pooling"""

    def __init__(self):
        self.docker_client = __import__('docker').from_env()
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

        # State tracking
        self.metrics_down_since = None
        self._tailscale_was_connected = None
        self._temp_history = []
        self._temp_throttle_armed = True
        self._temp_restart_armed = True
        self.last_critical_action_time = 0

        logger.info("Self-Healing Engine initialized")

    # ========================================================================
    # MONITORING
    # ========================================================================

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

                try:
                    inspect = container.attrs
                    if 'Health' in inspect.get('State', {}):
                        health = inspect['State']['Health']['Status']
                except Exception as e:
                    logger.debug(f"Non-critical error reading health for {name}: {e}")

                services_status[name] = {
                    'status': status,
                    'health': health,
                    'container': container
                }

        except Exception as e:
            logger.error(f"Failed to check services: {e}")

        return services_status

    def update_heartbeat(self):
        """Update heartbeat file for health check monitoring"""
        try:
            heartbeat_data = {
                'timestamp': datetime.now().isoformat(),
                'check_count': self.check_count,
                'last_action': self.last_action,
            }

            with open('/tmp/self_healing_heartbeat.json', 'w') as f:
                json.dump(heartbeat_data, f)

            self.check_count += 1

        except Exception as e:
            logger.warning(f"Failed to update heartbeat: {e}")

    def handle_gpu_errors(self):
        """Handle GPU-specific errors and recovery"""
        if not self.gpu_recovery:
            return

        try:
            has_error, error_type, error_msg = self.gpu_recovery.detect_gpu_error()

            if not has_error:
                return

            severity = 'CRITICAL' if error_type in ['critical_health', 'gpu_hang'] else 'WARNING'
            self.log_event(
                'gpu_error_detected', severity,
                f'GPU Error: {error_type}',
                error_msg or 'GPU error detected',
                'llm-service', True
            )

            action = self.gpu_recovery.recommend_recovery_action(error_type)
            logger.warning(f"GPU Error: {error_type} - Action: {action.value}")

            start_time = time.time()
            success = self.gpu_recovery.execute_recovery(action)
            duration_ms = int((time.time() - start_time) * 1000)

            action_type_map = {
                'clear_cache': 'llm_cache_clear',
                'reset_session': 'gpu_session_reset',
                'throttle': 'gpu_throttle',
                'reset_gpu': 'gpu_reset',
                'restart_llm': 'service_restart',
                'stop_llm': 'service_restart'
            }
            action_type = action_type_map.get(action.value, 'gpu_reset')

            self.record_recovery_action(action_type, 'llm-service', f'GPU {error_type}', success, duration_ms)

            if success:
                self.log_event(
                    'gpu_recovery_success', 'INFO',
                    f'GPU recovery successful: {action.value}',
                    f'Recovered from {error_type} in {duration_ms}ms',
                    'llm-service', True
                )
            else:
                self.log_event(
                    'gpu_recovery_failed', 'ERROR',
                    f'GPU recovery failed: {action.value}',
                    f'Failed to recover from {error_type}',
                    'llm-service', False
                )

        except Exception as e:
            logger.error(f"Error in GPU error handling: {e}")

    def check_tailscale_health(self, metrics: Dict):
        """Monitor Tailscale VPN connectivity and attempt recovery if it drops."""
        ts = metrics.get('tailscale')
        if ts is None or not ts.get('installed'):
            return

        connected = ts.get('connected', False)

        if self._tailscale_was_connected is True and not connected:
            logger.warning("Tailscale VPN connection lost")
            self.log_event(
                'tailscale_disconnected', 'WARNING',
                'Tailscale VPN connection lost unexpectedly',
                'Logged warning - manual reconnection may be required',
                'tailscale', True
            )

        if self._tailscale_was_connected is False and connected:
            logger.info(f"Tailscale VPN reconnected (IP: {ts.get('ip')})")
            self.log_event(
                'tailscale_reconnected', 'INFO',
                f"Tailscale VPN reconnected (IP: {ts.get('ip')})",
                'Connection restored', 'tailscale', True
            )

        self._tailscale_was_connected = connected

    # ========================================================================
    # MAIN HEALING CYCLE
    # ========================================================================

    def run_healing_cycle(self):
        """Main healing cycle - executed every HEALING_INTERVAL seconds"""
        logger.debug("Running healing cycle")

        try:
            self.update_heartbeat()

            metrics = self.get_metrics()

            # Handle metrics failure
            if metrics is None:
                if self.metrics_down_since is None:
                    self.metrics_down_since = time.time()
                    logger.warning("Metrics collection failed - entering warning state")
                elif time.time() - self.metrics_down_since > 60:
                    logger.error("Metrics collector down for > 1 minute - attempting restart")
                    try:
                        container = self.docker_client.containers.get('metrics-collector')
                        container.restart()
                        self.metrics_down_since = time.time()
                        self.log_event(
                            'metrics_recovery', 'WARNING',
                            'Metrics collector down > 1min',
                            'Restarted metrics-collector',
                            'metrics-collector', True
                        )
                    except Exception as e:
                        logger.error(f"Failed to restart metrics-collector: {e}")

                metrics = {}
            else:
                if self.metrics_down_since is not None:
                    logger.info("Metrics collection recovered")
                    self.metrics_down_since = None

            # GPU Error Handling
            self.handle_gpu_errors()

            # Check disk usage first (most critical)
            self.check_disk_usage()

            # Check service health
            services = self.check_service_health()

            # Category A: Check for unhealthy services
            for service_name, service_info in services.items():
                if service_name == 'self-healing-agent':
                    continue
                if service_name in EXCLUDED_CONTAINERS:
                    continue
                if service_info['status'] == 'exited' and self.is_store_app_intentionally_stopped(service_name):
                    logger.debug(f"Skipping {service_name} - Store app intentionally stopped")
                    continue

                if service_info['health'] == 'unhealthy':
                    self.handle_category_a_service_down(service_name, service_info['container'])

            # Category B: Check for overload conditions
            if metrics:
                self.handle_category_b_overload(metrics)

            # Tailscale VPN monitoring (every 6 cycles = ~1 min)
            if self.check_count % 6 == 0 and metrics:
                self.check_tailscale_health(metrics)

            # Periodic cleanup (every 100 cycles = ~16 minutes)
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

    engine.log_event(
        'engine_started', 'INFO',
        'Self-Healing Engine v2.0 started successfully',
        'Monitoring all services with advanced failure tracking',
        None, True
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
                    'engine_stopped', 'INFO',
                    'Self-Healing Engine stopped by user',
                    f'Completed {cycle_count} healing cycles',
                    None, True
                )
                break
            except Exception as e:
                logger.error(f"Unexpected error in main loop: {e}")
                time.sleep(HEALING_INTERVAL)
    finally:
        logger.info("Shutting down Self-Healing Engine...")
        try:
            logger.info("Closing database connection pool...")
            engine.close_pool()
            logger.debug("Waiting for connections to close...")
            time.sleep(1)
            logger.info("Connection pool closed successfully")
        except Exception as e:
            logger.error(f"Error closing connection pool: {e}")
            logger.warning("Some database connections may not have closed cleanly")

        logger.info("Self-Healing Engine shutdown complete")


if __name__ == '__main__':
    main()
