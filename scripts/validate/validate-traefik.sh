#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Traefik Configuration Validator
# Validates Traefik YAML configs without requiring a running system.
#
# Checks:
#   1. YAML syntax (all config files)
#   2. Placeholder credentials detection
#   3. Middleware references (routers reference only defined middlewares)
#   4. Service references (routers reference only defined services)
#   5. Priority conflicts (duplicate priorities on same entrypoint)
#
# Usage:    ./scripts/validate/validate-traefik.sh
# Exit:     0 = OK, 1 = errors found
###############################################################################

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TRAEFIK_DIR="$PROJECT_ROOT/config/traefik"
DYNAMIC_DIR="$TRAEFIK_DIR/dynamic"

ERRORS=0
WARNINGS=0

pass() { echo -e "  ${GREEN}OK${NC}    $1"; }
fail() { echo -e "  ${RED}FAIL${NC}  $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC}  $1"; WARNINGS=$((WARNINGS + 1)); }

echo -e "${BOLD}"
echo "============================================"
echo "  TRAEFIK CONFIG VALIDATION"
echo "============================================"
echo -e "${NC}"

###############################################################################
# 1. YAML Syntax Check
###############################################################################
echo -e "${BOLD}[1/5] YAML-Syntax${NC}"

if ! command -v python3 >/dev/null 2>&1; then
  warn "python3 nicht verfuegbar, YAML-Syntax-Check uebersprungen"
else
  # Check static config
  if [ -f "$TRAEFIK_DIR/traefik.yml" ]; then
    if python3 -c "import yaml; yaml.safe_load(open('$TRAEFIK_DIR/traefik.yml'))" 2>/dev/null; then
      pass "traefik.yml Syntax OK"
    else
      fail "traefik.yml hat YAML-Syntaxfehler"
    fi
  else
    fail "traefik.yml nicht gefunden"
  fi

  # Check all dynamic configs
  for f in "$DYNAMIC_DIR"/*.yml; do
    [ -f "$f" ] || continue
    basename=$(basename "$f")
    if python3 -c "import yaml; yaml.safe_load(open('$f'))" 2>/dev/null; then
      pass "$basename Syntax OK"
    else
      fail "$basename hat YAML-Syntaxfehler"
    fi
  done
fi

echo ""

###############################################################################
# 2. Placeholder Credentials
###############################################################################
echo -e "${BOLD}[2/5] Placeholder-Credentials${NC}"

PLACEHOLDER_COUNT=0
for f in "$DYNAMIC_DIR"/*.yml; do
  [ -f "$f" ] || continue
  matches=$(grep -c 'PLACEHOLDER' "$f" 2>/dev/null || true)
  if [ "$matches" -gt 0 ]; then
    PLACEHOLDER_COUNT=$((PLACEHOLDER_COUNT + matches))
    warn "$(basename "$f"): $matches PLACEHOLDER-Eintraege gefunden"
  fi
done

if [ "$PLACEHOLDER_COUNT" -eq 0 ]; then
  pass "Keine Placeholder-Credentials gefunden"
else
  warn "Insgesamt $PLACEHOLDER_COUNT PLACEHOLDER-Eintraege (muessen vor Produktion ersetzt werden)"
fi

echo ""

###############################################################################
# 3. Middleware References
###############################################################################
echo -e "${BOLD}[3/5] Middleware-Referenzen${NC}"

if command -v python3 >/dev/null 2>&1; then
  # Collect all defined middlewares
  DEFINED_MW=$(python3 -c "
import yaml, glob, sys
mws = set()
for f in glob.glob('$DYNAMIC_DIR/*.yml'):
    try:
        data = yaml.safe_load(open(f))
        if data and 'http' in data and 'middlewares' in data['http']:
            mws.update(data['http']['middlewares'].keys())
    except: pass
for m in sorted(mws):
    print(m)
" 2>/dev/null)

  # Collect all referenced middlewares from routers
  REFERENCED_MW=$(python3 -c "
import yaml, glob, sys
refs = set()
for f in glob.glob('$DYNAMIC_DIR/*.yml'):
    try:
        data = yaml.safe_load(open(f))
        if data and 'http' in data and 'routers' in data['http']:
            for name, router in data['http']['routers'].items():
                for mw in router.get('middlewares', []):
                    refs.add(mw)
    except: pass
for r in sorted(refs):
    print(r)
" 2>/dev/null)

  # Check that all referenced middlewares are defined
  MW_ERRORS=0
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    if ! echo "$DEFINED_MW" | grep -qx "$ref"; then
      fail "Middleware '$ref' wird referenziert aber nicht definiert"
      MW_ERRORS=$((MW_ERRORS + 1))
    fi
  done <<< "$REFERENCED_MW"

  if [ "$MW_ERRORS" -eq 0 ]; then
    pass "Alle referenzierten Middlewares sind definiert"
  fi

  # Check for unused middlewares (informational)
  UNUSED=0
  while IFS= read -r def; do
    [ -z "$def" ] && continue
    if ! echo "$REFERENCED_MW" | grep -qx "$def"; then
      UNUSED=$((UNUSED + 1))
      [ "$UNUSED" -le 5 ] && warn "Middleware '$def' definiert aber nie referenziert"
    fi
  done <<< "$DEFINED_MW"
  [ "$UNUSED" -gt 5 ] && warn "... und $((UNUSED - 5)) weitere nicht referenzierte Middlewares"
else
  warn "python3 nicht verfuegbar, Middleware-Referenz-Check uebersprungen"
fi

echo ""

###############################################################################
# 4. Service References
###############################################################################
echo -e "${BOLD}[4/5] Service-Referenzen${NC}"

if command -v python3 >/dev/null 2>&1; then
  # Collect all defined services
  DEFINED_SVC=$(python3 -c "
import yaml, glob
svcs = set()
for f in glob.glob('$DYNAMIC_DIR/*.yml'):
    try:
        data = yaml.safe_load(open(f))
        if data and 'http' in data and 'services' in data['http']:
            svcs.update(data['http']['services'].keys())
    except: pass
for s in sorted(svcs):
    print(s)
" 2>/dev/null)

  # Collect all referenced services from routers
  REFERENCED_SVC=$(python3 -c "
import yaml, glob
refs = set()
for f in glob.glob('$DYNAMIC_DIR/*.yml'):
    try:
        data = yaml.safe_load(open(f))
        if data and 'http' in data and 'routers' in data['http']:
            for name, router in data['http']['routers'].items():
                svc = router.get('service', '')
                if svc and '@' not in svc:  # skip internal services like api@internal
                    refs.add(svc)
    except: pass
for r in sorted(refs):
    print(r)
" 2>/dev/null)

  SVC_ERRORS=0
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    if ! echo "$DEFINED_SVC" | grep -qx "$ref"; then
      fail "Service '$ref' wird referenziert aber nicht definiert"
      SVC_ERRORS=$((SVC_ERRORS + 1))
    fi
  done <<< "$REFERENCED_SVC"

  if [ "$SVC_ERRORS" -eq 0 ]; then
    pass "Alle referenzierten Services sind definiert"
  fi
else
  warn "python3 nicht verfuegbar, Service-Referenz-Check uebersprungen"
fi

echo ""

###############################################################################
# 5. Priority Conflicts
###############################################################################
echo -e "${BOLD}[5/5] Priority-Konflikte${NC}"

if command -v python3 >/dev/null 2>&1; then
  CONFLICTS=$(python3 -c "
import yaml, glob
from collections import defaultdict

# Collect: (entrypoint, priority) -> [router_names]
combos = defaultdict(list)
for f in glob.glob('$DYNAMIC_DIR/*.yml'):
    try:
        data = yaml.safe_load(open(f))
        if not data or 'http' not in data or 'routers' not in data['http']:
            continue
        for name, router in data['http']['routers'].items():
            priority = router.get('priority', 0)
            entrypoints = router.get('entryPoints', ['web'])
            rule = router.get('rule', '')
            for ep in entrypoints:
                combos[(ep, priority)].append((name, rule))
    except:
        pass

# Report conflicts (same entrypoint + same priority + overlapping rules)
found = 0
for (ep, prio), routers in sorted(combos.items()):
    if len(routers) > 1:
        names = [r[0] for r in routers]
        # HTTP/HTTPS pairs with same rule are OK, skip those
        # Check if rules actually differ
        rules = set(r[1] for r in routers)
        if len(rules) > 1:
            print(f'Priority {prio} auf {ep}: {', '.join(names)}')
            found += 1

if found == 0:
    print('OK')
" 2>/dev/null)

  if [ "$CONFLICTS" = "OK" ]; then
    pass "Keine Priority-Konflikte gefunden"
  else
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      warn "Priority-Konflikt: $line"
    done <<< "$CONFLICTS"
  fi
else
  warn "python3 nicht verfuegbar, Priority-Check uebersprungen"
fi

echo ""

###############################################################################
# Summary
###############################################################################
echo -e "${BOLD}============================================${NC}"
echo -e "  Ergebnis: ${GREEN}$((ERRORS == 0 ? 1 : 0)) OK${NC}, ${RED}${ERRORS} FEHLER${NC}, ${YELLOW}${WARNINGS} WARNUNGEN${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""

if [ "$ERRORS" -eq 0 ]; then
  if [ "$WARNINGS" -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}Traefik-Konfiguration OK${NC}"
  else
    echo -e "  ${YELLOW}${BOLD}Traefik-Konfiguration OK (mit Warnungen)${NC}"
  fi
  exit 0
else
  echo -e "  ${RED}${BOLD}Traefik-Konfiguration hat Fehler${NC}"
  exit 1
fi
