#!/bin/bash
# =============================================================================
# Arasul Platform - Restore Script
# =============================================================================
# Restores PostgreSQL database and/or MinIO documents from backup
#
# Usage:
#   ./restore.sh --postgres <backup_file>    # Restore PostgreSQL only
#   ./restore.sh --minio <backup_file>       # Restore MinIO only
#   ./restore.sh --all --date YYYYMMDD       # Restore both from specific date
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

# MinIO settings
MINIO_ROOT_USER=${MINIO_ROOT_USER:-arasul}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-}
MINIO_BUCKET=${MINIO_BUCKET:-documents}

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
    echo "=== Available MinIO Backups ==="
    if ls "${BACKUP_DIR}/minio/"*.tar.gz* 1>/dev/null 2>&1; then
        ls -lh "${BACKUP_DIR}/minio/"*.tar.gz* | awk '{print $9, "(" $5 ")"}'
    else
        echo "  No MinIO backups found"
    fi

    echo ""
    echo "=== Available Qdrant Backups ==="
    if ls "${BACKUP_DIR}/qdrant/"*.tar.gz* 1>/dev/null 2>&1; then
        ls -lh "${BACKUP_DIR}/qdrant/"*.tar.gz* | awk '{print $9, "(" $5 ")"}'
    else
        echo "  No Qdrant backups found"
    fi

    echo ""
    echo "=== Available n8n Backups ==="
    if ls "${BACKUP_DIR}/n8n/"*.json* 1>/dev/null 2>&1; then
        ls -lh "${BACKUP_DIR}/n8n/"*.json* | awk '{print $9, "(" $5 ")"}'
    else
        echo "  No n8n backups found"
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
    if ! docker ps --format '{{.Names}}' | grep -q "^postgres-db$"; then
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

# Restore MinIO documents
restore_minio() {
    local backup_file="$1"

    # Validate backup file
    if [[ ! -f "$backup_file" ]]; then
        log "ERROR" "Backup file not found: $backup_file"
        exit 1
    fi

    if [[ ! "$backup_file" =~ \.tar\.gz$ ]]; then
        log "ERROR" "Invalid backup file format. Expected .tar.gz"
        exit 1
    fi

    # Verify backup integrity
    log "INFO" "Verifying backup integrity..."
    if ! tar -tzf "$backup_file" >/dev/null 2>&1; then
        log "ERROR" "Backup file is corrupted"
        exit 1
    fi

    local file_count=$(tar -tzf "$backup_file" 2>/dev/null | wc -l)
    log "INFO" "Backup contains ${file_count} files"

    confirm "This will restore documents to MinIO. Existing files with same names will be overwritten!"

    # Check if minio container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^minio$"; then
        log "ERROR" "MinIO container is not running"
        exit 1
    fi

    log "INFO" "Starting MinIO restore from: $backup_file"

    # Extract to temp directory
    local temp_dir=$(mktemp -d)
    tar -xzf "$backup_file" -C "$temp_dir"

    # Find the extracted directory (handle different backup structures)
    local source_dir=$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type d | head -1)
    if [[ -z "$source_dir" ]]; then
        source_dir="$temp_dir"
    fi

    # Configure mc and restore
    log "INFO" "Copying files to MinIO..."
    docker exec minio mc alias set local "http://localhost:9000" \
        "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" 2>/dev/null

    # Copy files into container and then to MinIO
    docker cp "${source_dir}/." "minio:/tmp/restore_${MINIO_BUCKET}"

    if docker exec minio mc mirror \
        --overwrite \
        "/tmp/restore_${MINIO_BUCKET}" \
        "local/${MINIO_BUCKET}" 2>/dev/null; then

        # Cleanup
        docker exec minio rm -rf "/tmp/restore_${MINIO_BUCKET}" 2>/dev/null || true
        rm -rf "$temp_dir"

        log "INFO" "MinIO restore completed successfully"
        return 0
    else
        rm -rf "$temp_dir"
        log "ERROR" "MinIO restore failed"
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

    echo "${file}"
    return 0
}

# Restore Qdrant vector database
restore_qdrant() {
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

    if ! docker ps --format '{{.Names}}' | grep -q "^qdrant$"; then
        log "ERROR" "Qdrant container is not running"
        exit 1
    fi

    confirm "This will restore the Qdrant vector database from backup."

    log "INFO" "Starting Qdrant restore from: $backup_file"

    local temp_dir=$(mktemp -d)
    tar -xzf "$backup_file" -C "$temp_dir"

    # Find snapshot file
    local snapshot_file
    snapshot_file=$(find "$temp_dir" -name "*.snapshot" -type f | head -1)

    if [[ -z "$snapshot_file" ]]; then
        log "ERROR" "No .snapshot file found in backup archive"
        rm -rf "$temp_dir"
        return 1
    fi

    # Upload snapshot to Qdrant via API
    local snapshot_name
    snapshot_name=$(basename "$snapshot_file")
    docker cp "${snapshot_file}" "qdrant:/qdrant/snapshots/${snapshot_name}"

    if docker exec qdrant curl -sf -X POST \
        "http://localhost:6333/snapshots/${snapshot_name}/recover" \
        -H "Content-Type: application/json" > /dev/null 2>&1; then
        log "INFO" "Qdrant restore completed successfully"
        rm -rf "$temp_dir"
        return 0
    else
        log "ERROR" "Qdrant snapshot recovery failed"
        rm -rf "$temp_dir"
        return 1
    fi
}

# Restore n8n workflows
restore_n8n() {
    local backup_file="$1"

    backup_file=$(decrypt_if_needed "${backup_file}") || exit 1

    if [[ ! -f "$backup_file" ]]; then
        log "ERROR" "Backup file not found: $backup_file"
        exit 1
    fi

    if [[ ! "$backup_file" =~ \.json$ ]]; then
        log "ERROR" "Invalid backup file format. Expected .json"
        exit 1
    fi

    if ! docker ps --format '{{.Names}}' | grep -q "^n8n$"; then
        log "ERROR" "n8n container is not running"
        exit 1
    fi

    confirm "This will import workflows into n8n. Existing workflows with same IDs will be updated."

    log "INFO" "Starting n8n workflow restore from: $backup_file"

    # Copy backup into container
    docker cp "$backup_file" "n8n:/tmp/workflows_restore.json"

    if docker exec n8n n8n import:workflow --input=/tmp/workflows_restore.json 2>/dev/null; then
        docker exec n8n rm -f /tmp/workflows_restore.json 2>/dev/null || true
        log "INFO" "n8n workflow restore completed successfully"
        return 0
    else
        docker exec n8n rm -f /tmp/workflows_restore.json 2>/dev/null || true
        log "ERROR" "n8n workflow restore failed"
        return 1
    fi
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
            file=$(ls "${BACKUP_DIR}/postgres/arasul_db_${date}"*.sql.gz* 2>/dev/null | head -1)
            ;;
        minio)
            file=$(ls "${BACKUP_DIR}/minio/documents_${date}"*.tar.gz* 2>/dev/null | head -1)
            ;;
        qdrant)
            file=$(ls "${BACKUP_DIR}/qdrant/qdrant_${date}"*.tar.gz* 2>/dev/null | head -1)
            ;;
        n8n)
            file=$(ls "${BACKUP_DIR}/n8n/workflows_${date}"*.json* 2>/dev/null | head -1)
            ;;
        config)
            file=$(ls "${BACKUP_DIR}/config/config_${date}"*.tar.gz* 2>/dev/null | head -1)
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
    echo "  $0 --minio <backup_file>       Restore MinIO from specific backup"
    echo "  $0 --qdrant <backup_file>      Restore Qdrant vectors from specific backup"
    echo "  $0 --n8n <backup_file>         Restore n8n workflows from specific backup"
    echo "  $0 --config <backup_file>      Restore platform config (.env, certs)"
    echo "  $0 --all --date YYYYMMDD       Restore everything from specific date"
    echo "  $0 --latest                    Restore from latest backups"
    echo "  $0 --list                      List available backups"
    echo ""
    echo "Encrypted backups (.gpg) are auto-decrypted if BACKUP_ENCRYPTION_KEY_FILE is set."
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

        --minio)
            if [[ -z "${2:-}" ]]; then
                log "ERROR" "Please specify a backup file"
                usage
                exit 1
            fi
            restore_minio "$2"
            ;;

        --qdrant)
            if [[ -z "${2:-}" ]]; then
                log "ERROR" "Please specify a backup file"
                usage
                exit 1
            fi
            restore_qdrant "$2"
            ;;

        --n8n)
            if [[ -z "${2:-}" ]]; then
                log "ERROR" "Please specify a backup file"
                usage
                exit 1
            fi
            restore_n8n "$2"
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
            local minio_latest="${BACKUP_DIR}/minio/documents_latest.tar.gz"
            local qdrant_latest="${BACKUP_DIR}/qdrant/qdrant_latest.tar.gz"
            local n8n_latest="${BACKUP_DIR}/n8n/workflows_latest.json"
            local config_latest="${BACKUP_DIR}/config/config_latest.tar.gz"

            if [[ -L "$pg_latest" ]]; then
                restore_postgres "$(readlink -f "$pg_latest")"
            else
                log "WARN" "No latest PostgreSQL backup found"
            fi

            if [[ -L "$minio_latest" ]]; then
                restore_minio "$(readlink -f "$minio_latest")"
            else
                log "WARN" "No latest MinIO backup found"
            fi

            if [[ -L "$qdrant_latest" ]]; then
                restore_qdrant "$(readlink -f "$qdrant_latest")"
            else
                log "WARN" "No latest Qdrant backup found"
            fi

            if [[ -L "$n8n_latest" ]]; then
                restore_n8n "$(readlink -f "$n8n_latest")"
            else
                log "WARN" "No latest n8n backup found"
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
            local minio_backup=$(find_backup_by_date "minio" "$date")
            local qdrant_backup=$(find_backup_by_date "qdrant" "$date")
            local n8n_backup=$(find_backup_by_date "n8n" "$date")
            local config_backup=$(find_backup_by_date "config" "$date")

            if [[ -n "$pg_backup" ]]; then
                restore_postgres "$pg_backup"
            else
                log "WARN" "No PostgreSQL backup found for date: $date"
            fi

            if [[ -n "$minio_backup" ]]; then
                restore_minio "$minio_backup"
            else
                log "WARN" "No MinIO backup found for date: $date"
            fi

            if [[ -n "$qdrant_backup" ]]; then
                restore_qdrant "$qdrant_backup"
            else
                log "WARN" "No Qdrant backup found for date: $date"
            fi

            if [[ -n "$n8n_backup" ]]; then
                restore_n8n "$n8n_backup"
            else
                log "WARN" "No n8n backup found for date: $date"
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
