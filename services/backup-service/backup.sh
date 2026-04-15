#!/bin/bash
set -e

# Resolve Docker secrets (_FILE env vars → regular env vars)
[ -f "$POSTGRES_PASSWORD_FILE" ] && POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")
[ -f "$MINIO_ROOT_USER_FILE" ] && MINIO_ROOT_USER=$(cat "$MINIO_ROOT_USER_FILE")
[ -f "$MINIO_ROOT_PASSWORD_FILE" ] && MINIO_ROOT_PASSWORD=$(cat "$MINIO_ROOT_PASSWORD_FILE")

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u) # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date +%d)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
WEEKLY_RETENTION_WEEKS=${BACKUP_WEEKLY_RETENTION_WEEKS:-52}
WEEKLY_RETENTION_DAYS=$((WEEKLY_RETENTION_WEEKS * 7))
MONTHLY_RETENTION_MONTHS=${BACKUP_MONTHLY_RETENTION_MONTHS:-60}
MONTHLY_RETENTION_DAYS=$((MONTHLY_RETENTION_MONTHS * 30))

# Backup encryption (AES-256-CBC via openssl)
BACKUP_ENCRYPT=${BACKUP_ENCRYPT:-false}
BACKUP_ENCRYPT_KEY_FILE=${BACKUP_ENCRYPT_KEY_FILE:-/run/secrets/backup_encryption_key}

encrypt_file() {
    local src="$1"
    if [ "$BACKUP_ENCRYPT" = "true" ] && [ -f "$BACKUP_ENCRYPT_KEY_FILE" ]; then
        local key
        key=$(cat "$BACKUP_ENCRYPT_KEY_FILE")
        if openssl enc -aes-256-cbc -salt -pbkdf2 -in "$src" -out "${src}.enc" -pass "pass:${key}" 2>/dev/null; then
            mv "${src}.enc" "$src"
            echo "[$TIMESTAMP] Encrypted: $(basename "$src")"
            return 0
        else
            echo "[$TIMESTAMP] [WARNING] Encryption failed for $(basename "$src"), keeping unencrypted"
            rm -f "${src}.enc"
            return 1
        fi
    fi
    return 0
}

echo "[$TIMESTAMP] Starting backup..."
BACKUP_OK=true

# PostgreSQL backup (use .pgpass to avoid password in process listing)
mkdir -p /backups/postgres /backups/postgres/weekly
echo "$POSTGRES_HOST:${POSTGRES_PORT:-5432}:$POSTGRES_DB:$POSTGRES_USER:$POSTGRES_PASSWORD" > ~/.pgpass
chmod 600 ~/.pgpass
if pg_dump \
  -h "$POSTGRES_HOST" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner --no-acl --clean --if-exists \
  | gzip > /backups/postgres/arasul_db_$TIMESTAMP.sql.gz; then
    # Verify backup integrity
    if gunzip -t /backups/postgres/arasul_db_$TIMESTAMP.sql.gz 2>/dev/null; then
        PG_BYTES=$(stat -c%s /backups/postgres/arasul_db_$TIMESTAMP.sql.gz 2>/dev/null || echo "0")
        if [ "$PG_BYTES" -gt 100 ] 2>/dev/null; then
            echo "[$TIMESTAMP] PostgreSQL backup completed and verified (${PG_BYTES} bytes)"
        else
            echo "[$TIMESTAMP] [ERROR] PostgreSQL backup too small (${PG_BYTES} bytes) — likely empty"
            BACKUP_OK=false
        fi
    else
        echo "[$TIMESTAMP] [ERROR] PostgreSQL backup corrupt (gunzip integrity check failed)"
        BACKUP_OK=false
    fi
else
    echo "[$TIMESTAMP] [ERROR] PostgreSQL backup failed"
    BACKUP_OK=false
fi
rm -f ~/.pgpass
encrypt_file /backups/postgres/arasul_db_$TIMESTAMP.sql.gz
ln -sf arasul_db_$TIMESTAMP.sql.gz /backups/postgres/arasul_db_latest.sql.gz

# Weekly snapshot: copy Sunday's backup to weekly dir (kept longer)
if [ "$DAY_OF_WEEK" = "7" ]; then
    cp /backups/postgres/arasul_db_$TIMESTAMP.sql.gz /backups/postgres/weekly/
    echo "[$TIMESTAMP] Weekly PostgreSQL snapshot saved"
fi

# Monthly snapshot: copy 1st of month to monthly dir (5-year retention)
if [ "$DAY_OF_MONTH" = "01" ]; then
    mkdir -p /backups/postgres/monthly
    cp /backups/postgres/arasul_db_$TIMESTAMP.sql.gz /backups/postgres/monthly/
    echo "[$TIMESTAMP] Monthly PostgreSQL snapshot saved"
fi

# MinIO backup via docker exec (credentials via env to avoid process listing exposure)
mkdir -p /backups/minio /backups/minio/weekly
docker exec -e MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000" minio mc mirror --overwrite local/documents /tmp/backup_docs 2>/dev/null || true
docker cp minio:/tmp/backup_docs /tmp/minio_backup_$TIMESTAMP 2>/dev/null || mkdir -p /tmp/minio_backup_$TIMESTAMP
if tar -czf /backups/minio/documents_$TIMESTAMP.tar.gz -C /tmp minio_backup_$TIMESTAMP 2>/dev/null; then
    # Verify tar archive integrity
    if tar -tzf /backups/minio/documents_$TIMESTAMP.tar.gz >/dev/null 2>&1; then
        echo "[$TIMESTAMP] MinIO backup completed and verified"
    else
        echo "[$TIMESTAMP] [ERROR] MinIO backup archive corrupt (tar integrity check failed)"
        BACKUP_OK=false
    fi
else
    echo "[$TIMESTAMP] [ERROR] MinIO backup archive creation failed"
    BACKUP_OK=false
fi
encrypt_file /backups/minio/documents_$TIMESTAMP.tar.gz
ln -sf documents_$TIMESTAMP.tar.gz /backups/minio/documents_latest.tar.gz
rm -rf /tmp/minio_backup_$TIMESTAMP
docker exec minio rm -rf /tmp/backup_docs 2>/dev/null || true

# Weekly snapshot for MinIO
if [ "$DAY_OF_WEEK" = "7" ]; then
    cp /backups/minio/documents_$TIMESTAMP.tar.gz /backups/minio/weekly/
    echo "[$TIMESTAMP] Weekly MinIO snapshot saved"
fi

# Monthly snapshot for MinIO
if [ "$DAY_OF_MONTH" = "01" ]; then
    mkdir -p /backups/minio/monthly
    cp /backups/minio/documents_$TIMESTAMP.tar.gz /backups/minio/monthly/
    echo "[$TIMESTAMP] Monthly MinIO snapshot saved"
fi

# WAL archive backup: include in daily backup for PITR
WAL_COUNT=0
if [ -d /backups/wal ] && [ "$(ls -A /backups/wal 2>/dev/null)" ]; then
    mkdir -p /backups/wal-archive
    tar -czf /backups/wal-archive/wal_$TIMESTAMP.tar.gz -C /backups/wal . 2>/dev/null || true
    WAL_COUNT=$(ls /backups/wal/ 2>/dev/null | wc -l)
    echo "[$TIMESTAMP] WAL archive backup completed ($WAL_COUNT files)"
fi

# Cleanup: only run if backup succeeded (don't purge WAL if we might need it for recovery)
if [ "$BACKUP_OK" = true ]; then
    # Cleanup: daily backups (short retention)
    find /backups/postgres -maxdepth 1 -name "*.sql.gz" ! -name "*latest*" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/minio -maxdepth 1 -name "*.tar.gz" ! -name "*latest*" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

    # WAL archive cleanup: keep only retention period worth
    WAL_ARCHIVE_DELETED=$(find /backups/wal-archive -name "*.tar.gz" -mtime +$RETENTION_DAYS -print 2>/dev/null | wc -l)
    find /backups/wal-archive -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    [ "$WAL_ARCHIVE_DELETED" -gt 0 ] && echo "[$TIMESTAMP] WAL archive cleanup: removed $WAL_ARCHIVE_DELETED archive(s) older than ${RETENTION_DAYS}d"

    # WAL segment cleanup: delete raw segments older than retention (already archived above)
    WAL_SEGMENTS_DELETED=$(find /backups/wal -maxdepth 1 -type f -mtime +$RETENTION_DAYS -print 2>/dev/null | wc -l)
    find /backups/wal -maxdepth 1 -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    [ "$WAL_SEGMENTS_DELETED" -gt 0 ] && echo "[$TIMESTAMP] WAL segment cleanup: removed $WAL_SEGMENTS_DELETED file(s) older than ${RETENTION_DAYS}d"

    # Cleanup: weekly backups (longer retention)
    find /backups/postgres/weekly -name "*.sql.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/minio/weekly -name "*.tar.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true

    # Cleanup: monthly backups (5-year retention)
    find /backups/postgres/monthly -name "*.sql.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/minio/monthly -name "*.tar.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    echo "[$TIMESTAMP] Cleanup completed (daily: ${RETENTION_DAYS}d, weekly: ${WEEKLY_RETENTION_WEEKS}w, monthly: ${MONTHLY_RETENTION_MONTHS}mo)"
else
    echo "[$TIMESTAMP] [WARNING] Skipping cleanup — backup had errors (WAL files preserved for recovery)"
fi

# Calculate backup sizes
PG_SIZE=$(du -sh /backups/postgres/ 2>/dev/null | cut -f1 || echo "0")
MINIO_SIZE=$(du -sh /backups/minio/ 2>/dev/null | cut -f1 || echo "0")
WAL_SIZE=$(du -sh /backups/wal/ 2>/dev/null | cut -f1 || echo "0")
TOTAL_SIZE=$(du -sh /backups/ 2>/dev/null | cut -f1 || echo "0")

# Disk usage warning (>10% of total disk)
DISK_TOTAL_KB=$(df /backups | awk 'NR==2 {print $2}')
BACKUP_KB=$(du -sk /backups/ 2>/dev/null | cut -f1 || echo "0")
if [ "$DISK_TOTAL_KB" -gt 0 ] 2>/dev/null; then
    BACKUP_PERCENT=$((BACKUP_KB * 100 / DISK_TOTAL_KB))
    if [ "$BACKUP_PERCENT" -gt 10 ]; then
        echo "[WARNING] Backups use ${BACKUP_PERCENT}% of disk (${TOTAL_SIZE}). Consider reducing retention."
    fi
fi

# Generate report
cat > /backups/backup_report.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "status": "$([ "$BACKUP_OK" = true ] && echo completed || echo partial_failure)",
  "postgres_backups": $(ls /backups/postgres/*.sql.gz 2>/dev/null | grep -v latest | wc -l),
  "postgres_weekly": $(ls /backups/postgres/weekly/*.sql.gz 2>/dev/null | wc -l),
  "postgres_monthly": $(ls /backups/postgres/monthly/*.sql.gz 2>/dev/null | wc -l),
  "minio_backups": $(ls /backups/minio/*.tar.gz 2>/dev/null | grep -v latest | wc -l),
  "minio_weekly": $(ls /backups/minio/weekly/*.tar.gz 2>/dev/null | wc -l),
  "minio_monthly": $(ls /backups/minio/monthly/*.tar.gz 2>/dev/null | wc -l),
  "retention_days": $RETENTION_DAYS,
  "weekly_retention_weeks": $WEEKLY_RETENTION_WEEKS,
  "monthly_retention_months": $MONTHLY_RETENTION_MONTHS,
  "encrypted": "$BACKUP_ENCRYPT",
  "postgres_size": "$PG_SIZE",
  "minio_size": "$MINIO_SIZE",
  "wal_size": "$WAL_SIZE",
  "wal_segments": $WAL_COUNT,
  "total_size": "$TOTAL_SIZE"
}
EOF
if [ "$BACKUP_OK" = true ]; then
    echo "[$TIMESTAMP] Backup completed successfully (total: ${TOTAL_SIZE})"
else
    echo "[$TIMESTAMP] Backup completed with errors (total: ${TOTAL_SIZE})"
fi
