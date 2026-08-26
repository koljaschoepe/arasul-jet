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
import requests
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

    def _ollama_responsive(self) -> bool:
        """Antwortet die Ollama-API? Unterscheidet 'GPU rechnet Inferenz'
        (API antwortet trotz 99% Auslastung sofort) von 'GPU verklemmt'."""
        llm_host = os.getenv('LLM_SERVICE_HOST', 'llm-service')
        llm_port = os.getenv('LLM_SERVICE_PORT', '11434')
        try:
            response = requests.get(f"http://{llm_host}:{llm_port}/api/tags", timeout=5)
            return response.status_code == 200
        except Exception:
            return False

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
        """
        Check if service has exceeded max restart-class actions in 30min window.

        P5.9: also count `service_stop` and `hard_restart` so a stop-loop or
        Category-C-loop cannot bypass the rate limit by varying the action_type.
        """
        try:
            rows = self.execute_query(
                "SELECT COUNT(*) FROM recovery_actions "
                "WHERE service_name = %s "
                "AND action_type IN ('service_restart', 'service_stop', "
                "                    'hard_restart_application_services', "
                "                    'gpu_session_reset', 'gpu_recovery') "
                "AND timestamp >= NOW() - INTERVAL '30 minutes'",
                (service_name,), fetch_all=True
            )
            count = rows[0][0] if rows else 0
            if count >= self.MAX_RESTARTS_PER_30MIN:
                logger.error(
                    f"Service {service_name} hit restart rate limit: "
                    f"{count}/{self.MAX_RESTARTS_PER_30MIN} restart-class actions in 30min — alert only"
                )
                return True
            return False
        except Exception:
            return False

    # ========================================================================
    # CATEGORY A: SERVICE DOWN
    # ========================================================================

    # Docker-Meldungen, die kein Ausfall sind, sondern ein laufender Deploy:
    # Compose ersetzt den Container, waehrend die Selbstheilung ihn noch
    # anfassen will. Beobachtet am 19.08.2026 bei jedem automatischen Deploy —
    # zweimal in 24 Stunden stand danach 'service_recovery_failed' als CRITICAL
    # im Ereignisprotokoll, obwohl nur eine neue Version ausgerollt wurde.
    #
    # Bewusst nur Muster, die genau diesen Zustand beschreiben und im Log des
    # Geraets auch so vorkamen. Ein zu weites Muster waere schlimmer als der
    # Fehlalarm: es wuerde einen echten CRITICAL still zu einem INFO abwerten,
    # und still ist genau das, was hier niemand will.
    CONTAINER_BEING_REPLACED = (
        'marked for removal',
        'removal of container',
        'no such container',
    )

    # Fehler, bei denen die VERBINDUNG zum Docker-Daemon abgerissen ist, nicht
    # der Neustart misslungen. `container.restart()` laeuft ueber den
    # docker-proxy; reisst dabei die Verbindung ab, sagt das nichts darueber,
    # ob der Container danach laeuft. Meistens laeuft er.
    VERBINDUNG_ABGERISSEN = (
        'connection aborted',
        'remotedisconnected',
        'connection reset',
        'connection refused',
        'read timed out',
        'timeout',
    )

    # So lange wird nach einem abgerissenen Aufruf gewartet, bevor zum ersten
    # Mal nachgesehen wird. Ein Neustart braucht ein paar Sekunden.
    NACHSCHAU_SEKUNDEN = 15

    # Und so lange wird insgesamt nachgesehen, in Schritten von
    # NACHSCHAU_TAKT_SEKUNDEN. Grund am 23.08.2026 auf dem Orin gemessen: bei
    # einem Deploy baut Compose das Abbild und ERSETZT den Container. Zwischen
    # `restart()` und dem laufenden neuen Container lagen mehr als 15 Sekunden,
    # der Container war zeitweise gar nicht da. Nach einem Blick stand deshalb
    # "laeuft nicht", und die Eskalationsleiter lief bis zum Neustart des
    # ganzen Geraets durch — wegen eines Deploys.
    NACHSCHAU_GESAMT_SEKUNDEN = 120
    NACHSCHAU_TAKT_SEKUNDEN = 5

    # Und so viel Nachschau darf eine GANZE Runde kosten, ueber alle Dienste
    # zusammen. Der Grund wiegt schwerer als die Nachschau selbst: die
    # Heilungsrunde ist einfaedig. Waehrend hier gewartet wird, laufen weder
    # die Temperaturpruefung noch die GPU-Fehlerbehandlung noch die
    # Plattenpruefung. Ein Deploy trifft mehrere Container gleichzeitig, und
    # drei Dienste mit je zwei Minuten Nachschau haetten den Wachhund auf einem
    # Jetson sieben Minuten lang blind gemacht — auf Hardware, die bei 90 Grad
    # abschaltet. Das Budget deckelt genau diesen Fall.
    NACHSCHAU_BUDGET_JE_RUNDE = 150

    def _is_container_being_replaced(self, error) -> bool:
        """Ist der Fehler nur ein Container-Wechsel (Deploy), kein Ausfall?"""
        text = str(error).lower()
        return any(pattern in text for pattern in self.CONTAINER_BEING_REPLACED)

    def _ist_verbindungsabriss(self, error) -> bool:
        text = str(error).lower()
        return any(muster in text for muster in self.VERBINDUNG_ABGERISSEN)

    def _nachschau_rest(self) -> float:
        """Wie viel Nachschau diese Runde noch kosten darf."""
        frist = getattr(self, 'nachschau_frist', None)
        if frist is None:
            return float(self.NACHSCHAU_SEKUNDEN)
        return max(0.0, frist - time.time())

    def _laeuft_wieder(self, service_name: str) -> bool:
        """Nach einem abgerissenen Aufruf: laeuft der Dienst wieder?

        In der Nacht auf den 23.08.2026 auf dem Orin beobachtet. n8n wurde
        unter Last ungesund, der Agent startete es neu, und der Neustart selbst
        riss ihm die Verbindung zum docker-proxy ab
        (`('Connection aborted.', RemoteDisconnected(...))`). Der Agent buchte
        das als "Failed to recover" und eskalierte — obwohl n8n danach lief.
        Vier Runden lang, von 00:59 bis 02:32.

        Nachsehen statt annehmen ist die einzige ehrliche Antwort auf die
        Frage, ob die Wiederherstellung geklappt hat. Billig ist es nicht mehr:
        bis zu zwei Minuten je Dienst, gedeckelt durch das Budget der Runde
        (`NACHSCHAU_BUDGET_JE_RUNDE`), damit der Wachhund nicht blind wird.
        """
        rundenfrist = getattr(self, 'nachschau_frist', None)
        if rundenfrist is not None and time.time() >= rundenfrist:
            logger.warning(
                f"Nachschau fuer {service_name} entfaellt: das Nachschau-Budget "
                f"dieser Runde ist aufgebraucht"
            )
            return False

        time.sleep(min(self.NACHSCHAU_SEKUNDEN, self._nachschau_rest()))
        frist = time.time() + self.NACHSCHAU_GESAMT_SEKUNDEN
        if rundenfrist is not None:
            frist = min(frist, rundenfrist)
        letzter = 'nie gesehen'
        while True:
            try:
                container = self.docker_client.containers.get(service_name)
                container.reload()
                letzter = container.status
                if letzter == 'running':
                    return True
            except Exception as e:
                # Waehrend eines Deploys gibt es den Container zeitweise nicht.
                # Das ist kein Befund, sondern der Zustand zwischen zwei
                # Containern.
                letzter = f'nicht da ({e})'
            if time.time() >= frist:
                logger.debug(
                    f"Nachschau fuer {service_name} ohne Erfolg: {letzter}"
                )
                return False
            time.sleep(min(self.NACHSCHAU_TAKT_SEKUNDEN, max(0.0, frist - time.time())))

    # Kategorie C hat einen eigenen Cooldown von einer Stunde. Der stand aber
    # HINTER dem `log_event` in Kategorie A: solange ein Dienst ungesund blieb
    # und sein Fehlerzaehler ueber MAX_FAILURES_IN_WINDOW lag, schrieb JEDER
    # Durchlauf eine weitere CRITICAL-Zeile `service_escalation`, obwohl C
    # selbst laengst nichts mehr tat und sofort zurueckkehrte.
    #
    # Am 23.08.2026 auf dem Orin gemessen: 20 solche Zeilen in zwei Minuten
    # fuer n8n und n8n-runners (`SELECT ... FROM self_healing_events WHERE
    # event_type = 'service_escalation'`).
    #
    # Das ist nicht nur Rauschen. `get_critical_events_count()` zaehlte
    # CRITICAL-Zeilen, und ab MAX_CRITICAL_EVENTS startet das Geraet neu. Ein
    # einziger Dienst, der nicht hochkommt, fuellte den Zaehler damit in einer
    # halben Minute. Am selben Tag um 15:01 UTC stand deshalb im Protokoll
    # "Multiple critical events detected (3), escalating to reboot" — dass das
    # Geraet oben blieb, lag allein daran, dass SELF_HEALING_REBOOT_ENABLED
    # aus war. Im unbeaufsichtigten Betrieb, den Gate G7 verspricht, steht der
    # Schalter auf true.
    CATEGORY_C_COOLDOWN_SEKUNDEN = 3600

    def _category_c_in_cooldown(self) -> bool:
        """True, solange Kategorie C ohnehin nicht handeln wuerde."""
        return (
            time.time() - self.last_critical_action_time
            < self.CATEGORY_C_COOLDOWN_SEKUNDEN
        )

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
                if self._category_c_in_cooldown():
                    # Der Zustand ist unveraendert und schon protokolliert.
                    # Eine zweite CRITICAL-Zeile fuer denselben Vorfall waere
                    # keine neue Erkenntnis, sondern ein Stimmzettel mehr fuer
                    # den Neustart.
                    logger.debug(
                        f"{service_name} bleibt ungesund, Kategorie C ist im "
                        f"Cooldown — keine weitere Eskalationszeile"
                    )
                    return
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
            if self._is_container_being_replaced(e):
                # Kein Ausfall: Compose tauscht den Container gerade aus. Als
                # CRITICAL protokolliert stand im Dashboard eine gescheiterte
                # Wiederherstellung, obwohl nur ein Deploy lief.
                #
                # Scheitert der Deploy wirklich, bleibt der Dienst ungesund und
                # der Fehlerzaehler laeuft weiter (record_failure oben, ausserhalb
                # dieses Zweigs) — die Eskalation nach Kategorie C greift also
                # unveraendert. Dieser Zweig unterdrueckt die Meldung, nicht die
                # Beobachtung.
                logger.info(
                    f"{service_name} wird gerade ersetzt (Deploy), keine Wiederherstellung noetig: {e}"
                )
                self.log_event(
                    'service_replacement_detected', 'INFO',
                    f'{service_name} wird gerade ersetzt (Deploy), kein Ausfall',
                    'Kein Eingriff', service_name, True
                )
                return
            if self._ist_verbindungsabriss(e) and self._laeuft_wieder(service_name):
                # Die Verbindung riss ab, der Dienst laeuft. Das ist genau der
                # Fall, der n8n in der Nacht auf den 23.08.2026 in eine
                # Eskalationsschleife geschickt hat.
                logger.info(
                    f"{service_name}: Docker-Aufruf riss ab, der Dienst laeuft "
                    f"aber wieder ({e})"
                )
                self.log_event(
                    'service_recovery_verified', 'INFO',
                    f'{service_name}: Aufruf riss ab, Dienst laeuft wieder',
                    'Nachgesehen statt eskaliert', service_name, True
                )
                self.record_recovery_action(
                    'service_restart', service_name,
                    'Verbindung riss ab, Nachschau ergab: laeuft',
                    True, duration_ms
                )
                return
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

        # RAM Overload: seit Phase B5 (26.08.2026) ohne Hebel. Bis dahin hielt
        # die Selbstheilung n8n an, um Speicher freizugeben, und startete es
        # nach drei ruhigen Zyklen wieder; n8n ist weg, und kein anderer
        # Dienst laesst sich gefahrlos anhalten (Ollama gibt sein Modell nach
        # KEEP_ALIVE selbst frei). Der Zustand wird gemeldet, nicht behandelt.
        if ram > RAM_OVERLOAD_THRESHOLD:
            action_key = 'ram_overload'
            last_action = self.last_overload_actions.get(action_key, 0)
            if current_time - last_action > 300:
                logger.warning(f"RAM overload detected: {ram}% - no service left to stop, reporting only")
                self.log_event(
                    'ram_overload', 'WARNING', f'RAM usage at {ram}%',
                    'No action: no stoppable service (n8n removed in B5)',
                    'system', False
                )
                self.last_overload_actions[action_key] = current_time

        # GPU "Overload": 99%+ Auslastung ist bei laufender LLM-Inferenz
        # NORMALZUSTAND, kein Fehler. Der Reset (Modell-Unload, im Fallback
        # sogar Container-Restart) hat produktive Läufe abgeschossen. Er darf
        # nur den wirklich verklemmten Fall treffen: Auslastung hoch UND
        # Ollama antwortet nicht mehr — und das zwei Zyklen in Folge.
        if gpu > GPU_OVERLOAD_THRESHOLD:
            if self._ollama_responsive():
                # Ollama arbeitet — hohe GPU-Last ist Inferenz, Finger weg.
                self._gpu_wedged_count = 0
            else:
                self._gpu_wedged_count = getattr(self, '_gpu_wedged_count', 0) + 1
                action_key = 'gpu_overload'
                last_action = self.last_overload_actions.get(action_key, 0)
                if self._gpu_wedged_count >= 2 and current_time - last_action > 300:
                    logger.warning(
                        f"GPU wedged: {gpu}% and Ollama unresponsive for "
                        f"{self._gpu_wedged_count} cycles - resetting GPU session"
                    )
                    success = self.reset_gpu_session()
                    self.log_event(
                        'gpu_overload', 'CRITICAL',
                        f'GPU usage at {gpu}% with unresponsive Ollama',
                        'Reset GPU session' if success else 'Failed to reset session',
                        'llm-service', success
                    )
                    self.record_recovery_action('gpu_session_reset', 'llm-service', f'GPU wedged: {gpu}%', success)
                    self.last_overload_actions[action_key] = current_time
                    self._gpu_wedged_count = 0
        else:
            self._gpu_wedged_count = 0

        # Temperature Management with hysteresis and sliding window average
        self._temp_history.append(temp)
        if len(self._temp_history) > TEMP_HISTORY_SIZE:
            self._temp_history.pop(0)
        # P5.4: require at least 3 samples before averaging. Otherwise a single
        # spurious 91°C reading right after restart trips the emergency LLM
        # stop with avg_temp=91 from n=1.
        if len(self._temp_history) < 3:
            return
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

        if self._category_c_in_cooldown():
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

        # Hier stand bis zum 23.08.2026 EIN Eintrag, und zwar vor jeder
        # Pruefung: 'Saving state and initiating reboot', success=True. Am
        # 23.08. um 09:32 UTC stand er so im Protokoll des Orin, und das Geraet
        # lief seit vier Tagen ununterbrochen weiter — `REBOOT_ENABLED` ist ab
        # Werk aus. Der Eintrag behauptete etwas, das nicht geschah, und zwar
        # ausgerechnet in dem Protokoll, aus dem der Nachweis fuer Gate G7
        # gelesen wird.
        #
        # Jetzt sagt jeder Ausgang, was wirklich passiert ist.
        if not self.perform_reboot_safety_checks(reason):
            logger.error("Reboot safety checks failed - aborting reboot")
            self.log_event(
                'system_reboot_abgebrochen', 'CRITICAL',
                f'Neustart verworfen, Sicherheitspruefung: {reason}',
                'Kein Neustart, Sicherheitspruefung schlug fehl', None, False
            )
            return

        reboot_id = self.save_reboot_state(reason)
        self._pause_active_jobs_for_reboot(reason)

        if not REBOOT_ENABLED:
            logger.critical("REBOOT DISABLED - Manual intervention required")
            logger.critical(f"Reboot would be triggered for: {reason}")
            logger.critical("Enable reboots by setting SELF_HEALING_REBOOT_ENABLED=true")
            self.log_event(
                'system_reboot_unterdrueckt', 'CRITICAL',
                f'Neustart waere faellig gewesen: {reason}',
                'Kein Neustart, SELF_HEALING_REBOOT_ENABLED ist aus', None, False
            )
            return

        self.log_event(
            'system_reboot', 'EMERGENCY',
            f'System reboot triggered: {reason}',
            'Saving state and initiating reboot', None, True
        )
        logger.critical("Initiating system reboot in 10 seconds...")
        time.sleep(10)
        try:
            subprocess.run(['sudo', 'reboot'], timeout=5)
        except Exception as e:
            logger.error(f"Reboot command failed: {e}")
            logger.critical("MANUAL REBOOT REQUIRED")
            self.log_event(
                'system_reboot_gescheitert', 'EMERGENCY',
                f'Neustartbefehl scheiterte: {e}',
                'Handeingriff noetig', None, False
            )

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
