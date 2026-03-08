#!/bin/bash
set -e

# Resolve Docker secrets (_FILE env vars → regular env vars)
[ -f "$POSTGRES_PASSWORD_FILE" ] && POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")
[ -f "$MINIO_ROOT_USER_FILE" ] && MINIO_ROOT_USER=$(cat "$MINIO_ROOT_USER_FILE")
[ -f "$MINIO_ROOT_PASSWORD_FILE" ] && MINIO_ROOT_PASSWORD=$(cat "$MINIO_ROOT_PASSWORD_FILE")

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
echo "[$TIMESTAMP] Starting backup..."

# PostgreSQL backup (use .pgpass to avoid password in process listing)
mkdir -p /backups/postgres
echo "$POSTGRES_HOST:${POSTGRES_PORT:-5432}:$POSTGRES_DB:$POSTGRES_USER:$POSTGRES_PASSWORD" > ~/.pgpass
chmod 600 ~/.pgpass
pg_dump \
  -h "$POSTGRES_HOST" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner --no-acl --clean --if-exists \
  | gzip > /backups/postgres/arasul_db_$TIMESTAMP.sql.gz
rm -f ~/.pgpass
ln -sf arasul_db_$TIMESTAMP.sql.gz /backups/postgres/arasul_db_latest.sql.gz
echo "[$TIMESTAMP] PostgreSQL backup completed"

# MinIO backup via docker exec (credentials via env to avoid process listing exposure)
mkdir -p /backups/minio
docker exec -e MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@localhost:9000" minio mc mirror --overwrite local/documents /tmp/backup_docs 2>/dev/null || true
docker cp minio:/tmp/backup_docs /tmp/minio_backup_$TIMESTAMP 2>/dev/null || mkdir -p /tmp/minio_backup_$TIMESTAMP
tar -czf /backups/minio/documents_$TIMESTAMP.tar.gz -C /tmp minio_backup_$TIMESTAMP 2>/dev/null || true
ln -sf documents_$TIMESTAMP.tar.gz /backups/minio/documents_latest.tar.gz
rm -rf /tmp/minio_backup_$TIMESTAMP
docker exec minio rm -rf /tmp/backup_docs 2>/dev/null || true
echo "[$TIMESTAMP] MinIO backup completed"

# Cleanup old backups
find /backups/postgres -name "*.sql.gz" ! -name "*latest*" -mtime +$BACKUP_RETENTION_DAYS -delete 2>/dev/null || true
find /backups/minio -name "*.tar.gz" ! -name "*latest*" -mtime +$BACKUP_RETENTION_DAYS -delete 2>/dev/null || true
echo "[$TIMESTAMP] Cleanup completed"

# Generate report
cat > /backups/backup_report.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "status": "completed",
  "postgres_backups": $(ls /backups/postgres/*.sql.gz 2>/dev/null | wc -l),
  "minio_backups": $(ls /backups/minio/*.tar.gz 2>/dev/null | wc -l),
  "retention_days": $BACKUP_RETENTION_DAYS
}
EOF
echo "[$TIMESTAMP] Backup completed successfully"
