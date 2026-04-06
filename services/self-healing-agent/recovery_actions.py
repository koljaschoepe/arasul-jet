"""
ARASUL PLATFORM - Self-Healing Recovery Actions
Concrete recovery primitives: cache clearing, GPU reset, disk cleanup, etc.
"""

import time
import subprocess
import psycopg2
import psutil

from config import (
    LLM_SERVICE_URL, POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER,
    POSTGRES_PASSWORD, POSTGRES_DB, APPLICATION_SERVICES, logger
)

# Lazy import to avoid circular dependency
import requests


class RecoveryActionsMixin:
    """Recovery action primitives mixin for SelfHealingEngine"""

    def clear_llm_cache(self) -> bool:
        """Clear LLM service cache"""
        try:
            logger.info("Clearing LLM cache")
            response = requests.post(
                f"{LLM_SERVICE_URL}/api/generate",
                json={"model": "", "keep_alive": 0},
                timeout=5
            )
            if response.status_code in [200, 404]:
                logger.info("LLM cache cleared via model unload")
                return True
        except Exception as e:
            logger.warning(f"Could not clear LLM cache via API: {e}")

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
            response = requests.post(
                f"{LLM_SERVICE_URL}/api/generate",
                json={"model": "", "keep_alive": 0},
                timeout=5
            )
            if response.status_code in [200, 404]:
                logger.info("GPU session reset via model unload")
                time.sleep(2)
                return True
        except Exception as e:
            logger.debug(f"Non-critical error during GPU session reset via API: {e}")

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
            result = subprocess.run(
                ['nvpmodel', '-m', '2'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                logger.info("GPU throttling applied via nvpmodel (30W mode)")
                return True
            else:
                logger.warning(f"nvpmodel failed, trying jetson_clocks: {result.stderr}")
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
            container = self.docker_client.containers.get('n8n')
            container.restart()
            logger.info("Restarted n8n to free RAM")
            return True
        except Exception as e:
            logger.error(f"Failed to restart n8n: {e}")
            return False

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

        try:
            logger.info("Cleaning old logs")
            subprocess.run(
                ['find', '/arasul/logs', '-name', '*.log.*', '-mtime', '+7', '-delete'],
                capture_output=True, timeout=30
            )
            logger.info("Old logs cleaned")

            # Prune only dangling (untagged) images and stopped containers.
            # SAFETY: Use --filter to exclude images used by running/stopped
            # containers. Never use 'docker system prune -af' which can remove
            # images of temporarily stopped services, breaking restarts.
            logger.info("Running Docker container prune (stopped containers only)")
            result = subprocess.run(
                ['docker', 'container', 'prune', '-f'],
                capture_output=True, timeout=120
            )
            logger.info(f"Container cleanup: {result.stdout.decode()}")

            logger.info("Pruning dangling images only (tagged images preserved)")
            subprocess.run(
                ['docker', 'image', 'prune', '-f'],
                capture_output=True, timeout=60
            )

            logger.info("Cleaning Docker build cache")
            subprocess.run(
                ['docker', 'builder', 'prune', '-af'],
                capture_output=True, timeout=60
            )

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
            self.connect_db()
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
                time.sleep(5)

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
