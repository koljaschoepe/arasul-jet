#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Integration Test Suite
# Automated verification of all core functions on a running system.
#
# Prerequisites:
#   - All Docker services running (docker compose up -d)
#   - System accessible at localhost or specified host
#
# Usage:
#   ./scripts/integration-test.sh [--host HOST] [--port PORT] [--verbose]
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
HOST="localhost"
PORT="80"
VERBOSE=false
PASSED=0
FAILED=0
SKIPPED=0
RESULTS=()

# CLI flags
for arg in "$@"; do
  case "$arg" in
    --host=*)   HOST="${arg#*=}" ;;
    --port=*)   PORT="${arg#*=}" ;;
    --verbose)  VERBOSE=true ;;
    --help|-h)
      echo "Usage: $0 [--host=HOST] [--port=PORT] [--verbose]"
      echo "  --host=HOST   Target host (default: localhost)"
      echo "  --port=PORT   Target port (default: 80)"
      echo "  --verbose     Show response bodies"
      exit 0
      ;;
  esac
done

BASE_URL="http://${HOST}:${PORT}"
API_URL="${BASE_URL}/api"
TOKEN=""

###############################################################################
# HELPER FUNCTIONS
###############################################################################

log_section() {
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

test_pass() {
  echo -e "  ${GREEN}✓${NC} $1"
  PASSED=$((PASSED + 1))
  RESULTS+=("PASS: $1")
}

test_fail() {
  echo -e "  ${RED}✗${NC} $1"
  if [ -n "${2:-}" ]; then
    echo -e "    ${RED}→ $2${NC}"
  fi
  FAILED=$((FAILED + 1))
  RESULTS+=("FAIL: $1${2:+ - $2}")
}

test_skip() {
  echo -e "  ${YELLOW}⊘${NC} $1 (skipped: ${2:-})"
  SKIPPED=$((SKIPPED + 1))
  RESULTS+=("SKIP: $1")
}

# HTTP request helper
# Usage: http_request METHOD PATH [DATA] [EXTRA_CURL_ARGS...]
http_request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local url="${API_URL}${path}"

  local curl_args=(-s -w "\n%{http_code}" -X "$method" --max-time 30)

  if [ -n "$TOKEN" ]; then
    curl_args+=(-H "Authorization: Bearer ${TOKEN}")
  fi

  if [ -n "$data" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$data")
  fi

  curl "${curl_args[@]}" "$url" 2>/dev/null || echo -e "\n000"
}

# Extract HTTP status code from response
get_status() {
  echo "$1" | tail -1
}

# Extract response body from response
get_body() {
  echo "$1" | sed '$d'
}

###############################################################################
# 1. SERVICE HEALTH CHECKS
###############################################################################

log_section "1. Service Health Checks"

# Check Docker services
echo -e "  ${BLUE}Checking Docker service status...${NC}"
UNHEALTHY_SERVICES=()
while IFS= read -r line; do
  name=$(echo "$line" | awk '{print $1}')
  status=$(echo "$line" | awk '{print $2}')
  health=$(echo "$line" | awk '{print $3}')

  if [ "$status" != "running" ] || { [ -n "$health" ] && [ "$health" != "(healthy)" ]; }; then
    UNHEALTHY_SERVICES+=("$name ($status $health)")
  fi
done < <(docker compose ps --format "{{.Name}} {{.State}} {{.Health}}" 2>/dev/null || echo "")

if [ ${#UNHEALTHY_SERVICES[@]} -eq 0 ]; then
  test_pass "All Docker services healthy"
else
  for svc in "${UNHEALTHY_SERVICES[@]}"; do
    test_fail "Service unhealthy: $svc"
  done
fi

# Check frontend reachability
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL" 2>/dev/null || echo "000")
if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "304" ]; then
  test_pass "Frontend reachable (HTTP $RESPONSE)"
else
  test_fail "Frontend not reachable" "HTTP $RESPONSE"
fi

# Check API health
RESPONSE=$(http_request GET "/system/heartbeat")
STATUS=$(get_status "$RESPONSE")
if [ "$STATUS" = "200" ]; then
  test_pass "API heartbeat endpoint responding"
else
  test_fail "API heartbeat not responding" "HTTP $STATUS"
fi

###############################################################################
# 2. AUTHENTICATION
###############################################################################

log_section "2. Authentication"

# Login with admin credentials
ADMIN_USER="${ADMIN_USERNAME:-admin}"
ADMIN_PASS="${ADMIN_PASSWORD:-}"

if [ -z "$ADMIN_PASS" ]; then
  # Try to read from .env
  if [ -f ".env" ]; then
    ADMIN_PASS=$(grep -E "^ADMIN_PASSWORD=" .env | cut -d= -f2- | tr -d '"' || true)
  fi
fi

if [ -z "$ADMIN_PASS" ]; then
  test_skip "Login test" "ADMIN_PASSWORD not set"
else
  RESPONSE=$(http_request POST "/auth/login" "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}")
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")

  if [ "$STATUS" = "200" ]; then
    TOKEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
    if [ -n "$TOKEN" ]; then
      test_pass "Admin login successful"
    else
      test_fail "Login returned 200 but no token"
    fi
  else
    test_fail "Admin login failed" "HTTP $STATUS"
  fi

  # Test auth verification
  if [ -n "$TOKEN" ]; then
    RESPONSE=$(http_request GET "/auth/verify")
    STATUS=$(get_status "$RESPONSE")
    if [ "$STATUS" = "200" ]; then
      test_pass "Token verification successful"
    else
      test_fail "Token verification failed" "HTTP $STATUS"
    fi
  fi

  # Test invalid login
  RESPONSE=$(http_request POST "/auth/login" '{"username":"invalid","password":"wrong"}')
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "401" ]; then
    test_pass "Invalid login correctly rejected (401)"
  else
    test_fail "Invalid login not rejected" "Expected 401, got HTTP $STATUS"
  fi
fi

###############################################################################
# 3. SYSTEM ENDPOINTS
###############################################################################

log_section "3. System Endpoints"

if [ -z "$TOKEN" ]; then
  test_skip "System endpoints" "No auth token"
else
  # System status
  RESPONSE=$(http_request GET "/system/status")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /system/status"
  else
    test_fail "GET /system/status" "HTTP $STATUS"
  fi

  # System info
  RESPONSE=$(http_request GET "/system/info")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    BODY=$(get_body "$RESPONSE")
    VERSION=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version',''))" 2>/dev/null || true)
    test_pass "GET /system/info (version: ${VERSION:-unknown})"
  else
    test_fail "GET /system/info" "HTTP $STATUS"
  fi

  # System network
  RESPONSE=$(http_request GET "/system/network")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /system/network"
  else
    test_fail "GET /system/network" "HTTP $STATUS"
  fi

  # System thresholds
  RESPONSE=$(http_request GET "/system/thresholds")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /system/thresholds"
  else
    test_fail "GET /system/thresholds" "HTTP $STATUS"
  fi
fi

###############################################################################
# 4. LLM / CHAT
###############################################################################

log_section "4. LLM / Chat"

if [ -z "$TOKEN" ]; then
  test_skip "Chat tests" "No auth token"
else
  # List models
  RESPONSE=$(http_request GET "/llm/models")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /llm/models"
  else
    test_fail "GET /llm/models" "HTTP $STATUS"
  fi

  # Create a test chat
  RESPONSE=$(http_request POST "/chats" '{"title":"Integration Test Chat"}')
  STATUS=$(get_status "$RESPONSE")
  BODY=$(get_body "$RESPONSE")
  CHAT_ID=""
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
    CHAT_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id') or d.get('chat',{}).get('id',''))" 2>/dev/null || true)
    test_pass "Create chat"
  else
    test_fail "Create chat" "HTTP $STATUS"
  fi

  # List chats
  RESPONSE=$(http_request GET "/chats")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /chats"
  else
    test_fail "GET /chats" "HTTP $STATUS"
  fi

  # Clean up test chat
  if [ -n "$CHAT_ID" ]; then
    RESPONSE=$(http_request DELETE "/chats/${CHAT_ID}")
    STATUS=$(get_status "$RESPONSE")
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "204" ]; then
      test_pass "Delete test chat"
    else
      test_fail "Delete test chat" "HTTP $STATUS"
    fi
  fi
fi

###############################################################################
# 5. DOCUMENT / RAG
###############################################################################

log_section "5. Document Management & RAG"

if [ -z "$TOKEN" ]; then
  test_skip "Document tests" "No auth token"
else
  # List documents
  RESPONSE=$(http_request GET "/documents")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /documents"
  else
    test_fail "GET /documents" "HTTP $STATUS"
  fi

  # List spaces
  RESPONSE=$(http_request GET "/spaces")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /spaces"
  else
    test_fail "GET /spaces" "HTTP $STATUS"
  fi

  # RAG search (should work even with no documents)
  RESPONSE=$(http_request POST "/rag/search" '{"query":"test","limit":5}')
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "POST /rag/search"
  else
    test_fail "POST /rag/search" "HTTP $STATUS"
  fi
fi

###############################################################################
# 6. SETTINGS
###############################################################################

log_section "6. Settings"

if [ -z "$TOKEN" ]; then
  test_skip "Settings tests" "No auth token"
else
  # Get settings
  RESPONSE=$(http_request GET "/settings")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /settings"
  else
    test_fail "GET /settings" "HTTP $STATUS"
  fi
fi

###############################################################################
# 7. DATENTABELLEN
###############################################################################

log_section "7. Datentabellen"

if [ -z "$TOKEN" ]; then
  test_skip "Datentabellen tests" "No auth token"
else
  # List tables
  RESPONSE=$(http_request GET "/datentabellen/tables")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /datentabellen/tables"
  else
    test_fail "GET /datentabellen/tables" "HTTP $STATUS"
  fi
fi

###############################################################################
# 8. METRICS
###############################################################################

log_section "8. Metrics"

if [ -z "$TOKEN" ]; then
  test_skip "Metrics tests" "No auth token"
else
  RESPONSE=$(http_request GET "/metrics")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /metrics"
  else
    test_fail "GET /metrics" "HTTP $STATUS"
  fi
fi

###############################################################################
# 9. LOGS
###############################################################################

log_section "9. Logs"

if [ -z "$TOKEN" ]; then
  test_skip "Log tests" "No auth token"
else
  RESPONSE=$(http_request GET "/logs/list")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /logs/list"
  else
    test_fail "GET /logs/list" "HTTP $STATUS"
  fi
fi

###############################################################################
# 10. SERVICES MANAGEMENT
###############################################################################

log_section "10. Services Management"

if [ -z "$TOKEN" ]; then
  test_skip "Services tests" "No auth token"
else
  RESPONSE=$(http_request GET "/services")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /services"
  else
    test_fail "GET /services" "HTTP $STATUS"
  fi
fi

###############################################################################
# 11. UPDATE SYSTEM
###############################################################################

log_section "11. Update System"

if [ -z "$TOKEN" ]; then
  test_skip "Update tests" "No auth token"
else
  RESPONSE=$(http_request GET "/update/status")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /update/status"
  else
    test_fail "GET /update/status" "HTTP $STATUS"
  fi

  RESPONSE=$(http_request GET "/update/history")
  STATUS=$(get_status "$RESPONSE")
  if [ "$STATUS" = "200" ]; then
    test_pass "GET /update/history"
  else
    test_fail "GET /update/history" "HTTP $STATUS"
  fi
fi

###############################################################################
# 12. BACKUP SYSTEM
###############################################################################

log_section "12. Backup System"

# Check backup script exists and is executable
if [ -x "scripts/backup.sh" ]; then
  test_pass "Backup script exists and is executable"
else
  test_fail "Backup script missing or not executable"
fi

if [ -x "scripts/restore.sh" ]; then
  test_pass "Restore script exists and is executable"
else
  test_fail "Restore script missing or not executable"
fi

# Check backup directory
if [ -d "data/backups" ]; then
  test_pass "Backup directory exists"
else
  test_fail "Backup directory missing"
fi

###############################################################################
# RESULTS SUMMARY
###############################################################################

log_section "Results Summary"

TOTAL=$((PASSED + FAILED + SKIPPED))
echo ""
echo -e "  Total:   ${BOLD}${TOTAL}${NC}"
echo -e "  Passed:  ${GREEN}${PASSED}${NC}"
echo -e "  Failed:  ${RED}${FAILED}${NC}"
echo -e "  Skipped: ${YELLOW}${SKIPPED}${NC}"
echo ""

# Write report
REPORT_FILE="data/integration-test-report.json"
mkdir -p "$(dirname "$REPORT_FILE")"
python3 -c "
import json, datetime
report = {
    'timestamp': datetime.datetime.now().isoformat(),
    'host': '${HOST}',
    'port': '${PORT}',
    'total': ${TOTAL},
    'passed': ${PASSED},
    'failed': ${FAILED},
    'skipped': ${SKIPPED},
    'results': $(python3 -c "import json; print(json.dumps([line for line in '''$(printf '%s\n' "${RESULTS[@]}")'''.strip().split('\n') if line]))")
}
with open('${REPORT_FILE}', 'w') as f:
    json.dump(report, f, indent=2)
print(f'  Report saved to: ${REPORT_FILE}')
" 2>/dev/null || echo "  (Report generation skipped)"

echo ""
if [ "$FAILED" -gt 0 ]; then
  echo -e "  ${RED}${BOLD}INTEGRATION TESTS FAILED${NC}"
  exit 1
else
  echo -e "  ${GREEN}${BOLD}ALL INTEGRATION TESTS PASSED${NC}"
  exit 0
fi
