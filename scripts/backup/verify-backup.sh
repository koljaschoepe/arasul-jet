#!/bin/bash
# =============================================================================
# Arasul Platform - Backup Verification Script
# =============================================================================
# Verifies that the latest backup can be successfully restored.
# Spins up a temporary PostgreSQL container, restores the backup, and checks
# that tables and row counts are plausible.
#
# Usage: ./verify-backup.sh [--quiet]
# Intended to run monthly via cron or self-healing agent.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
BACKUP_DIR="${PROJECT_DIR}/data/backups"
LOG_FILE="${BACKUP_DIR}/verify-backup.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

VERIFY_CONTAINER="arasul-backup-verify"
VERIFY_PORT=54321
VERIFY_USER="verify_user"
VERIFY_DB="verify_db"
VERIFY_PASSWORD="verify_$(date +%s)"

QUIET=false
[[ "${1:-}" == "--quiet" ]] && QUIET=true

# Encryption key (if backups are encrypted)
BACKUP_ENCRYPTION_KEY_FILE=${BACKUP_ENCRYPTION_KEY_FILE:-/run/secrets/backup_key}

log() {
    local level="$1"
    shift
    local message="$*"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${ts}] [${level}] ${message}" >> "${LOG_FILE}"
    [[ "$QUIET" != "true" ]] && echo "[${level}] ${message}"
}

cleanup() {
    log "INFO" "Cleaning up verification container..."
    docker rm -f "${VERIFY_CONTAINER}" 2>/dev/null || true
}

trap cleanup EXIT

# Find latest PostgreSQL backup (plain or encrypted)
find_latest_pg_backup() {
    local latest_link="${BACKUP_DIR}/postgres/arasul_db_latest.sql.gz"

    if [[ -L "${latest_link}" ]]; then
        local target
        target=$(readlink -f "${latest_link}")
        # Check for .gpg variant
        if [[ -f "${target}.gpg" ]]; then
            echo "${target}.gpg"
        elif [[ -f "${target}" ]]; then
            echo "${target}"
        fi
    fi

    # Fallback: find most recent file
    find "${BACKUP_DIR}/postgres" -name "arasul_db_*.sql.gz*" \
        ! -name "*latest*" ! -name "*pre_restore*" \
        -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2
}

# Decrypt if needed, returns path to usable file
prepare_backup() {
    local file="$1"

    if [[ "${file}" =~ \.gpg$ ]]; then
        if [[ ! -f "${BACKUP_ENCRYPTION_KEY_FILE}" ]]; then
            log "ERROR" "Encrypted backup but no key file at: ${BACKUP_ENCRYPTION_KEY_FILE}"
            return 1
        fi
        local decrypted="/tmp/verify_backup_${TIMESTAMP}.sql.gz"
        gpg --batch --yes --decrypt \
            --passphrase-file "${BACKUP_ENCRYPTION_KEY_FILE}" \
            --output "${decrypted}" "${file}" 2>/dev/null || return 1
        echo "${decrypted}"
    else
        echo "${file}"
    fi
}

main() {
    mkdir -p "$(dirname "${LOG_FILE}")"
    log "INFO" "=========================================="
    log "INFO" "Backup Verification Starting"
    log "INFO" "=========================================="

    # 1. Find latest backup
    local backup_file
    backup_file=$(find_latest_pg_backup)

    if [[ -z "${backup_file}" ]]; then
        log "ERROR" "No PostgreSQL backup found to verify"
        echo '{"status":"error","reason":"no_backup_found","timestamp":"'$(date -Iseconds)'"}'
        exit 1
    fi

    local backup_size
    backup_size=$(du -h "${backup_file}" | cut -f1)
    log "INFO" "Verifying backup: $(basename "${backup_file}") (${backup_size})"

    # 2. Integrity check (gzip)
    local usable_file
    usable_file=$(prepare_backup "${backup_file}") || {
        log "ERROR" "Failed to prepare backup (decryption failed?)"
        exit 1
    }

    log "INFO" "Checking gzip integrity..."
    if ! gzip -t "${usable_file}" 2>/dev/null; then
        log "ERROR" "FAIL: Backup file is corrupted (gzip integrity check failed)"
        exit 1
    fi
    log "INFO" "Gzip integrity: OK"

    # 3. Start temporary PostgreSQL container
    log "INFO" "Starting temporary PostgreSQL container..."
    docker rm -f "${VERIFY_CONTAINER}" 2>/dev/null || true

    docker run -d \
        --name "${VERIFY_CONTAINER}" \
        -e POSTGRES_USER="${VERIFY_USER}" \
        -e POSTGRES_PASSWORD="${VERIFY_PASSWORD}" \
        -e POSTGRES_DB="${VERIFY_DB}" \
        -p "127.0.0.1:${VERIFY_PORT}:5432" \
        --tmpfs /var/lib/postgresql/data:size=2G \
        postgres:16-alpine > /dev/null

    # Wait for PostgreSQL to be ready
    log "INFO" "Waiting for temporary database..."
    local retries=30
    while ! docker exec "${VERIFY_CONTAINER}" pg_isready -U "${VERIFY_USER}" -d "${VERIFY_DB}" -q 2>/dev/null; do
        retries=$((retries - 1))
        if [[ $retries -le 0 ]]; then
            log "ERROR" "Temporary PostgreSQL failed to start"
            exit 1
        fi
        sleep 1
    done
    log "INFO" "Temporary database ready"

    # 4. Restore backup
    log "INFO" "Restoring backup into temporary database..."
    local restore_start
    restore_start=$(date +%s)

    if gunzip -c "${usable_file}" | docker exec -i "${VERIFY_CONTAINER}" psql \
        -U "${VERIFY_USER}" -d "${VERIFY_DB}" --quiet 2>/dev/null; then

        local restore_duration=$(( $(date +%s) - restore_start ))
        log "INFO" "Restore completed in ${restore_duration}s"
    else
        log "ERROR" "FAIL: Backup restore failed"
        exit 1
    fi

    # 5. Verify restored data
    log "INFO" "Verifying restored data..."

    # Count tables
    local table_count
    table_count=$(docker exec "${VERIFY_CONTAINER}" psql -U "${VERIFY_USER}" -d "${VERIFY_DB}" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null | tr -d ' ')

    # Count total rows across key tables
    local row_check
    row_check=$(docker exec "${VERIFY_CONTAINER}" psql -U "${VERIFY_USER}" -d "${VERIFY_DB}" \
        -t -c "SELECT SUM(n_live_tup) FROM pg_stat_user_tables;" 2>/dev/null | tr -d ' ')

    # Check for critical tables
    local critical_tables=("users" "audit_logs" "settings" "service_failures")
    local missing_tables=()
    for tbl in "${critical_tables[@]}"; do
        local exists
        exists=$(docker exec "${VERIFY_CONTAINER}" psql -U "${VERIFY_USER}" -d "${VERIFY_DB}" \
            -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='${tbl}';" 2>/dev/null | tr -d ' ')
        if [[ "${exists}" != "1" ]]; then
            missing_tables+=("${tbl}")
        fi
    done

    # 6. Report results
    local status="ok"
    local issues=()

    if [[ "${table_count}" -lt 10 ]]; then
        status="warning"
        issues+=("Low table count: ${table_count}")
    fi

    if [[ ${#missing_tables[@]} -gt 0 ]]; then
        status="error"
        issues+=("Missing critical tables: ${missing_tables[*]}")
    fi

    log "INFO" "Tables: ${table_count} | Rows: ${row_check:-0} | Status: ${status}"

    if [[ ${#issues[@]} -gt 0 ]]; then
        for issue in "${issues[@]}"; do
            log "WARN" "Issue: ${issue}"
        done
    fi

    # Write verification result as JSON
    local result_file="${BACKUP_DIR}/verify_result.json"
    cat > "${result_file}" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "backup_file": "$(basename "${backup_file}")",
    "backup_size": "${backup_size}",
    "status": "${status}",
    "tables": ${table_count},
    "rows": ${row_check:-0},
    "restore_duration_seconds": ${restore_duration},
    "missing_critical_tables": [$(printf '"%s",' "${missing_tables[@]}" 2>/dev/null | sed 's/,$//')]
}
EOF

    log "INFO" "Verification result saved to: ${result_file}"

    # Clean up decrypted temp file if we created one
    if [[ "${usable_file}" == /tmp/verify_backup_* ]]; then
        rm -f "${usable_file}"
    fi

    log "INFO" "=========================================="
    if [[ "${status}" == "ok" ]]; then
        log "INFO" "Backup verification PASSED"
    else
        log "WARN" "Backup verification completed with issues: ${status}"
    fi
    log "INFO" "=========================================="

    [[ "${status}" == "error" ]] && exit 1
    exit 0
}

main "$@"
