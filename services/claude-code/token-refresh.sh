#!/bin/bash
# Token-Refresh-Service for Claude Code OAuth
# Runs in background and proactively refreshes OAuth tokens before they expire
# This ensures the "never log out" experience for users

set -e

CREDENTIALS_FILE="/home/claude/.claude/.credentials.json"
CONFIG_FILE="/home/claude/.claude/config.json"
REFRESH_INTERVAL=14400  # 4 hours in seconds (tokens last ~6-8h)
LOG_FILE="/home/claude/.claude/debug/token-refresh.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log "Token-Refresh-Service started"
log "Credentials file: $CREDENTIALS_FILE"
log "Refresh interval: ${REFRESH_INTERVAL}s ($(($REFRESH_INTERVAL / 3600))h)"

# Initial check and refresh
do_token_check() {
    if [ ! -f "$CREDENTIALS_FILE" ]; then
        log "No credentials file found - user needs to authenticate"
        return 1
    fi

    # Parse expiration time from credentials
    EXPIRES_AT=$(jq -r '.claudeAiOauth.expiresAt // 0' "$CREDENTIALS_FILE" 2>/dev/null)

    if [ "$EXPIRES_AT" = "0" ] || [ -z "$EXPIRES_AT" ]; then
        log "No OAuth token found or invalid format"
        return 1
    fi

    NOW_MS=$(($(date +%s) * 1000))
    TIME_LEFT_MS=$((EXPIRES_AT - NOW_MS))
    TIME_LEFT_HOURS=$(echo "scale=2; $TIME_LEFT_MS / 3600000" | bc)

    log "Token expires in: ${TIME_LEFT_HOURS}h"

    # Refresh if token expires in less than 2 hours (7200000ms)
    if [ "$TIME_LEFT_MS" -lt 7200000 ]; then
        log "Token expiring soon, attempting refresh..."

        # Try to refresh the token
        if claude auth refresh 2>&1 | tee -a "$LOG_FILE"; then
            log "Token refresh successful"

            # Verify new expiration
            NEW_EXPIRES=$(jq -r '.claudeAiOauth.expiresAt // 0' "$CREDENTIALS_FILE" 2>/dev/null)
            NEW_TIME_LEFT=$((($NEW_EXPIRES - $(date +%s) * 1000) / 3600000))
            log "New token expires in: ${NEW_TIME_LEFT}h"
            return 0
        else
            log "Token refresh failed - user may need to re-authenticate"
            return 1
        fi
    else
        log "Token still valid, no refresh needed"
        return 0
    fi
}

# Get OAuth account info for status reporting
get_auth_info() {
    if [ -f "$CONFIG_FILE" ]; then
        EMAIL=$(jq -r '.oauthAccount.emailAddress // "unknown"' "$CONFIG_FILE" 2>/dev/null)
        DISPLAY_NAME=$(jq -r '.oauthAccount.displayName // "unknown"' "$CONFIG_FILE" 2>/dev/null)
        echo "{\"email\": \"$EMAIL\", \"displayName\": \"$DISPLAY_NAME\"}"
    else
        echo "{\"email\": \"unknown\", \"displayName\": \"unknown\"}"
    fi
}

# Write status file for external consumption (by dashboard-backend)
write_status_file() {
    STATUS_FILE="/home/claude/.claude/auth-status.json"

    if [ -f "$CREDENTIALS_FILE" ]; then
        EXPIRES_AT=$(jq -r '.claudeAiOauth.expiresAt // 0' "$CREDENTIALS_FILE" 2>/dev/null)
        NOW_MS=$(($(date +%s) * 1000))
        VALID="false"

        if [ "$EXPIRES_AT" -gt "$NOW_MS" ]; then
            VALID="true"
        fi

        AUTH_INFO=$(get_auth_info)

        cat > "$STATUS_FILE" << EOF
{
    "oauth": {
        "valid": $VALID,
        "expiresAt": $EXPIRES_AT,
        "expiresIn": $((($EXPIRES_AT - $NOW_MS) / 1000)),
        "account": $AUTH_INFO
    },
    "apiKey": {
        "set": $([ -n "$ANTHROPIC_API_KEY" ] && [ "$ANTHROPIC_API_KEY" != "sk-ant-test12345" ] && echo "true" || echo "false")
    },
    "lastCheck": $NOW_MS
}
EOF
        log "Status file updated: $STATUS_FILE"
    fi
}

# Main loop
while true; do
    log "--- Periodic token check ---"

    if do_token_check; then
        log "Token status: OK"
    else
        log "Token status: NEEDS_ATTENTION"
    fi

    # Always write status file
    write_status_file

    log "Next check in ${REFRESH_INTERVAL}s"
    sleep $REFRESH_INTERVAL
done
