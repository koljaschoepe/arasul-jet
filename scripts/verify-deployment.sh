#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Deployment Verification
# Automated pre-shipping checklist verification.
# Run this before shipping a Jetson to a customer.
#
# Usage:
#   ./scripts/verify-deployment.sh [--fix] [--verbose]
#
# Exit codes:
#   0 - All checks passed (ready to ship)
#   1 - Critical issues found (do NOT ship)
#   2 - Warnings found (review before shipping)
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

# CLI flags
FIX_MODE=false
VERBOSE=false

for arg in "$@"; do
  case "$arg" in
    --fix)     FIX_MODE=true ;;
    --verbose) VERBOSE=true ;;
    --help|-h)
      echo "Usage: $0 [--fix] [--verbose]"
      echo "  --fix      Attempt to auto-fix issues where possible"
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
  echo -e "  ${GREEN}✓${NC} $1"
  PASSED=$((PASSED + 1))
}

check_fail() {
  echo -e "  ${RED}✗${NC} $1"
  ERRORS=$((ERRORS + 1))
}

check_warn() {
  echo -e "  ${YELLOW}!${NC} $1"
  WARNINGS=$((WARNINGS + 1))
}

section() {
  echo ""
  echo -e "${BOLD}[$1]${NC}"
}

###############################################################################
# 1. CONFIGURATION
###############################################################################

section "1. Configuration"

# .env file exists
if [ -f ".env" ]; then
  check_pass ".env file exists"
else
  check_fail ".env file missing - run scripts/preconfigure.sh"
fi

# .env permissions
if [ -f ".env" ]; then
  PERMS=$(stat -c "%a" .env 2>/dev/null || echo "unknown")
  if [ "$PERMS" = "600" ]; then
    check_pass ".env permissions correct (600)"
  else
    check_warn ".env permissions are $PERMS (should be 600)"
    if $FIX_MODE; then
      chmod 600 .env
      echo -e "    ${BLUE}Fixed: chmod 600 .env${NC}"
    fi
  fi
fi

# No default/placeholder credentials
if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  source .env 2>/dev/null || true

  # Check admin password
  if [ -n "${ADMIN_PASSWORD:-}" ]; then
    if [ ${#ADMIN_PASSWORD} -ge 12 ]; then
      check_pass "Admin password length OK (${#ADMIN_PASSWORD} chars)"
    else
      check_fail "Admin password too short (${#ADMIN_PASSWORD} chars, minimum 12)"
    fi
    if echo "$ADMIN_PASSWORD" | grep -qE "^(admin|password|123|test|default)" 2>/dev/null; then
      check_fail "Admin password appears to be a default value"
    else
      check_pass "Admin password is not a default value"
    fi
  else
    check_fail "ADMIN_PASSWORD not set in .env"
  fi

  # Check JWT secret
  if [ -n "${JWT_SECRET:-}" ] && [ ${#JWT_SECRET} -ge 32 ]; then
    check_pass "JWT_SECRET set and sufficient length"
  else
    check_fail "JWT_SECRET missing or too short"
  fi

  # Check PostgreSQL password
  if [ -n "${POSTGRES_PASSWORD:-}" ] && [ ${#POSTGRES_PASSWORD} -ge 12 ]; then
    check_pass "POSTGRES_PASSWORD set and sufficient length"
  else
    check_fail "POSTGRES_PASSWORD missing or too short"
  fi

  # Check MinIO password
  if [ -n "${MINIO_ROOT_PASSWORD:-}" ] && [ ${#MINIO_ROOT_PASSWORD} -ge 12 ]; then
    check_pass "MINIO_ROOT_PASSWORD set and sufficient length"
  else
    check_fail "MINIO_ROOT_PASSWORD missing or too short"
  fi

  # Check for PLACEHOLDER values
  if grep -q "PLACEHOLDER\|CHANGEME\|TODO\|FIXME" .env 2>/dev/null; then
    check_fail "Placeholder values found in .env"
  else
    check_pass "No placeholder values in .env"
  fi
fi

###############################################################################
# 2. DOCKER SERVICES
###############################################################################

section "2. Docker Services"

# Docker running
if docker info &>/dev/null; then
  check_pass "Docker daemon running"
else
  check_fail "Docker daemon not running"
fi

# All services running and healthy
TOTAL_SERVICES=0
HEALTHY_SERVICES=0
UNHEALTHY_LIST=""

while IFS= read -r line; do
  name=$(echo "$line" | awk '{print $1}')
  state=$(echo "$line" | awk '{print $2}')
  health=$(echo "$line" | awk '{print $3}')
  TOTAL_SERVICES=$((TOTAL_SERVICES + 1))

  if [ "$state" = "running" ]; then
    if [ -z "$health" ] || [ "$health" = "(healthy)" ]; then
      HEALTHY_SERVICES=$((HEALTHY_SERVICES + 1))
    else
      UNHEALTHY_LIST="${UNHEALTHY_LIST}    ${name}: ${state} ${health}\n"
    fi
  else
    UNHEALTHY_LIST="${UNHEALTHY_LIST}    ${name}: ${state}\n"
  fi
done < <(docker compose ps --format "{{.Name}} {{.State}} {{.Health}}" 2>/dev/null || echo "")

if [ "$TOTAL_SERVICES" -gt 0 ] && [ "$HEALTHY_SERVICES" -eq "$TOTAL_SERVICES" ]; then
  check_pass "All $TOTAL_SERVICES services running and healthy"
elif [ "$TOTAL_SERVICES" -gt 0 ]; then
  check_fail "$HEALTHY_SERVICES/$TOTAL_SERVICES services healthy"
  if [ -n "$UNHEALTHY_LIST" ]; then
    echo -e "$UNHEALTHY_LIST"
  fi
else
  check_fail "No Docker services found"
fi

###############################################################################
# 3. SECURITY
###############################################################################

section "3. Security"

# SSH key-only auth
if [ -f "/etc/ssh/sshd_config.d/99-arasul-hardening.conf" ]; then
  check_pass "SSH hardening config present"
elif sshd -T 2>/dev/null | grep -q "passwordauthentication no"; then
  check_pass "SSH password auth disabled"
else
  check_warn "SSH hardening not applied - run scripts/harden-ssh.sh"
fi

# SSH keys exist
if [ -d "config/ssh-keys" ] && ls config/ssh-keys/*.pub &>/dev/null; then
  check_pass "SSH keys present in config/ssh-keys/"
else
  check_warn "No SSH keys found in config/ssh-keys/"
fi

# Firewall
if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  check_pass "Firewall (UFW) active"
else
  check_warn "Firewall not active - run scripts/setup-firewall.sh"
fi

# TLS certificate
if [ -f "config/tls/cert.pem" ] && [ -f "config/tls/key.pem" ]; then
  check_pass "TLS certificate present"
  # Check expiry
  EXPIRY=$(openssl x509 -enddate -noout -in config/tls/cert.pem 2>/dev/null | cut -d= -f2)
  if [ -n "$EXPIRY" ]; then
    EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null || echo "0")
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
    if [ "$DAYS_LEFT" -gt 30 ]; then
      check_pass "TLS certificate valid for $DAYS_LEFT days"
    else
      check_warn "TLS certificate expires in $DAYS_LEFT days"
    fi
  fi
else
  check_warn "TLS certificate not found"
fi

# Docker socket protection
SOCKET_SERVICES=$(docker compose config 2>/dev/null | grep -c "docker.sock" || echo "0")
if [ "$SOCKET_SERVICES" -le 3 ]; then
  check_pass "Docker socket access limited ($SOCKET_SERVICES services)"
else
  check_warn "Docker socket exposed to $SOCKET_SERVICES services"
fi

###############################################################################
# 4. DATA & BACKUPS
###############################################################################

section "4. Data & Backups"

# Required directories
REQUIRED_DIRS=("data/postgres" "data/minio" "data/qdrant" "data/ollama" "data/backups" "data/uploads" "logs" "updates")
MISSING_DIRS=0
for dir in "${REQUIRED_DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    MISSING_DIRS=$((MISSING_DIRS + 1))
    if $FIX_MODE; then
      mkdir -p "$dir"
    fi
  fi
done

if [ "$MISSING_DIRS" -eq 0 ]; then
  check_pass "All required data directories exist"
else
  check_fail "$MISSING_DIRS required directories missing"
  if $FIX_MODE; then
    echo -e "    ${BLUE}Fixed: Created missing directories${NC}"
  fi
fi

# Backup cron (check for backup.sh in crontab)
if crontab -l 2>/dev/null | grep -q "backup.sh"; then
  check_pass "Backup cron job configured"
else
  check_warn "No backup cron job found"
  echo -e "    ${YELLOW}Add: crontab -e → 0 2 * * * ${PROJECT_ROOT}/scripts/backup.sh${NC}"
fi

# Disk space
AVAIL_GB=$(df -BG . 2>/dev/null | awk 'NR==2 {gsub(/G/, "", $4); print $4}' || echo "0")
if [ "$AVAIL_GB" -ge 20 ]; then
  check_pass "Disk space sufficient (${AVAIL_GB}GB available)"
elif [ "$AVAIL_GB" -ge 10 ]; then
  check_warn "Disk space low (${AVAIL_GB}GB available, recommend 20GB+)"
else
  check_fail "Disk space critical (${AVAIL_GB}GB available)"
fi

###############################################################################
# 5. SETUP WIZARD
###############################################################################

section "5. Setup Wizard"

# Check setup-status endpoint
SETUP_STATUS=$(curl -s --max-time 5 "http://localhost/api/system/setup-status" 2>/dev/null || echo "{}")
SETUP_COMPLETED=$(echo "$SETUP_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('setup_completed', False))" 2>/dev/null || echo "unknown")

if [ "$SETUP_COMPLETED" = "False" ] || [ "$SETUP_COMPLETED" = "false" ]; then
  check_pass "Setup wizard will show on first login"
elif [ "$SETUP_COMPLETED" = "True" ] || [ "$SETUP_COMPLETED" = "true" ]; then
  check_warn "Setup wizard already completed - reset for new customer?"
else
  check_warn "Could not check setup wizard status"
fi

###############################################################################
# 6. UPDATE SYSTEM
###############################################################################

section "6. Update System"

# Update directory
if [ -d "updates" ]; then
  check_pass "Updates directory exists"
else
  check_warn "Updates directory missing"
fi

# Update signing key
if [ -f "config/update-keys/public_key.pem" ]; then
  check_pass "Update signing public key present"
else
  check_warn "Update signing key not found"
fi

# Create-update script
if [ -x "scripts/create_update_package.sh" ]; then
  check_pass "Update package creation script available"
else
  check_warn "Update package creation script missing"
fi

###############################################################################
# 7. OLLAMA / AI MODELS
###############################################################################

section "7. AI Models"

# Check if Ollama has models loaded
MODELS=$(curl -s --max-time 10 "http://localhost:11434/api/tags" 2>/dev/null || echo "{}")
MODEL_COUNT=$(echo "$MODELS" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('models', [])))" 2>/dev/null || echo "0")

if [ "$MODEL_COUNT" -gt 0 ]; then
  check_pass "Ollama has $MODEL_COUNT model(s) loaded"
else
  check_warn "No Ollama models loaded - run: docker exec llm-service ollama pull llama3.1:8b"
fi

###############################################################################
# 8. DOCUMENTATION
###############################################################################

section "8. Documentation"

DOC_FILES=("docs/QUICK_START.md" "docs/ADMIN_HANDBUCH.md" "docs/TROUBLESHOOTING.md" "docs/DEPLOYMENT_CHECKLIST.md")
for doc in "${DOC_FILES[@]}"; do
  if [ -f "$doc" ]; then
    check_pass "$doc present"
  else
    check_warn "$doc missing"
  fi
done

###############################################################################
# RESULTS
###############################################################################

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Deployment Verification Results${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Passed:   ${GREEN}${PASSED}${NC}"
echo -e "  Warnings: ${YELLOW}${WARNINGS}${NC}"
echo -e "  Errors:   ${RED}${ERRORS}${NC}"
echo ""

if [ "$ERRORS" -gt 0 ]; then
  echo -e "  ${RED}${BOLD}NOT READY FOR DEPLOYMENT${NC}"
  echo -e "  ${RED}Fix all errors before shipping.${NC}"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  echo -e "  ${YELLOW}${BOLD}REVIEW WARNINGS BEFORE DEPLOYMENT${NC}"
  echo -e "  ${YELLOW}Warnings should be addressed if possible.${NC}"
  exit 2
else
  echo -e "  ${GREEN}${BOLD}READY FOR DEPLOYMENT${NC}"
  exit 0
fi
