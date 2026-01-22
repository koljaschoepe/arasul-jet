#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Configuration Validation
# Validates .env file and configuration before startup
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "[INFO] $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

ERRORS=0
WARNINGS=0
ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
    log_error ".env file not found at $ENV_FILE"
    exit 1
fi

log_info "Validating configuration from $ENV_FILE"
echo ""

# Load environment variables
set -a
source "$ENV_FILE"
set +a

###############################################################################
# VALIDATION FUNCTIONS
###############################################################################

validate_required_var() {
    local var_name=$1
    local var_value="${!var_name}"

    if [ -z "$var_value" ]; then
        log_error "Required variable $var_name is not set"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
    return 0
}

validate_port() {
    local var_name=$1
    local port="${!var_name}"

    if [ -z "$port" ]; then
        return 0  # Already handled by required check
    fi

    if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
        log_error "$var_name has invalid port number: $port (must be 1-65535)"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
    return 0
}

validate_hostname() {
    local var_name=$1
    local hostname="${!var_name}"

    if [ -z "$hostname" ]; then
        return 0
    fi

    # Basic hostname validation
    if ! [[ "$hostname" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        log_error "$var_name has invalid hostname: $hostname"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
    return 0
}

validate_number() {
    local var_name=$1
    local min=$2
    local max=$3
    local value="${!var_name}"

    if [ -z "$value" ]; then
        return 0
    fi

    if ! [[ "$value" =~ ^[0-9]+$ ]]; then
        log_error "$var_name must be a number: $value"
        ERRORS=$((ERRORS + 1))
        return 1
    fi

    if [ -n "$min" ] && [ "$value" -lt "$min" ]; then
        log_error "$var_name must be >= $min (got $value)"
        ERRORS=$((ERRORS + 1))
        return 1
    fi

    if [ -n "$max" ] && [ "$value" -gt "$max" ]; then
        log_error "$var_name must be <= $max (got $value)"
        ERRORS=$((ERRORS + 1))
        return 1
    fi

    return 0
}

validate_boolean() {
    local var_name=$1
    local value="${!var_name}"

    if [ -z "$value" ]; then
        return 0
    fi

    if [[ ! "$value" =~ ^(true|false|yes|no|1|0)$ ]]; then
        log_error "$var_name must be boolean (true/false/yes/no/1/0): $value"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
    return 0
}

check_password_strength() {
    local var_name=$1
    local password="${!var_name}"

    if [ -z "$password" ]; then
        return 0
    fi

    local length=${#password}

    # Production mode: Minimum 12 characters for security
    if [ "$length" -lt 12 ]; then
        log_error "$var_name is too short (< 12 characters) - SECURITY RISK"
        ERRORS=$((ERRORS + 1))
    fi

    # Check for default/weak passwords (excluding arasul123 for dev)
    if [[ "$password" =~ ^(password|admin|123456|changeme|default)$ ]]; then
        log_error "$var_name uses a common/weak password - SECURITY RISK"
        ERRORS=$((ERRORS + 1))
    fi
}

###############################################################################
# DATABASE CONFIGURATION
###############################################################################

log_info "Validating Database Configuration..."

validate_required_var "POSTGRES_HOST"
validate_hostname "POSTGRES_HOST"
validate_required_var "POSTGRES_PORT"
validate_port "POSTGRES_PORT"
validate_required_var "POSTGRES_USER"
validate_required_var "POSTGRES_PASSWORD"
validate_required_var "POSTGRES_DB"
check_password_strength "POSTGRES_PASSWORD"
validate_number "POSTGRES_MAX_CONNECTIONS" 10 1000

echo ""

###############################################################################
# MINIO CONFIGURATION
###############################################################################

log_info "Validating MinIO Configuration..."

validate_required_var "MINIO_HOST"
validate_hostname "MINIO_HOST"
validate_required_var "MINIO_PORT"
validate_port "MINIO_PORT"
validate_required_var "MINIO_ROOT_USER"
validate_required_var "MINIO_ROOT_PASSWORD"
check_password_strength "MINIO_ROOT_PASSWORD"
validate_boolean "MINIO_BROWSER"

echo ""

###############################################################################
# LLM SERVICE CONFIGURATION
###############################################################################

log_info "Validating LLM Service Configuration..."

validate_required_var "LLM_SERVICE_HOST"
validate_hostname "LLM_SERVICE_HOST"
validate_required_var "LLM_SERVICE_PORT"
validate_port "LLM_SERVICE_PORT"
validate_required_var "LLM_MODEL"

# Check resource limits
if [ -n "$RAM_LIMIT_LLM" ]; then
    # Extract number from format like "32G" or "32768M"
    ram_value=$(echo "$RAM_LIMIT_LLM" | sed 's/[^0-9]//g')
    ram_unit=$(echo "$RAM_LIMIT_LLM" | sed 's/[0-9]//g')

    if [ "$ram_unit" = "G" ] && [ "$ram_value" -lt 8 ]; then
        log_warning "RAM_LIMIT_LLM is very low (< 8GB) - LLM may not function properly"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

echo ""

###############################################################################
# EMBEDDING SERVICE CONFIGURATION
###############################################################################

log_info "Validating Embedding Service Configuration..."

validate_required_var "EMBEDDING_SERVICE_HOST"
validate_hostname "EMBEDDING_SERVICE_HOST"
validate_required_var "EMBEDDING_SERVICE_PORT"
validate_port "EMBEDDING_SERVICE_PORT"
validate_required_var "EMBEDDING_MODEL"
validate_number "EMBEDDING_VECTOR_SIZE" 128 4096
validate_number "EMBEDDING_MAX_INPUT_TOKENS" 128 8192

echo ""

###############################################################################
# N8N CONFIGURATION
###############################################################################

log_info "Validating n8n Configuration..."

validate_required_var "N8N_HOST"
validate_hostname "N8N_HOST"
validate_required_var "N8N_PORT"
validate_port "N8N_PORT"
validate_boolean "N8N_BASIC_AUTH_ACTIVE"

if [ "$N8N_BASIC_AUTH_ACTIVE" = "true" ]; then
    validate_required_var "N8N_BASIC_AUTH_USER"
    validate_required_var "N8N_BASIC_AUTH_PASSWORD"
    check_password_strength "N8N_BASIC_AUTH_PASSWORD"
fi

validate_required_var "N8N_ENCRYPTION_KEY"
if [ -n "$N8N_ENCRYPTION_KEY" ]; then
    key_length=${#N8N_ENCRYPTION_KEY}
    if [ "$key_length" -lt 32 ]; then
        log_error "N8N_ENCRYPTION_KEY is too short (< 32 characters)"
        ERRORS=$((ERRORS + 1))
    fi
fi

echo ""

###############################################################################
# AUTHENTICATION CONFIGURATION
###############################################################################

log_info "Validating Authentication Configuration..."

validate_required_var "JWT_SECRET"
if [ -n "$JWT_SECRET" ]; then
    secret_length=${#JWT_SECRET}
    if [ "$secret_length" -lt 32 ]; then
        log_error "JWT_SECRET is too short (< 32 characters) - SECURITY RISK"
        ERRORS=$((ERRORS + 1))
    fi
fi

validate_required_var "JWT_EXPIRY"
validate_required_var "ADMIN_USERNAME"

echo ""

###############################################################################
# SYSTEM CONFIGURATION
###############################################################################

log_info "Validating System Configuration..."

validate_required_var "SYSTEM_VERSION"
validate_required_var "BUILD_HASH"
validate_required_var "LOG_LEVEL"

# Validate log level
if [ -n "$LOG_LEVEL" ]; then
    if [[ ! "$LOG_LEVEL" =~ ^(DEBUG|INFO|WARN|ERROR|CRITICAL)$ ]]; then
        log_error "LOG_LEVEL must be one of: DEBUG, INFO, WARN, ERROR, CRITICAL"
        ERRORS=$((ERRORS + 1))
    fi
fi

echo ""

###############################################################################
# SELF-HEALING CONFIGURATION
###############################################################################

log_info "Validating Self-Healing Configuration..."

validate_boolean "SELF_HEALING_ENABLED"
validate_number "SELF_HEALING_INTERVAL" 5 300
validate_boolean "SELF_HEALING_REBOOT_ENABLED"
validate_number "DISK_WARNING_PERCENT" 50 95
validate_number "DISK_CLEANUP_PERCENT" 70 97
validate_number "DISK_CRITICAL_PERCENT" 80 99
validate_number "DISK_REBOOT_PERCENT" 90 99

# Validate disk threshold ordering
if [ -n "$DISK_WARNING_PERCENT" ] && [ -n "$DISK_CLEANUP_PERCENT" ]; then
    if [ "$DISK_WARNING_PERCENT" -ge "$DISK_CLEANUP_PERCENT" ]; then
        log_error "DISK_WARNING_PERCENT must be < DISK_CLEANUP_PERCENT"
        ERRORS=$((ERRORS + 1))
    fi
fi

if [ -n "$DISK_CLEANUP_PERCENT" ] && [ -n "$DISK_CRITICAL_PERCENT" ]; then
    if [ "$DISK_CLEANUP_PERCENT" -ge "$DISK_CRITICAL_PERCENT" ]; then
        log_error "DISK_CLEANUP_PERCENT must be < DISK_CRITICAL_PERCENT"
        ERRORS=$((ERRORS + 1))
    fi
fi

if [ -n "$DISK_CRITICAL_PERCENT" ] && [ -n "$DISK_REBOOT_PERCENT" ]; then
    if [ "$DISK_CRITICAL_PERCENT" -ge "$DISK_REBOOT_PERCENT" ]; then
        log_error "DISK_CRITICAL_PERCENT must be < DISK_REBOOT_PERCENT"
        ERRORS=$((ERRORS + 1))
    fi
fi

echo ""

###############################################################################
# METRICS CONFIGURATION
###############################################################################

log_info "Validating Metrics Configuration..."

validate_number "METRICS_INTERVAL_LIVE" 1 60
validate_number "METRICS_INTERVAL_PERSIST" 10 300

echo ""

###############################################################################
# FILE CHECKS
###############################################################################

log_info "Checking Configuration Files..."

# Check if secrets directory exists
if [ ! -d "config/secrets" ]; then
    log_warning "config/secrets directory does not exist - will be created by bootstrap"
    WARNINGS=$((WARNINGS + 1))
fi

# Check if admin hash exists
if [ ! -f "config/secrets/admin.hash" ]; then
    log_warning "Admin hash file not found - run bootstrap to generate"
    WARNINGS=$((WARNINGS + 1))
fi

# Check if JWT secret file exists
if [ ! -f "config/secrets/jwt_secret" ]; then
    log_warning "JWT secret file not found - run bootstrap to generate"
    WARNINGS=$((WARNINGS + 1))
fi

# Check if public key exists
if [ ! -f "config/secrets/public_update_key.pem" ]; then
    log_warning "Update public key not found - update system will not work"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

###############################################################################
# SUMMARY
###############################################################################

log_info "Validation Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    log_success "Configuration is valid!"
    echo ""
    echo "✓ All checks passed"
    echo "✓ Ready for deployment"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    log_warning "Configuration has $WARNINGS warning(s)"
    echo ""
    echo "⚠ $WARNINGS warning(s) found"
    echo "✓ Configuration is usable but could be improved"
    exit 0
else
    log_error "Configuration validation FAILED"
    echo ""
    echo "✗ $ERRORS error(s) found"
    echo "⚠ $WARNINGS warning(s) found"
    echo ""
    echo "Please fix the errors above before continuing."
    echo "Run './arasul bootstrap' to generate missing secrets."
    exit 1
fi
