#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Docker Secrets Loader
# Loads secrets from Docker Secrets or config/secrets/ directory
###############################################################################

# This script is sourced by other scripts to load secrets
# It checks Docker Secrets first, then falls back to file-based secrets

SECRETS_DIR="/run/secrets"
CONFIG_SECRETS_DIR="/arasul/config/secrets"

load_secret() {
    local secret_name=$1
    local env_var_name=$2
    local secret_value=""

    # Try Docker Secret first
    if [ -f "${SECRETS_DIR}/${secret_name}" ]; then
        secret_value=$(cat "${SECRETS_DIR}/${secret_name}")
        echo "[INFO] Loaded ${secret_name} from Docker Secret" >&2
    # Fall back to config/secrets/
    elif [ -f "${CONFIG_SECRETS_DIR}/${secret_name}" ]; then
        secret_value=$(cat "${CONFIG_SECRETS_DIR}/${secret_name}")
        echo "[INFO] Loaded ${secret_name} from config/secrets/" >&2
    else
        echo "[WARNING] Secret ${secret_name} not found" >&2
        return 1
    fi

    # Export as environment variable
    export "${env_var_name}=${secret_value}"
    return 0
}

# Load all standard secrets
load_all_secrets() {
    load_secret "postgres_password" "POSTGRES_PASSWORD"
    load_secret "minio_root_password" "MINIO_ROOT_PASSWORD"
    load_secret "jwt_secret" "JWT_SECRET"
    load_secret "n8n_encryption_key" "N8N_ENCRYPTION_KEY"
    load_secret "admin_password" "ADMIN_PASSWORD"
}

# Check if running in Docker Secrets mode
is_docker_secrets_mode() {
    [ -d "${SECRETS_DIR}" ] && [ "$(ls -A ${SECRETS_DIR} 2>/dev/null)" ]
}

# Main execution (only if script is run directly, not sourced)
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    echo "Loading secrets..."
    load_all_secrets
    echo "Secrets loaded successfully"
fi
