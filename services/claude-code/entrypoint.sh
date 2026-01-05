#!/bin/bash
set -e

# Set workspace based on environment variable
WORKSPACE=${CLAUDE_WORKSPACE:-/workspace/arasul}

# Ensure workspace exists
mkdir -p "$WORKSPACE" 2>/dev/null || true

# Set HOME for claude user
export HOME=/home/claude

# Check if API key is set
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "WARNING: ANTHROPIC_API_KEY is not set. Claude Code will prompt for it."
fi

echo "Starting Claude Code Terminal..."
echo "Workspace: $WORKSPACE"
echo "Port: 7681"
echo "User: $(whoami) (non-root)"
echo "Mode: --dangerously-skip-permissions (always enabled)"

# Start ttyd with Claude Code
# --writable allows input
# No authentication - open access within the local network
# Claude runs with --dangerously-skip-permissions for autonomous operation
exec ttyd \
    --port 7681 \
    --writable \
    bash -c "cd '$WORKSPACE' && echo 'Claude Code Terminal - Workspace: $WORKSPACE' && echo 'User: $(whoami)' && echo 'Mode: --dangerously-skip-permissions' && echo '---' && claude --dangerously-skip-permissions"
