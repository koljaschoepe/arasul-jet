#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Development Setup Script
# Automates the setup of the local development environment
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

# Check if openssl is installed
if ! command -v openssl &> /dev/null; then
    log_error "openssl is required but not installed. Please install it."
    exit 1
fi

# Create directories
log_info "Creating necessary directories..."
mkdir -p config/secrets
mkdir -p config/traefik/certs
mkdir -p logs

# Generate Secrets
log_info "Generating secrets..."

generate_secret() {
    openssl rand -base64 32 | tr -d '\n'
}

generate_password() {
    openssl rand -base64 12 | tr -d '\n'
}

# 1. .env file
if [ ! -f ".env" ]; then
    log_info "Creating .env from .env.template..."
    cp .env.template .env
    
    # Populate secrets
    JWT_SECRET=$(generate_secret)
    ADMIN_PASSWORD=$(generate_password)
    POSTGRES_PASSWORD=$(generate_password)
    MINIO_ROOT_PASSWORD=$(generate_password)
    N8N_BASIC_AUTH_PASSWORD=$(generate_password)
    N8N_ENCRYPTION_KEY=$(generate_secret)
    
    # Replace placeholders
    sed -i.bak "s|__JWT_SECRET_PLACEHOLDER__|$JWT_SECRET|g" .env
    sed -i.bak "s|__ADMIN_PASSWORD_PLACEHOLDER__|$ADMIN_PASSWORD|g" .env
    sed -i.bak "s|__POSTGRES_PASSWORD_PLACEHOLDER__|$POSTGRES_PASSWORD|g" .env
    sed -i.bak "s|__MINIO_ROOT_PASSWORD_PLACEHOLDER__|$MINIO_ROOT_PASSWORD|g" .env
    sed -i.bak "s|__N8N_BASIC_AUTH_PASSWORD_PLACEHOLDER__|$N8N_BASIC_AUTH_PASSWORD|g" .env
    sed -i.bak "s|__N8N_ENCRYPTION_KEY_PLACEHOLDER__|$N8N_ENCRYPTION_KEY|g" .env
    
    rm .env.bak
    log_success ".env created and populated with secure values"

    # Note: Admin password is stored in .env only, not in separate plaintext file
    # This is more secure than keeping a plaintext copy
    log_info "Admin password stored securely in .env file (not in separate file)"
else
    log_warning ".env already exists, skipping creation"
fi

# 2. SSL Certificates
if [ ! -f "config/traefik/certs/arasul.key" ]; then
    log_info "Generating self-signed SSL certificates..."
    
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout config/traefik/certs/arasul.key \
        -out config/traefik/certs/arasul.crt \
        -subj "/C=US/ST=State/L=City/O=Arasul/OU=Dev/CN=arasul.local"
        
    log_success "SSL certificates generated in config/traefik/certs/"
else
    log_warning "SSL certificates already exist, skipping generation"
fi

# 3. Update Keys
if [ ! -f "config/secrets/public_update_key.pem" ]; then
    log_info "Generating update signing keys..."
    
    openssl genrsa -out config/secrets/private_update_key.pem 2048
    openssl rsa -in config/secrets/private_update_key.pem -pubout -out config/secrets/public_update_key.pem

    # Set secure permissions on private key
    chmod 600 config/secrets/private_update_key.pem

    log_success "Update signing keys generated with secure permissions"
else
    log_warning "Update keys already exist, skipping generation"
fi

# 4. Admin Hash
if [ ! -f "config/secrets/admin.hash" ]; then
    log_info "Generating admin hash..."

    if command -v python3 &> /dev/null; then
        # Get admin password from .env (not from separate file)
        ADMIN_PASS=$(grep ADMIN_PASSWORD .env 2>/dev/null | cut -d '=' -f2 || echo "admin")

        # Use python to generate bcrypt hash
        # Requires bcrypt module, if not present, warn
        if python3 -c "import bcrypt" 2>/dev/null; then
             # Use stdin to pass password (avoids password in process list)
             HASH=$(echo "$ADMIN_PASS" | python3 -c "
import sys, bcrypt
password = sys.stdin.read().strip()
print(bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode())
")
             echo "$HASH" > config/secrets/admin.hash
             chmod 600 config/secrets/admin.hash
             log_success "Admin hash generated with secure permissions"
        else
             log_warning "python3-bcrypt not found, skipping admin hash generation. Run bootstrap or install dependencies."
             echo "HASH_PLACEHOLDER" > config/secrets/admin.hash
        fi
    else
        echo "HASH_PLACEHOLDER" > config/secrets/admin.hash
        log_warning "python3 not found, created placeholder admin hash"
    fi
fi

# 5. JWT Secret File
if [ ! -f "config/secrets/jwt_secret" ]; then
    # Extract from .env and set secure permissions
    if [ -f ".env" ]; then
        grep JWT_SECRET .env | cut -d '=' -f2 > config/secrets/jwt_secret
        chmod 600 config/secrets/jwt_secret
        log_success "JWT secret file created with secure permissions (0600)"
    fi
fi

# 6. System Hardware Detection
log_info "Detecting system hardware..."

# Detect total RAM
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))

# Detect if running on Jetson
IS_JETSON="false"
JETSON_MODEL=""
if [ -f "/etc/nv_tegra_release" ] || [ -d "/sys/devices/platform/tegra-pmc" ]; then
    IS_JETSON="true"
    if [ -f "/proc/device-tree/model" ]; then
        JETSON_MODEL=$(cat /proc/device-tree/model | tr -d '\0')
    fi
fi

# Detect GPU
GPU_INFO=""
GPU_MEMORY_MB=0
if command -v nvidia-smi &> /dev/null; then
    GPU_INFO=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    GPU_MEMORY_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
fi

# Calculate recommended settings based on RAM
# For Jetson: shared memory between CPU and GPU
# For desktop: separate GPU memory
if [ "$IS_JETSON" = "true" ]; then
    # Jetson AGX Orin 64GB: ~12GB for GPU, rest for system
    # Leave 20% for system, 95% threshold for LLM safety
    AVAILABLE_FOR_LLM=$((TOTAL_RAM_GB * 80 / 100))
    RAM_CRITICAL_THRESHOLD="95"
    RAM_WARNING_THRESHOLD="90"
else
    # Desktop/Server with dedicated GPU
    AVAILABLE_FOR_LLM=$((TOTAL_RAM_GB * 85 / 100))
    RAM_CRITICAL_THRESHOLD="95"
    RAM_WARNING_THRESHOLD="85"
fi

# Determine recommended model category
if [ "$AVAILABLE_FOR_LLM" -ge 50 ]; then
    RECOMMENDED_CATEGORY="xlarge"
    RECOMMENDED_MODEL="qwen3:32b-q8"
elif [ "$AVAILABLE_FOR_LLM" -ge 30 ]; then
    RECOMMENDED_CATEGORY="large"
    RECOMMENDED_MODEL="qwen3:14b-q8"
elif [ "$AVAILABLE_FOR_LLM" -ge 15 ]; then
    RECOMMENDED_CATEGORY="medium"
    RECOMMENDED_MODEL="qwen3:7b-q8"
else
    RECOMMENDED_CATEGORY="small"
    RECOMMENDED_MODEL="qwen3:1.7b"
fi

# Write system config
cat > config/system_hardware.json << EOF
{
    "detected_at": "$(date -Iseconds)",
    "ram": {
        "total_mb": ${TOTAL_RAM_MB},
        "total_gb": ${TOTAL_RAM_GB},
        "available_for_llm_gb": ${AVAILABLE_FOR_LLM}
    },
    "gpu": {
        "name": "${GPU_INFO}",
        "memory_mb": ${GPU_MEMORY_MB}
    },
    "platform": {
        "is_jetson": ${IS_JETSON},
        "jetson_model": "${JETSON_MODEL}"
    },
    "recommended_settings": {
        "model_category": "${RECOMMENDED_CATEGORY}",
        "default_model": "${RECOMMENDED_MODEL}",
        "ram_warning_threshold": ${RAM_WARNING_THRESHOLD},
        "ram_critical_threshold": ${RAM_CRITICAL_THRESHOLD},
        "model_inactivity_timeout_minutes": 30,
        "keep_alive_seconds": 300
    }
}
EOF

log_success "System hardware detected:"
echo "  - Total RAM: ${TOTAL_RAM_GB} GB"
echo "  - Available for LLM: ~${AVAILABLE_FOR_LLM} GB"
if [ "$IS_JETSON" = "true" ]; then
    echo "  - Platform: Jetson (${JETSON_MODEL})"
else
    echo "  - Platform: Standard (${GPU_INFO:-No GPU detected})"
fi
echo "  - Recommended model: ${RECOMMENDED_MODEL}"
echo "  - Configuration saved to config/system_hardware.json"

# Update .env with recommended settings if not already set
if [ -f ".env" ]; then
    # Check if LLM_MODEL is placeholder or not set
    if grep -q "^LLM_MODEL=.*PLACEHOLDER" .env || ! grep -q "^LLM_MODEL=" .env; then
        if grep -q "^LLM_MODEL=" .env; then
            sed -i.bak "s|^LLM_MODEL=.*|LLM_MODEL=${RECOMMENDED_MODEL}|g" .env
        else
            echo "LLM_MODEL=${RECOMMENDED_MODEL}" >> .env
        fi
        rm -f .env.bak
        log_info "Updated LLM_MODEL in .env to ${RECOMMENDED_MODEL}"
    fi

    # Set RAM thresholds if not present
    if ! grep -q "^RAM_CRITICAL_PERCENT=" .env; then
        echo "RAM_CRITICAL_PERCENT=${RAM_CRITICAL_THRESHOLD}" >> .env
    fi
    if ! grep -q "^RAM_WARNING_PERCENT=" .env; then
        echo "RAM_WARNING_PERCENT=${RAM_WARNING_THRESHOLD}" >> .env
    fi
fi

echo ""
log_success "Development environment setup complete!"
echo "You can now run 'docker-compose up -d' to start the platform."
