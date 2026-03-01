#!/bin/bash
set -euo pipefail

# ARASUL Auto-Updates Disable Script
# Disables automatic system updates for production stability
#
# Usage: sudo ./disable-auto-updates.sh
#
# Rationale:
#   Customer systems must remain stable and predictable.
#   All updates are delivered through the ARASUL Update System.
#   Unattended OS updates could break Docker, NVIDIA drivers,
#   or kernel compatibility.

# Check root
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root (sudo)"
    exit 1
fi

echo "=================================================="
echo "  ARASUL Auto-Updates Disable"
echo "=================================================="
echo ""

# 1. Disable unattended-upgrades
echo "[1/4] Disabling unattended-upgrades..."
if dpkg -l | grep -q unattended-upgrades; then
    systemctl stop unattended-upgrades 2>/dev/null || true
    systemctl disable unattended-upgrades 2>/dev/null || true
    systemctl mask unattended-upgrades 2>/dev/null || true
    echo "  unattended-upgrades: STOPPED + MASKED"
else
    echo "  unattended-upgrades: not installed (OK)"
fi

# Also disable apt daily timers
echo "[2/4] Disabling apt daily update timers..."
systemctl stop apt-daily.timer 2>/dev/null || true
systemctl disable apt-daily.timer 2>/dev/null || true
systemctl mask apt-daily.timer 2>/dev/null || true

systemctl stop apt-daily-upgrade.timer 2>/dev/null || true
systemctl disable apt-daily-upgrade.timer 2>/dev/null || true
systemctl mask apt-daily-upgrade.timer 2>/dev/null || true
echo "  apt-daily.timer: MASKED"
echo "  apt-daily-upgrade.timer: MASKED"

# Write APT configuration to prevent auto-updates
cat > /etc/apt/apt.conf.d/99-arasul-no-auto-update << 'APTEOF'
// ARASUL: Disable automatic updates for production stability
// All updates are delivered through the ARASUL Update System
APT::Periodic::Update-Package-Lists "0";
APT::Periodic::Unattended-Upgrade "0";
APT::Periodic::Download-Upgradeable-Packages "0";
APT::Periodic::AutocleanInterval "0";
APTEOF
echo "  APT periodic updates: DISABLED"

# 3. Pin kernel and NVIDIA packages
echo "[3/4] Pinning kernel and NVIDIA packages..."
cat > /etc/apt/preferences.d/99-arasul-pin-critical << 'PINEOF'
# ARASUL: Pin critical packages to prevent unintended upgrades
# Kernel packages - only update via ARASUL Update System
Package: linux-*
Pin: release *
Pin-Priority: -1

# NVIDIA JetPack packages - only update via ARASUL Update System
Package: nvidia-*
Pin: release *
Pin-Priority: -1

Package: cuda-*
Pin: release *
Pin-Priority: -1

Package: libcudnn*
Pin: release *
Pin-Priority: -1

Package: tensorrt*
Pin: release *
Pin-Priority: -1

# Docker - only update via ARASUL Update System
Package: docker-ce*
Pin: release *
Pin-Priority: -1

Package: containerd*
Pin: release *
Pin-Priority: -1
PINEOF
echo "  Pinned: linux-*, nvidia-*, cuda-*, docker-*"

# 4. Disable NVIDIA apt sources auto-refresh
echo "[4/4] Disabling NVIDIA apt source auto-refresh..."
NVIDIA_LIST="/etc/apt/sources.list.d/nvidia-l4t-apt-source.list"
if [ -f "$NVIDIA_LIST" ]; then
    # Don't delete, just comment out
    sed -i 's/^deb /#deb /' "$NVIDIA_LIST"
    echo "  NVIDIA apt sources: COMMENTED OUT"
else
    echo "  NVIDIA apt sources: not found (OK)"
fi

echo ""
echo "=================================================="
echo "  Auto-Updates Disabled"
echo "=================================================="
echo ""
echo "  Disabled services:"
echo "    - unattended-upgrades (masked)"
echo "    - apt-daily.timer (masked)"
echo "    - apt-daily-upgrade.timer (masked)"
echo ""
echo "  Pinned packages (no auto-upgrade):"
echo "    - linux-* (kernel)"
echo "    - nvidia-*, cuda-*, libcudnn*, tensorrt*"
echo "    - docker-ce*, containerd*"
echo ""
echo "  Manual updates still possible:"
echo "    sudo apt update && sudo apt upgrade <package>"
echo ""
echo "  System updates via ARASUL Update System:"
echo "    Dashboard -> Einstellungen -> Updates"
echo "=================================================="
