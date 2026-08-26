#!/bin/bash
# =============================================================================
# Arasul Platform - Automated Backup Script
# =============================================================================
# Backs up PostgreSQL database and config
# (MinIO-Sicherung am 26.08.2026 entfallen, Phase B4 des Rueckbaus: der
# Objektspeicher ist weg; kritisch ist nur noch Postgres)
# Supports retention policies and optional S3 upload
#
# Usage: ./backup.sh [--type full|incremental] [--upload-s3]
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
BACKUP_DIR="${PROJECT_DIR}/data/backups"
LOG_FILE="${BACKUP_DIR}/backup.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_TODAY=$(date +%Y%m%d)

# Retention settings (in days)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
RETENTION_WEEKLY=${BACKUP_RETENTION_WEEKLY:-12}  # Keep weekly backups for 12 weeks

# Encryption settings (optional GPG symmetric encryption for compliance)
BACKUP_ENCRYPTION_ENABLED=${BACKUP_ENCRYPTION_ENABLED:-false}
BACKUP_ENCRYPTION_KEY_FILE=${BACKUP_ENCRYPTION_KEY_FILE:-/run/secrets/backup_key}

# USB backup target (optional offsite copy)
BACKUP_USB_ENABLED=${BACKUP_USB_ENABLED:-false}
BACKUP_USB_MOUNT=${BACKUP_USB_MOUNT:-/mnt/usb-backup}

# Database settings
POSTGRES_HOST=${POSTGRES_HOST:-postgres-db}
POSTGRES_USER=${POSTGRES_USER:-arasul}
POSTGRES_DB=${POSTGRES_DB:-arasul_db}

# Parse arguments
BACKUP_TYPE="full"
UPLOAD_S3=false
QUIET=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --type)
            BACKUP_TYPE="$2"
            shift 2
            ;;
        --upload-s3)
            UPLOAD_S3=true
            shift
            ;;
        --quiet)
            QUIET=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"

    if [[ "$QUIET" != "true" ]]; then
        echo "[${level}] ${message}"
    fi
}

# Create backup directories
setup_directories() {
    mkdir -p "${BACKUP_DIR}/postgres"
    mkdir -p "${BACKUP_DIR}/weekly"
    touch "${LOG_FILE}"
}

# Backup PostgreSQL database
backup_postgres() {
    log "INFO" "Starting PostgreSQL backup..."

    local backup_file="${BACKUP_DIR}/postgres/arasul_db_${TIMESTAMP}.sql.gz"
    local backup_file_latest="${BACKUP_DIR}/postgres/arasul_db_latest.sql.gz"

    # Check if postgres container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^postgres-db$"; then
        log "ERROR" "PostgreSQL container is not running"
        return 1
    fi

    # Create backup using pg_dump
    if docker exec postgres-db pg_dump \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        2>/dev/null | gzip > "${backup_file}"; then

        local size=$(du -h "${backup_file}" | cut -f1)
        log "INFO" "PostgreSQL backup completed: ${backup_file} (${size})"

        # Create/update latest symlink
        ln -sf "$(basename "${backup_file}")" "${backup_file_latest}"

        # Verify backup integrity
        if gzip -t "${backup_file}" 2>/dev/null; then
            log "INFO" "PostgreSQL backup integrity verified"
            echo "${backup_file}"
            return 0
        else
            log "ERROR" "PostgreSQL backup integrity check failed"
            rm -f "${backup_file}"
            return 1
        fi
    else
        log "ERROR" "PostgreSQL backup failed"
        return 1
    fi
}

# Backup platform configuration (.env, certs, traefik, secrets)
backup_config() {
    log "INFO" "Starting configuration backup..."

    local backup_dir="${BACKUP_DIR}/config"
    local backup_archive="${BACKUP_DIR}/config/config_${TIMESTAMP}.tar.gz"
    local backup_archive_latest="${BACKUP_DIR}/config/config_latest.tar.gz"

    mkdir -p "${backup_dir}"

    # Build list of config paths that exist
    local config_paths=()
    [[ -f "${PROJECT_DIR}/.env" ]] && config_paths+=(".env")
    [[ -d "${PROJECT_DIR}/config/traefik/certs" ]] && config_paths+=("config/traefik/certs")
    [[ -d "${PROJECT_DIR}/config/traefik/dynamic" ]] && config_paths+=("config/traefik/dynamic")
    [[ -d "${PROJECT_DIR}/config/postgres" ]] && config_paths+=("config/postgres")
    [[ -d "${PROJECT_DIR}/config/secrets" ]] && config_paths+=("config/secrets")

    if [[ ${#config_paths[@]} -eq 0 ]]; then
        log "WARN" "No configuration files found to backup"
        return 1
    fi

    if tar -czf "${backup_archive}" \
        -C "${PROJECT_DIR}" \
        --exclude='*.backup*' \
        --exclude='*.bak' \
        "${config_paths[@]}" 2>/dev/null; then

        local size=$(du -h "${backup_archive}" | cut -f1)
        log "INFO" "Config backup completed: ${backup_archive} (${size})"
        ln -sf "$(basename "${backup_archive}")" "${backup_archive_latest}"
        echo "${backup_archive}"
        return 0
    else
        log "ERROR" "Config backup failed"
        return 1
    fi
}

# Encrypt a backup file with GPG symmetric encryption
# Usage: encrypt_file <filepath> — replaces original with .gpg version
encrypt_file() {
    local file="$1"

    if [[ "${BACKUP_ENCRYPTION_ENABLED}" != "true" ]]; then
        return 0
    fi

    if [[ ! -f "${BACKUP_ENCRYPTION_KEY_FILE}" ]]; then
        log "ERROR" "Encryption enabled but key file not found: ${BACKUP_ENCRYPTION_KEY_FILE}"
        log "ERROR" "Create it with: openssl rand -base64 32 > ${BACKUP_ENCRYPTION_KEY_FILE}"
        return 1
    fi

    if ! command -v gpg &>/dev/null; then
        log "ERROR" "gpg not installed — cannot encrypt backups"
        return 1
    fi

    if gpg --batch --yes --symmetric \
        --cipher-algo AES256 \
        --passphrase-file "${BACKUP_ENCRYPTION_KEY_FILE}" \
        --output "${file}.gpg" \
        "${file}" 2>/dev/null; then

        rm -f "${file}"
        log "INFO" "Encrypted: $(basename "${file}").gpg"
        return 0
    else
        log "ERROR" "Encryption failed for: ${file}"
        return 1
    fi
}

# Copy latest backups to USB mount (offsite protection)
copy_to_usb() {
    if [[ "${BACKUP_USB_ENABLED}" != "true" ]]; then
        return 0
    fi

    if ! mountpoint -q "${BACKUP_USB_MOUNT}" 2>/dev/null; then
        log "WARN" "USB backup enabled but ${BACKUP_USB_MOUNT} is not mounted — skipping"
        return 1
    fi

    log "INFO" "Copying latest backups to USB: ${BACKUP_USB_MOUNT}"
    local usb_dir="${BACKUP_USB_MOUNT}/arasul-backups/${DATE_TODAY}"
    mkdir -p "${usb_dir}"

    local copied=0
    for latest_file in \
        "${BACKUP_DIR}/postgres/arasul_db_latest.sql.gz" \
        "${BACKUP_DIR}/config/config_latest.tar.gz"; do

        if [[ -e "${latest_file}" ]]; then
            # Follow symlink and copy the actual file (or .gpg variant)
            local real_file
            real_file=$(readlink -f "${latest_file}" 2>/dev/null || echo "${latest_file}")
            [[ -f "${real_file}.gpg" ]] && real_file="${real_file}.gpg"
            cp -f "${real_file}" "${usb_dir}/" && copied=$((copied + 1))
        fi
    done

    # Sync to ensure data is on disk
    sync

    log "INFO" "USB backup complete: ${copied} files copied to ${usb_dir}"
    return 0
}

# Create weekly backup (every Sunday or if forced)
create_weekly_backup() {
    local day_of_week=$(date +%u)
    local week_number=$(date +%V)
    local year=$(date +%Y)

    # Only create weekly backup on Sundays (day 7) or if forced
    if [[ "$day_of_week" == "7" ]] || [[ "${FORCE_WEEKLY:-false}" == "true" ]]; then
        log "INFO" "Creating weekly backup snapshot..."

        local weekly_dir="${BACKUP_DIR}/weekly/${year}_W${week_number}"
        mkdir -p "${weekly_dir}"

        # Copy latest backups to weekly
        if [[ -f "${BACKUP_DIR}/postgres/arasul_db_latest.sql.gz" ]]; then
            cp "${BACKUP_DIR}/postgres/arasul_db_latest.sql.gz" \
               "${weekly_dir}/postgres_W${week_number}.sql.gz"
        fi

        if [[ -f "${BACKUP_DIR}/config/config_latest.tar.gz" ]]; then
            cp "${BACKUP_DIR}/config/config_latest.tar.gz" \
               "${weekly_dir}/config_W${week_number}.tar.gz"
        fi

        log "INFO" "Weekly backup created: ${weekly_dir}"
    fi
}

# Clean up old backups based on retention policy
cleanup_old_backups() {
    log "INFO" "Cleaning up old backups (retention: ${RETENTION_DAYS} days)..."

    local deleted_count=0

    # Clean PostgreSQL daily backups (keep last N days)
    while IFS= read -r -d '' file; do
        rm -f "$file"
        deleted_count=$((deleted_count + 1))
        log "DEBUG" "Deleted old backup: $file"
    done < <(find "${BACKUP_DIR}/postgres" -name "arasul_db_*.sql.gz" \
        ! -name "arasul_db_latest.sql.gz" \
        -type f -mtime +${RETENTION_DAYS} -print0 2>/dev/null)

    # Clean config backups
    while IFS= read -r -d '' file; do
        rm -f "$file"
        deleted_count=$((deleted_count + 1))
        log "DEBUG" "Deleted old backup: $file"
    done < <(find "${BACKUP_DIR}/config" -name "config_*.tar.gz" \
        ! -name "config_latest.tar.gz" \
        -type f -mtime +${RETENTION_DAYS} -print0 2>/dev/null)

    # Clean weekly backups (keep last N weeks)
    local weekly_retention_days=$((RETENTION_WEEKLY * 7))
    while IFS= read -r -d '' dir; do
        rm -rf "$dir"
        deleted_count=$((deleted_count + 1))
        log "DEBUG" "Deleted old weekly backup: $dir"
    done < <(find "${BACKUP_DIR}/weekly" -mindepth 1 -maxdepth 1 \
        -type d -mtime +${weekly_retention_days} -print0 2>/dev/null)

    log "INFO" "Cleanup complete. Deleted ${deleted_count} old backup(s)."
}

# Upload to S3 (optional)
upload_to_s3() {
    if [[ "$UPLOAD_S3" != "true" ]]; then
        return 0
    fi

    if [[ -z "${AWS_S3_BUCKET:-}" ]]; then
        log "WARN" "S3 upload requested but AWS_S3_BUCKET not set"
        return 1
    fi

    log "INFO" "Uploading backups to S3: ${AWS_S3_BUCKET}..."

    # Upload PostgreSQL backup
    if [[ -f "${BACKUP_DIR}/postgres/arasul_db_latest.sql.gz" ]]; then
        aws s3 cp "${BACKUP_DIR}/postgres/arasul_db_latest.sql.gz" \
            "s3://${AWS_S3_BUCKET}/postgres/arasul_db_${TIMESTAMP}.sql.gz" \
            --quiet 2>/dev/null && \
        log "INFO" "PostgreSQL backup uploaded to S3"
    fi

}

# Generate backup report
generate_report() {
    local report_file="${BACKUP_DIR}/backup_report.json"

    local postgres_count=$(find "${BACKUP_DIR}/postgres" -name "*.sql.gz*" -type f 2>/dev/null | wc -l)
    local config_count=$(find "${BACKUP_DIR}/config" -name "config_*.tar.gz*" -type f 2>/dev/null | wc -l)
    local weekly_count=$(find "${BACKUP_DIR}/weekly" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    local total_size=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1)

    cat > "${report_file}" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "backup_type": "${BACKUP_TYPE}",
    "status": "completed",
    "statistics": {
        "postgres_backups": ${postgres_count},
        "config_backups": ${config_count},
        "encryption_enabled": ${BACKUP_ENCRYPTION_ENABLED},
        "weekly_snapshots": ${weekly_count},
        "total_size": "${total_size}",
        "retention_days": ${RETENTION_DAYS},
        "retention_weekly": ${RETENTION_WEEKLY}
    },
    "latest_backups": {
        "postgres": "$(readlink -f "${BACKUP_DIR}/postgres/arasul_db_latest.sql.gz" 2>/dev/null || echo 'none')",
        "config": "$(readlink -f "${BACKUP_DIR}/config/config_latest.tar.gz" 2>/dev/null || echo 'none')"
    }
}
EOF

    log "INFO" "Backup report generated: ${report_file}"
}

# Main execution
main() {
    log "INFO" "=========================================="
    log "INFO" "Arasul Backup Starting (${BACKUP_TYPE})"
    log "INFO" "=========================================="

    local start_time=$(date +%s)
    local postgres_success=false
    local config_success=false

    # Setup
    setup_directories
    mkdir -p "${BACKUP_DIR}/config"

    # Run backups
    local pg_file=""
    if pg_file=$(backup_postgres); then
        postgres_success=true
        encrypt_file "${pg_file}" || true
    fi

    local config_file=""
    if config_file=$(backup_config); then
        config_success=true
        encrypt_file "${config_file}" || true
    fi

    # Weekly snapshot
    create_weekly_backup

    # Cleanup old backups
    cleanup_old_backups

    # Optional USB offsite copy
    copy_to_usb

    # Optional S3 upload
    upload_to_s3

    # Generate report
    generate_report

    # Calculate duration
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Summary
    log "INFO" "=========================================="
    log "INFO" "Backup Complete (${duration}s)"
    log "INFO" "PostgreSQL: $([ "$postgres_success" = true ] && echo 'SUCCESS' || echo 'FAILED')"
    log "INFO" "Config: $([ "$config_success" = true ] && echo 'SUCCESS' || echo 'FAILED')"
    if [[ "${BACKUP_ENCRYPTION_ENABLED}" == "true" ]]; then
        log "INFO" "Encryption: ENABLED (AES-256)"
    fi
    log "INFO" "=========================================="

    # Exit with error if the critical backup failed (only postgres is critical
    # since the MinIO backup ended on 26.08.2026)
    if [[ "$postgres_success" != "true" ]]; then
        exit 1
    fi
}

# Run main
main "$@"
