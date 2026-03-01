#!/bin/bash
# =============================================================================
# Arasul Platform - Automated Backup Script
# =============================================================================
# Backs up PostgreSQL database and MinIO documents bucket
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

# Database settings
POSTGRES_HOST=${POSTGRES_HOST:-postgres-db}
POSTGRES_USER=${POSTGRES_USER:-arasul}
POSTGRES_DB=${POSTGRES_DB:-arasul_db}

# MinIO settings
MINIO_HOST=${MINIO_HOST:-minio}
MINIO_PORT=${MINIO_PORT:-9000}
MINIO_ROOT_USER=${MINIO_ROOT_USER:-arasul}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-}
MINIO_BUCKET=${MINIO_BUCKET:-documents}

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
    mkdir -p "${BACKUP_DIR}/minio"
    mkdir -p "${BACKUP_DIR}/qdrant"
    mkdir -p "${BACKUP_DIR}/n8n"
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

# Backup MinIO documents bucket
backup_minio() {
    log "INFO" "Starting MinIO backup..."

    local backup_dir="${BACKUP_DIR}/minio/documents_${TIMESTAMP}"
    local backup_archive="${BACKUP_DIR}/minio/documents_${TIMESTAMP}.tar.gz"
    local backup_archive_latest="${BACKUP_DIR}/minio/documents_latest.tar.gz"

    # Check if minio container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^minio$"; then
        log "ERROR" "MinIO container is not running"
        return 1
    fi

    mkdir -p "${backup_dir}"

    # Use mc (MinIO client) to mirror the bucket
    # First, configure mc alias inside the minio container
    if docker exec minio mc alias set local \
        "http://localhost:9000" \
        "${MINIO_ROOT_USER}" \
        "${MINIO_ROOT_PASSWORD}" 2>/dev/null; then

        # Mirror documents to a temp location inside container, then copy out
        if docker exec minio mc mirror \
            --overwrite \
            "local/${MINIO_BUCKET}" \
            "/tmp/backup_${MINIO_BUCKET}" 2>/dev/null; then

            # Copy from container to host
            docker cp "minio:/tmp/backup_${MINIO_BUCKET}/." "${backup_dir}/"

            # Clean up temp in container
            docker exec minio rm -rf "/tmp/backup_${MINIO_BUCKET}" 2>/dev/null || true

            # Create compressed archive
            if tar -czf "${backup_archive}" -C "${BACKUP_DIR}/minio" "documents_${TIMESTAMP}"; then
                rm -rf "${backup_dir}"

                local size=$(du -h "${backup_archive}" | cut -f1)
                local file_count=$(tar -tzf "${backup_archive}" 2>/dev/null | wc -l)
                log "INFO" "MinIO backup completed: ${backup_archive} (${size}, ${file_count} files)"

                # Create/update latest symlink
                ln -sf "$(basename "${backup_archive}")" "${backup_archive_latest}"

                echo "${backup_archive}"
                return 0
            else
                log "ERROR" "Failed to create MinIO backup archive"
                rm -rf "${backup_dir}"
                return 1
            fi
        else
            log "ERROR" "MinIO mirror operation failed"
            rm -rf "${backup_dir}"
            return 1
        fi
    else
        log "ERROR" "Failed to configure MinIO client"
        return 1
    fi
}

# Backup Qdrant vector database
backup_qdrant() {
    log "INFO" "Starting Qdrant backup..."

    local backup_dir="${BACKUP_DIR}/qdrant"
    local backup_archive="${BACKUP_DIR}/qdrant/qdrant_${TIMESTAMP}.tar.gz"
    local backup_archive_latest="${BACKUP_DIR}/qdrant/qdrant_latest.tar.gz"

    mkdir -p "${backup_dir}"

    # Check if qdrant container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^qdrant$"; then
        log "WARN" "Qdrant container is not running, skipping backup"
        return 1
    fi

    # Create snapshot via Qdrant API
    log "INFO" "Creating Qdrant snapshot..."
    if docker exec qdrant curl -s -X POST "http://localhost:6333/snapshots" -H "Content-Type: application/json" > /dev/null 2>&1; then
        # Wait for snapshot to be created
        sleep 2

        # Get latest snapshot name
        local snapshot_name=$(docker exec qdrant curl -s "http://localhost:6333/snapshots" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)

        if [[ -n "$snapshot_name" ]]; then
            # Copy snapshot from container
            local temp_dir="/tmp/qdrant_backup_${TIMESTAMP}"
            mkdir -p "${temp_dir}"

            docker cp "qdrant:/qdrant/snapshots/${snapshot_name}" "${temp_dir}/" 2>/dev/null || true

            # Create compressed archive
            if tar -czf "${backup_archive}" -C "${temp_dir}" . 2>/dev/null; then
                rm -rf "${temp_dir}"

                local size=$(du -h "${backup_archive}" | cut -f1)
                log "INFO" "Qdrant backup completed: ${backup_archive} (${size})"

                # Create/update latest symlink
                ln -sf "$(basename "${backup_archive}")" "${backup_archive_latest}"

                echo "${backup_archive}"
                return 0
            else
                log "ERROR" "Failed to create Qdrant backup archive"
                rm -rf "${temp_dir}"
                return 1
            fi
        else
            log "WARN" "No Qdrant snapshot found"
            return 1
        fi
    else
        log "ERROR" "Failed to create Qdrant snapshot"
        return 1
    fi
}

# Backup n8n workflows
backup_n8n() {
    log "INFO" "Starting n8n workflows backup..."

    local backup_dir="${BACKUP_DIR}/n8n"
    local backup_file="${BACKUP_DIR}/n8n/workflows_${TIMESTAMP}.json"
    local backup_file_latest="${BACKUP_DIR}/n8n/workflows_latest.json"

    mkdir -p "${backup_dir}"

    # Check if n8n container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^n8n$"; then
        log "WARN" "n8n container is not running, skipping backup"
        return 1
    fi

    # Export all workflows using n8n CLI
    log "INFO" "Exporting n8n workflows..."
    if docker exec n8n n8n export:workflow --all --output=/tmp/workflows_export.json 2>/dev/null; then
        # Copy from container to host
        if docker cp "n8n:/tmp/workflows_export.json" "${backup_file}" 2>/dev/null; then
            # Clean up temp file in container
            docker exec n8n rm -f /tmp/workflows_export.json 2>/dev/null || true

            local size=$(du -h "${backup_file}" | cut -f1)
            local workflow_count=$(grep -c '"name"' "${backup_file}" 2>/dev/null || echo "?")
            log "INFO" "n8n backup completed: ${backup_file} (${size}, ${workflow_count} workflows)"

            # Create/update latest symlink
            ln -sf "$(basename "${backup_file}")" "${backup_file_latest}"

            echo "${backup_file}"
            return 0
        else
            log "ERROR" "Failed to copy n8n workflows from container"
            return 1
        fi
    else
        log "WARN" "n8n export command failed (may have no workflows yet)"
        # Create empty backup file to indicate backup was attempted
        echo "[]" > "${backup_file}"
        ln -sf "$(basename "${backup_file}")" "${backup_file_latest}"
        return 0
    fi
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

        if [[ -f "${BACKUP_DIR}/minio/documents_latest.tar.gz" ]]; then
            cp "${BACKUP_DIR}/minio/documents_latest.tar.gz" \
               "${weekly_dir}/minio_W${week_number}.tar.gz"
        fi

        if [[ -f "${BACKUP_DIR}/qdrant/qdrant_latest.tar.gz" ]]; then
            cp "${BACKUP_DIR}/qdrant/qdrant_latest.tar.gz" \
               "${weekly_dir}/qdrant_W${week_number}.tar.gz"
        fi

        if [[ -f "${BACKUP_DIR}/n8n/workflows_latest.json" ]]; then
            cp "${BACKUP_DIR}/n8n/workflows_latest.json" \
               "${weekly_dir}/n8n_W${week_number}.json"
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
        ((deleted_count++))
        log "DEBUG" "Deleted old backup: $file"
    done < <(find "${BACKUP_DIR}/postgres" -name "arasul_db_*.sql.gz" \
        ! -name "arasul_db_latest.sql.gz" \
        -type f -mtime +${RETENTION_DAYS} -print0 2>/dev/null)

    # Clean MinIO daily backups
    while IFS= read -r -d '' file; do
        rm -f "$file"
        ((deleted_count++))
        log "DEBUG" "Deleted old backup: $file"
    done < <(find "${BACKUP_DIR}/minio" -name "documents_*.tar.gz" \
        ! -name "documents_latest.tar.gz" \
        -type f -mtime +${RETENTION_DAYS} -print0 2>/dev/null)

    # Clean Qdrant daily backups
    while IFS= read -r -d '' file; do
        rm -f "$file"
        ((deleted_count++))
        log "DEBUG" "Deleted old backup: $file"
    done < <(find "${BACKUP_DIR}/qdrant" -name "qdrant_*.tar.gz" \
        ! -name "qdrant_latest.tar.gz" \
        -type f -mtime +${RETENTION_DAYS} -print0 2>/dev/null)

    # Clean n8n workflow backups
    while IFS= read -r -d '' file; do
        rm -f "$file"
        ((deleted_count++))
        log "DEBUG" "Deleted old backup: $file"
    done < <(find "${BACKUP_DIR}/n8n" -name "workflows_*.json" \
        ! -name "workflows_latest.json" \
        -type f -mtime +${RETENTION_DAYS} -print0 2>/dev/null)

    # Clean weekly backups (keep last N weeks)
    local weekly_retention_days=$((RETENTION_WEEKLY * 7))
    while IFS= read -r -d '' dir; do
        rm -rf "$dir"
        ((deleted_count++))
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

    # Upload MinIO backup
    if [[ -f "${BACKUP_DIR}/minio/documents_latest.tar.gz" ]]; then
        aws s3 cp "${BACKUP_DIR}/minio/documents_latest.tar.gz" \
            "s3://${AWS_S3_BUCKET}/minio/documents_${TIMESTAMP}.tar.gz" \
            --quiet 2>/dev/null && \
        log "INFO" "MinIO backup uploaded to S3"
    fi
}

# Generate backup report
generate_report() {
    local report_file="${BACKUP_DIR}/backup_report.json"

    local postgres_count=$(find "${BACKUP_DIR}/postgres" -name "*.sql.gz" -type f 2>/dev/null | wc -l)
    local minio_count=$(find "${BACKUP_DIR}/minio" -name "*.tar.gz" -type f 2>/dev/null | wc -l)
    local qdrant_count=$(find "${BACKUP_DIR}/qdrant" -name "*.tar.gz" -type f 2>/dev/null | wc -l)
    local n8n_count=$(find "${BACKUP_DIR}/n8n" -name "*.json" -type f 2>/dev/null | wc -l)
    local weekly_count=$(find "${BACKUP_DIR}/weekly" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    local total_size=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1)

    cat > "${report_file}" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "backup_type": "${BACKUP_TYPE}",
    "status": "completed",
    "statistics": {
        "postgres_backups": ${postgres_count},
        "minio_backups": ${minio_count},
        "qdrant_backups": ${qdrant_count},
        "n8n_backups": ${n8n_count},
        "weekly_snapshots": ${weekly_count},
        "total_size": "${total_size}",
        "retention_days": ${RETENTION_DAYS},
        "retention_weekly": ${RETENTION_WEEKLY}
    },
    "latest_backups": {
        "postgres": "$(readlink -f "${BACKUP_DIR}/postgres/arasul_db_latest.sql.gz" 2>/dev/null || echo 'none')",
        "minio": "$(readlink -f "${BACKUP_DIR}/minio/documents_latest.tar.gz" 2>/dev/null || echo 'none')",
        "qdrant": "$(readlink -f "${BACKUP_DIR}/qdrant/qdrant_latest.tar.gz" 2>/dev/null || echo 'none')",
        "n8n": "$(readlink -f "${BACKUP_DIR}/n8n/workflows_latest.json" 2>/dev/null || echo 'none')"
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
    local minio_success=false
    local qdrant_success=false
    local n8n_success=false

    # Setup
    setup_directories

    # Run backups
    if backup_postgres; then
        postgres_success=true
    fi

    if backup_minio; then
        minio_success=true
    fi

    if backup_qdrant; then
        qdrant_success=true
    fi

    if backup_n8n; then
        n8n_success=true
    fi

    # Weekly snapshot
    create_weekly_backup

    # Cleanup old backups
    cleanup_old_backups

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
    log "INFO" "MinIO: $([ "$minio_success" = true ] && echo 'SUCCESS' || echo 'FAILED')"
    log "INFO" "Qdrant: $([ "$qdrant_success" = true ] && echo 'SUCCESS' || echo 'SKIPPED/FAILED')"
    log "INFO" "n8n: $([ "$n8n_success" = true ] && echo 'SUCCESS' || echo 'SKIPPED/FAILED')"
    log "INFO" "=========================================="

    # Exit with error if critical backups failed (postgres and minio are critical)
    if [[ "$postgres_success" != "true" ]] || [[ "$minio_success" != "true" ]]; then
        exit 1
    fi
}

# Run main
main "$@"
