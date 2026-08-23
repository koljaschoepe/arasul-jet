"""
ARASUL PLATFORM - Self-Healing Engine Configuration
All constants, thresholds, and environment variable parsing.
"""

import os

# Structured JSON logging
from structured_logging import setup_logging
logger = setup_logging("self-healing")


# Resolve Docker secrets (_FILE env vars → regular env vars)
def _resolve_secrets(*var_names):
    for var in var_names:
        file_path = os.environ.get(f'{var}_FILE')
        if file_path and os.path.isfile(file_path):
            with open(file_path) as f:
                os.environ[var] = f.read().strip()

_resolve_secrets('POSTGRES_PASSWORD')


# Database
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'postgres-db')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_USER = os.getenv('POSTGRES_USER', 'arasul')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD')
POSTGRES_DB = os.getenv('POSTGRES_DB', 'arasul_db')

# Engine
HEALING_INTERVAL = int(os.getenv('SELF_HEALING_INTERVAL', '10'))
ENABLED = os.getenv('SELF_HEALING_ENABLED', 'true').lower() == 'true'
REBOOT_ENABLED = os.getenv('SELF_HEALING_REBOOT_ENABLED', 'false').lower() == 'true'

# Service URLs
METRICS_COLLECTOR_URL = f"http://{os.getenv('METRICS_COLLECTOR_HOST', 'metrics-collector')}:9100"
LLM_SERVICE_URL = f"http://{os.getenv('LLM_SERVICE_HOST', 'llm-service')}:{os.getenv('LLM_SERVICE_MANAGEMENT_PORT', '11436')}"
N8N_URL = f"http://{os.getenv('N8N_HOST', 'n8n')}:5678"

# Disk thresholds
DISK_WARNING = int(os.getenv('DISK_WARNING_PERCENT', '75'))
DISK_CLEANUP = int(os.getenv('DISK_CLEANUP_PERCENT', '85'))
DISK_CRITICAL = int(os.getenv('DISK_CRITICAL_PERCENT', '95'))
DISK_REBOOT = int(os.getenv('DISK_REBOOT_PERCENT', '97'))

# Resource thresholds (configurable via env vars)
CPU_OVERLOAD_THRESHOLD = int(os.getenv('CPU_OVERLOAD_THRESHOLD', '90'))
RAM_OVERLOAD_THRESHOLD = int(os.getenv('RAM_OVERLOAD_THRESHOLD', '90'))
GPU_OVERLOAD_THRESHOLD = int(os.getenv('GPU_OVERLOAD_THRESHOLD', '95'))
TEMP_THROTTLE_THRESHOLD = int(os.getenv('TEMP_THROTTLE_THRESHOLD', '83'))
TEMP_RESTART_THRESHOLD = int(os.getenv('TEMP_RESTART_THRESHOLD', '85'))
TEMP_SHUTDOWN_THRESHOLD = int(os.getenv('TEMP_SHUTDOWN_THRESHOLD', '90'))
TEMP_THROTTLE_REARM = int(os.getenv('TEMP_THROTTLE_REARM', '78'))
TEMP_RESTART_REARM = int(os.getenv('TEMP_RESTART_REARM', '78'))
TEMP_SHUTDOWN_REARM = int(os.getenv('TEMP_SHUTDOWN_REARM', '80'))
TEMP_HISTORY_SIZE = int(os.getenv('TEMP_HISTORY_SIZE', '5'))

# Failure tracking windows
FAILURE_WINDOW_MINUTES = 10
CRITICAL_WINDOW_MINUTES = 30
MAX_FAILURES_IN_WINDOW = 3
MAX_CRITICAL_EVENTS = 3

# Reboot safety limits
MAX_REBOOTS_PER_HOUR = int(os.getenv('MAX_REBOOTS_PER_HOUR', '1'))
REBOOT_COOLDOWN_MINUTES = int(os.getenv('REBOOT_COOLDOWN_MINUTES', '30'))

# Application services (excluding system services).
# Plan 021 (Schritt 8): embedding-service ins Profil "classic-rag" (standardmäßig
# aus) — NICHT mehr überwachen, sonst würde die Selbstheilung ein bewusst
# abgeschaltetes embedding als „down" behandeln und neu starten.
APPLICATION_SERVICES = [
    'llm-service',
    'n8n',
    'dashboard-backend',
    'dashboard-frontend'
]

# Nur die Container DIESES Compose-Projekts ueberwachen (23.08.2026).
#
# `containers.list(all=True)` liefert jeden Container des Hosts. Auf dem Orin
# waren das auch der Pruefstand (ein zweiter Stack fuer Abnahmen) und die
# Sandbox-Container der Terminals. Ergebnis in sieben Tagen: 311 CRITICAL-
# Ereignisse zu `pruef-llm-service`, einem Dienst, den es im Produkt gar nicht
# gibt, und der absichtlich nicht laeuft. Das ist genau die Art Rauschen, die
# Gate G7 unbelegbar macht: wer 800 Eintraege durchsehen muss, sieht den einen
# echten nicht.
#
# Leer lassen heisst: der Agent liest das Projekt aus seinem EIGENEN Container.
# Das ist die richtige Vorgabe, weil sie auch dann stimmt, wenn das Projekt
# anders heisst.
COMPOSE_PROJECT = os.getenv('SELFHEAL_COMPOSE_PROJECT', '')

# Wartungsfenster: solange diese Datei frisch ist, laeuft ein Deploy, und
# Kategorie A haelt still. Sie liegt in `logs/`, weil das der einzige Ordner
# ist, den der Agent und das Deploy-Skript beide sehen (Bind-Mount).
#
# Kein Schalter, sondern ein Herzschlag: `deploy-local.sh` fasst die Datei
# waehrend des ganzen Deploys immer wieder an. Ein abgebrochener Deploy legt
# die Selbstheilung deshalb nicht dauerhaft schlafen, sondern hoechstens fuer
# WARTUNG_MAX_MINUTEN.
WARTUNGSDATEI = os.getenv('SELFHEAL_WARTUNGSDATEI', '/arasul/logs/wartung.aktiv')
WARTUNG_MAX_MINUTEN = int(os.getenv('SELFHEAL_WARTUNG_MAX_MINUTEN', '30'))

# Nachlauf: nach dem Ende der Wartung bleibt Kategorie A noch so lange
# ausgesetzt. Ohne das war der Schutz um Sekunden zu kurz. Am 24.08.2026 auf
# dem Orin gemessen:
#
#   00:05:12  Wartungsfenster aktiv (pruefstand-build)
#   00:05:33  Wartungsfenster beendet
#   00:05:43  n8n unhealthy, performing restart
#
# Das Fenster schliesst, sobald `compose up` zurueckkommt. Die Dienste sind
# dann aber noch ungesund und brauchen erst einen erfolgreichen Healthcheck,
# um wieder als gesund zu gelten.
#
# Der erste Wurf stand auf 60 Sekunden, und das war zu kurz. Am 24.08.2026
# nachgemessen, derselbe Pruefstand-Start:
#
#   00:33:05  Wartungsfenster beendet, 60s Nachlauf
#   00:34:05  Nachlauf abgelaufen
#   00:34:17  n8n unhealthy, performing restart
#   00:41:43  n8n still unhealthy, stop+start
#   00:42:16  n8n-runners still unhealthy, stop+start
#
# Zwoelf Sekunden nach Ablauf griff die Selbstheilung zu, und dieser eine
# Eingriff loeste die Kaskade aus, die danach folgte. Ich hatte den Erfolg
# schon gemeldet — gemessen um 00:34, also bevor der Eingriff kam. Ein Beleg,
# der zu frueh genommen wird, ist keiner.
#
# 300 Sekunden decken den gemessenen Fall (72 Sekunden bis n8n noch ungesund
# war) mit Abstand ab und sind kurz genug, dass ein echter Ausfall nicht lange
# unbemerkt bleibt. Der Deckel aus WARTUNG_MAX_MINUTEN gilt unabhaengig davon.
WARTUNG_NACHLAUF_SEKUNDEN = int(os.getenv('SELFHEAL_WARTUNG_NACHLAUF_SEKUNDEN', '300'))

# External heartbeat / Dead Man's Switch
# If set, POST to this URL every HEARTBEAT_INTERVAL_CYCLES cycles
# External monitoring service alerts operator if heartbeat stops
HEARTBEAT_URL = os.getenv('HEARTBEAT_URL', '')  # e.g. https://uptime.arasul.de/ping/<device-id>
HEARTBEAT_INTERVAL_CYCLES = int(os.getenv('HEARTBEAT_INTERVAL_CYCLES', '30'))  # ~5 min at 10s interval

# Containers to exclude from monitoring
EXCLUDED_CONTAINERS = set(
    c.strip() for c in os.getenv('EXCLUDED_CONTAINERS', '').split(',') if c.strip()
)
