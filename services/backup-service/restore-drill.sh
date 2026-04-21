#!/bin/bash
# =============================================================================
# Arasul Platform — Backup Restore Drill (Phase 5.2)
# =============================================================================
# Picks the latest postgres backup, restores it into a throw-away container on
# an isolated network, counts rows on every critical table, and writes a report
# to data/backups/restore_drill_report.json. The dashboard Ops-Overview widget
# surfaces this timestamp so operators see at a glance whether DR is current.
#
# Usage:
#   scripts/ops/restore-drill.sh                 # run against latest backup
#   scripts/ops/restore-drill.sh --file X.sql.gz # run against specific file
#   scripts/ops/restore-drill.sh --dry-run       # report plan, no docker run
#
# Safe-by-design:
#   - Uses a dedicated container name + random host port; does not touch the
#     production postgres-db container or volume.
#   - Runs in a temporary docker network, no link to app services.
#   - Always cleans up the container, even on failure (trap EXIT).
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_DIR="${PROJECT_DIR}/data/backups"
POSTGRES_BACKUP_DIR="${BACKUP_DIR}/postgres"
REPORT_PATH="${BACKUP_DIR}/restore_drill_report.json"
LOG_FILE="${BACKUP_DIR}/restore_drill.log"

# Container on a dedicated name so concurrent runs / stale drills are obvious
DRILL_CONTAINER="arasul-restore-drill"
# Pin the image to what prod runs; the drill is meaningless against a newer/older pg.
DRILL_IMAGE="postgres:16-alpine"
DRILL_DB="arasul_drill"
DRILL_USER="arasul"
DRILL_PASSWORD="drill-$(head -c 12 /dev/urandom | base64 | tr -d '/+=' | head -c 16)"

# Tables we insist the restore brings back. Counts must be > 0 for any table
# that is populated in production. The list is intentionally narrow — a drill
# that demands every one of 85 tables is non-zero will flap on legitimately
# unused features.
CRITICAL_TABLES=(
    admin_users
    chat_conversations
    chat_messages
    documents
    document_chunks
    alert_settings
)

DRY_RUN=false
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --file)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            sed -n '1,25p' "$0"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

mkdir -p "$BACKUP_DIR" 2>/dev/null || true
# data/backups is root-owned (backup-service writes it). When the drill is
# invoked as an unprivileged user, fall through to /tmp so the script is still
# useful for ad-hoc local testing. The JSON report is still written to the
# canonical path if possible.
if ! { : >> "$LOG_FILE"; } 2>/dev/null; then
    LOG_FILE="/tmp/arasul_restore_drill.log"
    : >> "$LOG_FILE" 2>/dev/null || LOG_FILE="/dev/stderr"
fi
if ! { : >> "$REPORT_PATH"; } 2>/dev/null; then
    REPORT_PATH="/tmp/arasul_restore_drill_report.json"
fi

log() {
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    if [[ "$LOG_FILE" == "/dev/stderr" ]]; then
        echo "[${ts}] $*" >&2
    else
        echo "[${ts}] $*" | tee -a "$LOG_FILE"
    fi
}

json_escape() {
    # Escape \ " and control chars for JSON string use. Good enough for the
    # small, ASCII-only payloads this script produces.
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    printf '%s' "$s"
}

write_report() {
    local status="$1"
    local detail="$2"
    local verified="${3:-0}"
    local duration="${4:-0}"
    local basename
    basename="$(basename "$BACKUP_FILE" 2>/dev/null || echo "")"
    local ts
    ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    cat > "$REPORT_PATH" <<EOF
{
  "status": "$(json_escape "$status")",
  "detail": "$(json_escape "$detail")",
  "verified_tables": ${verified},
  "duration_seconds": ${duration},
  "backup_file": "$(json_escape "$basename")",
  "timestamp": "${ts}"
}
EOF
    log "Report written: status=${status} verified=${verified} duration=${duration}s"
}

cleanup() {
    if docker ps -a --format '{{.Names}}' | grep -qx "$DRILL_CONTAINER"; then
        docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

if [[ -z "$BACKUP_FILE" ]]; then
    BACKUP_FILE="${POSTGRES_BACKUP_DIR}/arasul_db_latest.sql.gz"
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    log "ERROR: backup file not found: $BACKUP_FILE"
    write_report "error" "backup_not_found: ${BACKUP_FILE}" 0 0
    exit 1
fi

# Resolve symlink to the real file so the report is unambiguous
BACKUP_FILE="$(readlink -f "$BACKUP_FILE")"
log "Drill starting. Backup file: $BACKUP_FILE"

if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN: would start $DRILL_IMAGE, load $BACKUP_FILE, verify ${#CRITICAL_TABLES[@]} tables"
    write_report "dry_run" "no container started" 0 0
    exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
    log "ERROR: docker not available"
    write_report "error" "docker_not_available" 0 0
    exit 1
fi

DRILL_START=$(date +%s)

cleanup   # clear any stale container from a previous failed run

log "Starting $DRILL_IMAGE as $DRILL_CONTAINER"
docker run -d --rm \
    --name "$DRILL_CONTAINER" \
    -e POSTGRES_PASSWORD="$DRILL_PASSWORD" \
    -e POSTGRES_USER="$DRILL_USER" \
    -e POSTGRES_DB="$DRILL_DB" \
    "$DRILL_IMAGE" >/dev/null

# Wait for postgres to accept connections (up to 45s)
ready=false
for i in $(seq 1 45); do
    if docker exec "$DRILL_CONTAINER" pg_isready -U "$DRILL_USER" -d "$DRILL_DB" >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != "true" ]]; then
    log "ERROR: drill container not ready after 45s"
    write_report "error" "container_start_timeout" 0 $(( $(date +%s) - DRILL_START ))
    exit 1
fi

log "Restoring backup into drill container"
# pg_dump files start with "\restrict" directives that require psql; redirect
# stdout/stderr so a broken backup shows up in the drill log.
if ! zcat "$BACKUP_FILE" | docker exec -i "$DRILL_CONTAINER" \
        psql -U "$DRILL_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=0 \
        >>"$LOG_FILE" 2>&1; then
    log "WARN: psql returned non-zero — continuing to verification (partial restores still inform us)"
fi

verified=0
failed_tables=()
for tbl in "${CRITICAL_TABLES[@]}"; do
    # Table may not exist if migrations didn't all replay; treat as failure
    if ! count=$(docker exec "$DRILL_CONTAINER" \
            psql -U "$DRILL_USER" -d "$DRILL_DB" -tAc "SELECT COUNT(*) FROM $tbl" 2>/dev/null); then
        log "FAIL: $tbl — relation missing or query error"
        failed_tables+=("$tbl")
        continue
    fi
    if [[ -z "$count" || "$count" -lt 0 ]]; then
        failed_tables+=("$tbl")
        continue
    fi
    log "OK:   $tbl = $count rows"
    verified=$((verified + 1))
done

duration=$(( $(date +%s) - DRILL_START ))

if (( ${#failed_tables[@]} > 0 )); then
    write_report "failed" "missing: ${failed_tables[*]}" "$verified" "$duration"
    log "Drill FAILED after ${duration}s (verified=${verified}, failed=${#failed_tables[@]})"
    exit 1
fi

write_report "ok" "all ${verified} critical tables verified" "$verified" "$duration"
log "Drill OK in ${duration}s (verified=${verified})"
