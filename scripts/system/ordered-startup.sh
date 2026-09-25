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
#   1. Infrastructure: postgres-db
#   2. AI Services: llm-service, embedding-service
#   3. Application: dashboard-backend, dashboard-frontend, reverse-proxy
#   4. Monitoring: metrics-collector, self-healing-agent, backup-service, document-indexer
#   5. Profile: was Compose mit den gesetzten `COMPOSE_PROFILES` darueber
#      hinaus kennt -- heute der Firmenordner (J33)
#
# Die App-Container stehen in keiner Phase: sie sind kein Dienst des Compose,
# Docker startet sie (`unless-stopped`) selbst und damit VOR Postgres. Neu
# gestartet werden sie vom Backend in Phase 3, sobald es die App-Datenbanken
# geheilt hat (`appDatenbank.appsNachDerDatenbank`, J35) -- dort, weil erst
# danach die Rolle das Passwort traegt, das in der Umgebung der App steht.
#
# MinIO, Loki und Promtail sind am 26.08.2026 (Phase B4 des Rueckbaus) aus
# den Phasen gefallen; sie gibt es im Compose nicht mehr.

set -euo pipefail

# Resolve compose directory. Ganz oben, VOR jedem Seiteneffekt: der Riegel
# gleich darunter muss greifen, bevor dieses Skript irgendetwas anlegt.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Ein Verzeichnis, das sein Geraet abgegeben hat, faehrt hier nichts hoch.
#
# Dieses Skript ist der `ExecStart` von `arasul-platform.service`, und die Unit
# traegt `WorkingDirectory=<Fassungsordner>`. Nach einer Aktualisierung schreibt
# `install.sh` sie auf das neue Verzeichnis um -- bricht es aber vorher ab, zeigt
# eine STEHENGEBLIEBENE Unit weiter auf den alten Ordner, und der naechste
# Stromausfall faehrt von dort hoch. Docker legt dann jede fehlende Bind-Quelle
# LEER an, waehrend die Datenbank im gemeinsamen Volume weiterlebt: das Geraet
# stuende ohne Apps, ohne Zertifikat und ohne Sicherungen da. Derselbe Riegel
# steht in `arasul`.
# shellcheck source=../lib/installation.sh
source "${SCRIPT_DIR}/../lib/installation.sh"
if [ -f "${PROJECT_DIR}/${ARASUL_ABGEGEBEN}" ]; then
    echo "Dieses Verzeichnis ist nicht mehr das Geraet, es wird hier nichts gestartet." >&2
    sed -n '3,$p' "${PROJECT_DIR}/${ARASUL_ABGEGEBEN}" >&2
    exit 1
fi

# Configuration
PHASE_TIMEOUT=${PHASE_TIMEOUT:-300}       # 5 min per phase
STABILIZE_WAIT=${STABILIZE_WAIT:-10}      # 10s between phases
HEALTH_POLL_INTERVAL=5                    # Check every 5s
# Im Fassungsordner und nicht unter `/arasul/logs` (J35): die Unit laeuft als
# der Mensch, der installiert hat, mit `ProtectSystem=strict`, und schreiben
# darf sie nur in ihrem `ReadWritePaths` -- dem Fassungsordner. Ein `mkdir`
# ausserhalb brach das Skript unter `set -e` ab, bevor es einen Dienst anfasste.
LOG_DIR="${ARASUL_LOG_DIR:-${PROJECT_DIR}/logs}"
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
PHASE1_SERVICES="postgres-db"
PHASE2_SERVICES="llm-service embedding-service"
PHASE3_SERVICES="dashboard-backend dashboard-frontend reverse-proxy"
PHASE4_SERVICES="metrics-collector self-healing-agent backup-service document-indexer"

# Phase 5 ist KEINE Liste, sondern eine Frage an Compose (J33, 26.09.2026).
#
# Der Firmenordner traegt `profiles: [firmenordner]` und stand in keiner der
# vier Listen. `ExecStop` (`docker compose down`) nimmt beim Herunterfahren
# jeden Container des Projekts weg, auch ihn -- und dieses Skript legte nach
# dem Hochfahren nur an, was es beim Namen kannte. Jeder Neustart eines Geraets
# mit Firmenordner verlor also den Dateidienst, bis jemand
# `docker compose up -d firmenordner` tippte (Kundendurchlauf 2, 25.09.2026,
# am Orin). Eine fuenfte Liste mit `firmenordner` darin haette denselben
# Fehler fuer das naechste Profil wieder angelegt; `docker compose config
# --services` nennt genau die Dienste, die die `.env` des Geraets einschaltet,
# und was davon in keiner Phase steht, kommt hier.
profile_services() {
    local alle svc
    alle=$(cd "$PROJECT_DIR" && docker compose config --services 2>/dev/null) || return 0
    for svc in $alle; do
        case " $PHASE1_SERVICES $PHASE2_SERVICES $PHASE3_SERVICES $PHASE4_SERVICES " in
            *" $svc "*) ;;
            *) printf '%s\n' "$svc" ;;
        esac
    done
}


log() {
    local level="$1"
    shift
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*"
    echo "$msg" | tee -a "$LOG_FILE"
}

# Check if a service is healthy
#
# Den Container fragt Compose und nicht ein ausgedachter Name (J35): jeder
# Dienst traegt `container_name`, also hiess nie einer
# `${COMPOSE_PROJECT}-<dienst>-1`, und jede Phase wartete ihre vollen fuenf
# Minuten auf einen Container, den es nicht gibt. Ein Dienst ohne
# Healthcheck gilt als gesund, sobald er laeuft.
is_service_healthy() {
    local service="$1"
    local id health
    id=$(cd "$PROJECT_DIR" && docker compose ps -q "$service" 2>/dev/null) || true
    id="${id%%$'\n'*}"
    [ -n "$id" ] || return 1
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo "missing")

    case "$health" in
        healthy|running) return 0 ;;
        *)               return 1 ;;
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

    local phase5
    phase5=$(profile_services | tr '\n' ' ')
    if [ -n "${phase5// /}" ]; then
        # shellcheck disable=SC2086
        start_phase 5 "Profile" $phase5
    else
        log "INFO" "=== Phase 5: Profile === nichts darueber hinaus (COMPOSE_PROFILES=${COMPOSE_PROFILES:-})"
    fi

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
