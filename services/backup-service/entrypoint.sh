#!/bin/bash
set -euo pipefail

# Run initial backup
echo "Running initial backup..."
/usr/local/bin/backup.sh || echo "Initial backup skipped (services may not be ready)"

# Setup cron
# - Nightly backup on $BACKUP_SCHEDULE
# - Weekly restore drill Sunday 04:00 (Phase 5.2)
#   Override with RESTORE_DRILL_SCHEDULE; disable by setting it to "off".
RESTORE_DRILL_SCHEDULE="${RESTORE_DRILL_SCHEDULE:-0 4 * * 0}"

# busybox crond does not always inherit the entrypoint's env, so we prepend
# BACKUP_DIR (and any other vars the scripts need) directly on the cron line.
# Falls back to /backups, matching the volume mount in compose.monitoring.yaml
# and the ENV BACKUP_DIR in this image's Dockerfile.
BACKUP_DIR_FOR_CRON="${BACKUP_DIR:-/backups}"

{
    echo "$BACKUP_SCHEDULE BACKUP_DIR=$BACKUP_DIR_FOR_CRON /usr/local/bin/backup.sh >> /backups/backup.log 2>&1"
    if [ "$RESTORE_DRILL_SCHEDULE" != "off" ]; then
        echo "$RESTORE_DRILL_SCHEDULE BACKUP_DIR=$BACKUP_DIR_FOR_CRON /usr/local/bin/restore-drill.sh >> /backups/restore_drill.log 2>&1"
    fi
} > /etc/crontabs/root

echo "Backup service started."
echo "  Backup schedule:        $BACKUP_SCHEDULE"
echo "  Restore-drill schedule: $RESTORE_DRILL_SCHEDULE"

# Run crond in foreground
exec crond -f -l 2
