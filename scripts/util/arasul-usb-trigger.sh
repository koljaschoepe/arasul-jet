#!/bin/bash
# ARASUL USB Trigger Script
# Called by udev when USB device is plugged in
# Should be placed in /usr/local/bin/arasul-usb-trigger.sh

LOG_FILE="/arasul/logs/usb_trigger.log"

# Log the event
echo "$(date '+%Y-%m-%d %H:%M:%S') - USB device detected: $DEVNAME" >> "$LOG_FILE"

# Wait a moment for device to be fully mounted
sleep 2

# Find the mount point
MOUNT_POINT=$(mount | grep "$DEVNAME" | awk '{print $3}' | head -1)

if [ -z "$MOUNT_POINT" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Device not mounted: $DEVNAME" >> "$LOG_FILE"
    exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Mounted at: $MOUNT_POINT" >> "$LOG_FILE"

# Check for .araupdate files
UPDATE_FILES=$(find "$MOUNT_POINT" -maxdepth 2 -name "*.araupdate" 2>/dev/null)

if [ -z "$UPDATE_FILES" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - No .araupdate files found" >> "$LOG_FILE"
    exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Found .araupdate files:" >> "$LOG_FILE"
echo "$UPDATE_FILES" >> "$LOG_FILE"

# Signal the USB monitor to check for new devices
# The USB monitor runs continuously and will detect the new mount
# We just need to ensure it's running
docker exec self-healing-agent pgrep -f usb_monitor.py > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - WARNING: USB monitor not running" >> "$LOG_FILE"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - USB monitor is active" >> "$LOG_FILE"
fi

exit 0
