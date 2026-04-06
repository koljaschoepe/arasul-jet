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
TEMP_THROTTLE_REARM = int(os.getenv('TEMP_THROTTLE_REARM', '78'))
TEMP_RESTART_REARM = int(os.getenv('TEMP_RESTART_REARM', '78'))
TEMP_HISTORY_SIZE = int(os.getenv('TEMP_HISTORY_SIZE', '5'))

# Failure tracking windows
FAILURE_WINDOW_MINUTES = 10
CRITICAL_WINDOW_MINUTES = 30
MAX_FAILURES_IN_WINDOW = 3
MAX_CRITICAL_EVENTS = 3

# Reboot safety limits
MAX_REBOOTS_PER_HOUR = int(os.getenv('MAX_REBOOTS_PER_HOUR', '1'))
REBOOT_COOLDOWN_MINUTES = int(os.getenv('REBOOT_COOLDOWN_MINUTES', '30'))

# Application services (excluding system services)
APPLICATION_SERVICES = [
    'llm-service',
    'embedding-service',
    'n8n',
    'dashboard-backend',
    'dashboard-frontend'
]

# Containers to exclude from monitoring
EXCLUDED_CONTAINERS = set(
    c.strip() for c in os.getenv('EXCLUDED_CONTAINERS', '').split(',') if c.strip()
)
