"""
Self-Healing Agent - File Logger

Structured logging for self-healing events to /arasul/logs/self_healing.log
"""

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any


class SelfHealingLogger:
    """Logger for self-healing events with structured JSON output"""

    def __init__(self, log_dir: str = "/arasul/logs"):
        self.log_dir = Path(log_dir)
        self.log_file = self.log_dir / "self_healing.log"

        # Ensure log directory exists
        self.log_dir.mkdir(parents=True, exist_ok=True)

        # Also setup Python logging for console output
        self.console_logger = logging.getLogger("self-healing")
        self.console_logger.setLevel(logging.INFO)

        if not self.console_logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s [%(levelname)s] %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            handler.setFormatter(formatter)
            self.console_logger.addHandler(handler)

    def _write_event(
        self,
        event_type: str,
        severity: str,
        description: str,
        action_taken: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Write event to log file in JSON format"""
        event = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "event_type": event_type,
            "severity": severity,
            "description": description,
            "action_taken": action_taken or "None",
            "service": "self-healing-agent",
            "pid": os.getpid()
        }

        if metadata:
            event.update(metadata)

        try:
            with open(self.log_file, 'a') as f:
                f.write(json.dumps(event) + '\n')
        except Exception as e:
            self.console_logger.error(f"Failed to write to log file: {e}")

    def info(self, event_type: str, description: str, **metadata):
        """Log INFO level event"""
        self._write_event(event_type, "INFO", description, metadata=metadata)
        self.console_logger.info(f"[{event_type}] {description}")

    def warning(
        self,
        event_type: str,
        description: str,
        action_taken: Optional[str] = None,
        **metadata
    ):
        """Log WARNING level event"""
        self._write_event(
            event_type,
            "WARNING",
            description,
            action_taken,
            metadata
        )
        self.console_logger.warning(f"[{event_type}] {description}")
        if action_taken:
            self.console_logger.warning(f"  Action: {action_taken}")

    def critical(
        self,
        event_type: str,
        description: str,
        action_taken: Optional[str] = None,
        **metadata
    ):
        """Log CRITICAL level event"""
        self._write_event(
            event_type,
            "CRITICAL",
            description,
            action_taken,
            metadata
        )
        self.console_logger.critical(f"[{event_type}] {description}")
        if action_taken:
            self.console_logger.critical(f"  Action: {action_taken}")

    # Convenience methods for common events

    def service_down(
        self,
        service_name: str,
        health_check_failures: int,
        action_taken: str
    ):
        """Log service down event"""
        self.warning(
            "service_down",
            f"Service {service_name} health check failed",
            action_taken=action_taken,
            service_name=service_name,
            failures=health_check_failures
        )

    def service_restart(
        self,
        service_name: str,
        reason: str,
        success: bool,
        duration_ms: Optional[int] = None
    ):
        """Log service restart event"""
        if success:
            self.info(
                "service_restart",
                f"Service {service_name} restarted successfully",
                service_name=service_name,
                reason=reason,
                duration_ms=duration_ms
            )
        else:
            self.warning(
                "service_restart_failed",
                f"Service {service_name} restart failed",
                action_taken="Escalating to higher recovery tier",
                service_name=service_name,
                reason=reason
            )

    def resource_warning(
        self,
        resource_type: str,
        current_value: float,
        threshold: float,
        action_taken: str
    ):
        """Log resource threshold warning"""
        self.warning(
            "resource_threshold",
            f"{resource_type} at {current_value:.1f}% (threshold: {threshold}%)",
            action_taken=action_taken,
            resource_type=resource_type,
            current_value=current_value,
            threshold=threshold
        )

    def cpu_overload(self, cpu_percent: float, action_taken: str):
        """Log CPU overload"""
        self.resource_warning("CPU", cpu_percent, 90.0, action_taken)

    def ram_overload(self, ram_percent: float, action_taken: str):
        """Log RAM overload"""
        self.resource_warning("RAM", ram_percent, 95.0, action_taken)

    def gpu_overload(self, gpu_percent: float, action_taken: str):
        """Log GPU overload"""
        self.resource_warning("GPU", gpu_percent, 95.0, action_taken)

    def temperature_warning(self, temp_celsius: float, action_taken: str):
        """Log temperature warning"""
        self.warning(
            "temperature_warning",
            f"Temperature at {temp_celsius}°C (threshold: 85°C)",
            action_taken=action_taken,
            temperature=temp_celsius,
            threshold=85.0
        )

    def disk_warning(
        self,
        disk_percent: float,
        disk_free_gb: float,
        action_taken: str
    ):
        """Log disk space warning"""
        self.warning(
            "disk_space_warning",
            f"Disk at {disk_percent:.1f}% ({disk_free_gb:.1f}GB free)",
            action_taken=action_taken,
            disk_percent=disk_percent,
            disk_free_gb=disk_free_gb
        )

    def disk_cleanup(
        self,
        freed_mb: int,
        files_removed: int,
        directories_cleaned: list
    ):
        """Log disk cleanup action"""
        self.info(
            "disk_cleanup",
            f"Freed {freed_mb}MB by removing {files_removed} files",
            freed_mb=freed_mb,
            files_removed=files_removed,
            directories=directories_cleaned
        )

    def gpu_reset(self, reason: str, success: bool):
        """Log GPU reset"""
        if success:
            self.warning(
                "gpu_reset",
                "GPU reset successfully",
                action_taken="GPU driver reloaded",
                reason=reason
            )
        else:
            self.critical(
                "gpu_reset_failed",
                "GPU reset failed",
                action_taken="System reboot may be required",
                reason=reason
            )

    def database_recovery(self, action: str, success: bool, duration_ms: int):
        """Log database recovery attempt"""
        if success:
            self.warning(
                "database_recovery",
                f"Database recovered: {action}",
                action_taken=action,
                duration_ms=duration_ms
            )
        else:
            self.critical(
                "database_recovery_failed",
                f"Database recovery failed: {action}",
                action_taken="Manual intervention required",
                attempted_action=action
            )

    def system_reboot(self, reason: str, scheduled: bool):
        """Log system reboot event"""
        if scheduled:
            self.warning(
                "system_reboot_scheduled",
                f"System reboot scheduled: {reason}",
                action_taken="Reboot in 60 seconds",
                reason=reason
            )
        else:
            self.critical(
                "system_reboot_immediate",
                f"Immediate system reboot: {reason}",
                action_taken="Rebooting now",
                reason=reason
            )

    def recovery_escalation(
        self,
        from_tier: str,
        to_tier: str,
        reason: str,
        attempts: int
    ):
        """Log recovery tier escalation"""
        self.warning(
            "recovery_escalation",
            f"Escalating from {from_tier} to {to_tier}",
            action_taken=f"Attempting {to_tier} recovery",
            from_tier=from_tier,
            to_tier=to_tier,
            reason=reason,
            previous_attempts=attempts
        )

    def check_cycle_start(self, cycle_number: int):
        """Log start of health check cycle"""
        self.info(
            "health_check_cycle",
            f"Health check cycle #{cycle_number} started",
            cycle=cycle_number
        )

    def check_cycle_complete(
        self,
        cycle_number: int,
        issues_found: int,
        actions_taken: int,
        duration_ms: int
    ):
        """Log completion of health check cycle"""
        self.info(
            "health_check_complete",
            f"Cycle #{cycle_number} complete: {issues_found} issues, {actions_taken} actions",
            cycle=cycle_number,
            issues_found=issues_found,
            actions_taken=actions_taken,
            duration_ms=duration_ms
        )


# Global logger instance
_logger_instance = None


def get_logger() -> SelfHealingLogger:
    """Get global logger instance"""
    global _logger_instance
    if _logger_instance is None:
        log_dir = os.getenv('LOG_DIR', '/arasul/logs')
        _logger_instance = SelfHealingLogger(log_dir)
    return _logger_instance
