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

# Fix permissions on .claude directory if needed (may be owned by root from previous runs)
if [ -d "$HOME/.claude" ]; then
    sudo chown -R claude:node "$HOME/.claude" 2>/dev/null || true
fi
mkdir -p "$HOME/.claude/debug" 2>/dev/null || true

# Start ttyd with Claude Code
# --writable allows input
# --base-path for proper routing behind Traefik reverse proxy
# No authentication - open access within the local network (protected by forward-auth in Traefik)
exec ttyd \
    --port 7681 \
    --writable \
    --base-path /claude-terminal \
    bash -c "cd '$WORKSPACE' && echo 'Claude Code Terminal - Workspace: $WORKSPACE' && echo 'User: $(whoami)' && echo '---' && claude"
