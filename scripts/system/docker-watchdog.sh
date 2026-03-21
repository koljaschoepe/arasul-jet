#!/bin/bash
# ARASUL PLATFORM - Docker Daemon Watchdog
# Monitors Docker daemon health and attempts recovery on failure.
# Designed to run via systemd timer every 30 seconds.
#
# Recovery strategy:
#   1. Check if Docker is active
#   2. If not, attempt restart (up to 2 retries)
#   3. If still not recovered after 60s, reboot the system
#
# Log output: /arasul/logs/watchdog.log (+ journalctl)

set -euo pipefail

LOG_DIR="/arasul/logs"
LOG_FILE="${LOG_DIR}/watchdog.log"
STATE_FILE="/tmp/docker-watchdog-state"
MAX_RESTART_WAIT=60  # seconds before reboot

mkdir -p "$LOG_DIR"

log() {
    local level="$1"
    shift
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
    echo "$msg" >> "$LOG_FILE"
    # Also log to stderr so journalctl picks it up
    echo "$msg" >&2
}

# Rotate log if > 5MB
if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt 5242880 ]; then
    mv "$LOG_FILE" "${LOG_FILE}.1"
    log "INFO" "Log rotated"
fi

# Check Docker daemon status
if systemctl is-active --quiet docker; then
    # Docker is running - verify it can actually respond
    if docker info >/dev/null 2>&1; then
        # All good - clear any failure state
        if [ -f "$STATE_FILE" ]; then
            log "INFO" "Docker recovered successfully"
            rm -f "$STATE_FILE"
        fi
        exit 0
    else
        log "WARN" "Docker service active but daemon not responding"
    fi
fi

# Docker is down or unresponsive
log "ERROR" "Docker daemon is not healthy"

# Read state file to track recovery attempts
FIRST_FAILURE_TIME=0
RESTART_ATTEMPTS=0
if [ -f "$STATE_FILE" ]; then
    # Format: first_failure_timestamp:restart_attempts
    IFS=':' read -r FIRST_FAILURE_TIME RESTART_ATTEMPTS < "$STATE_FILE" 2>/dev/null || true
fi

NOW=$(date +%s)

# First detection of failure
if [ "$FIRST_FAILURE_TIME" -eq 0 ] 2>/dev/null; then
    FIRST_FAILURE_TIME=$NOW
    RESTART_ATTEMPTS=0
    echo "${FIRST_FAILURE_TIME}:${RESTART_ATTEMPTS}" > "$STATE_FILE"
    log "WARN" "Docker failure detected - starting recovery"
fi

ELAPSED=$((NOW - FIRST_FAILURE_TIME))

# If we've been trying for too long, reboot
if [ "$ELAPSED" -ge "$MAX_RESTART_WAIT" ]; then
    log "ERROR" "Docker not recovered after ${ELAPSED}s and ${RESTART_ATTEMPTS} restart attempts - REBOOTING"
    rm -f "$STATE_FILE"
    sync
    systemctl reboot
    exit 1
fi

# Attempt restart (max 2 attempts to avoid hammering)
if [ "$RESTART_ATTEMPTS" -lt 2 ]; then
    RESTART_ATTEMPTS=$((RESTART_ATTEMPTS + 1))
    echo "${FIRST_FAILURE_TIME}:${RESTART_ATTEMPTS}" > "$STATE_FILE"
    log "WARN" "Attempting Docker restart (attempt ${RESTART_ATTEMPTS}/2, ${ELAPSED}s since first failure)"
    systemctl restart docker || log "ERROR" "Docker restart command failed"
else
    log "WARN" "Max restart attempts reached, waiting for reboot threshold (${ELAPSED}/${MAX_RESTART_WAIT}s)"
fi
