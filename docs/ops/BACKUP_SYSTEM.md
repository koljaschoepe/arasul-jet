# Backup System

Automated backup service for PostgreSQL and the flow definitions under
`data/flows/`.

## Overview

| Property  | Value                          |
| --------- | ------------------------------ |
| Image     | alpine:3.19                    |
| Container | backup-service                 |
| Schedule  | 02:00 UTC daily (configurable) |
| Retention | 7 days (configurable)          |
| Storage   | `/data/backups/`               |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BACKUP SERVICE                             │
│                    (Alpine + crond)                             │
└─────────────────────────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
   ┌─────────┐                    ┌─────────┐
   │PostgreSQL│                   │ Flows   │
   │pg_dump  │                    │ tar.gz  │
   └────┬────┘                    └────┬────┘
        │                              │
        ▼                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                    /data/backups/                           │
   │      postgres/ │ escrow/ │ flows/ │ wal-archive/            │
   └─────────────────────────────────────────────────────────────┘
```

## Backup Components

### 1. PostgreSQL Database

**Method:** `pg_dump` with gzip compression.

```bash
pg_dump -h postgres-db -U arasul -d arasul_db \
  --no-owner --no-acl --clean --if-exists \
  | gzip > /backups/postgres/arasul_db_$(date +%Y%m%d_%H%M%S).sql.gz
```

**Output:**

- File: `/backups/postgres/arasul_db_YYYYMMDD_HHMMSS.sql.gz`
- Latest: `/backups/postgres/arasul_db_latest.sql.gz` (symlink)
- Weekly: `/backups/postgres/weekly/` (Sundays), Monthly:
  `/backups/postgres/monthly/` (1st of month)

**Verification:**

```bash
gzip -t /backups/postgres/arasul_db_latest.sql.gz
```

### 2. Flows

Flow definitions (Plan 011) are Markdown files under `data/flows/` — they are
**not** stored in Postgres. They are user-authored and
reproducible from nowhere else, so a device loss without this archive would
silently take every self-built flow with it. The directory is mounted
read-only into the backup service at `FLOWS_BACKUP_DIR` (default
`/arasul/flows`).

**Method:** tar.gz of the flows directory, verified by reading the archive back

```bash
tar -czf /backups/flows/flows_$(date +%Y%m%d_%H%M%S).tar.gz \
  -C "${FLOWS_BACKUP_DIR:-/arasul/flows}" .
tar -tzf /backups/flows/flows_$(date +%Y%m%d_%H%M%S).tar.gz   # verify
```

**Output:**

- File: `/backups/flows/flows_YYYYMMDD_HHMMSS.tar.gz`
- Latest: `/backups/flows/flows_latest.tar.gz` (symlink)
- Weekly: `/backups/flows/weekly/` (Sundays), Monthly: `/backups/flows/monthly/` (1st of month)

Retention follows the same daily / weekly / monthly rules as PostgreSQL.
If backup encryption is enabled, the archive is encrypted in place after
verification (same `encrypt_file` step as the other components).

**Missing directory is a warning, not a failure:** older deployments have no
such mount, and failing there would make the healthcheck report a broken backup
on a perfectly healthy box. The report field `flows_status` is `true`,
`false` or `skipped` accordingly.

### 4. WAL Archive

If WAL segments are being shipped into `/backups/wal` (Postgres
`archive_mode`), `backup.sh` bundles them into a dated tar.gz under
`/backups/wal-archive/` for point-in-time recovery, and prunes both the
archive and the raw segments once they age past the daily retention window.

## Directory Structure

```
/data/backups/
├── postgres/
│   ├── arasul_db_20240124_020015.sql.gz
│   ├── arasul_db_20240125_020012.sql.gz
│   ├── arasul_db_latest.sql.gz → arasul_db_20240125_020012.sql.gz
│   ├── weekly/
│   └── monthly/
├── flows/
│   ├── flows_20240124_020110.tar.gz
│   ├── flows_20240125_020108.tar.gz
│   ├── flows_latest.tar.gz → flows_20240125_020108.tar.gz
│   ├── weekly/
│   └── monthly/
├── wal-archive/
├── backup_report.json
└── backup.log
```

## Configuration

### Environment Variables

| Variable                        | Default                            | Description                                |
| ------------------------------- | ---------------------------------- | ------------------------------------------ |
| BACKUP_SCHEDULE                 | `0 2 * * *`                        | Cron schedule (02:00 UTC daily)            |
| BACKUP_RETENTION_DAYS           | 7                                  | Days to keep daily backups                 |
| BACKUP_WEEKLY_RETENTION_WEEKS   | 12 (52 in the script default)      | Weeks to keep weekly snapshots             |
| BACKUP_MONTHLY_RETENTION_MONTHS | 60                                 | Months to keep monthly snapshots           |
| BACKUP_ENCRYPT                  | false                              | Encrypt backups with AES-256-CBC (openssl) |
| BACKUP_ENCRYPT_KEY_FILE         | /run/secrets/backup_encryption_key | Key file used when BACKUP_ENCRYPT=true     |
| POSTGRES_HOST                   | postgres-db                        | PostgreSQL host                            |
| POSTGRES_USER                   | arasul                             | PostgreSQL user                            |
| POSTGRES_PASSWORD               | (required, via Docker secret)      | PostgreSQL password                        |
| POSTGRES_DB                     | arasul_db                          | Database name                              |
| FLOWS_BACKUP_DIR                | /arasul/flows                      | Source dir of the flow files (read-only)   |
| TZ                              | Europe/Berlin                      | Timezone                                   |

Production backups run automatically via cron inside the `backup-service`
container (`/usr/local/bin/backup.sh`, i.e.
[`services/backup-service/backup.sh`](../../services/backup-service/backup.sh)).
`scripts/backup/backup.sh` below is a separate, host-run CLI variant with its
own `--type`/`--component` flags.

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

- Kept for `BACKUP_RETENTION_DAYS` (default: 7)
- Oldest backups deleted automatically
- Latest symlinks always point to most recent

### Weekly and Monthly Snapshots

- Postgres and flows each get their own `weekly/` (Sundays) and `monthly/`
  (1st of month) subdirectory
- Kept for `BACKUP_WEEKLY_RETENTION_WEEKS` / `BACKUP_MONTHLY_RETENTION_MONTHS`

## Manual Execution

### Production Backup

```bash
# Run the scheduled backup immediately, inside the running container
docker exec backup-service /usr/local/bin/backup.sh
```

### Host-Run CLI Variant

```bash
# Run full backup immediately
./scripts/backup/backup.sh

# With explicit type
./scripts/backup/backup.sh --type full
```

### Single Component

```bash
# Backup only PostgreSQL
./scripts/backup/backup.sh --component postgres
```

## Restore Procedures

### Restore PostgreSQL

```bash
# Stop services that depend on database
docker compose stop dashboard-backend

# Restore from backup
gunzip -c /data/backups/postgres/arasul_db_latest.sql.gz | \
  docker exec -i postgres-db psql -U arasul -d arasul_db

# Restart services
docker compose start dashboard-backend
```

### Restore Flows

Unpack into the host directory `data/flows/` — the backend picks changes up on
the next read (the registry cache is invalidated per file via mtime+size, no
restart needed).

```bash
tar -xzf /data/backups/flows/flows_latest.tar.gz -C /path/to/arasul-jet/data/flows/
```

## Backup Report

After each backup, a report is generated at `/backups/backup_report.json`:

```json
{
  "timestamp": "2026-08-26T02:01:30+02:00",
  "status": "completed",
  "postgres_backups": 7,
  "postgres_weekly": 3,
  "postgres_monthly": 2,
  "flows_status": "true",
  "flows_backups": 7,
  "retention_days": 7,
  "weekly_retention_weeks": 52,
  "monthly_retention_months": 60,
  "encrypted": "false",
  "encryption_requested": "false",
  "postgres_size": "48M",
  "wal_size": "0",
  "wal_segments": 0,
  "total_size": "52M"
}
```

`status` is `partial_failure` (not `completed`) if any backed-up component
failed. `flows_status` is `true`, `false` or `skipped` (see above).

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

# Verify flows backup
tar -tzf /data/backups/flows/flows_latest.tar.gz > /dev/null && echo "OK"
```

### Restore Drill

`services/backup-service/restore-drill.sh` restores the latest PostgreSQL dump
into a scratch database and additionally inspects the flows archive. Its report
carries two extra fields:

| Field          | Meaning                                                                        |
| -------------- | ------------------------------------------------------------------------------ |
| `flows_files`  | Number of `.md` files found in the archive (`0` unless `flows_status` is `ok`) |
| `flows_status` | One of the four states below                                                   |

> **Not the same field as in `backup_report.json`.** Both reports happen to
> carry a key called `flows_status`, but they answer different questions and
> use different vocabularies. In `backup_report.json` it reports whether the
> archive was _written_ (`true` / `false` / `skipped`); here it reports whether
> the archive is _readable_ (`ok` / `encrypted` / `absent` / `corrupt`).

- `ok` — archive present, readable and listed; `flows_files` holds the count.
- `encrypted` — backup encryption is on, so the archive is no longer a gzip
  stream. It is reported as-is and **not** verified; the drill still passes.
- `absent` — no archive under `/backups/flows/flows_latest.tar.gz`. The drill
  **does not fail** (a fresh box or an older deployment without the mount).
- `corrupt` — the archive exists as gzip but cannot be listed. The drill still
  reports `status: ok` and exits `0`, because its primary question is _"can the
  database be restored?"_ — a problem with a handful of text files must not
  raise a false DR alarm or devalue that signal. The problem stays visible in
  two places: the drill log, and the report's `detail` field, which then carries
  `WARNUNG: Flow-Archiv beschaedigt`. Act on it, but do not read it as a
  failed database drill.

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

### Encryption

`BACKUP_ENCRYPT=true` makes `backup.sh` encrypt every archive in place with
`openssl enc -aes-256-cbc -pbkdf2` against `BACKUP_ENCRYPT_KEY_FILE`. Older
archives created with the previous GPG-based flow decrypt via
`gpg --decrypt` and `BACKUP_ENCRYPTION_KEY_FILE`; `scripts/backup/restore.sh`
detects which of the two a given file is by its magic bytes, not its
extension.

## Related Documentation

- [PostgreSQL Service](../../services/postgres/README.md)
- [Disaster Recovery](DISASTER_RECOVERY.md)
