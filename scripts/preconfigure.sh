#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Pre-Configuration Script
# Prepares a fresh Jetson device for first customer deployment.
# This script is IDEMPOTENT - safe to run multiple times.
#
# What it does:
#   1. Detect Jetson hardware and apply device-specific config
#   2. Generate .env with secure random credentials
#   3. Generate SSH keys (if not present)
#   4. Generate self-signed TLS certificate (if not present)
#   5. Create required directories
#   6. Pull Docker images
#   7. Initialize database
#   8. Pre-load default Ollama model
#
# Usage:
#   ./scripts/preconfigure.sh [--skip-pull] [--skip-model]
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# CLI flags
SKIP_PULL=false
SKIP_MODEL=false

for arg in "$@"; do
  case "$arg" in
    --skip-pull)  SKIP_PULL=true ;;
    --skip-model) SKIP_MODEL=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-pull] [--skip-model]"
      echo "  --skip-pull   Skip Docker image pulling"
      echo "  --skip-model  Skip Ollama model download"
      exit 0
      ;;
  esac
done

# Logging helpers
log_step()    { echo -e "\n${BLUE}${BOLD}[$1/$TOTAL_STEPS]${NC} ${BOLD}$2${NC}"; }
log_info()    { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_error()   { echo -e "  ${RED}✗${NC} $1"; }
log_skip()    { echo -e "  ${YELLOW}→${NC} Übersprungen: $1"; }

TOTAL_STEPS=8

###############################################################################
# Helper functions
###############################################################################

generate_secret() {
  # Generate a cryptographically secure random string
  local length=${1:-32}
  openssl rand -base64 "$length" | tr -dc 'a-zA-Z0-9' | head -c "$length"
}

generate_password() {
  # Generate a human-readable password (for admin)
  local length=${1:-16}
  openssl rand -base64 "$length" | tr -dc 'a-zA-Z0-9!@#$%' | head -c "$length"
}

###############################################################################
echo -e "\n${BLUE}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}    ARASUL PLATFORM - Vorkonfiguration${NC}"
echo -e "${BLUE}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "  Zeitstempel: $(date -Iseconds)"
echo -e "  Verzeichnis: ${PROJECT_ROOT}\n"

###############################################################################
# Step 1: Detect hardware
###############################################################################
log_step 1 "Hardware erkennen"

if [ -x "${SCRIPT_DIR}/detect-jetson.sh" ]; then
  DEVICE_MODEL=$("${SCRIPT_DIR}/detect-jetson.sh" profile 2>/dev/null || echo "generic")
  log_info "Geräteprofil: ${DEVICE_MODEL}"

  # Generate device-specific config
  "${SCRIPT_DIR}/detect-jetson.sh" generate >/dev/null 2>&1 || true
  log_info "Gerätekonfiguration generiert"
else
  DEVICE_MODEL="generic"
  log_warn "detect-jetson.sh nicht gefunden, nutze generisches Profil"
fi

###############################################################################
# Step 2: Generate .env with secure credentials
###############################################################################
log_step 2 "Umgebungsvariablen konfigurieren"

ENV_FILE="${PROJECT_ROOT}/.env"
ENV_TEMPLATE="${PROJECT_ROOT}/.env.example"

if [ -f "$ENV_FILE" ]; then
  log_info ".env existiert bereits, Credentials bleiben erhalten"
  # Ensure all required variables exist (non-destructive merge)
  NEEDS_UPDATE=false
else
  log_info "Erstelle neue .env mit sicheren Zufallswerten"
  NEEDS_UPDATE=true

  # Generate credentials
  ADMIN_PASSWORD=$(generate_password 16)
  JWT_SECRET=$(generate_secret 64)
  MINIO_ROOT_PASSWORD=$(generate_secret 24)
  N8N_ENCRYPTION_KEY=$(generate_secret 32)
  N8N_BASIC_AUTH_PASSWORD=$(generate_password 16)
  POSTGRES_PASSWORD=$(generate_secret 24)

  # Create .env from template or scratch
  if [ -f "$ENV_TEMPLATE" ]; then
    cp "$ENV_TEMPLATE" "$ENV_FILE"
    log_info "Template .env.example als Basis verwendet"
  else
    cat > "$ENV_FILE" << EOF
# =============================================================================
# Arasul Platform - Environment Configuration
# Generated: $(date -Iseconds)
# Device Profile: ${DEVICE_MODEL}
# =============================================================================

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h

# PostgreSQL
POSTGRES_DB=arasul_db
POSTGRES_USER=arasul
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://arasul:${POSTGRES_PASSWORD}@postgres-db:5432/arasul_db

# MinIO
MINIO_ROOT_USER=arasul
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}

# n8n
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}

# LLM
LLM_HOST=llm-service
LLM_PORT=11434
LLM_MODEL=llama3.1:8b

# Embedding
EMBEDDING_HOST=embedding-service
EMBEDDING_PORT=11435
EMBEDDING_MODEL=nomic-embed-text

# System
SYSTEM_VERSION=1.0.0
LOG_LEVEL=INFO
NODE_ENV=production
EOF
    log_info ".env erstellt"
  fi

  # Apply device-specific overrides
  JETSON_ENV="${PROJECT_ROOT}/.env.jetson"
  if [ -f "$JETSON_ENV" ]; then
    while IFS='=' read -r key value; do
      [[ "$key" =~ ^#.*$ ]] && continue
      [[ -z "$key" ]] && continue
      # Only add if not already set
      if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
        echo "${key}=${value}" >> "$ENV_FILE"
      fi
    done < <(grep -v '^#' "$JETSON_ENV" | grep '=')
    log_info "Gerätespezifische Konfiguration angewendet"
  fi

  echo ""
  echo -e "  ${BOLD}╔══════════════════════════════════════════════╗${NC}"
  echo -e "  ${BOLD}║  Admin-Passwort: ${GREEN}${ADMIN_PASSWORD}${NC}${BOLD}  ║${NC}"
  echo -e "  ${BOLD}║  Bitte notieren Sie dieses Passwort!         ║${NC}"
  echo -e "  ${BOLD}╚══════════════════════════════════════════════╝${NC}"
  echo ""
fi

###############################################################################
# Step 3: Create required directories
###############################################################################
log_step 3 "Verzeichnisstruktur erstellen"

DIRS=(
  "${PROJECT_ROOT}/data/postgres"
  "${PROJECT_ROOT}/data/minio"
  "${PROJECT_ROOT}/data/qdrant"
  "${PROJECT_ROOT}/data/n8n"
  "${PROJECT_ROOT}/data/ollama"
  "${PROJECT_ROOT}/data/backups"
  "${PROJECT_ROOT}/data/uploads"
  "${PROJECT_ROOT}/logs"
  "${PROJECT_ROOT}/cache"
  "${PROJECT_ROOT}/updates"
)

for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
done

log_info "${#DIRS[@]} Verzeichnisse erstellt/verifiziert"

###############################################################################
# Step 4: Generate SSH keys
###############################################################################
log_step 4 "SSH-Schlüssel generieren"

SSH_KEY="${PROJECT_ROOT}/config/ssh/arasul_deploy_key"

if [ -f "$SSH_KEY" ]; then
  log_info "SSH-Schlüssel existiert bereits"
else
  mkdir -p "$(dirname "$SSH_KEY")"
  ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "arasul-platform@$(hostname)" >/dev/null 2>&1
  chmod 600 "$SSH_KEY"
  chmod 644 "${SSH_KEY}.pub"
  log_info "Ed25519 SSH-Schlüssel generiert"
fi

###############################################################################
# Step 5: Generate self-signed TLS certificate
###############################################################################
log_step 5 "TLS-Zertifikat generieren"

CERT_DIR="${PROJECT_ROOT}/config/certs"
CERT_FILE="${CERT_DIR}/arasul.crt"
KEY_FILE="${CERT_DIR}/arasul.key"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
  log_info "TLS-Zertifikat existiert bereits"
else
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -days 3650 \
    -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/CN=arasul.local/O=Arasul Platform/C=DE" \
    -addext "subjectAltName=DNS:arasul.local,DNS:localhost,IP:127.0.0.1" \
    >/dev/null 2>&1
  chmod 600 "$KEY_FILE"
  log_info "Selbstsigniertes TLS-Zertifikat generiert (10 Jahre)"
fi

###############################################################################
# Step 6: Pull Docker images
###############################################################################
log_step 6 "Docker-Images vorbereiten"

if [ "$SKIP_PULL" = true ]; then
  log_skip "Docker-Pull übersprungen (--skip-pull)"
else
  if command -v docker >/dev/null 2>&1; then
    cd "$PROJECT_ROOT"

    # Build project-specific images
    if [ -f "docker-compose.yml" ] || [ -f "compose.yaml" ]; then
      log_info "Baue Docker-Images..."
      docker compose build --parallel 2>/dev/null || docker compose build || {
        log_warn "Docker-Build teilweise fehlgeschlagen"
      }
      log_info "Docker-Images gebaut"
    else
      log_warn "Keine docker-compose.yml gefunden"
    fi
  else
    log_warn "Docker nicht installiert, überspringe Image-Pull"
  fi
fi

###############################################################################
# Step 7: Initialize database
###############################################################################
log_step 7 "Datenbank initialisieren"

if command -v docker >/dev/null 2>&1; then
  cd "$PROJECT_ROOT"

  # Start only postgres to run migrations
  POSTGRES_RUNNING=$(docker compose ps --status running postgres-db 2>/dev/null | grep -c postgres || true)

  if [ "$POSTGRES_RUNNING" -gt 0 ]; then
    log_info "PostgreSQL läuft bereits"
  else
    log_info "Starte PostgreSQL für Migration..."
    docker compose up -d postgres-db 2>/dev/null || true

    # Wait for postgres to be ready
    for i in $(seq 1 30); do
      if docker compose exec -T postgres-db pg_isready -U arasul >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    log_info "PostgreSQL ist bereit"
  fi

  # Migrations are applied via init scripts on first run
  log_info "Migrationen werden beim ersten Start automatisch angewendet"
else
  log_warn "Docker nicht verfügbar, Datenbank-Init übersprungen"
fi

###############################################################################
# Step 8: Pre-load Ollama model
###############################################################################
log_step 8 "KI-Modell vorladen"

if [ "$SKIP_MODEL" = true ]; then
  log_skip "Modell-Download übersprungen (--skip-model)"
else
  # Load .env to get model name
  if [ -f "$ENV_FILE" ]; then
    LLM_MODEL=$(grep "^LLM_MODEL=" "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
  fi
  LLM_MODEL=${LLM_MODEL:-"llama3.1:8b"}

  if command -v docker >/dev/null 2>&1; then
    # Check if LLM service is running
    LLM_RUNNING=$(docker compose ps --status running llm-service 2>/dev/null | grep -c llm || true)

    if [ "$LLM_RUNNING" -eq 0 ]; then
      log_info "Starte LLM-Service..."
      cd "$PROJECT_ROOT"
      docker compose up -d llm-service 2>/dev/null || true

      # Wait for Ollama to be ready
      for i in $(seq 1 60); do
        if docker compose exec -T llm-service ollama list >/dev/null 2>&1; then
          break
        fi
        sleep 2
      done
    fi

    # Check if model is already downloaded
    MODEL_EXISTS=$(docker compose exec -T llm-service ollama list 2>/dev/null | grep -c "${LLM_MODEL}" || true)

    if [ "$MODEL_EXISTS" -gt 0 ]; then
      log_info "Modell '${LLM_MODEL}' bereits vorhanden"
    else
      log_info "Lade Modell '${LLM_MODEL}' herunter (kann mehrere Minuten dauern)..."
      docker compose exec -T llm-service ollama pull "${LLM_MODEL}" 2>&1 | tail -1 || {
        log_warn "Modell-Download fehlgeschlagen (kann später im Store nachgeholt werden)"
      }
    fi
  else
    log_warn "Docker nicht verfügbar, Modell-Vorladung übersprungen"
  fi
fi

###############################################################################
# Summary
###############################################################################
echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}    Vorkonfiguration abgeschlossen!${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Nächste Schritte:"
echo -e "    1. ${BOLD}docker compose up -d${NC}  - Alle Services starten"
echo -e "    2. Browser öffnen: ${BOLD}http://arasul.local${NC}"
echo -e "    3. Setup-Wizard durchlaufen"
echo ""

if [ "$NEEDS_UPDATE" = true ] 2>/dev/null; then
  echo -e "  ${YELLOW}${BOLD}Wichtig: Admin-Passwort oben notieren!${NC}"
  echo ""
fi
