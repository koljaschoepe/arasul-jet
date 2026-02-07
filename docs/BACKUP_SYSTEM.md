# Backup System

Automated backup service for PostgreSQL, MinIO, Qdrant, and n8n workflows.

## Overview

| Property | Value |
|----------|-------|
| Image | alpine:3.19 |
| Container | backup-service |
| Schedule | 02:00 UTC daily (configurable) |
| Retention | 30 days (configurable) |
| Storage | `/data/backups/` |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BACKUP SERVICE                             │
│                    (Alpine + crond)                             │
└─────────────────────────────────────────────────────────────────┘
        │           │           │           │
        ▼           ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   │PostgreSQL│ │  MinIO  │ │ Qdrant  │ │   n8n   │
   │pg_dump  │ │mc mirror│ │snapshot │ │ export  │
   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
        │           │           │           │
        ▼           ▼           ▼           ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                    /data/backups/                           │
   │  postgres/  │  minio/  │  qdrant/  │  n8n/  │  weekly/     │
   └─────────────────────────────────────────────────────────────┘
```

## Backup Components

### 1. PostgreSQL Database

**Method:** `pg_dump` with gzip compression

```bash
pg_dump -h postgres-db -U arasul -d arasul_db \
  --no-owner --no-acl --clean --if-exists \
  | gzip > /backups/postgres/arasul_db_$(date +%Y%m%d_%H%M%S).sql.gz
```

**Output:**
- File: `/backups/postgres/arasul_db_YYYYMMDD_HHMMSS.sql.gz`
- Latest: `/backups/postgres/arasul_db_latest.sql.gz` (symlink)

**Verification:**
```bash
gzip -t /backups/postgres/arasul_db_latest.sql.gz
```

### 2. MinIO Documents

**Method:** `mc mirror` to local filesystem, then tar.gz

```bash
mc mirror minio/documents /tmp/documents_backup/
tar -czf /backups/minio/documents_$(date +%Y%m%d_%H%M%S).tar.gz \
  -C /tmp documents_backup/
```

**Output:**
- File: `/backups/minio/documents_YYYYMMDD_HHMMSS.tar.gz`
- Latest: `/backups/minio/documents_latest.tar.gz` (symlink)

### 3. Qdrant Vectors

**Method:** Qdrant Snapshot API

```bash
# Create snapshot
curl -X POST http://qdrant:6333/snapshots

# Download and compress
tar -czf /backups/qdrant/qdrant_$(date +%Y%m%d_%H%M%S).tar.gz \
  /qdrant/snapshots/
```

**Output:**
- File: `/backups/qdrant/qdrant_YYYYMMDD_HHMMSS.tar.gz`
- Latest: `/backups/qdrant/qdrant_latest.tar.gz` (symlink)

### 4. n8n Workflows

**Method:** n8n CLI export

```bash
n8n export:workflow --all \
  --output=/backups/n8n/workflows_$(date +%Y%m%d_%H%M%S).json
```

**Output:**
- File: `/backups/n8n/workflows_YYYYMMDD_HHMMSS.json`
- Latest: `/backups/n8n/workflows_latest.json` (symlink)

## Directory Structure

```
/data/backups/
├── postgres/
│   ├── arasul_db_20240124_020015.sql.gz
│   ├── arasul_db_20240125_020012.sql.gz
│   └── arasul_db_latest.sql.gz → arasul_db_20240125_020012.sql.gz
├── minio/
│   ├── documents_20240124_020030.tar.gz
│   ├── documents_20240125_020028.tar.gz
│   └── documents_latest.tar.gz → documents_20240125_020028.tar.gz
├── qdrant/
│   ├── qdrant_20240124_020045.tar.gz
│   ├── qdrant_20240125_020042.tar.gz
│   └── qdrant_latest.tar.gz → qdrant_20240125_020042.tar.gz
├── n8n/
│   ├── workflows_20240124_020100.json
│   ├── workflows_20240125_020058.json
│   └── workflows_latest.json → workflows_20240125_020058.json
├── weekly/
│   ├── 2024_W03/
│   │   ├── postgres/
│   │   ├── minio/
│   │   ├── qdrant/
│   │   └── n8n/
│   └── 2024_W04/
├── backup_report.json
└── backup.log
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| BACKUP_SCHEDULE | `0 2 * * *` | Cron schedule (02:00 UTC daily) |
| BACKUP_RETENTION_DAYS | 30 | Days to keep daily backups |
| BACKUP_RETENTION_WEEKLY | 12 | Weeks to keep weekly snapshots |
| POSTGRES_HOST | postgres-db | PostgreSQL host |
| POSTGRES_USER | arasul | PostgreSQL user |
| POSTGRES_PASSWORD | (required) | PostgreSQL password |
| POSTGRES_DB | arasul_db | Database name |
| MINIO_HOST | minio | MinIO host |
| MINIO_ROOT_USER | (required) | MinIO access key |
| MINIO_ROOT_PASSWORD | (required) | MinIO secret key |
| TZ | Europe/Berlin | Timezone |

### Cron Schedule Examples

```bash
# Every day at 02:00 (default)
BACKUP_SCHEDULE="0 2 * * *"

# Every 6 hours
BACKUP_SCHEDULE="0 */6 * * *"

# Every Sunday at 03:00
BACKUP_SCHEDULE="0 3 * * 0"

# Every day at midnight and noon
BACKUP_SCHEDULE="0 0,12 * * *"
```

## Retention Strategy

### Daily Backups

- Kept for `BACKUP_RETENTION_DAYS` (default: 30)
- Oldest backups deleted automatically
- Latest symlinks always point to most recent

### Weekly Snapshots

- Created every Sunday (or on --weekly flag)
- Stored in `/backups/weekly/YYYY_WNUM/`
- Kept for `BACKUP_RETENTION_WEEKLY` weeks (default: 12)
- Full copy of all components

## Manual Execution

### Full Backup

```bash
# Run full backup immediately
./scripts/backup.sh

# With explicit type
./scripts/backup.sh --type full
```

### Incremental Backup

```bash
# Only backup changed files (MinIO)
./scripts/backup.sh --type incremental
```

### Weekly Snapshot

```bash
# Force weekly snapshot
./scripts/backup.sh --weekly
```

### Single Component

```bash
# Backup only PostgreSQL
./scripts/backup.sh --component postgres

# Backup only MinIO
./scripts/backup.sh --component minio
```

## Restore Procedures

### Restore PostgreSQL

```bash
# Stop services that depend on database
docker compose stop dashboard-backend n8n

# Restore from backup
gunzip -c /data/backups/postgres/arasul_db_latest.sql.gz | \
  docker exec -i postgres-db psql -U arasul -d arasul_db

# Restart services
docker compose start dashboard-backend n8n
```

### Restore MinIO

```bash
# Extract backup
tar -xzf /data/backups/minio/documents_latest.tar.gz -C /tmp/

# Upload to MinIO
mc mirror /tmp/documents_backup/ minio/documents/
```

### Restore Qdrant

```bash
# Stop Qdrant
docker compose stop qdrant

# Extract snapshot
tar -xzf /data/backups/qdrant/qdrant_latest.tar.gz -C /tmp/

# Copy to Qdrant storage
cp /tmp/snapshots/* /path/to/qdrant/storage/snapshots/

# Restore via API
curl -X POST http://localhost:6333/collections/documents/snapshots/recover \
  -H 'Content-Type: application/json' \
  -d '{"location": "/snapshots/snapshot_name"}'

# Start Qdrant
docker compose start qdrant
```

### Restore n8n Workflows

```bash
# Import workflows
docker exec n8n n8n import:workflow \
  --input=/backups/n8n/workflows_latest.json
```

## Backup Report

After each backup, a report is generated at `/backups/backup_report.json`:

```json
{
  "timestamp": "2024-01-24T02:01:30.000Z",
  "backup_type": "full",
  "status": "completed",
  "duration_seconds": 90,
  "components": {
    "postgres": {
      "status": "success",
      "file": "arasul_db_20240124_020015.sql.gz",
      "size_bytes": 15728640,
      "duration_seconds": 15
    },
    "minio": {
      "status": "success",
      "file": "documents_20240124_020030.tar.gz",
      "size_bytes": 104857600,
      "duration_seconds": 45
    },
    "qdrant": {
      "status": "success",
      "file": "qdrant_20240124_020045.tar.gz",
      "size_bytes": 52428800,
      "duration_seconds": 20
    },
    "n8n": {
      "status": "success",
      "file": "workflows_20240124_020100.json",
      "size_bytes": 102400,
      "duration_seconds": 5
    }
  },
  "statistics": {
    "total_size_bytes": 173015040,
    "postgres_backups": 30,
    "minio_backups": 30,
    "qdrant_backups": 30,
    "n8n_backups": 30,
    "weekly_snapshots": 4,
    "retention_days": 30,
    "retention_weekly": 12
  },
  "errors": []
}
```

## Monitoring

### Check Backup Status

```bash
# View last backup report
cat /data/backups/backup_report.json | jq .

# Check backup log
tail -100 /data/backups/backup.log

# List recent backups
ls -la /data/backups/postgres/ | tail -5
```

### Verify Backup Integrity

```bash
# Verify PostgreSQL backup
gzip -t /data/backups/postgres/arasul_db_latest.sql.gz && echo "OK"

# Verify MinIO backup
tar -tzf /data/backups/minio/documents_latest.tar.gz > /dev/null && echo "OK"

# Verify Qdrant backup
tar -tzf /data/backups/qdrant/qdrant_latest.tar.gz > /dev/null && echo "OK"

# Verify n8n backup (JSON validity)
jq . /data/backups/n8n/workflows_latest.json > /dev/null && echo "OK"
```

## Troubleshooting

### Backup Fails

1. Check container status: `docker compose ps backup-service`
2. View logs: `docker compose logs backup-service`
3. Verify credentials in environment
4. Check disk space: `df -h /data/backups`

### PostgreSQL Backup Fails

```bash
# Test database connection
docker exec postgres-db pg_isready -U arasul

# Check credentials
docker exec backup-service env | grep POSTGRES
```

### MinIO Backup Fails

```bash
# Test MinIO connection
docker exec backup-service mc ls minio/

# Check bucket exists
docker exec backup-service mc ls minio/documents/
```

### Insufficient Disk Space

```bash
# Check usage
du -sh /data/backups/*

# Manual cleanup (older than 7 days)
find /data/backups/postgres -name "*.sql.gz" -mtime +7 -delete
```

### Restore Fails

1. Verify backup file integrity
2. Check target service is stopped
3. Ensure sufficient disk space
4. Check permissions on backup files

## Security Considerations

1. **Encrypt Backups** - Consider GPG encryption for sensitive data
2. **Secure Storage** - Restrict access to backup directory
3. **Offsite Copy** - Copy to external storage (S3, NAS)
4. **Test Restores** - Regularly test restore procedures
5. **Audit Access** - Log backup/restore operations

### Encryption Example

```bash
# Encrypt backup
gpg --symmetric --cipher-algo AES256 \
  /data/backups/postgres/arasul_db_latest.sql.gz

# Decrypt backup
gpg --decrypt arasul_db_latest.sql.gz.gpg > arasul_db.sql.gz
```

## Related Documentation

- [PostgreSQL Service](../services/postgres/README.md)
- [MinIO Service](MINIO_SERVICE.md)
- [n8n Service](../services/n8n/README.md)
- [Disaster Recovery](DEPLOYMENT.md#disaster-recovery)
