#!/bin/bash
# =============================================================================
# Auto-Restart Service Script
# Automatically restarts Docker services when their code is modified
# Called by Claude Code PostToolUse hook after Edit/Write operations
# =============================================================================

set -e

# Configuration
DEBOUNCE_SECONDS=5
RESTART_LOG="/tmp/claude-service-restarts.log"
LOCK_DIR="/tmp/claude-restart-locks"

# Create lock directory if not exists
mkdir -p "$LOCK_DIR"

# Read the file path from the hook output (passed via environment or stdin)
# The hook passes tool output which contains the file path
FILE_PATH=""

# Try to extract file path from stdin (hook passes JSON-like output)
if [ -t 0 ]; then
    # No stdin, check if passed as argument
    FILE_PATH="$1"
else
    # Read from stdin and extract file path
    INPUT=$(cat)
    # Extract file path from various formats
    FILE_PATH=$(echo "$INPUT" | grep -oE '(services/[^"'\''[:space:]]+\.(js|ts|jsx|tsx|py|sql|yml|yaml|json|css))' | head -1)
    if [ -z "$FILE_PATH" ]; then
        FILE_PATH=$(echo "$INPUT" | grep -oE '/home/[^"'\''[:space:]]+\.(js|ts|jsx|tsx|py|sql|yml|yaml|json|css)' | head -1)
    fi
fi

# Exit if no file path found
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Normalize path - extract relative path from project root
FILE_PATH=$(echo "$FILE_PATH" | sed 's|.*/arasul-jet/||' | sed 's|^/home/arasul/arasul/arasul-jet/||')

# =============================================================================
# File Pattern Exclusions - Don't restart for these
# =============================================================================
should_skip_restart() {
    local file="$1"

    # Skip test files
    [[ "$file" == *"__tests__"* ]] && return 0
    [[ "$file" == *".test."* ]] && return 0
    [[ "$file" == *".spec."* ]] && return 0
    [[ "$file" == *"test_"* ]] && return 0

    # Skip documentation
    [[ "$file" == *".md" ]] && return 0
    [[ "$file" == *"README"* ]] && return 0
    [[ "$file" == *"CLAUDE"* ]] && return 0

    # Skip frontend CSS (hot reload handles it)
    [[ "$file" == "services/dashboard-frontend/"*".css" ]] && return 0

    # Skip config/schema files that need rebuild, not restart
    [[ "$file" == *"package.json" ]] && return 0
    [[ "$file" == *"package-lock.json" ]] && return 0
    [[ "$file" == *"Dockerfile"* ]] && return 0

    # Skip database init scripts (need full rebuild)
    [[ "$file" == "services/postgres/init/"* ]] && return 0

    # Skip scripts directory
    [[ "$file" == "scripts/"* ]] && return 0

    # Skip claude config
    [[ "$file" == ".claude/"* ]] && return 0

    # Skip docs
    [[ "$file" == "docs/"* ]] && return 0

    return 1
}

# =============================================================================
# Service Mapping - Map file paths to Docker service names
# =============================================================================
get_service_name() {
    local file="$1"

    case "$file" in
        services/dashboard-backend/*)
            echo "dashboard-backend"
            ;;
        services/dashboard-frontend/*)
            echo "dashboard-frontend"
            ;;
        services/telegram-bot/*)
            echo "telegram-bot"
            ;;
        services/document-indexer/*)
            echo "document-indexer"
            ;;
        services/llm-service/*)
            echo "llm-service"
            ;;
        services/embedding-service/*)
            echo "embedding-service"
            ;;
        services/metrics-collector/*)
            echo "metrics-collector"
            ;;
        services/self-healing-agent/*)
            echo "self-healing-agent"
            ;;
        config/traefik/*)
            echo "reverse-proxy"
            ;;
        *)
            echo ""
            ;;
    esac
}

# =============================================================================
# Debounce Logic - Prevent rapid restarts
# =============================================================================
should_debounce() {
    local service="$1"
    local lock_file="$LOCK_DIR/$service.lock"
    local now=$(date +%s)

    if [ -f "$lock_file" ]; then
        local last_restart=$(cat "$lock_file")
        local diff=$((now - last_restart))
        if [ "$diff" -lt "$DEBOUNCE_SECONDS" ]; then
            return 0  # Should debounce (skip)
        fi
    fi

    # Update lock file
    echo "$now" > "$lock_file"
    return 1  # Should not debounce (proceed)
}

# =============================================================================
# Main Logic
# =============================================================================

# Check if we should skip restart
if should_skip_restart "$FILE_PATH"; then
    exit 0
fi

# Get service name
SERVICE=$(get_service_name "$FILE_PATH")

# Exit if no matching service
if [ -z "$SERVICE" ]; then
    exit 0
fi

# Check debounce
if should_debounce "$SERVICE"; then
    exit 0
fi

# Check if service is running
if ! docker compose ps --status running "$SERVICE" 2>/dev/null | grep -q "$SERVICE"; then
    exit 0
fi

# Log the restart
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting $SERVICE (changed: $FILE_PATH)" >> "$RESTART_LOG"

# Restart the service in background (don't block Claude)
(
    cd /home/arasul/arasul/arasul-jet
    docker compose restart "$SERVICE" >/dev/null 2>&1
) &

# Output for Claude's awareness (optional)
echo "🔄 Auto-restarting $SERVICE..."

exit 0
