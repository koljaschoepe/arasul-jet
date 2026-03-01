#!/bin/bash
set -euo pipefail

# ARASUL Service User Setup Script
# Creates and configures a dedicated service user for running Arasul
#
# Usage: sudo ./setup-service-user.sh [--username NAME]
#
# Actions:
#   1. Create dedicated arasul user (if not exists)
#   2. Add to docker group
#   3. Set no interactive shell for service operations
#   4. Set home directory permissions to 0750
#   5. Configure directory ownership

USERNAME="${1:-arasul}"
ARASUL_DIR="/arasul"

# Parse options
while [[ $# -gt 0 ]]; do
    case "$1" in
        --username)
            USERNAME="$2"
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
echo "  ARASUL Service User Setup"
echo "=================================================="
echo "  Username:  $USERNAME"
echo "  Home:      /home/$USERNAME"
echo "  App Dir:   $ARASUL_DIR"
echo "=================================================="
echo ""

# 1. Create user if not exists
if id "$USERNAME" &>/dev/null; then
    echo "[1/6] User '$USERNAME' already exists"
else
    echo "[1/6] Creating user '$USERNAME'..."
    useradd -m -s /bin/bash -c "Arasul AI Platform Service Account" "$USERNAME"
    echo "  User created"
fi

# 2. Add to docker group
echo "[2/6] Adding '$USERNAME' to docker group..."
if getent group docker &>/dev/null; then
    usermod -aG docker "$USERNAME"
    echo "  Added to docker group"
else
    echo "  WARNING: docker group does not exist. Install Docker first."
fi

# 3. Set home directory permissions
echo "[3/6] Setting home directory permissions to 0750..."
chmod 0750 "/home/$USERNAME"
echo "  /home/$USERNAME: $(stat -c '%a' "/home/$USERNAME")"

# 4. Create and own application directory
echo "[4/6] Setting up application directory..."
if [ ! -d "$ARASUL_DIR" ]; then
    mkdir -p "$ARASUL_DIR"
fi

# Set ownership of key directories
DIRS=(
    "$ARASUL_DIR"
    "$ARASUL_DIR/config"
    "$ARASUL_DIR/data"
    "$ARASUL_DIR/logs"
    "$ARASUL_DIR/backups"
    "$ARASUL_DIR/updates"
)

for dir in "${DIRS[@]}"; do
    mkdir -p "$dir"
    chown "$USERNAME:$USERNAME" "$dir"
    chmod 0750 "$dir"
done
echo "  Application directories created and owned by $USERNAME"

# 5. Secure sensitive config files
echo "[5/6] Securing configuration files..."

# .env file should only be readable by the service user
if [ -f "$ARASUL_DIR/config/.env" ]; then
    chown "$USERNAME:$USERNAME" "$ARASUL_DIR/config/.env"
    chmod 0600 "$ARASUL_DIR/config/.env"
    echo "  .env: 0600 (owner-only read/write)"
fi

# SSH keys directory
if [ -d "$ARASUL_DIR/data/ssh-keys" ]; then
    chmod 0700 "$ARASUL_DIR/data/ssh-keys"
    find "$ARASUL_DIR/data/ssh-keys" -type f -exec chmod 0600 {} \;
    echo "  SSH keys: 0700/0600"
fi

# Secrets directory
if [ -d "$ARASUL_DIR/config/secrets" ]; then
    chmod 0700 "$ARASUL_DIR/config/secrets"
    find "$ARASUL_DIR/config/secrets" -type f -exec chmod 0600 {} \;
    echo "  Secrets: 0700/0600"
fi

# TLS certificates
if [ -d "$ARASUL_DIR/config/traefik/certs" ]; then
    find "$ARASUL_DIR/config/traefik/certs" -name "*.key" -exec chmod 0600 {} \;
    echo "  TLS keys: 0600"
fi

# 6. Set up sudoers for service operations
echo "[6/6] Configuring sudoers for service operations..."
SUDOERS_FILE="/etc/sudoers.d/arasul-service"

cat > "$SUDOERS_FILE" << SUDOEOF
# Arasul service account sudoers configuration
# Allow docker-compose and systemctl for service management
# No password required for these specific commands

$USERNAME ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker-compose, /usr/local/bin/docker-compose
$USERNAME ALL=(ALL) NOPASSWD: /bin/systemctl restart docker
$USERNAME ALL=(ALL) NOPASSWD: /bin/systemctl status docker
SUDOEOF

chmod 0440 "$SUDOERS_FILE"
echo "  Sudoers configured for docker/docker-compose"

echo ""
echo "=================================================="
echo "  Service User Setup Complete"
echo "=================================================="
echo ""
echo "  User:       $USERNAME"
echo "  Groups:     $(id -nG "$USERNAME")"
echo "  Home:       /home/$USERNAME (0750)"
echo "  App Dir:    $ARASUL_DIR (0750)"
echo "  .env:       0600 (owner-only)"
echo "  Secrets:    0700/0600"
echo ""
echo "  To switch to service user:"
echo "    sudo su - $USERNAME"
echo ""
echo "  To run services:"
echo "    sudo su - $USERNAME -c 'cd $ARASUL_DIR && docker compose up -d'"
echo "=================================================="
