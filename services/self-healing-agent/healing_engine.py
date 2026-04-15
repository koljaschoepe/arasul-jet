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
import ssl
import subprocess
import psutil
import requests
from datetime import datetime
from typing import Dict, Optional

from config import (
    HEALING_INTERVAL, ENABLED, REBOOT_ENABLED, EXCLUDED_CONTAINERS,
    FAILURE_WINDOW_MINUTES, MAX_FAILURES_IN_WINDOW, CRITICAL_WINDOW_MINUTES,
    METRICS_COLLECTOR_URL, HEARTBEAT_URL, HEARTBEAT_INTERVAL_CYCLES, logger
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

        # MEM-TREND: Per-container memory samples for leak detection
        # Key: container_name, Value: list of (timestamp, rss_mb) tuples
        # Rolling 7-day window at 5-min intervals = max 2016 samples per container
        self._memory_samples: Dict = {}
        self._memory_max_samples = 2016  # 7 days at 5-min intervals

        logger.info("Self-Healing Engine initialized")

    # ========================================================================
    # MONITORING
    # ========================================================================

    def get_metrics(self) -> Dict:
        """Get current system metrics, falling back to psutil if metrics-collector is down."""
        try:
            response = requests.get(f"{METRICS_COLLECTOR_URL}/metrics", timeout=2)
            return response.json()
        except Exception as e:
            logger.warning(f"Metrics collector unreachable, using psutil fallback: {e}")
            return self._get_local_metrics()

    def _get_local_metrics(self) -> Optional[Dict]:
        """Fallback metrics via psutil when metrics-collector is unavailable."""
        try:
            mem = psutil.virtual_memory()
            temps = psutil.sensors_temperatures()
            # Find highest temperature across all sensors
            max_temp = 0
            for entries in temps.values():
                for entry in entries:
                    if entry.current > max_temp:
                        max_temp = entry.current
            return {
                'cpu': psutil.cpu_percent(interval=0.5),
                'ram': mem.percent,
                'temperature': max_temp,
                'gpu': 0,  # GPU metrics require tegrastats, not available via psutil
                '_fallback': True,
            }
        except Exception as e:
            logger.error(f"psutil fallback also failed: {e}")
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

    def sample_container_memory(self):
        """MEM-TREND: Sample RSS memory for all running containers"""
        try:
            now = time.time()
            containers = self.docker_client.containers.list()

            for container in containers:
                name = container.name
                try:
                    stats = container.stats(stream=False)
                    mem_stats = stats.get('memory_stats', {})
                    rss_bytes = mem_stats.get('usage', 0) - mem_stats.get('stats', {}).get('cache', 0)
                    rss_mb = max(0, rss_bytes / (1024 * 1024))

                    if name not in self._memory_samples:
                        self._memory_samples[name] = []

                    samples = self._memory_samples[name]
                    samples.append((now, rss_mb))

                    # Trim to rolling window
                    if len(samples) > self._memory_max_samples:
                        self._memory_samples[name] = samples[-self._memory_max_samples:]

                except Exception:
                    pass  # Container may have stopped between list and stats

            # Clean up samples for containers that no longer exist
            running_names = {c.name for c in containers}
            for name in list(self._memory_samples.keys()):
                if name not in running_names:
                    # Keep data for 1 hour after container stops (may restart)
                    samples = self._memory_samples[name]
                    if samples and (now - samples[-1][0]) > 3600:
                        del self._memory_samples[name]

        except Exception as e:
            logger.error(f"Memory sampling failed: {e}")

    def check_memory_trends(self):
        """MEM-TREND: Detect rising memory trends (potential leaks) over 24h+"""
        min_samples = 288  # At least 24h of data (at 5-min intervals)

        for name, samples in self._memory_samples.items():
            if len(samples) < min_samples:
                continue

            try:
                # Simple linear regression on the last 24h of samples
                recent = samples[-min_samples:]
                n = len(recent)
                t0 = recent[0][0]

                # Normalize timestamps to hours
                xs = [(s[0] - t0) / 3600 for s in recent]
                ys = [s[1] for s in recent]

                mean_x = sum(xs) / n
                mean_y = sum(ys) / n

                num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
                den = sum((xs[i] - mean_x) ** 2 for i in range(n))

                if den == 0:
                    continue

                slope_mb_per_hour = num / den

                # Alert if memory grows > 10 MB/hour sustained over 24h
                # and current usage is > 50% of what it started at
                if slope_mb_per_hour > 10 and ys[-1] > ys[0] * 1.5:
                    projected_24h = ys[-1] + slope_mb_per_hour * 24
                    logger.warning(
                        f"MEM-TREND: {name} leaking ~{slope_mb_per_hour:.1f} MB/h "
                        f"(now: {ys[-1]:.0f} MB, 24h projection: {projected_24h:.0f} MB)"
                    )
                    self.log_event(
                        'memory_trend', 'WARNING',
                        f'{name}: +{slope_mb_per_hour:.1f} MB/h over 24h '
                        f'(current: {ys[-1]:.0f} MB)',
                        'Potential memory leak — consider restart if trend continues',
                        name, False
                    )

            except Exception as e:
                logger.debug(f"Memory trend analysis failed for {name}: {e}")

    def send_external_heartbeat(self):
        """HEARTBEAT: POST to external Dead Man's Switch endpoint"""
        if not HEARTBEAT_URL:
            return

        try:
            import socket
            payload = {
                'device': socket.gethostname(),
                'timestamp': datetime.now().isoformat(),
                'check_count': self.check_count,
                'uptime_hours': round((time.time() - self.pool_stats['start_time']) / 3600, 1),
            }
            response = requests.post(
                HEARTBEAT_URL,
                json=payload,
                timeout=10,
                headers={'Content-Type': 'application/json'}
            )
            if response.status_code < 300:
                logger.debug(f"External heartbeat sent to {HEARTBEAT_URL}")
            else:
                logger.warning(f"External heartbeat returned {response.status_code}")
        except Exception as e:
            logger.warning(f"External heartbeat failed: {e}")

    def check_database_health(self):
        """DB-MON: Check PostgreSQL connection saturation and table bloat"""
        try:
            # Check active connections vs max_connections
            rows = self.execute_query(
                "SELECT count(*) AS active, "
                "(SELECT setting::int FROM pg_settings WHERE name='max_connections') AS max_conn "
                "FROM pg_stat_activity WHERE backend_type='client backend'",
                fetch=True
            )
            if rows:
                active, max_conn = rows[0][0], rows[0][1]
                utilization = active / max_conn if max_conn > 0 else 0
                if utilization > 0.8:
                    logger.warning(f"DB connection saturation: {active}/{max_conn} ({utilization:.0%})")
                    self.log_event(
                        'db_connections', 'WARNING',
                        f'Connection utilization {utilization:.0%} ({active}/{max_conn})',
                        'Monitor - may need max_connections increase',
                        'postgres-db', False
                    )
                # Check for long-running idle-in-transaction connections (>5 min)
                idle_rows = self.execute_query(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE state='idle in transaction' "
                    "AND state_change < now() - interval '5 minutes'",
                    fetch=True
                )
                if idle_rows and idle_rows[0][0] > 0:
                    logger.warning(f"DB: {idle_rows[0][0]} idle-in-transaction connections > 5 min")

            # Check table bloat (dead tuples > 50% of live)
            bloat_rows = self.execute_query(
                "SELECT schemaname || '.' || relname AS tbl, n_dead_tup, n_live_tup "
                "FROM pg_stat_user_tables "
                "WHERE n_live_tup > 0 AND n_dead_tup > 10000 "
                "AND (n_dead_tup::float / (n_live_tup + n_dead_tup)) > 0.5 "
                "ORDER BY n_dead_tup DESC LIMIT 5",
                fetch=True
            )
            if bloat_rows:
                tables = [f"{r[0]}({r[1]} dead)" for r in bloat_rows]
                logger.warning(f"DB table bloat detected: {', '.join(tables)}")
                self.log_event(
                    'db_bloat', 'WARNING',
                    f'High dead tuple ratio in: {", ".join(tables)}',
                    'Autovacuum may be falling behind',
                    'postgres-db', False
                )

            # XID wraparound check (critical for multi-year uptime)
            # PostgreSQL forces shutdown at 2^31 (~2.1B) XIDs without vacuum
            xid_rows = self.execute_query(
                "SELECT datname, age(datfrozenxid) AS xid_age "
                "FROM pg_database "
                "WHERE datallowconn "
                "ORDER BY xid_age DESC LIMIT 3",
                fetch=True
            )
            if xid_rows:
                for db_name, xid_age in xid_rows:
                    if xid_age > 1_200_000_000:  # ~56% of wraparound limit
                        logger.error(f"CRITICAL: DB {db_name} XID age {xid_age:,} — triggering VACUUM FREEZE")
                        try:
                            self.execute_query(f"VACUUM FREEZE")
                            self.log_event(
                                'db_xid_wraparound', 'CRITICAL',
                                f'Database {db_name} XID age {xid_age:,} — VACUUM FREEZE executed',
                                'Automatic VACUUM FREEZE triggered to prevent wraparound',
                                'postgres-db', True
                            )
                        except Exception as vac_err:
                            logger.error(f"VACUUM FREEZE failed: {vac_err}")
                            self.log_event(
                                'db_xid_wraparound', 'CRITICAL',
                                f'Database {db_name} XID age {xid_age:,} approaching wraparound',
                                f'VACUUM FREEZE failed: {vac_err}',
                                'postgres-db', False
                            )
                    elif xid_age > 500_000_000:  # ~23% of limit
                        logger.warning(f"DB {db_name} XID age {xid_age:,} — monitor autovacuum")
        except Exception as e:
            logger.error(f"Database health check failed: {e}")

    def check_tls_cert_expiry(self):
        """Check TLS certificate expiry and auto-renew if within 60 days"""
        try:
            cert_pem = ssl.get_server_certificate(('reverse-proxy', 443))
            # Use openssl to parse expiry date
            result = subprocess.run(
                ['openssl', 'x509', '-enddate', '-noout'],
                input=cert_pem, capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                # Format: notAfter=Mar 15 12:00:00 2036 GMT
                expiry_str = result.stdout.strip().replace('notAfter=', '')
                expiry = datetime.strptime(expiry_str, '%b %d %H:%M:%S %Y %Z')
                days_left = (expiry - datetime.utcnow()).days

                if days_left < 60:
                    severity = 'CRITICAL' if days_left < 30 else 'WARNING'
                    logger.warning(f"TLS certificate expires in {days_left} days — attempting auto-renewal")
                    renewed = self._renew_tls_cert()
                    self.log_event(
                        'tls_cert_renewal', severity,
                        f'TLS certificate expires in {days_left} days',
                        'Auto-renewed successfully' if renewed else 'Auto-renewal failed — manual action required',
                        'reverse-proxy', renewed
                    )
                    self.record_recovery_action(
                        'cert_renewal', 'reverse-proxy',
                        f'TLS cert expires in {days_left} days', renewed
                    )
                elif days_left < 90:
                    logger.info(f"TLS certificate expires in {days_left} days (renewal at <60 days)")
                else:
                    logger.debug(f"TLS certificate valid for {days_left} more days")
        except Exception as e:
            logger.debug(f"TLS cert check skipped: {e}")

    def _renew_tls_cert(self) -> bool:
        """Auto-renew self-signed TLS certificate and reload Traefik"""
        try:
            cert_script = '/arasul/scripts/security/generate_self_signed_cert.sh'
            if not os.path.exists(cert_script):
                logger.error(f"Cert renewal script not found: {cert_script}")
                return False

            # Run cert generation with FORCE_OVERWRITE
            env = os.environ.copy()
            env['FORCE_OVERWRITE'] = 'true'
            result = subprocess.run(
                ['bash', cert_script, '/arasul/config/traefik/certs'],
                capture_output=True, text=True, timeout=30, env=env
            )
            if result.returncode != 0:
                logger.error(f"Cert renewal script failed: {result.stderr}")
                return False

            logger.info("TLS certificate renewed, reloading Traefik...")

            # Reload Traefik to pick up the new certificate
            try:
                container = self.docker_client.containers.get('reverse-proxy')
                # Traefik watches its dynamic config dir — a restart ensures it picks up new certs
                container.restart(timeout=10)
                logger.info("Traefik restarted with new certificate")
            except Exception as e:
                logger.warning(f"Traefik restart failed (cert still renewed on disk): {e}")

            return True
        except Exception as e:
            logger.error(f"TLS cert renewal failed: {e}")
            return False

    def check_storage_wear(self, metrics: dict):
        """Check storage wear from metrics-collector data and alert if degraded"""
        try:
            wear = metrics.get('storage_wear') if metrics else None
            if not wear:
                return

            health = wear.get('health', 'ok')
            device = wear.get('device', 'unknown')
            spare = wear.get('spare_pct', '?')

            if health == 'critical':
                self.log_event(
                    'storage_wear_critical', 'CRITICAL',
                    f'Storage {device} spare at {spare}% — replacement needed',
                    'No automated action — hardware replacement required',
                    'storage', False
                )
            elif health == 'warning':
                self.log_event(
                    'storage_wear_warning', 'WARNING',
                    f'Storage {device} spare at {spare}% — plan replacement',
                    'Monitor closely — schedule maintenance window',
                    'storage', True
                )
            else:
                logger.debug(f"Storage wear OK: {device} spare at {spare}%")
        except Exception as e:
            logger.debug(f"Storage wear check failed: {e}")

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

            # External heartbeat / Dead Man's Switch
            if self.check_count % HEARTBEAT_INTERVAL_CYCLES == 0:
                self.send_external_heartbeat()

            # Tailscale VPN monitoring (every 6 cycles = ~1 min)
            if self.check_count % 6 == 0 and metrics:
                self.check_tailscale_health(metrics)

            # MEM-TREND: Sample container memory (every 30 cycles = ~5 minutes)
            if self.check_count % 30 == 0:
                self.sample_container_memory()

            # MEM-TREND: Analyze trends (every 360 cycles = ~1 hour)
            if self.check_count % 360 == 0 and self.check_count > 0:
                self.check_memory_trends()

            # Database health monitoring (every 60 cycles = ~10 minutes)
            if self.check_count % 60 == 0:
                self.check_database_health()

            # TLS certificate expiry check (every 720 cycles = ~2 hours)
            if self.check_count % 720 == 0:
                self.check_tls_cert_expiry()

            # Storage wear check (every 8640 cycles = ~24 hours)
            if self.check_count % 8640 == 0:
                self.check_storage_wear(metrics)

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
