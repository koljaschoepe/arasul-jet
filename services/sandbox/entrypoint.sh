#!/bin/bash
set -e

export HOME=/home/sandbox

# Copy global tmux config to user home (if not already customized)
if [ -f /etc/tmux.conf ] && [ ! -f "$HOME/.tmux.conf" ]; then
    cp /etc/tmux.conf "$HOME/.tmux.conf"
fi

# Ensure workspace directory exists and is writable
mkdir -p /workspace 2>/dev/null || true

# Fix ownership if workspace was mounted from host as root
if [ ! -w /workspace ]; then
    sudo chown -R sandbox:sandbox /workspace 2>/dev/null || true
fi

# Apply custom environment variables passed via SANDBOX_ENV_JSON
# Format: {"KEY": "VALUE", ...}
if [ -n "$SANDBOX_ENV_JSON" ]; then
    for key in $(echo "$SANDBOX_ENV_JSON" | jq -r 'keys[]' 2>/dev/null); do
        value=$(echo "$SANDBOX_ENV_JSON" | jq -r --arg k "$key" '.[$k]' 2>/dev/null)
        export "$key=$value"
    done
fi

echo "============================================"
echo "  Arasul Sandbox Environment"
echo "============================================"
echo "User:      $(whoami)"
echo "Workspace: /workspace"
echo "Node:      $(node --version 2>/dev/null || echo 'n/a')"
echo "Python:    $(python3 --version 2>/dev/null || echo 'n/a')"
echo "Git:       $(git --version 2>/dev/null || echo 'n/a')"
echo "============================================"

# Execute CMD (default: sleep infinity)
exec "$@"
