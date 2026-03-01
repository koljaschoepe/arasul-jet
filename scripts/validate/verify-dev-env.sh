#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Development Environment Verification
# Verifies that the local dev environment is correctly set up.
# Run this after preconfigure.sh to confirm readiness.
#
# Usage:
#   ./scripts/verify-dev-env.sh [--tap] [--verbose] [--help]
#
# Exit codes:
#   0 - All checks passed
#   1 - Errors found
#   2 - Only warnings found
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
WARNINGS=0
PASSED=0
TEST_NUM=0

# CLI flags
TAP_MODE=false
VERBOSE=false

for arg in "$@"; do
  case "$arg" in
    --tap)     TAP_MODE=true ;;
    --verbose) VERBOSE=true ;;
    --help|-h)
      echo "Usage: $0 [--tap] [--verbose]"
      echo "  --tap      Output in TAP (Test Anything Protocol) format"
      echo "  --verbose  Show detailed output"
      exit 0
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

###############################################################################
# HELPER FUNCTIONS
###############################################################################

check_pass() {
  TEST_NUM=$((TEST_NUM + 1))
  PASSED=$((PASSED + 1))
  if $TAP_MODE; then
    echo "ok $TEST_NUM - $1"
  else
    echo -e "  ${GREEN}✓${NC} $1"
  fi
}

check_fail() {
  TEST_NUM=$((TEST_NUM + 1))
  ERRORS=$((ERRORS + 1))
  if $TAP_MODE; then
    echo "not ok $TEST_NUM - $1"
  else
    echo -e "  ${RED}✗${NC} $1"
  fi
}

check_warn() {
  TEST_NUM=$((TEST_NUM + 1))
  WARNINGS=$((WARNINGS + 1))
  if $TAP_MODE; then
    echo "ok $TEST_NUM - $1 # TODO warning"
  else
    echo -e "  ${YELLOW}!${NC} $1"
  fi
}

section() {
  if ! $TAP_MODE; then
    echo ""
    echo -e "${BOLD}[$1]${NC}"
  else
    echo "# $1"
  fi
}

verbose() {
  if $VERBOSE && ! $TAP_MODE; then
    echo -e "    ${BLUE}→${NC} $1"
  fi
}

# Version comparison: returns 0 if $1 >= $2
version_gte() {
  [ "$(printf '%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

###############################################################################
# 1. SYSTEM TOOLS
###############################################################################

section "System-Tools"

for tool in jq curl git; do
  if command -v "$tool" >/dev/null 2>&1; then
    check_pass "$tool installiert"
    $VERBOSE && verbose "$(command -v "$tool")"
  else
    check_fail "$tool nicht installiert"
  fi
done

if command -v rg >/dev/null 2>&1; then
  check_pass "ripgrep installiert"
else
  check_fail "ripgrep nicht installiert (apt install ripgrep)"
fi

if command -v tmux >/dev/null 2>&1; then
  check_pass "tmux installiert"
else
  check_fail "tmux nicht installiert (apt install tmux)"
fi

###############################################################################
# 2. RUNTIME VERSIONS
###############################################################################

section "Runtime-Versionen"

# Node.js
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v 2>/dev/null | sed 's/^v//')
  if version_gte "$NODE_VER" "18.0.0"; then
    check_pass "Node.js $NODE_VER (>= 18)"
  else
    check_fail "Node.js $NODE_VER (< 18 erforderlich)"
  fi
else
  check_fail "Node.js nicht installiert"
fi

# npm
if command -v npm >/dev/null 2>&1; then
  NPM_VER=$(npm -v 2>/dev/null)
  if version_gte "$NPM_VER" "9.0.0"; then
    check_pass "npm $NPM_VER (>= 9)"
  else
    check_fail "npm $NPM_VER (< 9 erforderlich)"
  fi
else
  check_fail "npm nicht installiert"
fi

# Docker
if command -v docker >/dev/null 2>&1; then
  DOCKER_VER=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "0")
  if version_gte "$DOCKER_VER" "24.0.0"; then
    check_pass "Docker $DOCKER_VER (>= 24)"
  else
    check_fail "Docker $DOCKER_VER (< 24 erforderlich)"
  fi
else
  check_fail "Docker nicht installiert"
fi

# Docker Compose V2
if docker compose version >/dev/null 2>&1; then
  COMPOSE_VER=$(docker compose version --short 2>/dev/null || echo "0")
  check_pass "Docker Compose $COMPOSE_VER (V2)"
else
  check_fail "Docker Compose V2 nicht verfügbar"
fi

# Git
if command -v git >/dev/null 2>&1; then
  GIT_VER=$(git --version 2>/dev/null | awk '{print $3}')
  if version_gte "$GIT_VER" "2.30.0"; then
    check_pass "Git $GIT_VER (>= 2.30)"
  else
    check_fail "Git $GIT_VER (< 2.30 erforderlich)"
  fi
fi

###############################################################################
# 3. GIT CONFIGURATION
###############################################################################

section "Git-Konfiguration"

GIT_NAME=$(git config --global user.name 2>/dev/null || echo "")
if [ -n "$GIT_NAME" ]; then
  check_pass "git user.name gesetzt: $GIT_NAME"
else
  check_fail "git user.name nicht konfiguriert"
fi

GIT_EMAIL=$(git config --global user.email 2>/dev/null || echo "")
if [ -n "$GIT_EMAIL" ]; then
  check_pass "git user.email gesetzt: $GIT_EMAIL"
else
  check_fail "git user.email nicht konfiguriert"
fi

if [ -f "$HOME/.ssh/id_ed25519" ]; then
  check_pass "SSH-Schlüssel vorhanden (~/.ssh/id_ed25519)"
else
  check_fail "SSH-Schlüssel fehlt (~/.ssh/id_ed25519)"
fi

# GitHub SSH connectivity (warn-only, might not have access)
if ssh -T git@github.com 2>&1 | grep -qi "successfully authenticated\|Hi "; then
  check_pass "GitHub SSH-Verbindung funktioniert"
else
  check_warn "GitHub SSH-Verbindung fehlgeschlagen (Key bei GitHub hinterlegt?)"
fi

###############################################################################
# 4. DOCKER ENVIRONMENT
###############################################################################

section "Docker-Umgebung"

# Daemon running
if docker info &>/dev/null; then
  check_pass "Docker-Daemon läuft"
else
  check_fail "Docker-Daemon nicht erreichbar"
fi

# User in docker group
if groups 2>/dev/null | grep -qw docker; then
  check_pass "Benutzer in docker-Gruppe"
else
  check_warn "Benutzer nicht in docker-Gruppe"
fi

# NVIDIA Runtime
if docker info 2>/dev/null | grep -qi "nvidia"; then
  check_pass "NVIDIA Container Runtime verfügbar"
else
  check_warn "NVIDIA Container Runtime nicht erkannt"
fi

# Compose config valid
if docker compose config --quiet 2>/dev/null; then
  check_pass "docker-compose.yml valide"
else
  check_fail "docker-compose.yml hat Fehler"
fi

###############################################################################
# 5. SERVICES HEALTH
###############################################################################

section "Services-Health"

TOTAL_SERVICES=0
HEALTHY_SERVICES=0
UNHEALTHY_LIST=""

while IFS= read -r line; do
  [ -z "$line" ] && continue
  name=$(echo "$line" | awk '{print $1}')
  state=$(echo "$line" | awk '{print $2}')
  health=$(echo "$line" | awk '{print $3}')
  TOTAL_SERVICES=$((TOTAL_SERVICES + 1))

  if [ "$state" = "running" ]; then
    if [ -z "$health" ] || [ "$health" = "(healthy)" ]; then
      HEALTHY_SERVICES=$((HEALTHY_SERVICES + 1))
    else
      UNHEALTHY_LIST="${UNHEALTHY_LIST}${name} "
    fi
  else
    UNHEALTHY_LIST="${UNHEALTHY_LIST}${name} "
  fi
done < <(docker compose ps --format "{{.Name}} {{.State}} {{.Health}}" 2>/dev/null || echo "")

if [ "$TOTAL_SERVICES" -gt 0 ] && [ "$HEALTHY_SERVICES" -eq "$TOTAL_SERVICES" ]; then
  check_pass "Alle $TOTAL_SERVICES Services running/healthy"
elif [ "$TOTAL_SERVICES" -gt 0 ]; then
  check_fail "$HEALTHY_SERVICES/$TOTAL_SERVICES Services healthy (Problem: ${UNHEALTHY_LIST})"
else
  check_fail "Keine Docker-Services gefunden"
fi

###############################################################################
# 6. PORT ACCESSIBILITY
###############################################################################

section "Port-Erreichbarkeit"

check_port() {
  local port=$1
  local label=$2
  if curl -sf --max-time 3 "http://localhost:${port}/" >/dev/null 2>&1 || \
     curl -sf --max-time 3 -o /dev/null -w '%{http_code}' "http://localhost:${port}/" 2>/dev/null | grep -qE "^[2345]"; then
    check_pass "Port $port ($label) erreichbar"
  elif nc -z localhost "$port" 2>/dev/null; then
    check_pass "Port $port ($label) offen"
  else
    check_warn "Port $port ($label) nicht erreichbar"
  fi
}

check_port 80 "Traefik HTTP"
check_port 3001 "Backend API"
check_port 5432 "PostgreSQL"
check_port 11434 "Ollama LLM"

###############################################################################
# 7. mDNS / NETWORK
###############################################################################

section "mDNS/Netzwerk"

# Avahi service
if systemctl is-active --quiet avahi-daemon 2>/dev/null; then
  check_pass "Avahi-Daemon aktiv"
else
  check_warn "Avahi-Daemon nicht aktiv"
fi

# arasul.local resolution
if avahi-resolve -n arasul.local >/dev/null 2>&1; then
  check_pass "arasul.local auflösbar"
elif getent hosts arasul.local >/dev/null 2>&1; then
  check_pass "arasul.local auflösbar (via hosts)"
else
  check_warn "arasul.local nicht auflösbar"
fi

# Hostname
CURRENT_HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
if [ "$CURRENT_HOSTNAME" = "arasul" ]; then
  check_pass "Hostname ist 'arasul'"
else
  check_warn "Hostname ist '$CURRENT_HOSTNAME' (erwartet: 'arasul')"
fi

###############################################################################
# 8. DEVICE IDENTITY
###############################################################################

section "Device-Identity"

DEVICE_ID_FILE="${PROJECT_ROOT}/config/device/device-id"
if [ -f "$DEVICE_ID_FILE" ]; then
  check_pass "Device-ID vorhanden: $(cat "$DEVICE_ID_FILE")"
else
  check_fail "Device-ID fehlt (config/device/device-id)"
fi

# Config layering directories
for dir in config/base config/profiles config/device; do
  if [ -d "${PROJECT_ROOT}/$dir" ]; then
    check_pass "Verzeichnis $dir existiert"
  else
    check_fail "Verzeichnis $dir fehlt"
  fi
done

# .env file
if [ -f "${PROJECT_ROOT}/.env" ]; then
  check_pass ".env Datei vorhanden"
else
  check_fail ".env Datei fehlt"
fi

###############################################################################
# 9. DEV ENVIRONMENT
###############################################################################

section "Dev-Environment"

if [ -f "$HOME/.tmux.conf" ]; then
  check_pass "tmux-Konfiguration vorhanden (~/.tmux.conf)"
else
  check_warn "tmux-Konfiguration fehlt (~/.tmux.conf)"
fi

BASH_ALIASES="$HOME/.bash_aliases"
if [ -f "$BASH_ALIASES" ] && grep -q "# === ARASUL ALIASES ===" "$BASH_ALIASES" 2>/dev/null; then
  check_pass "Arasul-Aliase konfiguriert (~/.bash_aliases)"
else
  check_warn "Arasul-Aliase nicht konfiguriert"
fi

# Git repo status
if git -C "$PROJECT_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")
  check_pass "Git-Repository OK (Branch: $BRANCH)"
else
  check_fail "Kein Git-Repository in $PROJECT_ROOT"
fi

###############################################################################
# RESULTS
###############################################################################

if $TAP_MODE; then
  echo "1..$TEST_NUM"
  echo "# Passed: $PASSED  Failed: $ERRORS  Warnings: $WARNINGS"
else
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  Passed: ${GREEN}${PASSED}${NC}  Failed: ${RED}${ERRORS}${NC}  Warnings: ${YELLOW}${WARNINGS}${NC}"

  if [ "$ERRORS" -gt 0 ]; then
    echo -e "  ${RED}${BOLD}ENTWICKLUNGSUMGEBUNG NICHT BEREIT${NC}"
  elif [ "$WARNINGS" -gt 0 ]; then
    echo -e "  ${YELLOW}${BOLD}ENTWICKLUNGSUMGEBUNG BEREIT (mit Warnungen)${NC}"
  else
    echo -e "  ${GREEN}${BOLD}ENTWICKLUNGSUMGEBUNG BEREIT${NC}"
  fi

  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi

if [ "$ERRORS" -gt 0 ]; then
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  exit 2
else
  exit 0
fi
