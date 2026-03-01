#!/bin/bash
set -euo pipefail

# ARASUL OS Hardening Orchestrator
# Runs all hardening scripts for production deployment on Jetson AGX Orin
#
# Usage: sudo ./harden-os.sh [--ssh-port PORT] [--skip-ssh] [--skip-firewall] [--skip-apparmor]
#
# This script orchestrates:
#   1. Service user setup
#   2. SSH hardening
#   3. Firewall configuration
#   4. Auto-updates disable
#   5. AppArmor profile installation
#
# Prerequisites:
#   - Run as root (sudo)
#   - SSH key already added for arasul user
#   - Docker and docker-compose installed

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_PORT="2222"
SKIP_SSH=false
SKIP_FIREWALL=false
SKIP_APPARMOR=false

# Parse options
while [[ $# -gt 0 ]]; do
    case "$1" in
        --ssh-port)
            SSH_PORT="$2"
            shift 2
            ;;
        --skip-ssh)
            SKIP_SSH=true
            shift
            ;;
        --skip-firewall)
            SKIP_FIREWALL=true
            shift
            ;;
        --skip-apparmor)
            SKIP_APPARMOR=true
            shift
            ;;
        --help|-h)
            echo "Usage: sudo $0 [--ssh-port PORT] [--skip-ssh] [--skip-firewall] [--skip-apparmor]"
            echo ""
            echo "Options:"
            echo "  --ssh-port PORT   SSH port (default: 2222)"
            echo "  --skip-ssh        Skip SSH hardening"
            echo "  --skip-firewall   Skip firewall setup"
            echo "  --skip-apparmor   Skip AppArmor profile installation"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check root
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root (sudo)"
    exit 1
fi

echo "================================================================"
echo "  ARASUL OS Hardening - Production Deployment"
echo "================================================================"
echo "  SSH Port:     $SSH_PORT"
echo "  Skip SSH:     $SKIP_SSH"
echo "  Skip FW:      $SKIP_FIREWALL"
echo "  Skip AppArmor: $SKIP_APPARMOR"
echo "================================================================"
echo ""
echo "This script will harden the OS for production deployment."
echo "Make sure you have SSH key access configured BEFORE proceeding."
echo ""
read -rp "Continue? (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "=========================================="
echo "  Step 1/5: Service User Setup"
echo "=========================================="
bash "$SCRIPT_DIR/setup-service-user.sh"

echo ""
echo "=========================================="
echo "  Step 2/5: Disable Auto-Updates"
echo "=========================================="
bash "$SCRIPT_DIR/disable-auto-updates.sh"

if [ "$SKIP_SSH" = false ]; then
    echo ""
    echo "=========================================="
    echo "  Step 3/5: SSH Hardening"
    echo "=========================================="
    bash "$SCRIPT_DIR/harden-ssh.sh" --port "$SSH_PORT"
else
    echo ""
    echo "=========================================="
    echo "  Step 3/5: SSH Hardening (SKIPPED)"
    echo "=========================================="
fi

if [ "$SKIP_FIREWALL" = false ]; then
    echo ""
    echo "=========================================="
    echo "  Step 4/5: Firewall Setup"
    echo "=========================================="
    bash "$SCRIPT_DIR/setup-firewall.sh" --ssh-port "$SSH_PORT"
else
    echo ""
    echo "=========================================="
    echo "  Step 4/5: Firewall Setup (SKIPPED)"
    echo "=========================================="
fi

if [ "$SKIP_APPARMOR" = false ]; then
    echo ""
    echo "=========================================="
    echo "  Step 5/5: AppArmor Profiles"
    echo "=========================================="
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    APPARMOR_DIR="$PROJECT_ROOT/config/apparmor"

    if [ -d "$APPARMOR_DIR" ]; then
        if command -v apparmor_parser &> /dev/null; then
            for profile in "$APPARMOR_DIR"/*; do
                if [ -f "$profile" ]; then
                    echo "  Loading AppArmor profile: $(basename "$profile")"
                    apparmor_parser -r -W "$profile" 2>/dev/null || echo "    WARNING: Failed to load (may need kernel support)"
                fi
            done
            echo "  AppArmor profiles loaded"
        else
            echo "  WARNING: apparmor_parser not found. Install with: apt install apparmor-utils"
            echo "  Profiles saved in: $APPARMOR_DIR"
        fi
    fi
else
    echo ""
    echo "=========================================="
    echo "  Step 5/5: AppArmor Profiles (SKIPPED)"
    echo "=========================================="
fi

echo ""
echo "================================================================"
echo "  ARASUL OS Hardening Complete"
echo "================================================================"
echo ""
echo "  Summary:"
echo "    [x] Service user configured (arasul)"
echo "    [x] Auto-updates disabled"
if [ "$SKIP_SSH" = false ]; then
    echo "    [x] SSH hardened (port $SSH_PORT, key-only, fail2ban)"
else
    echo "    [ ] SSH hardening (skipped)"
fi
if [ "$SKIP_FIREWALL" = false ]; then
    echo "    [x] Firewall active (ports: $SSH_PORT, 80, 443)"
else
    echo "    [ ] Firewall (skipped)"
fi
if [ "$SKIP_APPARMOR" = false ]; then
    echo "    [x] AppArmor profiles loaded"
else
    echo "    [ ] AppArmor (skipped)"
fi
echo ""
echo "  Docker Compose hardening (already in docker-compose.yml):"
echo "    [x] security_opt: no-new-privileges on all containers"
echo "    [x] cap_drop: ALL on stateless containers"
echo "    [x] read_only filesystem on frontend, traefik, loki, promtail"
echo "    [x] Internal-only ports for MinIO, Qdrant, n8n"
echo ""
echo "  IMPORTANT: Test SSH access in a new terminal before closing!"
echo "    ssh -p $SSH_PORT arasul@<jetson-ip>"
echo "================================================================"
