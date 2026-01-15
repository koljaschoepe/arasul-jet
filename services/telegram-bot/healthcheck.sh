#!/bin/bash
# Health check script for Telegram Bot service

set -e

# Check if health endpoint responds
response=$(curl -sf http://localhost:8090/health 2>/dev/null) || exit 1

# Parse status from JSON response
status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

if [ "$status" = "healthy" ]; then
    exit 0
else
    echo "Health check failed: status=$status"
    exit 1
fi
