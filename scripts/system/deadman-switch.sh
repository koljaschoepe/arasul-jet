#!/bin/bash
# ARASUL PLATFORM - Deadman's Switch for Self-Healing Agent
# Monitors the self-healing agent's heartbeat endpoint.
# If the agent is unresponsive for > 120s, restarts its container.
# If still unresponsive after restart, triggers system reboot (if enabled).
#
# Designed to run via systemd timer every 30 seconds.
# Relies on the heartbeat HTTP endpoint at port 9200.

set -euo pipefail

LOG_DIR="/arasul/logs"
LOG_FILE="${LOG_DIR}/deadman-switch.log"
STATE_FILE="/tmp/deadman-switch-state"
HEARTBEAT_URL="http://127.0.0.1:9200/health"
CONTAINER_NAME="arasul-platform-self-healing-agent-1"
MAX_UNHEALTHY_BEFORE_RESTART=120   # seconds
MAX_UNHEALTHY_BEFORE_REBOOT=300    # seconds

mkdir -p "$LOG_DIR"

log() {
    local level="$1"
    shift
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [DEADMAN] [${level}] $*"
    echo "$msg" >> "$LOG_FILE"
    echo "$msg" >&2
}

# Rotate log if > 2MB
if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt 2097152 ]; then
    mv "$LOG_FILE" "${LOG_FILE}.1"
fi

# Check self-healing agent health via HTTP
check_health() {
    local response
    response=$(curl -sf --connect-timeout 5 --max-time 10 "$HEARTBEAT_URL" 2>/dev/null) || return 1

    # Parse healthy field from JSON
    local healthy
    healthy=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('healthy', False))" 2>/dev/null) || return 1

    [ "$healthy" = "True" ] && return 0
    return 1
}

# Check if self-healing container is running
is_container_running() {
    docker inspect --format='{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q "true"
}

# Main logic
if check_health; then
    # Agent is healthy - clear state
    if [ -f "$STATE_FILE" ]; then
        log "INFO" "Self-healing agent recovered"
        rm -f "$STATE_FILE"
    fi
    exit 0
fi

# Agent is unhealthy or unreachable
log "WARN" "Self-healing agent health check failed"

# Track failure duration
FIRST_FAILURE_TIME=0
RESTART_DONE=false
if [ -f "$STATE_FILE" ]; then
    IFS=':' read -r FIRST_FAILURE_TIME RESTART_DONE < "$STATE_FILE" 2>/dev/null || true
fi

NOW=$(date +%s)

if [ "$FIRST_FAILURE_TIME" -eq 0 ] 2>/dev/null; then
    FIRST_FAILURE_TIME=$NOW
    echo "${FIRST_FAILURE_TIME}:false" > "$STATE_FILE"
    log "WARN" "Self-healing agent failure detected - monitoring"
    exit 0
fi

ELAPSED=$((NOW - FIRST_FAILURE_TIME))

# Stage 1: Restart container after threshold
if [ "$ELAPSED" -ge "$MAX_UNHEALTHY_BEFORE_RESTART" ] && [ "$RESTART_DONE" != "true" ]; then
    log "WARN" "Self-healing agent unhealthy for ${ELAPSED}s - restarting container"
    echo "${FIRST_FAILURE_TIME}:true" > "$STATE_FILE"

    if is_container_running; then
        docker restart "$CONTAINER_NAME" 2>&1 | while IFS= read -r line; do
            log "INFO" "  docker: $line"
        done
    else
        log "WARN" "Container not running, attempting docker compose restart"
        cd /opt/arasul 2>/dev/null || cd /home/arasul/arasul/arasul-jet
        docker compose up -d self-healing-agent 2>&1 | while IFS= read -r line; do
            log "INFO" "  compose: $line"
        done
    fi
    exit 0
fi

# Stage 2: Reboot if still unhealthy after restart
if [ "$ELAPSED" -ge "$MAX_UNHEALTHY_BEFORE_REBOOT" ] && [ "$RESTART_DONE" = "true" ]; then
    # Check if reboot is enabled
    REBOOT_ENABLED=$(grep -oP 'SELF_HEALING_REBOOT_ENABLED=\K.*' /opt/arasul/.env 2>/dev/null || \
                     grep -oP 'SELF_HEALING_REBOOT_ENABLED=\K.*' /home/arasul/arasul/arasul-jet/.env 2>/dev/null || \
                     echo "false")

    if [ "$REBOOT_ENABLED" = "true" ]; then
        log "ERROR" "Self-healing agent still unhealthy after ${ELAPSED}s and container restart - REBOOTING"
        rm -f "$STATE_FILE"
        sync
        systemctl reboot
    else
        log "ERROR" "Self-healing agent unhealthy for ${ELAPSED}s - reboot disabled, manual intervention required"
    fi
fi
