#!/bin/bash
# ARASUL PLATFORM - Boot Loop Guard
# Prevents infinite reboot loops by tracking boot attempts.
# If more than MAX_BOOTS occur within WINDOW_SECONDS, enters recovery mode.
#
# Recovery mode: Docker services are NOT started, only SSH remains.
# A manual reset is required: rm /var/lib/arasul/boot_guard_triggered
#
# Designed to run as a systemd service (Before=arasul.service).

set -euo pipefail

STATE_DIR="/var/lib/arasul"
BOOT_LOG="${STATE_DIR}/boot_timestamps"
TRIGGER_FILE="${STATE_DIR}/boot_guard_triggered"
LOG_FILE="/arasul/logs/boot-guard.log"

MAX_BOOTS=5              # Max reboots allowed in window
WINDOW_SECONDS=3600      # 1 hour window
SUCCESS_DELAY=300        # Seconds to wait before marking boot as successful

mkdir -p "$STATE_DIR"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [BOOT-GUARD] [$1] $2"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
    echo "$msg" >&2
}

# Rotate log if > 1MB
if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt 1048576 ]; then
    mv "$LOG_FILE" "${LOG_FILE}.1"
fi

# Check if recovery mode was triggered
if [ -f "$TRIGGER_FILE" ]; then
    log "CRITICAL" "Boot guard is TRIGGERED - system in recovery mode"
    log "CRITICAL" "Docker services will NOT start automatically"
    log "INFO" "To reset: rm $TRIGGER_FILE && sudo reboot"
    exit 1
fi

# Record current boot timestamp
NOW=$(date +%s)
echo "$NOW" >> "$BOOT_LOG"

# Count boots within window
CUTOFF=$((NOW - WINDOW_SECONDS))
RECENT_BOOTS=0

if [ -f "$BOOT_LOG" ]; then
    while IFS= read -r ts; do
        if [ "$ts" -ge "$CUTOFF" ] 2>/dev/null; then
            RECENT_BOOTS=$((RECENT_BOOTS + 1))
        fi
    done < "$BOOT_LOG"
fi

log "INFO" "Boot recorded. Recent boots in last ${WINDOW_SECONDS}s: ${RECENT_BOOTS}/${MAX_BOOTS}"

# Check if threshold exceeded
if [ "$RECENT_BOOTS" -ge "$MAX_BOOTS" ]; then
    log "CRITICAL" "Boot loop detected! ${RECENT_BOOTS} boots in ${WINDOW_SECONDS}s"
    log "CRITICAL" "Entering recovery mode - Docker will NOT start"
    touch "$TRIGGER_FILE"
    exit 1
fi

# Clean old entries (keep only entries within 2x window)
CLEANUP_CUTOFF=$((NOW - WINDOW_SECONDS * 2))
if [ -f "$BOOT_LOG" ]; then
    TMP_LOG=$(mktemp)
    while IFS= read -r ts; do
        if [ "$ts" -ge "$CLEANUP_CUTOFF" ] 2>/dev/null; then
            echo "$ts"
        fi
    done < "$BOOT_LOG" > "$TMP_LOG"
    mv "$TMP_LOG" "$BOOT_LOG"
fi

log "INFO" "Boot guard passed - allowing normal startup"

# Schedule success marker (background): after SUCCESS_DELAY seconds,
# clear the boot log to indicate a stable boot
(
    sleep "$SUCCESS_DELAY"
    if [ -f "$BOOT_LOG" ]; then
        echo "" > "$BOOT_LOG"
        log "INFO" "Boot stability confirmed after ${SUCCESS_DELAY}s - counter reset"
    fi
) &

exit 0
