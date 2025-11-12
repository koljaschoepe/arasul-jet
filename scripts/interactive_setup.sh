#!/usr/bin/env bash
#
# Interactive Setup Wizard for Arasul Platform
# Guides the user through configuration parameter setup
# Generates /arasul/config/.env with validated values
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="${PROJECT_ROOT}/config"
ENV_FILE="${CONFIG_DIR}/.env"
ENV_TEMPLATE="${CONFIG_DIR}/.env.template"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        ARASUL PLATFORM - INTERACTIVE SETUP WIZARD         ║
║                                                           ║
║  Edge AI Appliance Configuration                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Utility Functions
info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

success() {
    echo -e "${GREEN}✓ ${NC}$1"
}

warn() {
    echo -e "${YELLOW}⚠ ${NC}$1"
}

error() {
    echo -e "${RED}✗ ${NC}$1"
}

prompt() {
    local var_name="$1"
    local prompt_text="$2"
    local default_value="${3:-}"
    local validation_func="${4:-}"

    while true; do
        if [ -n "$default_value" ]; then
            read -p "$(echo -e "${BLUE}?${NC} $prompt_text ${YELLOW}[$default_value]${NC}: ")" input
            input="${input:-$default_value}"
        else
            read -p "$(echo -e "${BLUE}?${NC} $prompt_text: ")" input
        fi

        # Validate if function provided
        if [ -n "$validation_func" ]; then
            if $validation_func "$input"; then
                eval "$var_name='$input'"
                break
            else
                error "Invalid input. Please try again."
            fi
        else
            eval "$var_name='$input'"
            break
        fi
    done
}

prompt_password() {
    local var_name="$1"
    local prompt_text="$2"

    while true; do
        read -s -p "$(echo -e "${BLUE}?${NC} $prompt_text: ")" password1
        echo
        read -s -p "$(echo -e "${BLUE}?${NC} Confirm password: ")" password2
        echo

        if [ "$password1" = "$password2" ]; then
            if [ ${#password1} -lt 8 ]; then
                error "Password must be at least 8 characters."
            else
                eval "$var_name='$password1'"
                break
            fi
        else
            error "Passwords do not match. Please try again."
        fi
    done
}

# Validation Functions
validate_port() {
    local port="$1"
    if [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ]; then
        return 0
    fi
    return 1
}

validate_ip() {
    local ip="$1"
    if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        return 0
    fi
    return 1
}

validate_hostname() {
    local hostname="$1"
    if [[ "$hostname" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$ ]]; then
        return 0
    fi
    return 1
}

validate_yes_no() {
    local input="$1"
    if [[ "$input" =~ ^[YyNn]$ ]]; then
        return 0
    fi
    return 1
}

# Auto-Detection Functions
detect_primary_ip() {
    # Try to detect primary network interface IP
    local ip=""

    # Try ip command first
    if command -v ip &> /dev/null; then
        ip=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || echo "")
    fi

    # Fallback to hostname -I
    if [ -z "$ip" ] && command -v hostname &> /dev/null; then
        ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
    fi

    # Fallback to ifconfig
    if [ -z "$ip" ] && command -v ifconfig &> /dev/null; then
        ip=$(ifconfig 2>/dev/null | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n1 || echo "")
    fi

    echo "${ip:-192.168.1.100}"
}

detect_hostname() {
    hostname 2>/dev/null || echo "arasul"
}

generate_secret() {
    local length="${1:-32}"
    openssl rand -base64 "$length" | tr -d "=+/" | cut -c1-"$length"
}

# Main Setup Flow
main() {
    info "Starting Arasul Platform configuration wizard..."
    echo

    # Check if .env already exists
    if [ -f "$ENV_FILE" ]; then
        warn ".env file already exists at $ENV_FILE"
        prompt OVERWRITE "Do you want to overwrite it? (y/N)" "N" validate_yes_no
        if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
            info "Setup cancelled. Existing configuration preserved."
            exit 0
        fi
        # Backup existing file
        cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%s)"
        success "Existing .env backed up"
    fi

    # Create config directory
    mkdir -p "$CONFIG_DIR"

    echo
    info "=== SYSTEM CONFIGURATION ==="
    echo

    # Hostname
    DEFAULT_HOSTNAME=$(detect_hostname)
    prompt HOSTNAME "System hostname" "$DEFAULT_HOSTNAME" validate_hostname

    # Primary IP
    DEFAULT_IP=$(detect_primary_ip)
    prompt PRIMARY_IP "Primary IP address" "$DEFAULT_IP" validate_ip

    # mDNS Name
    DEFAULT_MDNS="${HOSTNAME}.local"
    prompt MDNS_NAME "mDNS name" "$DEFAULT_MDNS"

    echo
    info "=== ADMIN ACCOUNT ==="
    echo

    # Admin Username
    prompt ADMIN_USER "Admin username" "admin"

    # Admin Password
    prompt_password ADMIN_PASSWORD "Admin password (min 8 characters)"

    echo
    info "=== NETWORK CONFIGURATION ==="
    echo

    # HTTP Port
    prompt HTTP_PORT "HTTP port" "80" validate_port

    # HTTPS Port
    prompt HTTPS_PORT "HTTPS port" "443" validate_port

    # Enable SSL
    prompt ENABLE_SSL "Enable SSL/TLS? (y/N)" "N" validate_yes_no
    SSL_ENABLED="false"
    if [[ "$ENABLE_SSL" =~ ^[Yy]$ ]]; then
        SSL_ENABLED="true"
    fi

    echo
    info "=== DATABASE CONFIGURATION ==="
    echo

    # PostgreSQL Password
    POSTGRES_PASSWORD=$(generate_secret 24)
    info "Generated secure PostgreSQL password"

    # Database Retention
    prompt DB_RETENTION_DAYS "Database retention (days)" "7" validate_port

    echo
    info "=== STORAGE CONFIGURATION ==="
    echo

    # MinIO Credentials
    MINIO_ACCESS_KEY=$(generate_secret 20)
    MINIO_SECRET_KEY=$(generate_secret 40)
    info "Generated MinIO access credentials"

    echo
    info "=== AI SERVICE CONFIGURATION ==="
    echo

    # LLM Model
    prompt LLM_MODEL "LLM model name" "llama2:7b"

    # LLM Max Memory
    prompt LLM_MAX_MEMORY "LLM max memory (GB)" "40" validate_port

    # Embedding Model
    prompt EMBEDDING_MODEL "Embedding model name" "all-minilm:l6-v2"

    echo
    info "=== SELF-HEALING CONFIGURATION ==="
    echo

    # Self-Healing Interval
    prompt SELF_HEAL_INTERVAL "Self-healing check interval (seconds)" "10" validate_port

    # CPU Threshold
    prompt CPU_THRESHOLD "CPU threshold (%)" "90" validate_port

    # RAM Threshold
    prompt RAM_THRESHOLD "RAM threshold (%)" "95" validate_port

    # GPU Threshold
    prompt GPU_THRESHOLD "GPU threshold (%)" "95" validate_port

    # Temp Threshold
    prompt TEMP_THRESHOLD "Temperature threshold (°C)" "85" validate_port

    echo
    info "=== SECURITY ==="
    echo

    # JWT Secret
    JWT_SECRET=$(generate_secret 64)
    info "Generated JWT secret"

    # Session Timeout
    prompt SESSION_TIMEOUT_HOURS "Session timeout (hours)" "24" validate_port

    echo
    info "=== GENERATING CONFIGURATION FILE ==="
    echo

    # Generate .env file
    cat > "$ENV_FILE" << EOF
# Arasul Platform Configuration
# Generated: $(date -Iseconds)
# DO NOT COMMIT THIS FILE TO VERSION CONTROL

# System
HOSTNAME=$HOSTNAME
PRIMARY_IP=$PRIMARY_IP
MDNS_NAME=$MDNS_NAME
ENVIRONMENT=production

# Network
HTTP_PORT=$HTTP_PORT
HTTPS_PORT=$HTTPS_PORT
SSL_ENABLED=$SSL_ENABLED

# Admin Account
ADMIN_USER=$ADMIN_USER
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Database
POSTGRES_USER=arasul
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=arasul_db
DB_RETENTION_DAYS=$DB_RETENTION_DAYS

# MinIO
MINIO_ROOT_USER=$MINIO_ACCESS_KEY
MINIO_ROOT_PASSWORD=$MINIO_SECRET_KEY
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY

# AI Services
LLM_MODEL=$LLM_MODEL
LLM_MAX_MEMORY_GB=$LLM_MAX_MEMORY
EMBEDDING_MODEL=$EMBEDDING_MODEL

# Self-Healing
SELF_HEAL_INTERVAL_SEC=$SELF_HEAL_INTERVAL
CPU_THRESHOLD=$CPU_THRESHOLD
RAM_THRESHOLD=$RAM_THRESHOLD
GPU_THRESHOLD=$GPU_THRESHOLD
TEMP_THRESHOLD=$TEMP_THRESHOLD

# Security
JWT_SECRET=$JWT_SECRET
SESSION_TIMEOUT_HOURS=$SESSION_TIMEOUT_HOURS

# Paths
DATA_DIR=/arasul/data
CONFIG_DIR=/arasul/config
LOG_DIR=/arasul/logs
CACHE_DIR=/arasul/cache
UPDATES_DIR=/arasul/updates

# Docker Network
ARASUL_NETWORK=arasul-net
ARASUL_SUBNET=172.30.0.0/24

# Feature Flags
ENABLE_TELEMETRY=true
ENABLE_SELF_HEALING=true
ENABLE_AUTO_UPDATES=false
EOF

    success "Configuration file created: $ENV_FILE"

    # Set restrictive permissions
    chmod 600 "$ENV_FILE"
    success "Permissions set to 600 (owner read/write only)"

    echo
    info "=== CONFIGURATION SUMMARY ==="
    echo
    echo "Hostname:        $HOSTNAME"
    echo "IP Address:      $PRIMARY_IP"
    echo "mDNS Name:       $MDNS_NAME"
    echo "Admin User:      $ADMIN_USER"
    echo "HTTP Port:       $HTTP_PORT"
    echo "HTTPS Port:      $HTTPS_PORT"
    echo "SSL Enabled:     $SSL_ENABLED"
    echo "LLM Model:       $LLM_MODEL"
    echo "LLM Max Memory:  ${LLM_MAX_MEMORY}GB"
    echo "Embedding Model: $EMBEDDING_MODEL"
    echo "DB Retention:    ${DB_RETENTION_DAYS} days"
    echo

    success "Setup completed successfully!"
    echo
    info "Next steps:"
    echo "  1. Review the configuration: cat $ENV_FILE"
    echo "  2. Run the bootstrap script: ./arasul bootstrap"
    echo "  3. Access the dashboard at: http://${PRIMARY_IP}:${HTTP_PORT}"
    if [ "$SSL_ENABLED" = "true" ]; then
        echo "     or: https://${PRIMARY_IP}:${HTTPS_PORT}"
    fi
    echo "  4. Access via mDNS: http://${MDNS_NAME}"
    echo
}

# Run main setup
main "$@"
