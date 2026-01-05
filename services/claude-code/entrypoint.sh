#!/bin/bash
set -e

# Set workspace based on environment variable
WORKSPACE=${CLAUDE_WORKSPACE:-/workspace/arasul}

# Ensure workspace exists
mkdir -p "$WORKSPACE"

# Check if API key is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "WARNING: ANTHROPIC_API_KEY is not set. Claude Code will prompt for it."
fi

# Build ttyd authentication argument
AUTH_ARG=""
if [ -n "$TTYD_USER" ] && [ -n "$TTYD_PASSWORD" ]; then
    AUTH_ARG="--credential ${TTYD_USER}:${TTYD_PASSWORD}"
fi

echo "Starting Claude Code Terminal..."
echo "Workspace: $WORKSPACE"
echo "Port: 7681"

# Start ttyd with Claude Code
# --writable allows input
# --once exits after client disconnects (optional, remove for persistent)
exec ttyd \
    --port 7681 \
    --writable \
    $AUTH_ARG \
    bash -c "cd '$WORKSPACE' && echo 'Claude Code Terminal - Workspace: $WORKSPACE' && echo '---' && claude"
