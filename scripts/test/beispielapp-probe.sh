#!/bin/bash
# =============================================================================
# Die Beispielapp als eigene Probe mit Stempel (M5, Auftrag app-protokoll-abrufen)
# =============================================================================
# Die Abnahmen `apps`, `app-anmeldung` und `rueckmeldung` setzten bis zum
# 06.10.2026 voraus, dass `beispielapp` am Gerät eingespielt ist
# (`beispielapp.sh einspielen`, auf dem Gerät, von Hand). Am Orin war sie es
# nicht, und alle drei meldeten etwas über den Messaufbau statt über das Gerät.
# Jetzt spielt jede Abnahme sich die Beispielapp SELBST ein, unter einer
# eigenen Kennung `probe-beispiel-<STEMPEL>`, über den Weg des Kits
# (Wegwerf-Schlüssel mit `app:deploy`, Paket, Teststand, live schalten), und
# entfernt sie am Ende samt Image, Ordnern und Schlüssel. Kein SSH.
#
# Wer eine schon eingespielte App messen will, setzt `ARASUL_BEISPIELAPP=<id>`;
# dann wird nichts eingespielt und nichts entfernt.
#
# ZWEI ARTEN, ES ZU BENUTZEN
#
#   Eingebunden (bash-Abnahmen):
#     source "$WURZEL/scripts/test/beispielapp-probe.sh"
#     beispielapp_bereitstellen "$TOK" || exit 1    # setzt BEISPIEL_APP
#     ...                                           # im trap:
#     beispielapp_wegraeumen "$TOK"
#
#   Aufgerufen (die Browser-Abnahme in Node):
#     bash scripts/test/beispielapp-probe.sh einspielen
#       -> letzte Zeile der Ausgabe: {"app":…,"key_id":…,"schluessel":…,"eigen":…}
#     BEISPIEL_APP=… BEISPIEL_KEY_ID=… BEISPIEL_SCHLUESSEL=… BEISPIEL_EIGEN=ja \
#       bash scripts/test/beispielapp-probe.sh entfernen
#
# Erwartet `anmeldung.sh` (ARASUL_URL, arasul_token), beim Aufruf bindet es
# sich die selbst ein. Meldungen gehen nach stderr, damit stdout frei bleibt.
# =============================================================================

_BEISPIEL_WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BEISPIEL_APP="${BEISPIEL_APP:-}"
BEISPIEL_KEY_ID="${BEISPIEL_KEY_ID:-}"
BEISPIEL_SCHLUESSEL="${BEISPIEL_SCHLUESSEL:-}"
BEISPIEL_EIGEN="${BEISPIEL_EIGEN:-nein}"

_beispiel_feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else (json.dumps(d) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

# beispielapp_bereitstellen <token> -- Rückgabe 0, wenn BEISPIEL_APP live steht.
beispielapp_bereitstellen() {
  local tok="$1" basis="${ARASUL_URL:?}" arbeit antwort code stempel
  if [ -n "${ARASUL_BEISPIELAPP:-}" ]; then
    BEISPIEL_APP="$ARASUL_BEISPIELAPP"
    BEISPIEL_EIGEN=nein
    echo "Beispielapp: die vorhandene $BEISPIEL_APP (ARASUL_BEISPIELAPP), nichts eingespielt" >&2
    return 0
  fi
  stempel="${ARASUL_STEMPEL:-$(date +%m%d)}-$(date +%H%M%S)"
  BEISPIEL_APP="probe-beispiel-$stempel"

  antwort=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $tok" \
    -H 'content-type: application/json' \
    -d "{\"name\":\"Abnahme Beispielapp $stempel\",\"allowed_endpoints\":[\"app:deploy\"]}" \
    "$basis/api/v1/external/api-keys")
  BEISPIEL_SCHLUESSEL=$(printf '%s' "$antwort" | _beispiel_feld api_key)
  BEISPIEL_KEY_ID=$(printf '%s' "$antwort" | _beispiel_feld key_id)
  if [ -z "$BEISPIEL_SCHLUESSEL" ]; then
    echo "Beispielapp: kein Wegwerf-Schlüssel mit app:deploy zu bekommen" >&2
    return 1
  fi
  BEISPIEL_EIGEN=ja

  arbeit="$(mktemp -d)"
  mkdir -p "$arbeit/paket"
  cp -R "$_BEISPIEL_WURZEL/tests/beispielapp/frontend" "$_BEISPIEL_WURZEL/tests/beispielapp/backend" \
    "$_BEISPIEL_WURZEL/tests/beispielapp/flows" "$arbeit/paket/"
  bash "$_BEISPIEL_WURZEL/scripts/util/marken-beilegen.sh" "$arbeit/paket/frontend" >/dev/null || {
    rm -rf "$arbeit"
    return 1
  }
  python3 - "$_BEISPIEL_WURZEL/tests/beispielapp/app.json" "$arbeit/paket/app.json" \
    "$BEISPIEL_APP" "$stempel" <<'PY'
import json, sys
quelle, ziel, kennung, stempel = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["name"] = "Beispielapp (Probe %s)" % stempel
m["backend"]["image"] = "arasul-%s:%s" % (kennung, m["version"])
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$arbeit/paket.tgz" -C "$arbeit/paket" .

  code=$(curl -sk -o "$arbeit/antwort" -w '%{http_code}' --max-time 900 \
    -H "x-api-key: $BEISPIEL_SCHLUESSEL" -F "paket=@$arbeit/paket.tgz" "$basis/api/v1/external/apps")
  if [ "$code" != "201" ] && [ "$code" != "200" ]; then
    echo "Beispielapp: $BEISPIEL_APP nicht eingespielt (HTTP $code): $(head -c 400 "$arbeit/antwort")" >&2
    rm -rf "$arbeit"
    return 1
  fi
  code=$(curl -sk -o "$arbeit/antwort" -w '%{http_code}' --max-time 600 -X POST \
    -H "x-api-key: $BEISPIEL_SCHLUESSEL" -H 'content-type: application/json' \
    -d '{"ziel":"live"}' "$basis/api/v1/external/apps/$BEISPIEL_APP/schalten")
  if [ "$code" != "200" ]; then
    echo "Beispielapp: $BEISPIEL_APP nicht live geschaltet (HTTP $code): $(head -c 400 "$arbeit/antwort")" >&2
    rm -rf "$arbeit"
    return 1
  fi
  rm -rf "$arbeit"

  # Der Container des Livestandes soll laufen, bevor die Abnahme fragt.
  local ende=$((SECONDS + 180)) laeuft=""
  while [ "$SECONDS" -lt "$ende" ]; do
    laeuft=$(curl -sk --max-time 20 -H "x-api-key: $BEISPIEL_SCHLUESSEL" \
      "$basis/api/v1/external/apps/$BEISPIEL_APP" | _beispiel_feld data.staende.live.backend.laeuft)
    [ "$laeuft" = "true" ] && break
    sleep 3
  done
  echo "Beispielapp: $BEISPIEL_APP eingespielt und live (Container läuft: ${laeuft:-?})" >&2
  return 0
}

# beispielapp_wegraeumen <token> -- nur, was bereitstellen selbst angelegt hat.
beispielapp_wegraeumen() {
  local tok="${1:-}" basis="${ARASUL_URL:?}" code=""
  [ "$BEISPIEL_EIGEN" = "ja" ] || return 0
  if [ -n "$BEISPIEL_SCHLUESSEL" ] && [ -n "$BEISPIEL_APP" ]; then
    code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 300 -X DELETE \
      -H "x-api-key: $BEISPIEL_SCHLUESSEL" \
      "$basis/api/v1/external/apps/$BEISPIEL_APP?bestaetigung=$BEISPIEL_APP&dateien=true")
  fi
  if [ -n "$BEISPIEL_KEY_ID" ] && [ -n "$tok" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $tok" \
      "$basis/api/v1/external/api-keys/$BEISPIEL_KEY_ID"
  fi
  echo "aufgeräumt  $BEISPIEL_APP entfernt (HTTP ${code:-?}), Wegwerf-Schlüssel widerrufen" >&2
  BEISPIEL_EIGEN=nein
}

# --- Aufgerufen statt eingebunden ----------------------------------------------
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -uo pipefail
  # shellcheck source=scripts/test/anmeldung.sh
  source "$_BEISPIEL_WURZEL/scripts/test/anmeldung.sh"
  _tok=$(arasul_token)
  if [ -z "$_tok" ]; then
    echo "Keine Anmeldung an $ARASUL_URL (HTTP $(arasul_anmeldecode))." >&2
    exit 1
  fi
  case "${1:-}" in
    einspielen)
      if beispielapp_bereitstellen "$_tok"; then
        python3 -c 'import json,sys; print(json.dumps(dict(zip(["app","key_id","schluessel","eigen"], sys.argv[1:]))))' \
          "$BEISPIEL_APP" "$BEISPIEL_KEY_ID" "$BEISPIEL_SCHLUESSEL" "$BEISPIEL_EIGEN"
      else
        beispielapp_wegraeumen "$_tok"
        exit 1
      fi
      ;;
    entfernen) beispielapp_wegraeumen "$_tok" ;;
    *)
      echo "Aufruf: $0 einspielen|entfernen" >&2
      exit 2
      ;;
  esac
fi
