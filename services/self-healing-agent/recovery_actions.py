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

    def entlade_modelle(self) -> dict:
        """Alle geladenen Modelle aus dem Speicher nehmen.

        Das ist der EINE Hebel, mit dem sich auf dieser Box Arbeitsspeicher
        freimachen laesst, und seit Phase C8 (27.08.2026) der Hebel der
        RAM-Ueberlast. Ein 27B-Modell in IQ4_XS belegt gut 16 GB; auf einem
        Geraet mit 61 GB ist das der groesste einzelne Posten, den ein Dienst
        freiwillig hergeben kann.

        Der Aufruf geht an `POST /api/cache/clear` der Management-API des
        `llm-service` (Port 11436). Sie liest `ollama ps`, entlaedt jedes
        gefundene Modell mit `keep_alive: 0` und nennt in der Antwort, WELCHE.
        Genau diese Namen braucht der Aufrufer: "Cache geleert" ohne Namen ist
        von "es war ohnehin nichts geladen" nicht zu unterscheiden.

        Bis zum 27.08.2026 stand hier stattdessen ein `POST /api/generate` an
        dieselbe Adresse. Diese Route gibt es auf 11436 nicht -- sie gehoert
        Ollama auf 11434. Der Aufruf endete mit HTTP 404, und die Bedingung
        darunter lautete `status_code in [200, 404]`. Die Selbstheilung meldete
        also "LLM cache cleared", waehrend das Modell unberuehrt im Speicher
        lag. Ein Hebel, der Erfolg meldet und nichts tut, ist schlimmer als
        keiner: er verhindert die Eskalation.

        Ein Lauf wird dabei nicht abgeschnitten. Ollama arbeitet Anfragen je
        Modell nacheinander ab, und die Entlade-Anfrage stellt sich hinten an;
        auf dieser Box kommt dazu, dass `gpuQueue` ohnehin nur eine Inferenz
        zur Zeit zulaesst.

        @return {'erfolg': bool, 'entladen': [str], 'meldung': str}
        """
        try:
            antwort = requests.post(f"{LLM_SERVICE_URL}/api/cache/clear", timeout=30)
        except Exception as fehler:
            logger.warning(f"Modelle entladen fehlgeschlagen: {fehler}")
            return {'erfolg': False, 'entladen': [], 'meldung': str(fehler)}

        if antwort.status_code != 200:
            logger.warning(f"Modelle entladen: HTTP {antwort.status_code}")
            return {
                'erfolg': False, 'entladen': [],
                'meldung': f"HTTP {antwort.status_code}",
            }

        daten = antwort.json()
        entladen = daten.get('unloaded_models', []) or []
        if entladen:
            logger.info(f"Modelle entladen: {', '.join(entladen)}")
        else:
            logger.info("Kein Modell geladen, nichts zu entladen")
        return {
            'erfolg': True,
            'entladen': entladen,
            'meldung': daten.get('message', ''),
        }

    def clear_llm_cache(self) -> bool:
        """Clear LLM service cache"""
        if self.entlade_modelle()['erfolg']:
            return True

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
        if self.entlade_modelle()['erfolg']:
            time.sleep(2)
            return True

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

    def hard_restart_application_services(self) -> bool:
        """Hard restart all application services"""
        logger.critical("Performing hard restart of application services")
        success_count = 0

        for service_name in APPLICATION_SERVICES:
            try:
                container = self.docker_client.containers.get(service_name)
                logger.info(f"Hard restarting {service_name}")
                # P5.6: 30s grace (was 5s) — LLM mid-inference and n8n
                # mid-workflow need time to flush state. Too-fast SIGKILL
                # leaves orphan idle-in-transaction rows that trip the next
                # check_database_health cycle (positive-feedback loop).
                container.stop(timeout=30)
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
            #
            # UND NIEMALS `docker volume prune`. Am 24.08.2026 lagen auf dem
            # Orin 11,3 GB in Volumes ohne Container — das sieht nach einer
            # leichten Beute aus und ist keine. Ein Volume ohne Container ist
            # nicht dasselbe wie ein Volume ohne Daten: die Selbstheilung
            # stoppt Dienste selbst (RAM-Entlastung, stop+start), und in genau
            # diesem Fenster haenge an einem gestoppten Dienst sein Volume
            # ohne Container. Ein Prune dort loescht Kundendaten, nicht
            # Abfall. Die 11 GB sind der Preis dafuer, und er ist niedrig:
            # die Platte war zu 26 Prozent belegt, und der Build Cache allein
            # gibt 65 GB her.
            logger.info("Running Docker container prune (stopped containers only)")
            result = subprocess.run(
                ['docker', 'container', 'prune', '-f'],
                capture_output=True, timeout=120
            )
            logger.info(f"Container cleanup: {result.stdout.decode()}")

            # Dasselbe Argument, kleinere Menge: 461 Images, davon 51 GB
            # rueckgewinnbar (24.08.2026).
            logger.info("Pruning dangling images only (tagged images preserved)")
            subprocess.run(
                ['docker', 'image', 'prune', '-f'],
                capture_output=True, timeout=300
            )

            # Zeitgrenze grosszuegig: der Build Cache ist der groesste Posten,
            # den diese Aufraeumung anfasst. Am 24.08.2026 auf dem Orin gemessen:
            # 159,4 GB in 2576 Eintraegen. Sechzig Sekunden waren dafuer
            # geschaetzt, nicht gemessen — und laeuft die Grenze ab, wirft
            # `subprocess` eine Ausnahme, der ganze Block landet im `except`,
            # und die Platte bleibt voll. Ein zu knapper Deckel scheitert
            # ausgerechnet dann, wenn am meisten zu tun ist.
            logger.info("Cleaning Docker build cache")
            subprocess.run(
                ['docker', 'builder', 'prune', '-af'],
                capture_output=True, timeout=900
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
            # Plan 021 (Schritt 8): embedding-service kann per Profil "classic-rag"
            # abgeschaltet sein — dann nur tatsächlich vorhandene Container neu
            # starten (sonst würde der GPU-Reset fälschlich als Fehlschlag gelten).
            existing = {c.name for c in self.docker_client.containers.list(all=True)}
            services_to_restart = [s for s in services_to_restart if s in existing]
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
