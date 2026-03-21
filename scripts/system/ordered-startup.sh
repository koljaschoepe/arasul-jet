#!/bin/bash
# ARASUL PLATFORM - Orchestrated Service Startup
# Starts services in 4 phases with health-gate between each phase.
# Prevents thundering-herd resource contention after reboot.
#
# Usage:
#   ./scripts/system/ordered-startup.sh              # Normal startup
#   ./scripts/system/ordered-startup.sh --skip-pull   # Skip image pull
#
# Phases:
#   1. Infrastructure: postgres-db, minio
#   2. AI Services: qdrant, llm-service, embedding-service
#   3. Application: dashboard-backend, dashboard-frontend, n8n, reverse-proxy
#   4. Monitoring: metrics-collector, self-healing-agent, backup-service, loki, promtail, document-indexer

set -euo pipefail

# Configuration
COMPOSE_PROJECT="arasul-platform"
PHASE_TIMEOUT=${PHASE_TIMEOUT:-300}       # 5 min per phase
STABILIZE_WAIT=${STABILIZE_WAIT:-10}      # 10s between phases
HEALTH_POLL_INTERVAL=5                    # Check every 5s
LOG_DIR="/arasul/logs"
LOG_FILE="${LOG_DIR}/startup.log"
SKIP_PULL=false

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --skip-pull) SKIP_PULL=true ;;
    esac
done

mkdir -p "$LOG_DIR"

# Phase definitions: space-separated service names
PHASE1_SERVICES="postgres-db minio"
PHASE2_SERVICES="qdrant llm-service embedding-service"
PHASE3_SERVICES="dashboard-backend dashboard-frontend n8n reverse-proxy"
PHASE4_SERVICES="metrics-collector self-healing-agent backup-service loki promtail document-indexer"

# Resolve compose directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() {
    local level="$1"
    shift
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
    echo "$msg" | tee -a "$LOG_FILE"
}

# Check if a service is healthy
is_service_healthy() {
    local service="$1"
    local health
    health=$(docker inspect --format='{{.State.Health.Status}}' "${COMPOSE_PROJECT}-${service}-1" 2>/dev/null || echo "missing")

    case "$health" in
        healthy) return 0 ;;
        *)       return 1 ;;
    esac
}

# Wait for all services in a list to become healthy
wait_for_healthy() {
    local phase_name="$1"
    shift
    local services=("$@")
    local deadline=$((SECONDS + PHASE_TIMEOUT))

    log "INFO" "Waiting for ${phase_name} services to become healthy (timeout: ${PHASE_TIMEOUT}s)"

    while [ $SECONDS -lt $deadline ]; do
        local all_healthy=true
        local status_line=""

        for svc in "${services[@]}"; do
            if is_service_healthy "$svc"; then
                status_line+=" ${svc}:OK"
            else
                status_line+=" ${svc}:WAIT"
                all_healthy=false
            fi
        done

        if $all_healthy; then
            log "INFO" "${phase_name} all healthy:${status_line}"
            return 0
        fi

        sleep "$HEALTH_POLL_INTERVAL"
    done

    # Timeout - log which services aren't healthy
    log "WARN" "${phase_name} timeout after ${PHASE_TIMEOUT}s. Continuing anyway."
    for svc in "${services[@]}"; do
        if ! is_service_healthy "$svc"; then
            log "WARN" "  ${svc} still not healthy"
        fi
    done
    return 0  # Continue despite timeout (force-continue per plan)
}

# Start a phase
start_phase() {
    local phase_num="$1"
    local phase_name="$2"
    shift 2
    local services=("$@")
    local start_time=$SECONDS

    log "INFO" "=== Phase ${phase_num}: ${phase_name} ==="
    log "INFO" "Starting: ${services[*]}"

    # Start services
    cd "$PROJECT_DIR"
    docker compose up -d "${services[@]}" 2>&1 | while IFS= read -r line; do
        log "INFO" "  $line"
    done

    # Wait for health
    wait_for_healthy "$phase_name" "${services[@]}"

    local elapsed=$((SECONDS - start_time))
    log "INFO" "Phase ${phase_num} completed in ${elapsed}s"

    # Stabilization pause between phases
    if [ "$phase_num" -lt 4 ]; then
        log "INFO" "Stabilizing for ${STABILIZE_WAIT}s..."
        sleep "$STABILIZE_WAIT"
    fi
}

# Main
main() {
    local total_start=$SECONDS

    log "INFO" "============================================"
    log "INFO" "ARASUL PLATFORM - Orchestrated Startup"
    log "INFO" "============================================"

    # Optional: pull images first
    if ! $SKIP_PULL; then
        log "INFO" "Pulling latest images..."
        cd "$PROJECT_DIR"
        docker compose pull --quiet 2>&1 | while IFS= read -r line; do
            log "INFO" "  $line"
        done
    else
        log "INFO" "Skipping image pull (--skip-pull)"
    fi

    # Start phases
    # shellcheck disable=SC2086
    start_phase 1 "Infrastructure" $PHASE1_SERVICES
    # shellcheck disable=SC2086
    start_phase 2 "AI Services" $PHASE2_SERVICES
    # shellcheck disable=SC2086
    start_phase 3 "Application" $PHASE3_SERVICES
    # shellcheck disable=SC2086
    start_phase 4 "Monitoring" $PHASE4_SERVICES

    local total_elapsed=$((SECONDS - total_start))
    log "INFO" "============================================"
    log "INFO" "Startup complete in ${total_elapsed}s"
    log "INFO" "============================================"

    # Final status
    cd "$PROJECT_DIR"
    docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>&1 | while IFS= read -r line; do
        log "INFO" "  $line"
    done
}

main "$@"
