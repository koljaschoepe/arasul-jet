#!/bin/bash
set -euo pipefail

# ARASUL Firewall Setup Script
# Configures UFW for production deployment on Jetson AGX Orin
#
# Usage: sudo ./setup-firewall.sh [--ssh-port PORT]
#
# Default allowed ports:
#   - 80/tcp   (HTTP via Traefik)
#   - 443/tcp  (HTTPS via Traefik)
#   - 2222/tcp (SSH, configurable)
#
# All other ports are blocked from external access.
# Docker internal networking (172.30.0.0/24) is allowed.

SSH_PORT="2222"

# Parse options
while [[ $# -gt 0 ]]; do
    case "$1" in
        --ssh-port)
            SSH_PORT="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Check root
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root (sudo)"
    exit 1
fi

echo "=================================================="
echo "  ARASUL Firewall Setup (UFW)"
echo "=================================================="
echo "  SSH Port:  $SSH_PORT"
echo "  HTTP:      80"
echo "  HTTPS:     443"
echo "=================================================="
echo ""

# 1. Install UFW if needed
if ! command -v ufw &> /dev/null; then
    echo "[1/6] Installing UFW..."
    apt-get update -qq && apt-get install -y -qq ufw
else
    echo "[1/6] UFW already installed"
fi

# 2. Reset UFW to clean state
echo "[2/6] Resetting UFW to default state..."
ufw --force reset

# 3. Set default policies
echo "[3/6] Setting default policies (deny incoming, allow outgoing)..."
ufw default deny incoming
ufw default allow outgoing

# 4. Allow required ports
echo "[4/6] Configuring allowed ports..."

# SSH (with rate limiting)
echo "  Allowing SSH on port $SSH_PORT (rate-limited)..."
ufw limit "$SSH_PORT/tcp" comment "SSH (rate-limited)"

# HTTP/HTTPS for Traefik
echo "  Allowing HTTP (80)..."
ufw allow 80/tcp comment "HTTP via Traefik"

echo "  Allowing HTTPS (443)..."
ufw allow 443/tcp comment "HTTPS via Traefik"

# 5. Allow Docker internal network
echo "[5/6] Allowing Docker internal network traffic..."
# Allow all traffic from Docker bridge networks (frontend/backend/monitoring)
ufw allow from 172.30.0.0/24 comment "Docker arasul networks"
# Allow from Docker default bridge
ufw allow from 172.17.0.0/16 comment "Docker default bridge"

# 6. Configure Docker/UFW compatibility
echo "[6/6] Configuring Docker/UFW compatibility..."

# Docker bypasses UFW by default via iptables DOCKER chain.
# To prevent Docker from exposing ports past UFW, we need to
# configure /etc/docker/daemon.json
DOCKER_DAEMON="/etc/docker/daemon.json"

if [ -f "$DOCKER_DAEMON" ]; then
    # Check if iptables is already configured
    if grep -q '"iptables"' "$DOCKER_DAEMON"; then
        echo "  Docker daemon.json already has iptables config"
    else
        echo "  WARNING: Docker daemon.json exists but lacks iptables config"
        echo "  You may need to add: \"iptables\": false"
        echo "  Note: This requires restarting Docker daemon"
    fi
else
    echo "  NOTE: /etc/docker/daemon.json not found"
    echo "  Docker may bypass UFW rules for published ports"
    echo "  To fix: Remove port mappings from docker-compose.yml for internal services"
fi

# Create UFW application profile for Arasul
cat > /etc/ufw/applications.d/arasul << APPEOF
[Arasul]
title=Arasul AI Platform
description=Arasul AI Platform - HTTP/HTTPS via Traefik
ports=80,443/tcp

[Arasul-SSH]
title=Arasul SSH
description=Arasul SSH Access (non-standard port)
ports=$SSH_PORT/tcp
APPEOF

echo ""
echo "Enabling UFW..."
ufw --force enable
echo ""

echo "Current UFW status:"
ufw status verbose
echo ""

echo "=================================================="
echo "  Firewall Setup Complete"
echo "=================================================="
echo ""
echo "  Allowed ports:"
echo "    - $SSH_PORT/tcp  (SSH, rate-limited)"
echo "    - 80/tcp         (HTTP)"
echo "    - 443/tcp        (HTTPS)"
echo "    - 172.30.0.0/24  (Docker internal)"
echo ""
echo "  Blocked services (internal only):"
echo "    - PostgreSQL (5432)"
echo "    - MinIO Console (9001)"
echo "    - Qdrant (6333/6334)"
echo "    - n8n (5678)"
echo "    - Ollama (11434)"
echo "    - Metrics (9100)"
echo "    - Loki (3100)"
echo ""
echo "  IMPORTANT: Remove external port mappings from"
echo "  docker-compose.yml for internal-only services."
echo "=================================================="
