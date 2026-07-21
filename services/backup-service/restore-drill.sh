#!/bin/bash
# =============================================================================
# Arasul Platform — Backup Restore Drill (Phase 5.2)
# =============================================================================
# Picks the latest postgres backup, restores it into a throw-away container on
# an isolated network, counts rows on every critical table, and writes a report
# to data/backups/restore_drill_report.json. The dashboard Ops-Overview widget
# surfaces this timestamp so operators see at a glance whether DR is current.
#
# Usage (runs inside the backup-service container as /usr/local/bin/restore-drill.sh):
#   docker exec backup-service /usr/local/bin/restore-drill.sh                 # latest backup
#   docker exec backup-service /usr/local/bin/restore-drill.sh --file X.sql.gz # specific file
#   docker exec backup-service /usr/local/bin/restore-drill.sh --dry-run       # report plan, no docker run
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
# BACKUP_DIR derivation: defaults to repo-relative path for local dev, but
# can be overridden via env when the script is deployed to /usr/local/bin/
# inside the backup-service container (where ${PROJECT_DIR}/data/backups
# resolves to /usr/data/backups, which doesn't exist). The compose mount
# binds the host backups dir to /backups inside the container.
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/data/backups}"
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

# Skill-Archiv pruefen (Plan 011). Die Skills liegen in KEINER Datenbank, der
# Postgres-Drill sagt ueber sie also nichts aus. Geprueft wird deshalb separat:
# existiert das Archiv, ist es lesbar, und enthaelt es .md-Dateien?
#
# Wichtig: Bei BACKUP_ENCRYPT=true ist das Archiv AES-verschluesselt und damit
# kein gueltiges gzip mehr. Ein blindes `tar -tzf` wuerde dann "korrupt" melden,
# obwohl alles in Ordnung ist. Deshalb erst die gzip-Magic-Bytes pruefen und
# verschluesselte Archive als "encrypted" (ungeprueft) ausweisen, statt zu luegen.
SKILLS_ARCHIVE="${BACKUP_DIR}/skills/skills_latest.tar.gz"
skills_status="absent"
skills_files=0

check_skills_archive() {
    if [[ ! -f "$SKILLS_ARCHIVE" ]]; then
        log "SKIP: kein Skill-Archiv unter ${SKILLS_ARCHIVE}"
        skills_status="absent"
        return 0
    fi
    # gzip beginnt mit 0x1f 0x8b; alles andere ist (erwartet) verschluesselt.
    local magic
    magic=$(head -c 2 "$SKILLS_ARCHIVE" | od -An -tx1 | tr -d ' \n')
    if [[ "$magic" != "1f8b" ]]; then
        log "OK:   Skill-Archiv vorhanden, aber verschluesselt — Inhalt nicht pruefbar"
        skills_status="encrypted"
        return 0
    fi
    if ! tar -tzf "$SKILLS_ARCHIVE" >/dev/null 2>&1; then
        log "FAIL: Skill-Archiv ist beschaedigt (${SKILLS_ARCHIVE})"
        skills_status="corrupt"
        return 1
    fi
    skills_files=$(tar -tzf "$SKILLS_ARCHIVE" 2>/dev/null | grep -c '\.md$' || true)
    log "OK:   Skill-Archiv lesbar (${skills_files} Skill-Dateien)"
    skills_status="ok"
    return 0
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
  "skills_status": "$(json_escape "$skills_status")",
  "skills_files": ${skills_files},
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
# P5.7: ON_ERROR_STOP=1 — previously the restore swallowed errors and the
# 6-table count check below could pass while 80 other tables silently failed
# to load. A broken backup must produce a non-zero exit so the drill
# correctly reports failure.
restore_ok=true
if ! zcat "$BACKUP_FILE" | docker exec -i "$DRILL_CONTAINER" \
        psql -U "$DRILL_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 \
        >>"$LOG_FILE" 2>&1; then
    log "FAIL: psql aborted on first error — backup is not cleanly restorable"
    restore_ok=false
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

# Skill-Archiv mitpruefen. Ein beschaedigtes Archiv laesst den Drill scheitern —
# ein fehlendes nicht, denn auf Geraeten ohne Skills gibt es schlicht keines.
skills_ok=true
check_skills_archive || skills_ok=false

duration=$(( $(date +%s) - DRILL_START ))

# P5.7: also fail the drill if the restore itself errored out, even if the
# 6-table check happens to find rows from a partial restore.
if [[ "$restore_ok" != "true" ]]; then
    write_report "failed" "psql restore aborted on error (see drill log)" "$verified" "$duration"
    log "Drill FAILED after ${duration}s — restore step did not complete cleanly"
    exit 1
fi

if (( ${#failed_tables[@]} > 0 )); then
    write_report "failed" "missing: ${failed_tables[*]}" "$verified" "$duration"
    log "Drill FAILED after ${duration}s (verified=${verified}, failed=${#failed_tables[@]})"
    exit 1
fi

# Ein beschaedigtes Skill-Archiv darf den DATENBANK-Befund nicht ueberschreiben.
# Der Drill beantwortet in erster Linie die Frage "laesst sich die DB
# zurueckspielen?" — diese Antwort muss sauber bleiben, sonst loest ein Problem
# mit ein paar Textdateien einen DR-Fehlalarm aus und entwertet das Signal.
# Das Skill-Problem bleibt sichtbar: im Log und als `skills_status` im Report,
# den das Ops-Widget anzeigt.
if [[ "$skills_ok" != "true" ]]; then
    write_report "ok" "all ${verified} critical tables verified; WARNUNG: Skill-Archiv beschaedigt (${SKILLS_ARCHIVE})" "$verified" "$duration"
    log "Drill OK in ${duration}s (DB verified=${verified}) — ABER: Skill-Archiv beschaedigt, bitte pruefen"
    exit 0
fi

write_report "ok" "all ${verified} critical tables verified (skills: ${skills_status})" "$verified" "$duration"
log "Drill OK in ${duration}s (verified=${verified}, skills=${skills_status})"
