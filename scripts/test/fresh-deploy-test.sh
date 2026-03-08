#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Fresh Deploy Validation Test
# Validates that a fresh or updated deployment is fully functional.
#
# Checks:
#   1. Database migration completeness (tables, tracking, admin user)
#   2. Core services reachable (API, frontend, Traefik)
#   3. Authentication flow works (login with admin credentials)
#   4. Configuration integrity (.env, device-id, permissions)
#
# Usage:
#   ./scripts/test/fresh-deploy-test.sh [--password ADMIN_PASSWORD] [--host HOST]
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
###############################################################################

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

HOST="localhost"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
VERBOSE=false

for arg in "$@"; do
  case "$arg" in
    --password=*) ADMIN_PASSWORD="${arg#*=}" ;;
    --host=*)     HOST="${arg#*=}" ;;
    --verbose)    VERBOSE=true ;;
    --help|-h)
      echo "Usage: $0 [--password=ADMIN_PASSWORD] [--host=HOST] [--verbose]"
      exit 0
      ;;
  esac
done

cd "$PROJECT_ROOT"

PASS=0
FAIL=0
WARN=0

pass() {
  echo -e "  ${GREEN}PASS${NC}  $1"
  PASS=$((PASS + 1))
}

fail() {
  echo -e "  ${RED}FAIL${NC}  $1"
  [ -n "${2:-}" ] && echo -e "        $2"
  FAIL=$((FAIL + 1))
}

warn() {
  echo -e "  ${YELLOW}WARN${NC}  $1"
  [ -n "${2:-}" ] && echo -e "        $2"
  WARN=$((WARN + 1))
}

db_query() {
  docker compose exec -T postgres-db psql -U arasul -d arasul_db -t -A -c "$1" 2>/dev/null
}

echo -e "${BOLD}"
echo "============================================"
echo "  ARASUL FRESH DEPLOY VALIDATION"
echo "============================================"
echo -e "${NC}"

###############################################################################
# 1. Database Migration Completeness
###############################################################################
echo -e "${BOLD}[1/5] Datenbank-Migrationen${NC}"

# Check PostgreSQL is reachable
if ! docker compose exec -T postgres-db pg_isready -U arasul >/dev/null 2>&1; then
  fail "PostgreSQL nicht erreichbar"
  echo -e "\n  ${RED}Abbruch: Datenbank muss laufen fuer weitere Tests${NC}"
  exit 1
fi
pass "PostgreSQL erreichbar"

# Check table count (should be at least 50)
TABLE_COUNT=$(db_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
if [ "$TABLE_COUNT" -ge 50 ]; then
  pass "Tabellen vorhanden ($TABLE_COUNT Tabellen)"
else
  fail "Zu wenige Tabellen: $TABLE_COUNT (erwartet >= 50)" \
       "Migrationen wurden vermutlich nicht vollstaendig ausgefuehrt"
fi

# Check schema_migrations tracking
MIGRATION_TABLE=$(db_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='schema_migrations'")
if [ "$MIGRATION_TABLE" -eq 1 ]; then
  APPLIED=$(db_query "SELECT COUNT(*) FROM schema_migrations WHERE success=true")
  pass "schema_migrations vorhanden ($APPLIED Migrationen angewendet)"
else
  warn "schema_migrations Tabelle fehlt" "Migration-Tracking nicht aktiv"
fi

# Check critical tables exist
CRITICAL_TABLES="admin_users system_settings chat_conversations chat_messages documents knowledge_spaces projects"
TABLE_MISSING=0
for table in $CRITICAL_TABLES; do
  EXISTS=$(db_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$table'")
  if [ "$EXISTS" -eq 1 ]; then
    [ "$VERBOSE" = true ] && pass "Tabelle '$table' existiert"
  else
    fail "Kritische Tabelle '$table' fehlt"
    TABLE_MISSING=$((TABLE_MISSING + 1))
  fi
done
[ "$TABLE_MISSING" -eq 0 ] && pass "Alle kritischen Tabellen vorhanden"

echo ""

###############################################################################
# 2. Admin User & System Settings
###############################################################################
echo -e "${BOLD}[2/5] Admin-User & System-Settings${NC}"

ADMIN_COUNT=$(db_query "SELECT COUNT(*) FROM admin_users")
if [ "$ADMIN_COUNT" -ge 1 ]; then
  pass "Admin-User vorhanden ($ADMIN_COUNT User)"
else
  fail "Kein Admin-User in admin_users" \
       "Bootstrap hat keinen Admin erstellt. ADMIN_PASSWORD in .env gesetzt?"
fi

SETTINGS_COUNT=$(db_query "SELECT COUNT(*) FROM system_settings")
if [ "$SETTINGS_COUNT" -ge 1 ]; then
  pass "system_settings vorhanden ($SETTINGS_COUNT Eintraege)"
else
  warn "system_settings ist leer" "Setup-Wizard wurde noch nicht abgeschlossen"
fi

echo ""

###############################################################################
# 3. Service-Erreichbarkeit
###############################################################################
echo -e "${BOLD}[3/5] Service-Erreichbarkeit${NC}"

# Traefik health
if curl -sf --max-time 5 "http://${HOST}:8080/ping" >/dev/null 2>&1; then
  pass "Traefik Health (ping)"
else
  fail "Traefik nicht erreichbar auf :8080/ping"
fi

# Backend API health
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://${HOST}/api/health")
if [ "$API_CODE" = "200" ]; then
  pass "Backend API Health (/api/health)"
else
  fail "Backend API gibt $API_CODE statt 200"
fi

# Frontend
FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://${HOST}/")
if [ "$FRONTEND_CODE" = "200" ]; then
  pass "Frontend erreichbar (/)"
else
  fail "Frontend gibt $FRONTEND_CODE statt 200"
fi

# Setup status (unauthenticated endpoint)
SETUP_STATUS=$(curl -sf --max-time 5 "http://${HOST}/api/system/setup-status" 2>/dev/null)
if echo "$SETUP_STATUS" | grep -q "setupComplete" 2>/dev/null; then
  pass "Setup-Status abrufbar (/api/system/setup-status)"
else
  warn "Setup-Status nicht abrufbar"
fi

echo ""

###############################################################################
# 4. Authentication Flow
###############################################################################
echo -e "${BOLD}[4/5] Authentifizierung${NC}"

if [ -z "$ADMIN_PASSWORD" ]; then
  # Try to read from .env
  if [ -f .env ]; then
    ADMIN_PASSWORD=$(grep -E '^ADMIN_PASSWORD=' .env 2>/dev/null | cut -d= -f2- || true)
  fi
fi

if [ -n "$ADMIN_PASSWORD" ]; then
  LOGIN_RESULT=$(curl -sf --max-time 10 -X POST "http://${HOST}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASSWORD}\"}" 2>/dev/null || echo "")

  if echo "$LOGIN_RESULT" | grep -q "token" 2>/dev/null; then
    pass "Login als admin erfolgreich"

    # Extract token and test authenticated endpoint
    TOKEN=$(echo "$LOGIN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
    if [ -n "$TOKEN" ]; then
      AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
        -H "Authorization: Bearer $TOKEN" \
        "http://${HOST}/api/chats" 2>/dev/null)
      if [ "$AUTH_CODE" = "200" ]; then
        pass "Authentifizierter API-Zugriff funktioniert"
      else
        fail "Authentifizierter API-Zugriff gibt $AUTH_CODE statt 200"
      fi
    fi
  else
    fail "Login als admin fehlgeschlagen" \
         "Antwort: $(echo "$LOGIN_RESULT" | head -c 200)"
  fi
else
  warn "ADMIN_PASSWORD nicht verfuegbar, Login-Test uebersprungen" \
       "Setze --password=... oder ADMIN_PASSWORD in .env"
fi

echo ""

###############################################################################
# 5. Konfiguration & Permissions
###############################################################################
echo -e "${BOLD}[5/5] Konfiguration & Permissions${NC}"

# .env exists
if [ -f .env ]; then
  pass ".env vorhanden"

  # Check .env permissions
  PERMS=$(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env 2>/dev/null)
  if [ "$PERMS" = "600" ] || [ "$PERMS" = "640" ]; then
    pass ".env Permissions: $PERMS"
  else
    warn ".env Permissions: $PERMS (empfohlen: 600)"
  fi
else
  fail ".env fehlt"
fi

# device-id
if [ -f config/device/device-id ]; then
  pass "device-id vorhanden"
else
  warn "config/device/device-id fehlt" "preconfigure.sh wurde nicht ausgefuehrt"
fi

# SQL migration file permissions
SQL_BAD=$(find services/postgres/init/ -name "*.sql" ! -perm -o=r -print 2>/dev/null | wc -l)
if [ "$SQL_BAD" -eq 0 ]; then
  pass "SQL-Dateien sind lesbar (644)"
else
  fail "$SQL_BAD SQL-Dateien haben falsche Permissions" \
       "chmod 644 services/postgres/init/*.sql"
fi

# Shell script permissions
SH_BAD=$(find services/postgres/init/ -name "*.sh" ! -perm -o=x -print 2>/dev/null | wc -l)
if [ "$SH_BAD" -eq 0 ]; then
  pass "Shell-Skripte sind ausfuehrbar (755)"
else
  fail "$SH_BAD Shell-Skripte haben falsche Permissions" \
       "chmod 755 services/postgres/init/*.sh"
fi

# Traefik placeholder check
if grep -rq 'PLACEHOLDER' config/traefik/dynamic/middlewares.yml 2>/dev/null; then
  warn "Traefik-Middlewares enthalten PLACEHOLDER-Credentials" \
       "preconfigure.sh Step 6 ausfuehren oder Credentials manuell setzen"
fi

echo ""

###############################################################################
# Summary
###############################################################################
echo -e "${BOLD}============================================${NC}"
echo -e "  Ergebnis: ${GREEN}${PASS} PASS${NC}, ${RED}${FAIL} FAIL${NC}, ${YELLOW}${WARN} WARN${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}BEREIT${NC} - Fresh Deploy vollstaendig validiert"
  exit 0
elif [ "$FAIL" -eq 0 ]; then
  echo -e "  ${YELLOW}${BOLD}BEREIT (mit Warnungen)${NC} - Funktional, aber Warnungen pruefen"
  exit 0
else
  echo -e "  ${RED}${BOLD}FEHLGESCHLAGEN${NC} - $FAIL Fehler muessen behoben werden"
  exit 1
fi
