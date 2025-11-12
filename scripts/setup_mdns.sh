#!/usr/bin/env bash
#
# mDNS (Avahi) Configuration for Arasul Platform
# Configures the system to be discoverable as arasul.local
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

info "Configuring mDNS (Avahi) for Arasul Platform..."

# Load configuration
if [ -f "${PROJECT_ROOT}/config/.env" ]; then
    source "${PROJECT_ROOT}/config/.env"
    MDNS_HOSTNAME="${MDNS_NAME:-arasul.local}"
    MDNS_HOSTNAME="${MDNS_HOSTNAME%.local}" # Remove .local suffix if present
else
    warn ".env file not found, using default hostname 'arasul'"
    MDNS_HOSTNAME="arasul"
fi

info "mDNS hostname will be: ${MDNS_HOSTNAME}.local"

# Check if avahi-daemon is installed
if ! command -v avahi-daemon &> /dev/null; then
    info "Avahi not found. Installing avahi-daemon..."

    # Detect package manager
    if command -v apt-get &> /dev/null; then
        apt-get update -qq
        apt-get install -y avahi-daemon avahi-utils libnss-mdns
    elif command -v yum &> /dev/null; then
        yum install -y avahi avahi-tools nss-mdns
    else
        error "Unsupported package manager. Please install avahi-daemon manually."
        exit 1
    fi

    success "Avahi installed"
else
    success "Avahi already installed"
fi

# Configure hostname
info "Setting system hostname to: $MDNS_HOSTNAME"
hostnamectl set-hostname "$MDNS_HOSTNAME" 2>/dev/null || {
    echo "$MDNS_HOSTNAME" > /etc/hostname
    hostname "$MDNS_HOSTNAME"
}
success "Hostname set"

# Update /etc/hosts
if ! grep -q "$MDNS_HOSTNAME" /etc/hosts; then
    info "Updating /etc/hosts..."
    cat >> /etc/hosts << EOF

# Arasul Platform
127.0.1.1    $MDNS_HOSTNAME
EOF
    success "/etc/hosts updated"
fi

# Configure Avahi daemon
info "Configuring Avahi daemon..."

# Backup original config
if [ -f /etc/avahi/avahi-daemon.conf ] && [ ! -f /etc/avahi/avahi-daemon.conf.backup ]; then
    cp /etc/avahi/avahi-daemon.conf /etc/avahi/avahi-daemon.conf.backup
    info "Original config backed up"
fi

# Create Avahi daemon config
cat > /etc/avahi/avahi-daemon.conf << 'EOF'
[server]
host-name=HOSTNAME_PLACEHOLDER
domain-name=local
use-ipv4=yes
use-ipv6=yes
allow-interfaces=eth0,wlan0,enp0s1,wlp2s0
deny-interfaces=docker0,br-*,veth*
ratelimit-interval-usec=1000000
ratelimit-burst=1000

[wide-area]
enable-wide-area=yes

[publish]
publish-addresses=yes
publish-hinfo=yes
publish-workstation=yes
publish-domain=yes
publish-dns-servers=no
publish-resolv-conf-dns-servers=no
publish-aaaa-on-ipv4=yes
publish-a-on-ipv6=no

[reflector]
enable-reflector=no
reflect-ipv=no

[rlimits]
EOF

# Replace placeholder with actual hostname
sed -i "s/HOSTNAME_PLACEHOLDER/$MDNS_HOSTNAME/g" /etc/avahi/avahi-daemon.conf

success "Avahi daemon configured"

# Create Avahi service definition for Arasul Platform
info "Creating Avahi service definition..."

mkdir -p /etc/avahi/services

cat > /etc/avahi/services/arasul-http.service << EOF
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">Arasul Platform on %h</name>
  <service>
    <type>_http._tcp</type>
    <port>${HTTP_PORT:-80}</port>
    <txt-record>path=/</txt-record>
    <txt-record>vendor=Arasul</txt-record>
    <txt-record>model=Edge AI Appliance</txt-record>
  </service>
</service-group>
EOF

success "HTTP service definition created"

# Create HTTPS service if enabled
if [ "${SSL_ENABLED:-false}" = "true" ]; then
    cat > /etc/avahi/services/arasul-https.service << EOF
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">Arasul Platform (HTTPS) on %h</name>
  <service>
    <type>_https._tcp</type>
    <port>${HTTPS_PORT:-443}</port>
    <txt-record>path=/</txt-record>
    <txt-record>vendor=Arasul</txt-record>
  </service>
</service-group>
EOF
    success "HTTPS service definition created"
fi

# Enable and start Avahi daemon
info "Starting Avahi daemon..."

systemctl enable avahi-daemon 2>/dev/null || true
systemctl restart avahi-daemon

# Wait for service to start
sleep 2

if systemctl is-active --quiet avahi-daemon; then
    success "Avahi daemon is running"
else
    error "Failed to start Avahi daemon"
    systemctl status avahi-daemon --no-pager
    exit 1
fi

# Verify mDNS resolution
info "Verifying mDNS resolution..."

if command -v avahi-resolve &> /dev/null; then
    # Try to resolve our own hostname
    if timeout 5 avahi-resolve -n "${MDNS_HOSTNAME}.local" &> /dev/null; then
        success "mDNS resolution working"
    else
        warn "mDNS resolution test failed (this may be normal on first run)"
    fi
fi

# Display status
echo
info "=== mDNS Configuration Summary ==="
echo "Hostname:     $MDNS_HOSTNAME"
echo "mDNS Name:    ${MDNS_HOSTNAME}.local"
echo "HTTP Port:    ${HTTP_PORT:-80}"
if [ "${SSL_ENABLED:-false}" = "true" ]; then
    echo "HTTPS Port:   ${HTTPS_PORT:-443}"
fi
echo

success "mDNS configuration completed!"
echo
info "The system should now be accessible at:"
echo "  http://${MDNS_HOSTNAME}.local"
if [ "${SSL_ENABLED:-false}" = "true" ]; then
    echo "  https://${MDNS_HOSTNAME}.local"
fi
echo
info "You can test mDNS resolution with:"
echo "  avahi-browse -a"
echo "  avahi-resolve -n ${MDNS_HOSTNAME}.local"
echo "  ping ${MDNS_HOSTNAME}.local"
echo
