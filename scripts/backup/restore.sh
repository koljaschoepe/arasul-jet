#!/bin/bash
# =============================================================================
# Arasul Platform - Restore Script
# =============================================================================
# Restores PostgreSQL database and/or config from backup
# (MinIO-Zweig am 26.08.2026 entfallen, Phase B4 des Rueckbaus: der
# Objektspeicher ist weg; aeltere documents_*.tar.gz haben kein Ziel mehr)
#
# Usage:
#   ./restore.sh --postgres <backup_file>    # Restore PostgreSQL only
#   ./restore.sh --all --date YYYYMMDD       # Restore everything from specific date
#   ./restore.sh --latest                    # Restore from latest backups
#   ./restore.sh --list                      # List available backups
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
BACKUP_DIR="${PROJECT_DIR}/data/backups"
LOG_FILE="${BACKUP_DIR}/restore.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Database settings
POSTGRES_HOST=${POSTGRES_HOST:-postgres-db}
POSTGRES_USER=${POSTGRES_USER:-arasul}
POSTGRES_DB=${POSTGRES_DB:-arasul_db}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" >> "${LOG_FILE}"

    case "$level" in
        ERROR) echo -e "${RED}[ERROR]${NC} ${message}" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} ${message}" ;;
        INFO)  echo -e "${GREEN}[INFO]${NC} ${message}" ;;
        *)     echo "[${level}] ${message}" ;;
    esac
}

# List available backups
list_backups() {
    echo ""
    echo "=== Available PostgreSQL Backups ==="
    if ls "${BACKUP_DIR}/postgres/"*.sql.gz 1>/dev/null 2>&1; then
        ls -lh "${BACKUP_DIR}/postgres/"*.sql.gz | awk '{print $9, "(" $5 ")"}'
    else
        echo "  No PostgreSQL backups found"
    fi


    echo ""
    echo "=== Available Config Backups ==="
    if ls "${BACKUP_DIR}/config/"config_*.tar.gz* 1>/dev/null 2>&1; then
        ls -lh "${BACKUP_DIR}/config/"config_*.tar.gz* | awk '{print $9, "(" $5 ")"}'
    else
        echo "  No config backups found"
    fi

    echo ""
    echo "=== Weekly Snapshots ==="
    if ls -d "${BACKUP_DIR}/weekly/"*/ 1>/dev/null 2>&1; then
        for dir in "${BACKUP_DIR}/weekly/"*/; do
            echo "  $(basename "$dir")"
        done
    else
        echo "  No weekly snapshots found"
    fi

    echo ""
}

# Confirm action with user
confirm() {
    local message="$1"
    echo -e "${YELLOW}WARNING: ${message}${NC}"
    read -p "Are you sure you want to continue? (yes/no): " response
    if [[ "$response" != "yes" ]]; then
        log "INFO" "Restore cancelled by user"
        exit 0
    fi
}

# Pre-restore checks
pre_restore_checks() {
    # Check if containers are running
    if ! grep -q "^postgres-db$" <<<"$(docker ps --format '{{.Names}}')"; then
        log "ERROR" "PostgreSQL container is not running"
        echo "Please start the services first: docker compose up -d postgres-db"
        exit 1
    fi
}

# Restore PostgreSQL database
restore_postgres() {
    local backup_file="$1"

    # Validate backup file
    if [[ ! -f "$backup_file" ]]; then
        log "ERROR" "Backup file not found: $backup_file"
        exit 1
    fi

    if [[ ! "$backup_file" =~ \.sql\.gz$ ]]; then
        log "ERROR" "Invalid backup file format. Expected .sql.gz"
        exit 1
    fi

    # Verify backup integrity
    log "INFO" "Verifying backup integrity..."
    if ! gzip -t "$backup_file" 2>/dev/null; then
        log "ERROR" "Backup file is corrupted"
        exit 1
    fi

    confirm "This will REPLACE the entire database with the backup. All current data will be lost!"

    log "INFO" "Starting PostgreSQL restore from: $backup_file"

    # Create pre-restore backup
    log "INFO" "Creating pre-restore backup..."
    local pre_restore_backup="${BACKUP_DIR}/postgres/pre_restore_${TIMESTAMP}.sql.gz"
    docker exec postgres-db pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" 2>/dev/null | \
        gzip > "$pre_restore_backup" || true
    log "INFO" "Pre-restore backup saved: $pre_restore_backup"

    # Terminate existing connections
    log "INFO" "Terminating existing database connections..."
    docker exec postgres-db psql -U "${POSTGRES_USER}" -d postgres -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();
    " 2>/dev/null || true

    # Restore the database
    log "INFO" "Restoring database (this may take a while)..."
    if gunzip -c "$backup_file" | docker exec -i postgres-db psql \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        --quiet \
        2>/dev/null; then

        log "INFO" "PostgreSQL restore completed successfully"

        # Verify restore
        local table_count=$(docker exec postgres-db psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
            -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
        log "INFO" "Verified: ${table_count} tables in restored database"

        return 0
    else
        log "ERROR" "PostgreSQL restore failed"
        log "WARN" "You can restore the pre-restore backup from: $pre_restore_backup"
        return 1
    fi
}

# Decrypt a .gpg file if needed (returns path to usable file)
decrypt_if_needed() {
    local file="$1"

    # If file doesn't exist, check for .gpg variant
    if [[ ! -f "${file}" ]] && [[ -f "${file}.gpg" ]]; then
        file="${file}.gpg"
    fi

    if [[ "${file}" =~ \.gpg$ ]]; then
        local key_file="${BACKUP_ENCRYPTION_KEY_FILE:-/run/secrets/backup_key}"
        if [[ ! -f "${key_file}" ]]; then
            log "ERROR" "Encrypted backup but key file not found: ${key_file}"
            log "ERROR" "Set BACKUP_ENCRYPTION_KEY_FILE to the decryption key path"
            return 1
        fi

        local decrypted="${file%.gpg}"
        log "INFO" "Decrypting: $(basename "${file}")"
        if gpg --batch --yes --decrypt \
            --passphrase-file "${key_file}" \
            --output "${decrypted}" \
            "${file}" 2>/dev/null; then
            echo "${decrypted}"
            return 0
        else
            log "ERROR" "Decryption failed for: ${file}"
            return 1
        fi
    fi

    # Plan 023 S3: der Sicherungsdienst (services/backup-service/backup.sh)
    # verschluesselt mit openssl AES-256-CBC und schreibt das Chiffrat unter
    # DEMSELBEN Dateinamen zurueck. Eine Sicherung heisst also weiter .sql.gz
    # oder .tar.gz und ist keine mehr. Ohne diesen Zweig haette dieses Skript
    # gunzip auf Chiffrat angewandt: verschluesselte Sicherungen waeren
    # geschrieben worden, die der dokumentierte Wiederherstellungsweg nicht
    # lesen kann. Erkannt wird an den gzip-Magic-Bytes, nicht an der Endung.
    local magic
    magic=$(head -c 2 "${file}" 2>/dev/null | od -An -tx1 | tr -d ' \n')
    if [[ -n "${magic}" && "${magic}" != "1f8b" ]]; then
        local ossl_key="${BACKUP_ENCRYPT_KEY_FILE:-/run/secrets/backup_encryption_key}"
        if [[ ! -f "${ossl_key}" ]]; then
            log "ERROR" "Sicherung ist verschluesselt, Schluessel fehlt: ${ossl_key}"
            log "ERROR" "BACKUP_ENCRYPT_KEY_FILE auf den Schluessel setzen"
            return 1
        fi
        local klartext="${file}.klartext"
        log "INFO" "Entschluesseln: $(basename "${file}")"
        if openssl enc -d -aes-256-cbc -pbkdf2 -in "${file}" -out "${klartext}" \
            -pass "file:${ossl_key}" 2>/dev/null; then
            echo "${klartext}"
            return 0
        fi
        log "ERROR" "Entschluesselung fehlgeschlagen: ${file}"
        rm -f "${klartext}"
        return 1
    fi

    echo "${file}"
    return 0
}

# Restore platform configuration
restore_config() {
    local backup_file="$1"

    backup_file=$(decrypt_if_needed "${backup_file}") || exit 1

    if [[ ! -f "$backup_file" ]]; then
        log "ERROR" "Backup file not found: $backup_file"
        exit 1
    fi

    if [[ ! "$backup_file" =~ \.tar\.gz$ ]]; then
        log "ERROR" "Invalid backup file format. Expected .tar.gz"
        exit 1
    fi

    confirm "This will OVERWRITE current configuration files (.env, certs, traefik config)!"

    log "INFO" "Starting config restore from: $backup_file"

    # Pre-restore: backup current config
    local config_backup="${BACKUP_DIR}/config/pre_restore_config_${TIMESTAMP}.tar.gz"
    if [[ -f "${PROJECT_DIR}/.env" ]]; then
        tar -czf "${config_backup}" -C "${PROJECT_DIR}" .env config/ 2>/dev/null || true
        log "INFO" "Current config backed up to: ${config_backup}"
    fi

    # Extract config to project dir
    if tar -xzf "$backup_file" -C "${PROJECT_DIR}" 2>/dev/null; then
        log "INFO" "Config restore completed successfully"
        log "WARN" "Restart services to apply restored configuration: docker compose up -d"
        return 0
    else
        log "ERROR" "Config restore failed"
        log "WARN" "Current config backup available at: ${config_backup}"
        return 1
    fi
}

# Find backup by date
find_backup_by_date() {
    local backup_type="$1"
    local date="$2"

    local file=""
    case "$backup_type" in
        postgres)
            file=$(ls "${BACKUP_DIR}/postgres/arasul_db_${date}"*.sql.gz* 2>/dev/null | head -1 || true)
            ;;
        config)
            file=$(ls "${BACKUP_DIR}/config/config_${date}"*.tar.gz* 2>/dev/null | head -1 || true)
            ;;
    esac

    echo "$file"
}

# Print usage
usage() {
    echo "Arasul Platform - Restore Script"
    echo ""
    echo "Usage:"
    echo "  $0 --postgres <backup_file>    Restore PostgreSQL from specific backup"
    echo "  $0 --config <backup_file>      Restore platform config (.env, certs)"
    echo "  $0 --all --date YYYYMMDD       Restore everything from specific date"
    echo "  $0 --latest                    Restore from latest backups"
    echo "  $0 --list                      List available backups"
    echo ""
    echo "Verschluesselte Sicherungen werden automatisch entschluesselt: openssl-AES ueber"
    echo "BACKUP_ENCRYPT_KEY_FILE (Standard /run/secrets/backup_encryption_key), aeltere .gpg"
    echo "ueber BACKUP_ENCRYPTION_KEY_FILE."
    echo ""
    echo "Examples:"
    echo "  $0 --list"
    echo "  $0 --postgres data/backups/postgres/arasul_db_20260105_020000.sql.gz"
    echo "  $0 --all --date 20260105"
    echo "  $0 --latest"
    echo ""
}

# Main execution
main() {
    touch "${LOG_FILE}"

    if [[ $# -eq 0 ]]; then
        usage
        exit 0
    fi

    log "INFO" "=========================================="
    log "INFO" "Arasul Restore Starting"
    log "INFO" "=========================================="

    pre_restore_checks

    case "$1" in
        --list)
            list_backups
            ;;

        --postgres)
            if [[ -z "${2:-}" ]]; then
                log "ERROR" "Please specify a backup file"
                usage
                exit 1
            fi
            restore_postgres "$2"
            ;;

        --config)
            if [[ -z "${2:-}" ]]; then
                log "ERROR" "Please specify a backup file"
                usage
                exit 1
            fi
            restore_config "$2"
            ;;

        --latest)
            log "INFO" "Restoring from latest backups..."
            local pg_latest="${BACKUP_DIR}/postgres/arasul_db_latest.sql.gz"
            local config_latest="${BACKUP_DIR}/config/config_latest.tar.gz"

            if [[ -L "$pg_latest" ]]; then
                restore_postgres "$(readlink -f "$pg_latest")"
            else
                log "WARN" "No latest PostgreSQL backup found"
            fi

            if [[ -L "$config_latest" ]]; then
                restore_config "$(readlink -f "$config_latest")"
            else
                log "WARN" "No latest config backup found"
            fi
            ;;

        --all)
            if [[ "${2:-}" != "--date" ]] || [[ -z "${3:-}" ]]; then
                log "ERROR" "Please specify a date with --date YYYYMMDD"
                usage
                exit 1
            fi

            local date="$3"
            log "INFO" "Restoring from date: $date"

            local pg_backup=$(find_backup_by_date "postgres" "$date")
            local config_backup=$(find_backup_by_date "config" "$date")

            if [[ -n "$pg_backup" ]]; then
                restore_postgres "$pg_backup"
            else
                log "WARN" "No PostgreSQL backup found for date: $date"
            fi

            if [[ -n "$config_backup" ]]; then
                restore_config "$config_backup"
            else
                log "WARN" "No config backup found for date: $date"
            fi
            ;;

        *)
            log "ERROR" "Unknown option: $1"
            usage
            exit 1
            ;;
    esac

    log "INFO" "=========================================="
    log "INFO" "Restore Complete"
    log "INFO" "=========================================="
}

# Run main
main "$@"
