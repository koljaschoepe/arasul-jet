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
    
    # Save admin password to secrets file for reference
    echo "$ADMIN_PASSWORD" > config/secrets/admin_password.txt
    log_info "Admin password saved to config/secrets/admin_password.txt"
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
    
    log_success "Update signing keys generated in config/secrets/"
else
    log_warning "Update keys already exist, skipping generation"
fi

# 4. Admin Hash
if [ ! -f "config/secrets/admin.hash" ]; then
    log_info "Generating admin hash..."
    # Simple hash generation (in production use bcrypt)
    # For dev script we just create a placeholder or use a simple python one-liner if available
    
    if command -v python3 &> /dev/null; then
        ADMIN_PASS=$(cat config/secrets/admin_password.txt 2>/dev/null || echo "admin")
        # Use python to generate bcrypt hash
        # Requires bcrypt module, if not present, warn
        if python3 -c "import bcrypt" 2>/dev/null; then
             HASH=$(python3 -c "import bcrypt; print(bcrypt.hashpw('$ADMIN_PASS'.encode(), bcrypt.gensalt()).decode())")
             echo "$HASH" > config/secrets/admin.hash
             log_success "Admin hash generated"
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
    # Extract from .env
    if [ -f ".env" ]; then
        grep JWT_SECRET .env | cut -d '=' -f2 > config/secrets/jwt_secret
        log_success "JWT secret file created"
    fi
fi

echo ""
log_success "Development environment setup complete!"
echo "You can now run 'docker-compose up -d' to start the platform."
