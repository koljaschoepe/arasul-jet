#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Pre-Configuration Script
# Prepares a fresh Jetson device for first customer deployment.
# This script is IDEMPOTENT - safe to run multiple times.
#
# What it does (15 steps):
#   0. (--full only) Install OS packages, Docker, NVIDIA runtime
#   1. Detect Jetson hardware and apply device-specific config
#   2. Generate .env with secure random credentials
#   3. Create required directories
#   4. Generate SSH keys (if not present)
#   5. Generate self-signed TLS certificate (if not present)
#   6. Generate Traefik Basic Auth credentials
#   7. Pull/build Docker images
#   8. Initialize database
#   9. Pre-load default Ollama model
#  10. Install development tools (jq, rg, tmux)
#  11. Git configuration
#  12. mDNS (arasul.local) setup
#  13. Device identity and configuration layers
#  14. Shell aliases
#  15. systemd auto-start service
#
# Usage:
#   ./scripts/preconfigure.sh [--skip-pull] [--skip-model] [--skip-tools]
#                             [--skip-git] [--skip-mdns] [--skip-devenv]
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
SKIP_TOOLS=false
SKIP_GIT=false
SKIP_MDNS=false
SKIP_DEVENV=false
FULL_MODE=false

for arg in "$@"; do
  case "$arg" in
    --full)        FULL_MODE=true ;;
    --skip-pull)   SKIP_PULL=true ;;
    --skip-model)  SKIP_MODEL=true ;;
    --skip-tools)  SKIP_TOOLS=true ;;
    --skip-git)    SKIP_GIT=true ;;
    --skip-mdns)   SKIP_MDNS=true ;;
    --skip-devenv) SKIP_DEVENV=true ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --full         Full provisioning (install OS packages, Docker, NVIDIA runtime)"
      echo "  --skip-pull    Skip Docker image pulling"
      echo "  --skip-model   Skip Ollama model download"
      echo "  --skip-tools   Skip system tools installation (jq, rg, tmux)"
      echo "  --skip-git     Skip Git configuration"
      echo "  --skip-mdns    Skip mDNS setup"
      echo "  --skip-devenv  Skip shell aliases configuration"
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

TOTAL_STEPS=16

###############################################################################
# Helper functions
###############################################################################

# Shared crypto helpers (generate_secret, generate_password). The previous
# in-file versions under-sampled the random pool and could return shorter-than-
# requested strings after alphanumeric filtering.
# shellcheck source=../lib/crypto.sh
. "${PROJECT_ROOT}/scripts/lib/crypto.sh"

###############################################################################
echo -e "\n${BLUE}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}    ARASUL PLATFORM - Vorkonfiguration${NC}"
echo -e "${BLUE}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "  Zeitstempel: $(date -Iseconds)"
echo -e "  Verzeichnis: ${PROJECT_ROOT}\n"

###############################################################################
# Config layer merge helper
# Merges base.env → profiles/jetson.env → device/device.env into .env
# Non-destructive: only adds variables that don't already exist
###############################################################################
merge_config_layers() {
  local env_file="${PROJECT_ROOT}/.env"
  local layers=(
    "${PROJECT_ROOT}/config/base/base.env"
    "${PROJECT_ROOT}/config/profiles/jetson.env"
    "${PROJECT_ROOT}/config/device/device.env"
  )
  local added=0

  for layer in "${layers[@]}"; do
    [ -f "$layer" ] || continue
    while IFS='=' read -r key value; do
      # Skip comments and empty lines
      [[ "$key" =~ ^[[:space:]]*# ]] && continue
      [[ -z "$key" ]] && continue
      # Strip whitespace from key
      key=$(echo "$key" | xargs)
      # Only add if not already set in .env
      if ! grep -q "^${key}=" "$env_file" 2>/dev/null; then
        echo "${key}=${value}" >> "$env_file"
        added=$((added + 1))
      fi
    done < "$layer"
  done

  if [ "$added" -gt 0 ]; then
    log_info "Config-Layer-Merge: $added neue Variablen aus Konfigurationsebenen hinzugefügt"
  fi
}

###############################################################################
# Step 0 (--full only): Install OS-level packages
###############################################################################
if [ "$FULL_MODE" = true ]; then
  echo -e "\n${BLUE}${BOLD}[0/$TOTAL_STEPS]${NC} ${BOLD}OS-Pakete installieren (--full Modus)${NC}"

  if [ "$(id -u)" -ne 0 ] && ! sudo -n true 2>/dev/null; then
    log_error "--full benoetigt sudo-Zugriff ohne Passwort"
    exit 1
  fi

  # Core packages
  log_info "Installiere System-Pakete..."
  sudo apt-get update -qq >/dev/null 2>&1
  sudo apt-get install -y -qq \
    docker.io docker-compose-plugin \
    avahi-daemon avahi-utils libnss-mdns \
    jq openssl curl apache2-utils \
    >/dev/null 2>&1 && log_info "System-Pakete installiert" || log_warn "Einige Pakete fehlgeschlagen"

  # NVIDIA Container Runtime (if nvidia-ctk available)
  if command -v nvidia-ctk >/dev/null 2>&1; then
    sudo nvidia-ctk runtime configure --runtime=docker --set-as-default 2>/dev/null && \
      log_info "NVIDIA Container Runtime als Default konfiguriert" || \
      log_warn "NVIDIA Runtime-Konfiguration fehlgeschlagen"
    sudo systemctl restart docker 2>/dev/null || true
  else
    log_warn "nvidia-ctk nicht gefunden, NVIDIA Runtime uebersprungen"
  fi

  # Ensure current user is in docker group
  if ! groups | grep -q docker; then
    sudo usermod -aG docker "$(whoami)" 2>/dev/null && \
      log_info "User zur docker-Gruppe hinzugefuegt (Neulogin erforderlich)" || true
  fi
else
  echo -e "\n  ${YELLOW}→${NC} OS-Pakete uebersprungen (nutze --full fuer vollstaendige Provisionierung)"
fi

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
  NEEDS_UPDATE=false
  # Non-destructive merge: apply config layers without overwriting existing values
  merge_config_layers
else
  log_info "Erstelle neue .env mit sicheren Zufallswerten"
  NEEDS_UPDATE=true

  # Generate credentials
  ADMIN_PASSWORD=$(generate_password 16)
  JWT_SECRET=$(generate_secret 64)
  MINIO_ROOT_PASSWORD=$(generate_secret 24)
  # Preserve encryption key from previous install (re-generating breaks n8n credentials)
  _prev_n8n_key=""
  if [ -f "${PROJECT_ROOT}/config/secrets/n8n_encryption_key" ]; then
    _prev_n8n_key=$(cat "${PROJECT_ROOT}/config/secrets/n8n_encryption_key" 2>/dev/null)
  elif [ -f "$ENV_FILE" ]; then
    _prev_n8n_key=$(grep '^N8N_ENCRYPTION_KEY=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-)
  fi
  N8N_ENCRYPTION_KEY=${_prev_n8n_key:-$(generate_secret 32)}
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

# Project
COMPOSE_PROJECT_DIR=${PROJECT_ROOT}

# LLM
LLM_HOST=llm-service
LLM_PORT=11434
LLM_MODEL=gemma4:e4b-q4

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

  # Merge config layers into fresh .env
  merge_config_layers

  # Secure .env permissions (owner-only read/write)
  chmod 600 "$ENV_FILE"
  log_info ".env Berechtigungen gesetzt (600)"

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
# Step 6: Generate Traefik Basic Auth credentials
###############################################################################
log_step 6 "Traefik-Authentifizierung generieren"

# Helper: Generate bcrypt htpasswd hash (htpasswd → Python fallback)
generate_htpasswd_hash() {
  local username="$1"
  local password="$2"
  if command -v htpasswd >/dev/null 2>&1; then
    echo "$password" | htpasswd -niB "$username"
  elif command -v python3 >/dev/null 2>&1 && python3 -c "import bcrypt" 2>/dev/null; then
    python3 -c "
import bcrypt
h = bcrypt.hashpw(b'''${password}''', bcrypt.gensalt(rounds=10)).decode()
print(f'${username}:{h}')
"
  else
    return 1
  fi
}

MIDDLEWARES_FILE="${PROJECT_ROOT}/config/traefik/dynamic/middlewares.yml"
if [ -f "$MIDDLEWARES_FILE" ] && grep -q "PLACEHOLDER" "$MIDDLEWARES_FILE" 2>/dev/null; then
  # Use ADMIN_PASSWORD from .env if available (new install), else generate fresh
  if [ -z "${ADMIN_PASSWORD:-}" ] && [ -f "$ENV_FILE" ]; then
    ADMIN_PASSWORD=$(grep "^ADMIN_PASSWORD=" "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
  fi

  # Auto-generate password if none is set
  if [ -z "${ADMIN_PASSWORD:-}" ]; then
    ADMIN_PASSWORD=$(generate_password 20)
    log_info "Traefik Admin-Passwort automatisch generiert"
    # Save to .env for reference (idempotent: skip if already present)
    if [ -f "$ENV_FILE" ] && ! grep -q '^ADMIN_PASSWORD=' "$ENV_FILE" 2>/dev/null; then
      echo "ADMIN_PASSWORD=\"${ADMIN_PASSWORD}\"" >> "$ENV_FILE"
    fi
  fi

  TRAEFIK_HASH=$(generate_htpasswd_hash admin "$ADMIN_PASSWORD" 2>/dev/null) || true
  if [ -n "$TRAEFIK_HASH" ]; then
    # Escape $ for YAML (double $$)
    TRAEFIK_HASH_ESCAPED=$(echo "$TRAEFIK_HASH" | sed 's/\$/\$\$/g')
    # Replace both PLACEHOLDER lines
    sed -i "s|'admin:\$apr1\$PLACEHOLDER\$REPLACE_WITH_GENERATED_HASH'|'${TRAEFIK_HASH_ESCAPED}'|" "$MIDDLEWARES_FILE"
    sed -i "s|'admin:\$\$2y\$\$05\$\$PLACEHOLDER_REPLACE_WITH_GENERATED_HASH'|'${TRAEFIK_HASH_ESCAPED}'|" "$MIDDLEWARES_FILE"
    log_info "Traefik Basic Auth generiert (User: admin)"

    # Save credentials file for admin reference
    CREDS_FILE="${PROJECT_ROOT}/config/.traefik-credentials"
    echo "# Traefik Basic Auth Credentials (generated $(date -Iseconds))" > "$CREDS_FILE"
    echo "# Used for: Traefik Dashboard (/dashboard) and n8n (/n8n)" >> "$CREDS_FILE"
    echo "TRAEFIK_USER=admin" >> "$CREDS_FILE"
    echo "TRAEFIK_PASSWORD=${ADMIN_PASSWORD}" >> "$CREDS_FILE"
    chmod 600 "$CREDS_FILE"
    log_info "Zugangsdaten gespeichert: config/.traefik-credentials"
  else
    log_warn "Weder htpasswd noch python3+bcrypt verfuegbar"
    log_warn "Installiere: sudo apt-get install apache2-utils"
    log_warn "  oder: pip3 install bcrypt"
  fi
else
  if [ -f "$MIDDLEWARES_FILE" ]; then
    log_info "Traefik-Authentifizierung bereits konfiguriert"
  else
    log_warn "middlewares.yml nicht gefunden, ueberspringe Traefik-Auth"
  fi
fi

###############################################################################
# Step 7: Pull Docker images
###############################################################################
log_step 7 "Docker-Images vorbereiten"

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
# Step 8: Initialize database
###############################################################################
log_step 8 "Datenbank initialisieren"

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
# Step 9: Pre-load Ollama model
###############################################################################
log_step 9 "KI-Modell vorladen"

if [ "$SKIP_MODEL" = true ]; then
  log_skip "Modell-Download übersprungen (--skip-model)"
else
  # Load .env to get model name
  if [ -f "$ENV_FILE" ]; then
    LLM_MODEL=$(grep "^LLM_MODEL=" "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")
  fi
  LLM_MODEL=${LLM_MODEL:-"gemma4:e4b-q4"}

  if command -v docker >/dev/null 2>&1; then
    # Check if LLM service is running
    LLM_RUNNING=$(docker compose ps --status running llm-service 2>/dev/null | grep -c llm || true)

    if [ "$LLM_RUNNING" -eq 0 ]; then
      log_info "Starte LLM-Service..."
      cd "$PROJECT_ROOT"
      docker compose up -d llm-service 2>/dev/null || true

      # Wait for Ollama to be ready (adaptive timeout based on device)
      OLLAMA_TIMEOUT=${OLLAMA_STARTUP_TIMEOUT:-120}
      log_info "Warte auf Ollama (Timeout: ${OLLAMA_TIMEOUT}s)..."
      for i in $(seq 1 "$OLLAMA_TIMEOUT"); do
        if docker compose exec -T llm-service ollama list >/dev/null 2>&1; then
          break
        fi
        sleep 1
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
# Step 10: Install development tools
###############################################################################
log_step 10 "Entwicklungswerkzeuge installieren"

if [ "$SKIP_TOOLS" = true ]; then
  log_skip "Tool-Installation übersprungen (--skip-tools)"
else
  TOOLS_TO_INSTALL=()

  if ! command -v jq >/dev/null 2>&1; then
    TOOLS_TO_INSTALL+=("jq")
  else
    log_info "jq bereits installiert"
  fi

  if ! command -v rg >/dev/null 2>&1; then
    TOOLS_TO_INSTALL+=("ripgrep")
  else
    log_info "ripgrep bereits installiert"
  fi

  if ! command -v tmux >/dev/null 2>&1; then
    TOOLS_TO_INSTALL+=("tmux")
  else
    log_info "tmux bereits installiert"
  fi

  if [ ${#TOOLS_TO_INSTALL[@]} -gt 0 ]; then
    if sudo -n true 2>/dev/null; then
      log_info "Installiere: ${TOOLS_TO_INSTALL[*]}"
      sudo apt-get update -qq >/dev/null 2>&1
      sudo apt-get install -y -qq "${TOOLS_TO_INSTALL[@]}" >/dev/null 2>&1 && \
        log_info "Tools installiert" || \
        log_warn "Einige Tools konnten nicht installiert werden"
    else
      log_warn "Kein sudo-Zugriff ohne Passwort. Manuell installieren: sudo apt-get install ${TOOLS_TO_INSTALL[*]}"
    fi
  else
    log_info "Alle Entwicklungstools bereits vorhanden"
  fi

  # Copy tmux config if not present
  TMUX_SRC="${PROJECT_ROOT}/config/dev/tmux.conf"
  if [ -f "$TMUX_SRC" ] && [ ! -f "$HOME/.tmux.conf" ]; then
    cp "$TMUX_SRC" "$HOME/.tmux.conf"
    log_info "tmux-Konfiguration installiert (~/.tmux.conf)"
  elif [ -f "$HOME/.tmux.conf" ]; then
    log_info "tmux-Konfiguration existiert bereits"
  fi
fi

###############################################################################
# Step 11: Git configuration
###############################################################################
log_step 11 "Git-Konfiguration einrichten"

if [ "$SKIP_GIT" = true ]; then
  log_skip "Git-Konfiguration übersprungen (--skip-git)"
else
  # Configure user.name
  CURRENT_GIT_NAME=$(git config --global user.name 2>/dev/null || echo "")
  if [ -z "$CURRENT_GIT_NAME" ]; then
    if [ -n "${GIT_USER_NAME:-}" ]; then
      git config --global user.name "$GIT_USER_NAME"
      log_info "Git user.name gesetzt: $GIT_USER_NAME"
    elif [ -t 0 ]; then
      read -rp "  Git user.name: " GIT_USER_NAME
      if [ -n "$GIT_USER_NAME" ]; then
        git config --global user.name "$GIT_USER_NAME"
        log_info "Git user.name gesetzt: $GIT_USER_NAME"
      else
        log_warn "Git user.name nicht gesetzt (leer)"
      fi
    else
      log_warn "Git user.name nicht konfiguriert (setze GIT_USER_NAME Env-Variable)"
    fi
  else
    log_info "Git user.name bereits gesetzt: $CURRENT_GIT_NAME"
  fi

  # Configure user.email
  CURRENT_GIT_EMAIL=$(git config --global user.email 2>/dev/null || echo "")
  if [ -z "$CURRENT_GIT_EMAIL" ]; then
    if [ -n "${GIT_USER_EMAIL:-}" ]; then
      git config --global user.email "$GIT_USER_EMAIL"
      log_info "Git user.email gesetzt: $GIT_USER_EMAIL"
    elif [ -t 0 ]; then
      read -rp "  Git user.email: " GIT_USER_EMAIL
      if [ -n "$GIT_USER_EMAIL" ]; then
        git config --global user.email "$GIT_USER_EMAIL"
        log_info "Git user.email gesetzt: $GIT_USER_EMAIL"
      else
        log_warn "Git user.email nicht gesetzt (leer)"
      fi
    else
      log_warn "Git user.email nicht konfiguriert (setze GIT_USER_EMAIL Env-Variable)"
    fi
  else
    log_info "Git user.email bereits gesetzt: $CURRENT_GIT_EMAIL"
  fi

  # SSH key for GitHub
  SSH_KEY_FILE="$HOME/.ssh/id_ed25519"
  if [ -f "$SSH_KEY_FILE" ]; then
    log_info "SSH-Schlüssel existiert: $SSH_KEY_FILE"
  else
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    ssh-keygen -t ed25519 -f "$SSH_KEY_FILE" -N "" -C "arasul@$(hostname)" >/dev/null 2>&1
    chmod 600 "$SSH_KEY_FILE"
    chmod 644 "${SSH_KEY_FILE}.pub"
    log_info "SSH-Schlüssel generiert: $SSH_KEY_FILE"
  fi

  # Add GitHub to known_hosts
  KNOWN_HOSTS="$HOME/.ssh/known_hosts"
  if [ ! -f "$KNOWN_HOSTS" ] || ! grep -q "github.com" "$KNOWN_HOSTS" 2>/dev/null; then
    ssh-keyscan -t ed25519 github.com >> "$KNOWN_HOSTS" 2>/dev/null && \
      log_info "github.com zu known_hosts hinzugefügt" || \
      log_warn "github.com konnte nicht zu known_hosts hinzugefügt werden"
  else
    log_info "github.com bereits in known_hosts"
  fi

  # Show public key
  if [ -f "${SSH_KEY_FILE}.pub" ]; then
    echo ""
    echo -e "  ${BOLD}Öffentlicher SSH-Schlüssel:${NC}"
    echo -e "  $(cat "${SSH_KEY_FILE}.pub")"
    echo -e "  ${YELLOW}→ Fügen Sie diesen Schlüssel unter https://github.com/settings/keys hinzu${NC}"
    echo ""
  fi
fi

###############################################################################
# Step 12: mDNS (arasul.local) configuration
###############################################################################
log_step 12 "mDNS (arasul.local) konfigurieren"

if [ "$SKIP_MDNS" = true ]; then
  log_skip "mDNS-Setup übersprungen (--skip-mdns)"
else
  # Check if arasul.local already resolves
  if avahi-resolve -n arasul.local >/dev/null 2>&1; then
    log_info "arasul.local ist bereits auflösbar"
  elif [ -x "${SCRIPT_DIR}/setup_mdns.sh" ]; then
    if sudo -n true 2>/dev/null; then
      log_info "Konfiguriere mDNS über setup_mdns.sh..."
      sudo "${SCRIPT_DIR}/setup_mdns.sh" 2>/dev/null && \
        log_info "mDNS konfiguriert" || \
        log_warn "mDNS-Konfiguration fehlgeschlagen"
    else
      log_warn "mDNS benötigt sudo. Manuell ausführen: sudo ${SCRIPT_DIR}/setup_mdns.sh"
    fi
  else
    log_warn "setup_mdns.sh nicht gefunden, mDNS-Setup übersprungen"
  fi
fi

###############################################################################
# Step 13: Device identity and configuration layers
###############################################################################
log_step 13 "Geräte-ID und Konfigurationsebenen"

# Create config layer directories
mkdir -p "${PROJECT_ROOT}/config/base"
mkdir -p "${PROJECT_ROOT}/config/profiles"
mkdir -p "${PROJECT_ROOT}/config/device"

# Generate device ID (deterministic, never overwritten)
DEVICE_ID_FILE="${PROJECT_ROOT}/config/device/device-id"
if [ -f "$DEVICE_ID_FILE" ]; then
  log_info "Geräte-ID existiert bereits: $(cat "$DEVICE_ID_FILE")"
else
  if [ -f /etc/machine-id ]; then
    # Deterministic UUID from machine-id
    DEVICE_UUID=$(cat /etc/machine-id | sha256sum | cut -c1-32)
    DEVICE_UUID="${DEVICE_UUID:0:8}-${DEVICE_UUID:8:4}-${DEVICE_UUID:12:4}-${DEVICE_UUID:16:4}-${DEVICE_UUID:20:12}"
  else
    DEVICE_UUID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || openssl rand -hex 16 | sed 's/\(.\{8\}\)\(.\{4\}\)\(.\{4\}\)\(.\{4\}\)\(.\{12\}\)/\1-\2-\3-\4-\5/')
  fi
  echo "$DEVICE_UUID" > "$DEVICE_ID_FILE"
  log_info "Geräte-ID generiert: $DEVICE_UUID"
fi

# Create device.env
DEVICE_ENV="${PROJECT_ROOT}/config/device/device.env"
if [ ! -f "$DEVICE_ENV" ]; then
  cat > "$DEVICE_ENV" << EOF
# Arasul Device Configuration
# Generated: $(date -Iseconds)
DEVICE_ID=$(cat "$DEVICE_ID_FILE")
DEVICE_HOSTNAME=$(hostname)
DEVICE_REGISTERED_AT=$(date -Iseconds)
EOF
  log_info "device.env erstellt"
else
  log_info "device.env existiert bereits"
fi

# Create base.env template
BASE_ENV="${PROJECT_ROOT}/config/base/base.env"
if [ ! -f "$BASE_ENV" ]; then
  cat > "$BASE_ENV" << 'EOF'
# Arasul Base Configuration
# Shared defaults for all devices and profiles
LOG_LEVEL=INFO
NODE_ENV=production
BACKUP_RETENTION_DAYS=30
HEALTH_CHECK_INTERVAL=60
EOF
  log_info "base.env Template erstellt"
else
  log_info "base.env existiert bereits"
fi

# Copy .env.jetson as profile if it exists
JETSON_ENV="${PROJECT_ROOT}/.env.jetson"
PROFILE_ENV="${PROJECT_ROOT}/config/profiles/jetson.env"
if [ -f "$JETSON_ENV" ] && [ ! -f "$PROFILE_ENV" ]; then
  cp "$JETSON_ENV" "$PROFILE_ENV"
  log_info "Jetson-Profil erstellt: config/profiles/jetson.env"
elif [ -f "$PROFILE_ENV" ]; then
  log_info "Jetson-Profil existiert bereits"
else
  log_info "Kein .env.jetson vorhanden, Profil übersprungen"
fi

###############################################################################
# Step 14: Shell aliases
###############################################################################
log_step 14 "Shell-Aliase konfigurieren"

if [ "$SKIP_DEVENV" = true ]; then
  log_skip "Shell-Aliase übersprungen (--skip-devenv)"
else
  BASH_ALIASES="$HOME/.bash_aliases"
  ALIASES_SRC="${PROJECT_ROOT}/config/dev/bash_aliases"

  if [ -f "$BASH_ALIASES" ] && grep -q "# === ARASUL ALIASES ===" "$BASH_ALIASES" 2>/dev/null; then
    log_info "Arasul-Aliase bereits in ~/.bash_aliases konfiguriert"
  elif [ -f "$ALIASES_SRC" ]; then
    if [ -f "$BASH_ALIASES" ]; then
      # Append to existing file
      echo "" >> "$BASH_ALIASES"
      cat "$ALIASES_SRC" >> "$BASH_ALIASES"
      log_info "Arasul-Aliase an ~/.bash_aliases angefügt"
    else
      cp "$ALIASES_SRC" "$BASH_ALIASES"
      log_info "~/.bash_aliases erstellt mit Arasul-Aliasen"
    fi
  else
    log_warn "Alias-Template nicht gefunden: $ALIASES_SRC"
  fi
fi

###############################################################################
# Step 15: systemd service for auto-start after reboot
###############################################################################
log_step 15 "Autostart-Service einrichten"

SYSTEMD_SERVICE="/etc/systemd/system/arasul.service"
if [ -f "$SYSTEMD_SERVICE" ]; then
  log_info "systemd-Service existiert bereits"
else
  if sudo -n true 2>/dev/null; then
    CURRENT_USER=$(whoami)
    sudo tee "$SYSTEMD_SERVICE" > /dev/null << EOF
[Unit]
Description=Arasul Platform
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${PROJECT_ROOT}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=${CURRENT_USER}

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable arasul.service >/dev/null 2>&1
    log_info "systemd-Service erstellt und aktiviert (Autostart nach Reboot)"
  else
    log_warn "Kein sudo-Zugriff. Manuell einrichten: sudo systemctl enable arasul"
  fi
fi

###############################################################################
# Step 16: System hardening for long-term autonomous operation
###############################################################################
log_step 16 "System-Haertung fuer Langzeitbetrieb"

if sudo -n true 2>/dev/null; then

  # --- 16a: Kernel sysctl tuning ---
  SYSCTL_CONF="/etc/sysctl.d/99-arasul.conf"
  if [ ! -f "$SYSCTL_CONF" ]; then
    sudo tee "$SYSCTL_CONF" > /dev/null << 'SYSCTL_EOF'
# Arasul Platform - Kernel tuning for 3-5 year autonomous operation

# Auto-reboot after kernel panic (10 seconds)
kernel.panic = 10
kernel.panic_on_oops = 1

# Filesystem: reduce disk writes for NVMe/eMMC longevity
vm.dirty_ratio = 10
vm.dirty_background_ratio = 5

# Docker needs more inotify watches
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 512

# Network tuning for Docker
net.core.somaxconn = 1024
net.ipv4.ip_local_port_range = 1024 65535

# Prevent OOM from silently killing services
vm.panic_on_oom = 0
vm.overcommit_memory = 0
SYSCTL_EOF
    sudo sysctl -p "$SYSCTL_CONF" >/dev/null 2>&1
    log_info "Kernel-Parameter optimiert ($SYSCTL_CONF)"
  else
    log_info "Kernel-Parameter bereits konfiguriert"
  fi

  # --- 16b: Hardware watchdog (Tegra WDT on Jetson) ---
  WATCHDOG_CONF="/etc/systemd/system.conf.d/watchdog.conf"
  if [ ! -f "$WATCHDOG_CONF" ]; then
    sudo mkdir -p /etc/systemd/system.conf.d
    sudo tee "$WATCHDOG_CONF" > /dev/null << 'WDT_EOF'
[Manager]
RuntimeWatchdogSec=30
ShutdownWatchdogSec=10min
WDT_EOF
    log_info "Hardware-Watchdog aktiviert (30s Timeout)"
  else
    log_info "Hardware-Watchdog bereits konfiguriert"
  fi

  # --- 16c: Boot loop guard service ---
  BOOT_GUARD_SERVICE="/etc/systemd/system/arasul-boot-guard.service"
  BOOT_GUARD_SCRIPT="${PROJECT_ROOT}/scripts/system/boot-guard.sh"
  if [ ! -f "$BOOT_GUARD_SERVICE" ] && [ -f "$BOOT_GUARD_SCRIPT" ]; then
    sudo tee "$BOOT_GUARD_SERVICE" > /dev/null << EOF
[Unit]
Description=Arasul Boot Loop Guard
Before=arasul.service
After=network.target

[Service]
Type=oneshot
ExecStart=${BOOT_GUARD_SCRIPT}
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable arasul-boot-guard.service >/dev/null 2>&1
    log_info "Boot-Loop-Guard installiert (max 5 Reboots/Stunde)"
  else
    log_info "Boot-Loop-Guard bereits installiert"
  fi

  # --- 16d: Docker daemon hardening ---
  DOCKER_DAEMON="/etc/docker/daemon.json"
  if [ ! -f "$DOCKER_DAEMON" ] || ! grep -q "max-size" "$DOCKER_DAEMON" 2>/dev/null; then
    # Only write if file doesn't exist or is missing log rotation
    if [ ! -f "$DOCKER_DAEMON" ]; then
      sudo tee "$DOCKER_DAEMON" > /dev/null << 'DOCKER_EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  },
  "storage-driver": "overlay2",
  "live-restore": true
}
DOCKER_EOF
      sudo systemctl reload docker 2>/dev/null || true
      log_info "Docker-Daemon Log-Rotation konfiguriert"
    else
      log_info "Docker-Daemon bereits konfiguriert"
    fi
  else
    log_info "Docker-Daemon Log-Rotation bereits aktiv"
  fi

  # --- 16e: NTP (chrony) for offline resilience ---
  if ! command -v chronyd >/dev/null 2>&1; then
    sudo apt-get install -y -qq chrony >/dev/null 2>&1 && \
      log_info "chrony installiert fuer Zeitsynchronisation" || \
      log_warn "chrony konnte nicht installiert werden"
  fi
  CHRONY_ARASUL="/etc/chrony/conf.d/arasul.conf"
  if command -v chronyd >/dev/null 2>&1 && [ ! -f "$CHRONY_ARASUL" ]; then
    sudo mkdir -p /etc/chrony/conf.d
    sudo tee "$CHRONY_ARASUL" > /dev/null << 'CHRONY_EOF'
# Arasul: Allow large time jumps after offline periods
makestep 1 -1
# Use RTC as fallback when no NTP servers reachable
rtcsync
CHRONY_EOF
    sudo systemctl restart chrony 2>/dev/null || true
    log_info "chrony konfiguriert (Offline-resistent)"
  elif command -v chronyd >/dev/null 2>&1; then
    log_info "chrony bereits konfiguriert"
  fi

  # --- 16f: Filesystem mount optimization ---
  # Add noatime to root partition if not already set
  if ! grep -q "noatime" /etc/fstab 2>/dev/null; then
    log_warn "Empfehlung: 'noatime' zu /etc/fstab hinzufuegen fuer NVMe-Langlebigkeit"
    log_warn "  Manuell: sudo sed -i 's/defaults/defaults,noatime/' /etc/fstab"
  else
    log_info "Filesystem bereits mit noatime konfiguriert"
  fi

else
  log_warn "Kein sudo-Zugriff. System-Haertung uebersprungen."
  log_warn "Manuell ausfuehren mit sudo: $0"
fi

TOTAL_STEPS=16

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
echo -e "    4. ${BOLD}./scripts/validate/verify-dev-env.sh${NC}  - Umgebung verifizieren"
echo ""

if [ "$NEEDS_UPDATE" = true ] 2>/dev/null; then
  echo -e "  ${YELLOW}${BOLD}Wichtig: Admin-Passwort oben notieren!${NC}"
  echo ""
fi
