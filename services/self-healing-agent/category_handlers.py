"""
ARASUL PLATFORM - Self-Healing Category Handlers
Escalation handlers for categories A-D: service down, overload, critical, reboot.
"""

import os
import time
import json
import subprocess
import psutil
import psycopg2
from datetime import datetime
from typing import Dict

from config import (
    REBOOT_ENABLED, MAX_REBOOTS_PER_HOUR, MAX_FAILURES_IN_WINDOW,
    FAILURE_WINDOW_MINUTES, CRITICAL_WINDOW_MINUTES, MAX_CRITICAL_EVENTS,
    CPU_OVERLOAD_THRESHOLD, RAM_OVERLOAD_THRESHOLD, GPU_OVERLOAD_THRESHOLD,
    TEMP_THROTTLE_THRESHOLD, TEMP_RESTART_THRESHOLD, TEMP_SHUTDOWN_THRESHOLD,
    TEMP_THROTTLE_REARM, TEMP_RESTART_REARM, TEMP_SHUTDOWN_REARM,
    TEMP_HISTORY_SIZE, DISK_WARNING, DISK_CLEANUP,
    DISK_CRITICAL, DISK_REBOOT, logger
)


class CategoryHandlersMixin:
    """Category A-D handler mixin for SelfHealingEngine"""

    # Restart backoff delays per attempt (exponential: 10s, 30s, 60s, 120s)
    RESTART_BACKOFF_DELAYS = [10, 30, 60, 120]

    # Max restarts per service in a 30-minute window before entering alert-only mode
    MAX_RESTARTS_PER_30MIN = 5

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)

    def _get_restart_backoff(self, failure_count: int) -> int:
        """Get backoff delay in seconds based on failure count"""
        idx = min(failure_count - 1, len(self.RESTART_BACKOFF_DELAYS) - 1)
        return self.RESTART_BACKOFF_DELAYS[max(0, idx)]

    def _notify_quarantine(self, service_name: str) -> None:
        """Fire a Telegram alert when a service enters restart-rate-limit quarantine.

        Dedup by _last_quarantine_notified so the admin isn't spammed every
        ~10s healing cycle while the service stays in quarantine.
        """
        now = time.time()
        last = self._last_quarantine_notified.get(service_name, 0)
        if now - last < self._quarantine_notify_interval_seconds:
            return
        self._last_quarantine_notified[service_name] = now

        try:
            self.record_notification_event(
                event_type='self_healing',
                event_category='quarantine',
                source_service=service_name,
                severity='critical',
                title=f'Service {service_name} in Quarantine',
                message=(
                    f'{service_name} hat in den letzten 30 Minuten '
                    f'{self.MAX_RESTARTS_PER_30MIN}+ Neustarts versucht und '
                    f'wurde in den Alert-Only-Modus versetzt. '
                    f'Manueller Eingriff erforderlich.'
                ),
                metadata={
                    'service_name': service_name,
                    'max_restarts_per_30min': self.MAX_RESTARTS_PER_30MIN,
                    'quarantine_mode': 'alert_only',
                },
            )
            logger.warning(f"Quarantine notification queued for {service_name}")
        except Exception as e:
            logger.error(f"Failed to queue quarantine notification for {service_name}: {e}")

    def _is_restart_rate_limited(self, service_name: str) -> bool:
        """Check if service has exceeded max restarts in 30min window"""
        try:
            rows = self.execute_query(
                "SELECT COUNT(*) FROM recovery_actions "
                "WHERE service_name = %s AND action_type = 'service_restart' "
                "AND timestamp >= NOW() - INTERVAL '30 minutes'",
                (service_name,), fetch_all=True
            )
            count = rows[0][0] if rows else 0
            if count >= self.MAX_RESTARTS_PER_30MIN:
                logger.error(
                    f"Service {service_name} hit restart rate limit: "
                    f"{count}/{self.MAX_RESTARTS_PER_30MIN} restarts in 30min — alert only"
                )
                return True
            return False
        except Exception:
            return False

    # ========================================================================
    # CATEGORY A: SERVICE DOWN
    # ========================================================================

    def handle_category_a_service_down(self, service_name: str, container):
        """Category A: Service Down - tiered restart strategies with exponential backoff"""

        if self.should_record_failure(service_name):
            self.record_failure(service_name, 'unhealthy', 'down')

        if self.is_in_cooldown(service_name):
            logger.warning(f"Service {service_name} is in cooldown, skipping recovery")
            return

        # Rate limit check: max 5 restarts in 30min, then alert-only
        if self._is_restart_rate_limited(service_name):
            self.log_event(
                'service_restart_rate_limited', 'CRITICAL',
                f'{service_name} exceeded {self.MAX_RESTARTS_PER_30MIN} restarts in 30min',
                'Entering alert-only mode — manual intervention required',
                service_name, False
            )
            self._notify_quarantine(service_name)
            return

        failure_count = self.get_failure_count(service_name)
        backoff = self._get_restart_backoff(failure_count)
        logger.warning(
            f"Service {service_name} unhealthy (failures: {failure_count}, backoff: {backoff}s)"
        )

        start_time = time.time()

        try:
            if failure_count == 1:
                logger.info(f"Attempting restart of {service_name} (attempt 1/3, wait {backoff}s)")
                container.restart()
                time.sleep(backoff)
                container.reload()
                is_running = container.status == 'running'
                duration_ms = int((time.time() - start_time) * 1000)

                self.log_event(
                    'service_restart', 'WARNING',
                    f'{service_name} unhealthy, performing restart (running={is_running})',
                    f'container.restart() + {backoff}s backoff', service_name, is_running
                )
                self.record_recovery_action(
                    'service_restart', service_name,
                    f'Health check failed (1/{MAX_FAILURES_IN_WINDOW})',
                    is_running, duration_ms
                )

            elif failure_count == 2:
                logger.info(f"Attempting stop+start of {service_name} (attempt 2/3, wait {backoff}s)")
                container.stop(timeout=10)
                time.sleep(2)
                container.start()
                time.sleep(backoff)
                container.reload()
                is_running = container.status == 'running'
                duration_ms = int((time.time() - start_time) * 1000)

                self.log_event(
                    'service_stop_start', 'WARNING',
                    f'{service_name} still unhealthy, performing stop+start',
                    f'container.stop()+start() + {backoff}s backoff', service_name, True
                )
                self.record_recovery_action(
                    'service_restart', service_name,
                    f'Health check failed after restart (2/{MAX_FAILURES_IN_WINDOW})',
                    True, duration_ms
                )

            elif failure_count >= MAX_FAILURES_IN_WINDOW:
                logger.error(
                    f"Service {service_name} failed {failure_count} times in "
                    f"{FAILURE_WINDOW_MINUTES}min window, escalating"
                )
                self.log_event(
                    'service_escalation', 'CRITICAL',
                    f'{service_name} failed {failure_count} times, escalating to hard recovery',
                    'Triggering Category C recovery', service_name, True
                )
                self.handle_category_c_critical(
                    f"Service {service_name} failed {failure_count} times in {FAILURE_WINDOW_MINUTES} minutes"
                )

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(f"Failed to recover {service_name}: {e}")
            self.log_event(
                'service_recovery_failed', 'CRITICAL',
                f'Failed to recover {service_name}: {str(e)}',
                'Escalating to critical', service_name, False
            )
            self.record_recovery_action(
                'service_restart', service_name,
                f'Recovery attempt failed: {str(e)}',
                False, duration_ms, str(e)
            )

    # ========================================================================
    # CATEGORY B: OVERLOAD
    # ========================================================================

    def handle_category_b_overload(self, metrics: Dict):
        """Category B: System Overload - automated resource management"""
        current_time = time.time()

        cpu = metrics.get('cpu', 0)
        ram = metrics.get('ram', 0)
        gpu = metrics.get('gpu', 0)
        temp = metrics.get('temperature', 0)

        # CPU Overload
        if cpu > CPU_OVERLOAD_THRESHOLD:
            action_key = 'cpu_overload'
            last_action = self.last_overload_actions.get(action_key, 0)
            if current_time - last_action > 300:
                logger.warning(f"CPU overload detected: {cpu}% - clearing LLM cache")
                success = self.clear_llm_cache()
                self.log_event(
                    'cpu_overload', 'WARNING', f'CPU usage at {cpu}%',
                    'Cleared LLM cache' if success else 'Failed to clear cache',
                    'llm-service', success
                )
                self.record_recovery_action('llm_cache_clear', 'llm-service', f'CPU overload: {cpu}%', success)
                self.last_overload_actions[action_key] = current_time

        # RAM Overload
        if ram > RAM_OVERLOAD_THRESHOLD:
            action_key = 'ram_overload'
            last_action = self.last_overload_actions.get(action_key, 0)
            if current_time - last_action > 300:
                logger.warning(f"RAM overload detected: {ram}% - restarting n8n")
                success = self.pause_n8n_workflows()
                self.log_event(
                    'ram_overload', 'WARNING', f'RAM usage at {ram}%',
                    'Restarted n8n to free memory' if success else 'Failed to free memory',
                    'n8n', success
                )
                self.record_recovery_action('service_restart', 'n8n', f'RAM overload: {ram}%', success)
                self.last_overload_actions[action_key] = current_time

        # GPU Overload
        if gpu > GPU_OVERLOAD_THRESHOLD:
            action_key = 'gpu_overload'
            last_action = self.last_overload_actions.get(action_key, 0)
            if current_time - last_action > 300:
                logger.warning(f"GPU overload detected: {gpu}% - resetting GPU session")
                success = self.reset_gpu_session()
                self.log_event(
                    'gpu_overload', 'CRITICAL', f'GPU usage at {gpu}%',
                    'Reset GPU session' if success else 'Failed to reset session',
                    'llm-service', success
                )
                self.record_recovery_action('gpu_session_reset', 'llm-service', f'GPU overload: {gpu}%', success)
                self.last_overload_actions[action_key] = current_time

        # Temperature Management with hysteresis and sliding window average
        self._temp_history.append(temp)
        if len(self._temp_history) > TEMP_HISTORY_SIZE:
            self._temp_history.pop(0)
        avg_temp = sum(self._temp_history) / len(self._temp_history)

        # Re-arm hysteresis
        if avg_temp < TEMP_SHUTDOWN_REARM:
            if not getattr(self, '_temp_shutdown_armed', True):
                logger.info(f"Temperature dropped to {avg_temp:.1f}°C - shutdown action re-armed")
                self._temp_shutdown_armed = True
        if avg_temp < TEMP_RESTART_REARM:
            if not self._temp_restart_armed:
                logger.info(f"Temperature dropped to {avg_temp:.1f}°C - restart action re-armed")
                self._temp_restart_armed = True
        if avg_temp < TEMP_THROTTLE_REARM:
            if not self._temp_throttle_armed:
                logger.info(f"Temperature dropped to {avg_temp:.1f}°C - throttle action re-armed")
                self._temp_throttle_armed = True

        # Emergency thermal shutdown: stop LLM completely at 90°C+
        # Restart alone can't help — GPU stays hot. Must fully stop until cooldown.
        if avg_temp > TEMP_SHUTDOWN_THRESHOLD and getattr(self, '_temp_shutdown_armed', True):
            action_key = 'temp_shutdown'
            last_action = self.last_overload_actions.get(action_key, 0)
            if current_time - last_action > 600:
                logger.critical(f"EMERGENCY: {avg_temp:.1f}°C (raw: {temp}°C) — stopping LLM service")
                self._temp_shutdown_armed = False
                try:
                    container = self.docker_client.containers.get('llm-service')
                    container.stop(timeout=30)
                    success = True
                except Exception as e:
                    logger.error(f"Failed to stop LLM service: {e}")
                    success = False

                self.log_event(
                    'thermal_emergency', 'CRITICAL',
                    f'Emergency thermal shutdown at {avg_temp:.1f}°C (threshold: {TEMP_SHUTDOWN_THRESHOLD}°C)',
                    'Stopped LLM service' if success else 'Failed to stop service',
                    'llm-service', success
                )
                self.record_recovery_action(
                    'service_stop', 'llm-service',
                    f'Emergency thermal shutdown: {avg_temp:.1f}°C', success
                )
                self.last_overload_actions[action_key] = current_time

        elif avg_temp > TEMP_RESTART_THRESHOLD and self._temp_restart_armed:
            action_key = 'temp_critical'
            last_action = self.last_overload_actions.get(action_key, 0)
            if current_time - last_action > 600:
                logger.critical(f"Critical temperature: {avg_temp:.1f}°C (raw: {temp}°C) - restarting LLM service")
                self._temp_restart_armed = False
                try:
                    container = self.docker_client.containers.get('llm-service')
                    container.restart()
                    success = True
                except Exception as e:
                    logger.error(f"Failed to restart LLM service: {e}")
                    success = False

                self.log_event(
                    'thermal_critical', 'CRITICAL',
                    f'System temperature at {avg_temp:.1f}°C avg (threshold: {TEMP_RESTART_THRESHOLD}°C)',
                    'Restarted LLM service' if success else 'Failed to restart service',
                    'llm-service', success
                )
                self.record_recovery_action(
                    'service_restart', 'llm-service',
                    f'Critical temperature: {avg_temp:.1f}°C', success
                )
                self.last_overload_actions[action_key] = current_time

        elif avg_temp > TEMP_THROTTLE_THRESHOLD and self._temp_throttle_armed:
            action_key = 'temp_throttle'
            last_action = self.last_overload_actions.get(action_key, 0)
            if current_time - last_action > 300:
                logger.warning(f"High temperature: {avg_temp:.1f}°C (raw: {temp}°C) - throttling GPU")
                self._temp_throttle_armed = False
                success = self.throttle_gpu()
                self.log_event(
                    'thermal_warning', 'WARNING',
                    f'System temperature at {avg_temp:.1f}°C avg (threshold: {TEMP_THROTTLE_THRESHOLD}°C)',
                    'Applied GPU throttling' if success else 'Failed to throttle GPU',
                    None, success
                )
                self.record_recovery_action('gpu_throttle', None, f'High temperature: {avg_temp:.1f}°C', success)
                self.last_overload_actions[action_key] = current_time

    # ========================================================================
    # CATEGORY C: CRITICAL ERRORS
    # ========================================================================

    def handle_category_c_critical(self, reason: str):
        """Category C: Critical Errors - aggressive recovery"""

        current_time = time.time()
        if current_time - self.last_critical_action_time < 3600:
            logger.warning(f"Category C recovery triggered but in cooldown (last action < 1h ago). Reason: {reason}")
            return

        logger.critical(f"CRITICAL EVENT: {reason}")

        self.log_event('critical_event', 'CRITICAL', reason, 'Initiating Category C recovery', None, True)

        critical_count = self.get_critical_events_count()
        logger.info(f"Critical events in last {CRITICAL_WINDOW_MINUTES}min: {critical_count}")

        logger.critical("Executing critical recovery sequence")

        # Step 1: Restart application services
        if not self.hard_restart_application_services():
            logger.error("Application restart failed — skipping disk cleanup to preserve images")
        else:
            time.sleep(5)
            # Step 2: Disk cleanup — only if restart succeeded (images are intact)
            self.perform_disk_cleanup()

        # Step 3: DB vacuum — run with statement timeout to avoid long locks
        self.perform_db_vacuum()

        # Step 4: GPU reset — only if the issue is GPU-related
        if 'gpu' in reason.lower() or 'llm' in reason.lower():
            # Wait for services to stabilize before resetting GPU
            time.sleep(10)
            self.perform_gpu_reset()

        self.last_critical_action_time = time.time()

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

    def _pause_active_jobs_for_reboot(self, reason: str):
        """Cancel or mark active LLM jobs as failed before reboot"""
        try:
            result = self.execute_query(
                """UPDATE llm_jobs SET status = 'failed', error = %s, updated_at = NOW()
                   WHERE status IN ('processing', 'pending')
                   RETURNING id""",
                (f'System reboot: {reason}',),
                fetch_all=True
            )
            count = len(result) if result else 0
            if count > 0:
                logger.info(f"Marked {count} active LLM jobs as failed before reboot")
        except Exception as e:
            logger.warning(f"Failed to pause active jobs before reboot: {e}")

    def handle_category_d_reboot(self, reason: str):
        """Category D: System Reboot - ultima ratio"""
        logger.critical(f"SYSTEM REBOOT TRIGGERED: {reason}")

        self.log_event(
            'system_reboot', 'EMERGENCY',
            f'System reboot triggered: {reason}',
            'Saving state and initiating reboot', None, True
        )

        if not self.perform_reboot_safety_checks(reason):
            logger.error("Reboot safety checks failed - aborting reboot")
            return

        reboot_id = self.save_reboot_state(reason)
        self._pause_active_jobs_for_reboot(reason)

        if REBOOT_ENABLED:
            logger.critical("Initiating system reboot in 10 seconds...")
            time.sleep(10)
            try:
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

        # Check 1: Too frequent reboots
        try:
            conn = None
            try:
                conn = self.get_connection()
                result = conn.cursor()
                result.execute(
                    "SELECT COUNT(*) FROM reboot_events WHERE timestamp >= NOW() - INTERVAL '1 hour'"
                )
                recent_count = result.fetchone()[0]
                result.close()

                if recent_count >= MAX_REBOOTS_PER_HOUR:
                    logger.error(f"Safety check failed: {recent_count} reboots in last hour (max {MAX_REBOOTS_PER_HOUR})")
                    self.log_event(
                        'reboot_safety_check_failed', 'CRITICAL',
                        f'Too many recent reboots: {recent_count} in last hour (limit: {MAX_REBOOTS_PER_HOUR})',
                        'Reboot aborted - possible reboot loop detected', None, False
                    )
                    return False
            finally:
                if conn:
                    self.release_connection(conn)
        except Exception as e:
            logger.warning(f"Failed to check recent reboots: {e}")

        # Check 2: Database accessible
        try:
            conn = None
            try:
                conn = self.get_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                cursor.close()
            finally:
                if conn:
                    self.release_connection(conn)
        except Exception as e:
            logger.error(f"Safety check failed: Database not accessible - {e}")
            return False

        # Check 3: No update in progress
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

        # Check 4: Sufficient disk space
        try:
            disk = psutil.disk_usage('/')
            if disk.percent >= 98:
                logger.error("Safety check failed: Disk almost full (98%+)")
                if 'disk' not in reason.lower():
                    return False
        except Exception as e:
            logger.warning(f"Failed to check disk space: {e}")

        # Check 5: Active workflows
        try:
            conn = None
            try:
                conn = self.get_connection()
                result = conn.cursor()
                result.execute(
                    "SELECT COUNT(*) FROM workflow_activity WHERE status = 'running' AND timestamp >= NOW() - INTERVAL '5 minutes'"
                )
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
                    'disk_critical', 'CRITICAL',
                    f'Disk usage at {percent}%',
                    'Performing emergency cleanup', None, True
                )
                self.perform_disk_cleanup()

            elif percent >= DISK_CLEANUP:
                logger.warning(f"Disk usage high: {percent}% - starting cleanup")
                self.perform_disk_cleanup()

            elif percent >= DISK_WARNING:
                logger.warning(f"Disk usage warning: {percent}%")

        except Exception as e:
            logger.error(f"Failed to check disk usage: {e}")
