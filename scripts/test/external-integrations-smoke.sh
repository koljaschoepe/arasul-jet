#!/usr/bin/env bash
# External-Integrations smoke test (n8n + Telegram).
#
# Run after every deploy of the EXTERNAL_INTEGRATIONS plan (Phases 1–6).
# Doesn't talk to Telegram or any external SaaS — only validates the local
# stack: route auth, container health, migrations, env-var rendering.
#
# Usage:
#   ./scripts/test/external-integrations-smoke.sh             # default checks
#   ./scripts/test/external-integrations-smoke.sh --host=URL  # explicit host
#
# Exit 0 on all-pass, 1 on any failure.

set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

PASS=0; FAIL=0; SKIP=0
HOST="${HOST:-https://localhost}"

for arg in "$@"; do
  case "$arg" in
    --host=*) HOST="${arg#--host=}" ;;
    -h|--help)
      sed -n '2,12p' "$0"; exit 0 ;;
  esac
done

pass()  { printf "  ${GREEN}✓${NC} %s\n" "$1"; PASS=$((PASS+1)); }
fail()  { printf "  ${RED}✗${NC} %s\n" "$1"; FAIL=$((FAIL+1)); }
skip()  { printf "  ${YELLOW}–${NC} %s (%s)\n" "$1" "$2"; SKIP=$((SKIP+1)); }
section() { printf "\n${YELLOW}== %s ==${NC}\n" "$1"; }

section "1. Container health"
for svc in n8n dashboard-backend postgres-db reverse-proxy; do
  if docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null | grep -q healthy; then
    pass "$svc is healthy"
  elif docker inspect "$svc" >/dev/null 2>&1; then
    fail "$svc exists but is not healthy"
  else
    skip "$svc" "container not present"
  fi
done

section "2. n8n forward-auth (AC2)"
status=$(curl -sk -o /dev/null -w '%{http_code}' "$HOST/n8n/" || echo 000)
if [ "$status" = "401" ] || [ "$status" = "302" ] || [ "$status" = "303" ]; then
  pass "/n8n/ rejects unauthenticated requests (HTTP $status)"
else
  fail "/n8n/ should return 401/302/303 without session — got HTTP $status"
fi

section "3. n8n encryption-key (AC3)"
if docker inspect n8n >/dev/null 2>&1; then
  # The entrypoint exports N8N_ENCRYPTION_KEY into the n8n process (PID 1)
  # only — `docker exec` spawns a new shell with the image's static ENV, not
  # the entrypoint's exports. So we read /proc/1/environ directly.
  if docker exec n8n sh -c 'tr "\0" "\n" < /proc/1/environ | grep -q "^N8N_ENCRYPTION_KEY=."' 2>/dev/null; then
    pass "N8N_ENCRYPTION_KEY is set inside the n8n process"
  else
    fail "N8N_ENCRYPTION_KEY is empty or missing inside n8n PID 1"
  fi
  # Boot-log scan for the auto-generation warning. Only meaningful on a fresh
  # container, but cheap to check.
  if docker logs n8n 2>&1 | grep -qi "Generated encryption key"; then
    fail "n8n logs contain 'Generated encryption key' — Docker secret is NOT being applied"
  else
    pass "n8n boot log does not mention an auto-generated key"
  fi
else
  skip "n8n encryption-key" "container not present"
fi

section "4. n8n hardening envs (AC6)"
if docker inspect n8n >/dev/null 2>&1; then
  for var in N8N_BLOCK_ENV_ACCESS_IN_NODE N8N_RESTRICT_FILE_ACCESS_TO N8N_DIAGNOSTICS_ENABLED N8N_COMMUNITY_PACKAGES_ENABLED EXECUTIONS_DATA_PRUNE; do
    val=$(docker exec n8n printenv "$var" 2>/dev/null || echo "")
    if [ -n "$val" ]; then
      pass "$var=$val"
    else
      fail "$var is unset"
    fi
  done
else
  skip "n8n hardening envs" "container not present"
fi

section "5. n8n version (AC4)"
if docker inspect n8n >/dev/null 2>&1; then
  ver=$(docker exec n8n n8n --version 2>/dev/null || echo "?")
  case "$ver" in
    1.123.18|2.4.8|2.6.2|2.6.[3-9]|2.[7-9].*)
      pass "n8n version is $ver (post Q1-2026 CVE patches)" ;;
    *)
      fail "n8n version is $ver — verify it is ≥ 1.123.18 / 2.4.8 / 2.6.2" ;;
  esac
else
  skip "n8n version" "container not present"
fi

section "6. Migration state"
expected_migrations="090_n8n_audit_log 091_telegram_bot_health 092_telegram_dsgvo"
if docker inspect postgres-db >/dev/null 2>&1; then
  applied=$(docker exec postgres-db psql -U arasul -d arasul_db -tAc \
    "SELECT filename FROM schema_migrations WHERE filename ~ '^09[0-2]_'" 2>/dev/null || echo "")
  for m in $expected_migrations; do
    if echo "$applied" | grep -q "$m"; then
      pass "migration $m applied"
    else
      fail "migration $m NOT applied"
    fi
  done
else
  skip "migration state" "postgres-db not present"
fi

section "7. Telegram diagnose endpoint (AC11)"
# This needs a logged-in session cookie to actually return data; without one
# it should at least be reachable and respond with 401 (forward-auth on /api).
status=$(curl -sk -o /dev/null -w '%{http_code}' "$HOST/api/telegram-bots/0/diagnose" || echo 000)
if [ "$status" = "401" ] || [ "$status" = "404" ]; then
  pass "/api/telegram-bots/:id/diagnose is wired (HTTP $status without auth)"
else
  fail "/api/telegram-bots/:id/diagnose returned HTTP $status — expected 401 or 404"
fi

section "8. Webhook hardening (AC sourceCriterion)"
# Just verify the rate-limiter middleware definition has sourceCriterion.
if grep -q "sourceCriterion:" "$PROJECT_ROOT/config/traefik/dynamic/middlewares.yml"; then
  pass "rate-limit-n8n has sourceCriterion (XFF-spoof mitigation)"
else
  fail "rate-limit-n8n lacks sourceCriterion"
fi

section "Summary"
printf "  ${GREEN}pass: %d${NC}  ${RED}fail: %d${NC}  ${YELLOW}skip: %d${NC}\n" "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ]
