#!/usr/bin/env bash
#
# Setup Logrotate for Arasul Platform
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "This script must be run as root (sudo)"
    exit 1
fi

info "Setting up logrotate for Arasul Platform..."

# Install logrotate if not present
if ! command -v logrotate &> /dev/null; then
    info "Installing logrotate..."
    if command -v apt-get &> /dev/null; then
        apt-get update -qq
        apt-get install -y logrotate
    elif command -v yum &> /dev/null; then
        yum install -y logrotate
    else
        error "Cannot install logrotate: unsupported package manager"
        exit 1
    fi
    success "Logrotate installed"
else
    success "Logrotate already installed"
fi

# Create log directories
info "Creating log directory structure..."
mkdir -p /arasul/logs/{service,containers}
chown -R arasul:arasul /arasul/logs 2>/dev/null || true
chmod 755 /arasul/logs
success "Log directories created"

# Install logrotate config
info "Installing logrotate configuration..."
if [ -f "${PROJECT_ROOT}/config/logrotate.d/arasul" ]; then
    cp "${PROJECT_ROOT}/config/logrotate.d/arasul" /etc/logrotate.d/arasul
    chmod 644 /etc/logrotate.d/arasul
    success "Logrotate config installed to /etc/logrotate.d/arasul"
else
    error "Logrotate config file not found"
    exit 1
fi

# Test logrotate configuration
info "Testing logrotate configuration..."
if logrotate -d /etc/logrotate.d/arasul 2>&1 | grep -q "error"; then
    error "Logrotate configuration test failed"
    logrotate -d /etc/logrotate.d/arasul
    exit 1
else
    success "Logrotate configuration valid"
fi

# Create a cron job for hourly rotation check (in addition to daily)
info "Setting up hourly logrotate check..."
CRON_FILE="/etc/cron.hourly/arasul-logrotate"

cat > "$CRON_FILE" << 'EOF'
#!/bin/bash
# Hourly logrotate check for Arasul Platform
# Ensures logs are rotated promptly when reaching size limits

/usr/sbin/logrotate -s /var/lib/logrotate/arasul.status /etc/logrotate.d/arasul 2>&1 | logger -t arasul-logrotate
EOF

chmod 755 "$CRON_FILE"
success "Hourly logrotate check configured"

# Initialize log files with correct permissions
info "Initializing log files..."
touch /arasul/logs/{system.log,self_healing.log,update.log}
chown arasul:arasul /arasul/logs/*.log 2>/dev/null || true
chmod 644 /arasul/logs/*.log
success "Log files initialized"

echo
success "Logrotate setup completed!"
echo
info "Configuration:"
echo "  - Config file: /etc/logrotate.d/arasul"
echo "  - Log directory: /arasul/logs/"
echo "  - Rotation: 50MB per file, 10 files retained"
echo "  - Compression: gzip with delayed compression"
echo "  - Schedule: Hourly check + daily rotation"
echo
info "Manual rotation test:"
echo "  sudo logrotate -f /etc/logrotate.d/arasul"
echo
info "View rotation status:"
echo "  cat /var/lib/logrotate/arasul.status"
echo
