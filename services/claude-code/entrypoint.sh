#!/bin/bash
set -e

# Set workspace based on environment variable
WORKSPACE=${CLAUDE_WORKSPACE:-/workspace/arasul}

# Ensure workspace exists
mkdir -p "$WORKSPACE" 2>/dev/null || true

# Set HOME for claude user
export HOME=/home/claude

# Fix permissions on .claude directory if needed (may be owned by root from previous runs)
if [ -d "$HOME/.claude" ]; then
    sudo chown -R claude:node "$HOME/.claude" 2>/dev/null || true
fi
mkdir -p "$HOME/.claude/debug" 2>/dev/null || true

echo "============================================"
echo "  Claude Code Terminal - Starting..."
echo "============================================"
echo "Workspace: $WORKSPACE"
echo "Port: 7681"
echo "User: $(whoami) (non-root)"
echo ""

# Check authentication status
CREDENTIALS_FILE="$HOME/.claude/.credentials.json"
CONFIG_FILE="$HOME/.claude/config.json"

check_auth_status() {
    if [ -f "$CREDENTIALS_FILE" ]; then
        EXPIRES_AT=$(jq -r '.claudeAiOauth.expiresAt // 0' "$CREDENTIALS_FILE" 2>/dev/null)
        NOW_MS=$(($(date +%s) * 1000))

        if [ "$EXPIRES_AT" -gt "$NOW_MS" ]; then
            TIME_LEFT_HOURS=$(echo "scale=1; ($EXPIRES_AT - $NOW_MS) / 3600000" | bc)
            EMAIL=$(jq -r '.oauthAccount.emailAddress // "unknown"' "$CONFIG_FILE" 2>/dev/null)
            echo "OAuth: Authenticated as $EMAIL"
            echo "Token valid for: ${TIME_LEFT_HOURS}h"
            return 0
        else
            echo "OAuth: Token EXPIRED - will attempt refresh"
            return 1
        fi
    else
        echo "OAuth: No credentials found"
        return 1
    fi
}

# Check API key - clear invalid placeholder keys so OAuth can be used
# Set USE_OAUTH flag if we should use OAuth instead of API key
USE_OAUTH=""
if [ "$ANTHROPIC_API_KEY" = "sk-ant-test12345" ] || [ "$ANTHROPIC_API_KEY" = "" ]; then
    # Clear the invalid/empty key so Claude Code will use OAuth instead
    unset ANTHROPIC_API_KEY
    export ANTHROPIC_API_KEY=""
    USE_OAUTH="true"
    echo "API Key: Not set (using OAuth authentication)"
elif [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "API Key: Set (fallback enabled)"
else
    USE_OAUTH="true"
    echo "API Key: Not set"
fi

echo ""
echo "Checking authentication status..."
if check_auth_status; then
    echo "Authentication: OK"
else
    echo "Authentication: Needs attention"
    # Try to refresh token if it exists
    if [ -f "$CREDENTIALS_FILE" ]; then
        echo "Attempting token refresh..."
        claude auth refresh 2>/dev/null && echo "Token refresh successful!" || echo "Token refresh failed - please re-authenticate"
    fi
fi

echo ""
echo "============================================"
echo "  Starting Token-Refresh-Service..."
echo "============================================"

# Start token-refresh service in background
/token-refresh.sh &
TOKEN_REFRESH_PID=$!
echo "Token-Refresh-Service started (PID: $TOKEN_REFRESH_PID)"

echo ""
echo "============================================"
echo "  Starting Web Terminal..."
echo "============================================"

# Start ttyd with Claude Code
# --writable allows input
# --base-path for proper routing behind Traefik reverse proxy
# No authentication - open access within the local network (protected by forward-auth in Traefik)
# If using OAuth, explicitly unset the API key when starting claude using env -u
if [ "$USE_OAUTH" = "true" ]; then
    exec ttyd \
        --port 7681 \
        --writable \
        --base-path /claude-terminal \
        bash -c "cd '$WORKSPACE' && echo 'Claude Code Terminal - Workspace: $WORKSPACE' && echo 'User: \$(whoami)' && echo '---' && unset ANTHROPIC_API_KEY && claude"
else
    exec ttyd \
        --port 7681 \
        --writable \
        --base-path /claude-terminal \
        bash -c "cd '$WORKSPACE' && echo 'Claude Code Terminal - Workspace: $WORKSPACE' && echo 'User: \$(whoami)' && echo '---' && claude"
fi
