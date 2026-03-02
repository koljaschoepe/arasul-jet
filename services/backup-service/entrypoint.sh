#!/bin/bash
set -e

# Run initial backup
echo "Running initial backup..."
/usr/local/bin/backup.sh || echo "Initial backup skipped (services may not be ready)"

# Setup cron
echo "$BACKUP_SCHEDULE /usr/local/bin/backup.sh >> /backups/backup.log 2>&1" > /etc/crontabs/root
echo "Backup service started. Schedule: $BACKUP_SCHEDULE"

# Run crond in foreground
exec crond -f -l 2
