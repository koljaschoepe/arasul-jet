#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Smoke Test
# Verifies all services are running and reachable after setup.
#
# Usage:    ./scripts/test/smoke-test.sh
# Returns:  Exit code 0 if all checks pass, 1 if any fail
###############################################################################

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

PASS=0
FAIL=0
SKIP=0

check() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo -e "  ${GREEN}OK${NC}    $description"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC}  $description"
    FAIL=$((FAIL + 1))
  fi
}

check_optional() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo -e "  ${GREEN}OK${NC}    $description"
    PASS=$((PASS + 1))
  else
    echo -e "  ${YELLOW}SKIP${NC}  $description"
    SKIP=$((SKIP + 1))
  fi
}

echo -e "${BOLD}"
echo "============================================"
echo "  ARASUL SMOKE TEST"
echo "============================================"
echo -e "${NC}"

# Docker services
echo -e "${BOLD}Docker Services:${NC}"
RUNNING_COUNT=$(docker compose ps --status running --format '{{.Name}}' 2>/dev/null | wc -l)
check "Docker Compose erreichbar" test "$RUNNING_COUNT" -gt 0
check "Mindestens 10 Services laufen" test "$RUNNING_COUNT" -ge 10
echo "  (${RUNNING_COUNT} Services laufen)"
echo ""

# Core infrastructure
echo -e "${BOLD}Infrastruktur:${NC}"
check "PostgreSQL erreichbar" docker compose exec -T postgres-db pg_isready -U arasul
check "MinIO Health" curl -sf http://localhost:9000/minio/health/live
check "Traefik Health" curl -sf --max-time 5 http://localhost:8080/ping
echo ""

# Application
echo -e "${BOLD}Anwendung:${NC}"
check "Backend API Health" curl -sf --max-time 5 http://localhost/api/health
check "Frontend erreichbar" curl -sf --max-time 5 http://localhost/ -o /dev/null
echo ""

# AI services
echo -e "${BOLD}KI-Services:${NC}"
check "LLM-Service (Ollama)" docker compose exec -T llm-service ollama list
check "Embedding-Service" curl -sf --max-time 10 http://localhost:11435/health
check_optional "Qdrant Vector DB" curl -sf --max-time 5 http://localhost:6333/healthz
echo ""

# Network
echo -e "${BOLD}Netzwerk:${NC}"
check_optional "mDNS (arasul.local)" avahi-resolve -n arasul.local
echo ""

# .env
echo -e "${BOLD}Konfiguration:${NC}"
check ".env vorhanden" test -f .env
check "device-id vorhanden" test -f config/device/device-id
echo ""

# Summary
echo -e "${BOLD}============================================${NC}"
echo -e "  Ergebnis: ${GREEN}${PASS} OK${NC}, ${RED}${FAIL} FAIL${NC}, ${YELLOW}${SKIP} SKIP${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}BEREIT${NC} - Geraet kann versendet werden"
  exit 0
else
  echo -e "  ${RED}${BOLD}PROBLEME GEFUNDEN${NC} - Bitte beheben vor Versand"
  exit 1
fi
