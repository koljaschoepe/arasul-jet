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

{
    echo "$BACKUP_SCHEDULE /usr/local/bin/backup.sh >> /backups/backup.log 2>&1"
    if [ "$RESTORE_DRILL_SCHEDULE" != "off" ]; then
        echo "$RESTORE_DRILL_SCHEDULE /usr/local/bin/restore-drill.sh >> /backups/restore_drill.log 2>&1"
    fi
} > /etc/crontabs/root

echo "Backup service started."
echo "  Backup schedule:        $BACKUP_SCHEDULE"
echo "  Restore-drill schedule: $RESTORE_DRILL_SCHEDULE"

# Run crond in foreground
exec crond -f -l 2
