#!/bin/bash
# =============================================================================
# Abnahme M5: Das Kit liest das Protokoll einer App, ohne SSH
# =============================================================================
# Die Abnahme des Auftrags app-protokoll-abrufen (06.10.2026). Wer im Teststand
# eine leere Seite oder einen 502 sieht, braucht die letzten Zeilen des
# App-Containers; in einer Kanzlei hat niemand SSH. Seitdem gibt es
# `GET /api/v1/external/apps/:id/protokoll` mit dem Bereich `app:deploy`.
#
# Probe-App `tests/probe-protokoll` unter `probe-protokoll-<STEMPEL>`: sie
# schreibt beim Start den Satz „Probe-Protokoll <STEMPEL>: der Container ist
# gestartet." und absichtlich ihre Geheimnisse (Schlüssel, Datenbankadresse,
# Passwort, einen eigenen Wert aus `backend.umgebung`).
#
#   KONTRAKT   nennt den Endpunkt mit `app:deploy`.
#   SATZ       der bekannte Satz mit dem Stempel steht im Protokoll des
#              Teststandes, der Container läuft.
#   GEHEIM     kein Wert aus der Umgebung steht in der Antwort; mit
#              ARASUL_GERAET zusätzlich gegen die echte Umgebung aus
#              `docker inspect` geprüft (und dagegen, dass das rohe Protokoll
#              sie wirklich enthält -- sonst misst die Prüfung nichts).
#   GRENZEN    `zeilen=3` gibt höchstens drei, `zeilen=5000` ist 400, der
#              Livestand ohne Container 404, ein Schlüssel ohne `app:deploy` 403.
#
# Aufruf vom Arbeitsrechner, als probe-admin (NIE als admin):
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_GERAET=jetson ARASUL_STEMPEL=1006 bash scripts/test/protokoll-abnahme.sh
#
# WAS ES ANLEGT, RÄUMT ES WEG: die App (samt Image und Ordnern) und zwei
# Wegwerf-Schlüssel.
#
# Rückgabe 0, wenn jede Prüfung grün war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:-}"
QUELLE="$WURZEL/tests/probe-protokoll"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="probe-protokoll-$STEMPEL"
GEHEIM="partner-geheimnis-$STEMPEL-$(date +%s)"
SATZ="Probe-Protokoll $STEMPEL: der Container ist gestartet."
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
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }
am_geraet() { ssh -o BatchMode=yes "$GERAET" "$@"; }

ARBEIT="$(mktemp -d)"
TOK=""
SCHLUESSEL=""
KEY_ID=""
FREMD=""
FREMD_ID=""
aufraeumen() {
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  for id in "$KEY_ID" "$FREMD_ID"; do
    [ -n "$id" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/v1/external/api-keys/$id"
  done
  rm -rf "$ARBEIT"
  printf 'aufgeräumt  %s entfernt, Wegwerf-Schlüssel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else (json.dumps(d, ensure_ascii=False) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

# schluessel <name> <bereiche-json> -- legt einen Wegwerf-Schlüssel an, "<schluessel> <id>"
schluessel() {
  local antwort
  antwort=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
    -H 'content-type: application/json' \
    -d "{\"name\":\"$1\",\"allowed_endpoints\":$2}" "$BASIS/api/v1/external/api-keys")
  # Die Antwort steht ohne Umschlag `data` (externalApi.js, Schlüssel anlegen).
  printf '%s %s\n' "$(printf '%s' "$antwort" | feld api_key)" \
    "$(printf '%s' "$antwort" | feld key_id)"
}

# protokoll <schluessel> <abfrage> -- setzt $CODE, Rumpf in $ARBEIT/antwort
protokoll() {
  CODE=$(curl -sk -o "$ARBEIT/antwort" -w '%{http_code}' --max-time 60 \
    -H "x-api-key: $1" "$BASIS/api/v1/external/apps/$APP/protokoll${2:+?$2}")
}

if [ "${ARASUL_BENUTZER:-}" = "admin" ]; then
  echo "Nie das Konto admin: das ist ein echtes Konto. probe-admin nehmen."
  exit 1
fi
if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Gerät unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 <gerät>"
  exit 1
fi

echo "=== Abnahme: Protokoll einer App ohne SSH (M5) gegen $BASIS, App $APP ==="
echo

TOK=$(arasul_token)
pruefe 'Anmeldung' "$([ -n "$TOK" ] && echo ja || echo nein)" "als $ARASUL_BENUTZER"
[ -z "$TOK" ] && exit 1

read -r SCHLUESSEL KEY_ID < <(schluessel "Abnahme Protokoll $STEMPEL" '["app:deploy"]')
pruefe 'Wegwerf-Schlüssel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && exit 1

# --- KONTRAKT ----------------------------------------------------------------
BEREICH=$(curl -sk --max-time 30 -H "x-api-key: $SCHLUESSEL" "$BASIS/api/v1/external/contract" |
  python3 -c 'import sys,json
try: e = json.load(sys.stdin)["data"]["endpunkte"]
except Exception: e = []
print(next((x.get("bereich") or "" for x in e if x.get("verb") == "GET" and x.get("pfad","").startswith("/api/v1/external/apps/:id/protokoll")), ""))')
pruefe 'der Kontrakt nennt GET apps/:id/protokoll mit app:deploy' "$(ja_wenn "$BEREICH" app:deploy)" "bereich=${BEREICH:-fehlt}"

# --- Die Probe-App in den Teststand -------------------------------------------
mkdir -p "$ARBEIT/paket"
cp -R "$QUELLE/backend" "$ARBEIT/paket/"
python3 - "$QUELLE/app.json" "$ARBEIT/paket/app.json" "$APP" "$STEMPEL" "$GEHEIM" <<'PY'
import json, sys
quelle, ziel, kennung, stempel, geheim = sys.argv[1:6]
m = json.load(open(quelle))
m["id"] = kennung
m["backend"]["image"] = "arasul-%s:%s" % (kennung, m["version"])
m["backend"]["umgebung"] = {"PROBE_STEMPEL": stempel, "PROBE_GEHEIM": geheim}
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ARBEIT/paket" .
CODE=$(curl -sk -o "$ARBEIT/eingespielt" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$ARBEIT/paket.tgz" "$BASIS/api/v1/external/apps")
pruefe "$APP in den Teststand eingespielt" \
  "$([ "$CODE" = "201" ] || [ "$CODE" = "200" ] && echo ja || echo nein)" "HTTP $CODE"
[ "$CODE" = "201" ] || [ "$CODE" = "200" ] || { head -c 600 "$ARBEIT/eingespielt"; echo; exit 1; }

# Der Satz kommt, sobald Node läuft; höchstens eine Minute warten.
ende=$((SECONDS + 60))
while [ "$SECONDS" -lt "$ende" ]; do
  protokoll "$SCHLUESSEL" "stand=test&zeilen=100"
  [ "$CODE" = "200" ] && grep -qF "$SATZ" "$ARBEIT/antwort" && break
  sleep 3
done

# --- SATZ --------------------------------------------------------------------
pruefe 'GET protokoll antwortet 200' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe 'der bekannte Satz mit dem Stempel steht darin' \
  "$(grep -qF "$SATZ" "$ARBEIT/antwort" && echo ja || echo nein)" "$SATZ"
pruefe 'der Container läuft' "$(ja_wenn "$(feld data.laeuft <"$ARBEIT/antwort")" true)" \
  "container=$(feld data.container <"$ARBEIT/antwort") neustarts=$(feld data.neustarts <"$ARBEIT/antwort")"
ERSTE=$(python3 -c 'import sys,json; print(json.load(open(sys.argv[1]))["data"]["zeilen"][0][:30])' "$ARBEIT/antwort" 2>/dev/null)
pruefe 'jede Zeile beginnt mit einem Zeitstempel' \
  "$(printf '%s' "$ERSTE" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' && echo ja || echo nein)" "$ERSTE"

# --- GEHEIM ------------------------------------------------------------------
pruefe 'der eigene Wert aus backend.umgebung ist geschwärzt' \
  "$(grep -qF "$GEHEIM" "$ARBEIT/antwort" && echo nein || echo ja)"
ANZAHL=$(feld data.geschwaerzt <"$ARBEIT/antwort")
pruefe 'Schlüssel, Datenbankadresse, Passwort und eigener Wert: vier Stellen geschwärzt' \
  "$([ "${ANZAHL:-0}" -ge 4 ] && echo ja || echo nein)" "geschwaerzt=$ANZAHL"
pruefe 'die Zeilen mit den Geheimnissen stehen da, nur ohne Wert' \
  "$(python3 -c 'import sys,json
z = json.load(open(sys.argv[1]))["data"]["zeilen"]
want = ["Schluessel [geschwärzt]", "Passwort [geschwärzt]", "Eigenes Geheimnis [geschwärzt]"]
print("ja" if all(any(w in x for x in z) for w in want) else "nein")' "$ARBEIT/antwort" 2>/dev/null)"
pruefe 'die harmlose Basis-Adresse bleibt lesbar' \
  "$(grep -qF 'Basis http://' "$ARBEIT/antwort" && echo ja || echo nein)"

if [ -n "$GERAET" ]; then
  CONTAINER="arasul-app-$APP-test"
  am_geraet "docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $CONTAINER" \
    >"$ARBEIT/env" 2>/dev/null
  am_geraet "docker logs $CONTAINER" >"$ARBEIT/roh" 2>&1
  LECK=$(python3 - "$ARBEIT/env" "$ARBEIT/antwort" "$ARBEIT/roh" <<'PY'
import sys, json
from urllib.parse import urlsplit, unquote
env, antwort, roh = sys.argv[1:4]
text = json.dumps(json.load(open(antwort))["data"]["zeilen"], ensure_ascii=False)
roh = open(roh, errors="replace").read()
harmlos = {"PATH", "HOME", "HOSTNAME", "LANG", "LC_ALL", "TERM", "TZ", "NODE_ENV", "PORT",
           "NO_PROXY", "no_proxy", "ARASUL_API_URL"}
werte = []
for zeile in open(env):
    name, _, wert = zeile.rstrip("\n").partition("=")
    if not name or name in harmlos or len(wert) < 8:
        continue
    werte.append((name, wert))
    try:
        pw = unquote(urlsplit(wert).password or "")
        if len(pw) >= 8:
            werte.append((name + " (Passwort)", pw))
    except ValueError:
        pass
im_roh = [n for n, w in werte if w in roh]
leck = [n for n, w in werte if w in text]
print("%d|%s|%s" % (len(werte), ",".join(im_roh), ",".join(leck)))
PY
)
  IFS='|' read -r GEPRUEFT IM_ROH GELECKT <<<"$LECK"
  pruefe 'das rohe Protokoll am Gerät enthält die Geheimnisse (sonst misst die Prüfung nichts)' \
    "$(printf '%s' "$IM_ROH" | grep -q ARASUL_API_SCHLUESSEL && printf '%s' "$IM_ROH" | grep -q ARASUL_DB_URL && echo ja || echo nein)" \
    "im Rohtext: ${IM_ROH:-keines}"
  pruefe 'kein Wert aus der echten Umgebung (docker inspect) steht in der Antwort' \
    "$([ -n "$GEPRUEFT" ] && [ "$GEPRUEFT" -gt 0 ] && [ -z "$GELECKT" ] && echo ja || echo nein)" \
    "$GEPRUEFT Werte geprüft${GELECKT:+, durchgerutscht: $GELECKT}"
else
  echo "hinweis  ohne ARASUL_GERAET kein Abgleich mit docker inspect"
fi

# --- GRENZEN -----------------------------------------------------------------
protokoll "$SCHLUESSEL" "zeilen=3"
N=$(python3 -c 'import sys,json; print(len(json.load(open(sys.argv[1]))["data"]["zeilen"]))' "$ARBEIT/antwort" 2>/dev/null)
pruefe 'zeilen=3 gibt höchstens drei Zeilen' "$([ "$CODE" = 200 ] && [ "${N:-9}" -le 3 ] && echo ja || echo nein)" "HTTP $CODE, $N Zeilen"
protokoll "$SCHLUESSEL" "zeilen=5000"
pruefe 'zeilen=5000 ist über der Obergrenze: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
protokoll "$SCHLUESSEL" "stand=live"
pruefe 'der Livestand ohne Container: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

read -r FREMD FREMD_ID < <(schluessel "Abnahme Protokoll $STEMPEL ohne deploy" '["llm:status"]')
if [ -n "$FREMD" ]; then
  protokoll "$FREMD" ""
  pruefe 'ein Schlüssel ohne app:deploy bekommt 403' "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
else
  pruefe 'ein Schlüssel ohne app:deploy bekommt 403' nein 'Schlüssel nicht angelegt'
fi

echo
echo "$gruen grün, $rot rot"
[ "$rot" -eq 0 ]
