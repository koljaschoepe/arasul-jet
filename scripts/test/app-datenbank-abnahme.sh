#!/bin/bash
# =============================================================================
# Abnahme „eine App ohne ihre Datenbank ist krank" (J35, 26.09.2026)
# =============================================================================
# Der Befund aus dem Kundendurchlauf 2: nach einem Neustart lief die
# Faktum-App ohne ihre Datenbank weiter und meldete sich gesund. Die zweite
# Haelfte der Reparatur ist, dass das GERAET es sagt, egal was der
# Healthcheck der App meint (`appStore.standZustand`, `appDatenbank.fehlt`).
#
# Gemessen wird am echten Postgres: die Proben-App (`tests/probe-daten`)
# kommt unter einer eigenen Kennung in den Teststand, ist lieferbar, ihre
# Datenbank wird weggeworfen -- und der Stand ist danach nicht mehr lieferbar,
# mit einem Mangel, der die Datenbank nennt. Die erste Haelfte (Neustart nach
# der Datenbank) misst nur ein Neustart des Geraets; siehe AUFTRAG und PR.
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App (samt Datenbanken und Images) und den
# Wegwerf-Schluessel. Keine Kundendaten werden beruehrt: weggeworfen wird nur
# die Datenbank der eigenen Kennung.
#
# Aufruf vom Arbeitsrechner:
#   ssh -f -N -L 8443:localhost:443 arasul@192.168.0.197
#   ARASUL_PASSWORT=... ARASUL_GERAET=arasul@192.168.0.197 \
#     bash scripts/test/app-datenbank-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-daten"
APP="${ARASUL_PROBE_APP:-probe-j35-db}"
GERAET="${ARASUL_GERAET:?ARASUL_GERAET (ssh-Ziel) fehlt: die Datenbank wird am Geraet weggeworfen}"
GEDULD=900

gruen=0
rot=0
pruefe() {
  local was="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "ja" ]; then
    gruen=$((gruen + 1))
    printf 'gruen  %s%s\n' "$was" "${detail:+  ($detail)}"
  else
    rot=$((rot + 1))
    printf 'ROT    %s%s\n' "$was" "${detail:+  ($detail)}"
  fi
}

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else (json.dumps(d) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

ARBEIT="$(mktemp -d)"
SCHLUESSEL=""
KEY_ID=""
TOK=""
aufraeumen() {
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  %s entfernt, Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

stand_test() {
  curl -sk --max-time 30 -H "authorization: Bearer $TOK" "$BASIS/api/apps/$APP" |
    python3 -c 'import sys,json
try: s = json.load(sys.stdin)["data"]["staende"]["test"]
except Exception: print("?|?|?"); raise SystemExit
b = s.get("backend") or {}
print("%s|%s|%s" % (json.dumps(s.get("lieferbar")), b.get("gesundheit"), s.get("mangel") or ""))'
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 $GERAET"
  exit 1
fi

echo "=== Abnahme: eine App ohne ihre Datenbank ist krank (J35) gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && exit 1

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme J35 (App ohne Datenbank)","allowed_endpoints":["app:deploy"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld data.api_key)
[ -z "$SCHLUESSEL" ] && SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld data.key_id)
[ -z "$KEY_ID" ] && KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && exit 1

# --- 1. Einspielen: der Stand ist lieferbar ----------------------------------
mkdir -p "$ARBEIT/paket"
cp -R "$QUELLE/backend" "$QUELLE/flows" "$ARBEIT/paket/"
python3 - "$QUELLE/app.json" "$ARBEIT/paket/app.json" "$APP" <<'PY'
import json, sys
quelle, ziel, kennung = sys.argv[1:4]
m = json.load(open(quelle))
m["id"] = kennung
m["backend"]["image"] = "arasul-%s:%s" % (kennung, m["version"])
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ARBEIT/paket" .
CODE=$(curl -sk -o "$ARBEIT/antwort" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$ARBEIT/paket.tgz" "$BASIS/api/v1/external/apps")
pruefe "$APP in den Teststand eingespielt" "$([ "$CODE" = "201" ] || [ "$CODE" = "200" ] && echo ja || echo nein)" "HTTP $CODE"

# Warten, bis der Container seine eigene Pruefung besteht.
ende=$((SECONDS + 240))
while [ "$SECONDS" -lt "$ende" ]; do
  IFS='|' read -r lieferbar gesundheit mangel <<<"$(stand_test)"
  [ "$gesundheit" = "healthy" ] && break
  sleep 5
done
pruefe 'mit Datenbank: lieferbar' "$([ "$lieferbar" = "true" ] && echo ja || echo nein)" \
  "lieferbar=$lieferbar gesundheit=$gesundheit ${mangel:+mangel=$mangel}"

# --- 2. Die Datenbank faellt weg: der Stand ist krank -----------------------
DBNAME="arasul_app_$(printf '%s' "$APP" | tr '-' '_')_test"
# shellcheck disable=SC2029  # der Name soll hier expandiert werden
ssh -o BatchMode=yes "$GERAET" \
  "docker exec postgres-db psql -U arasul -d arasul_db -qAt -c 'DROP DATABASE \"$DBNAME\" WITH (FORCE)'" \
  >/dev/null 2>&1
DA=$(ssh -o BatchMode=yes "$GERAET" \
  "docker exec postgres-db psql -U arasul -d arasul_db -qAt -c \"SELECT count(*) FROM pg_database WHERE datname = '$DBNAME'\"" 2>/dev/null)
pruefe "die Datenbank $DBNAME ist weg" "$([ "$DA" = "0" ] && echo ja || echo nein)" "pg_database: $DA"

IFS='|' read -r lieferbar gesundheit mangel <<<"$(stand_test)"
pruefe 'ohne Datenbank: NICHT lieferbar' "$([ "$lieferbar" = "false" ] && echo ja || echo nein)" \
  "lieferbar=$lieferbar gesundheit=$gesundheit"
pruefe 'der Mangel nennt die Datenbank' "$(grep -q 'Datenbank dieser App fehlt' <<<"$mangel" && echo ja || echo nein)" \
  "$mangel"

echo
echo "$gruen gruen, $rot rot"
[ "$rot" -eq 0 ]
