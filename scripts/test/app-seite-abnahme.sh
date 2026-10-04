#!/bin/bash
# =============================================================================
# app-seite-abnahme.sh — eine Seite je App in der Verwaltung, am Orin (M5)
# =============================================================================
# Auftrag verwaltung-app-seite (04.10.2026). Gemessen wird:
#
#   SEITE       Jede App hat in der Verwaltung genau eine Seite mit den Blöcken
#               Zustand, Fassungen, Personen, Freigabestufen, Flows,
#               Verbindungen, in dieser Reihenfolge, unter einer eigenen
#               Adresse. Einen Bereich „Verbindungen" gibt es nicht mehr, die
#               alte Adresse landet bei den Apps (Browser-Teil).
#   TEST        Eine Testperson sieht die App in ihrer Aktivitätsleiste als
#               „(Test) Name" und landet dort in der Testfassung; eine Person
#               ohne Test sieht nur die Livefassung und bekommt auf die
#               Testfassung 403.
#   AKTIV       Ein Flow lässt sich mit „aktiv" aus- und einschalten (über die
#               Schnittstelle UND im Browser). Ein inaktiver Flow startet nicht:
#               das Backend weist ab (409 FLOW_INAKTIV), es entsteht kein Lauf,
#               in Test und Live. Wieder an, startet er.
#   VERBINDUNG  Die Probe-App trägt `example.org` und `localtest.me` ein. Aus
#               ihrem Container: example.org geht hinaus (genutzt), example.com
#               (nicht eingetragen) wird abgewiesen (keine Störung, grau),
#               localtest.me zeigt auf 127.0.0.1 und wird trotz Eintrag
#               abgewiesen: `stoerung`, das einzige Rot.
#
# Konten: drei VORHANDENE Probekonten, nie `admin`, keine neuen. Passwörter nur
# zur Laufzeit, nie in Dateien:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   ARASUL_B=probe-j36-b ARASUL_B_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-b')" \
#   ARASUL_GERAET=jetson ARASUL_STEMPEL=1004 ARASUL_BILDER=1 \
#   bash scripts/test/app-seite-abnahme.sh
#
# WAS ES ANLEGT, RÄUMT ES WEG: die App `probe-seite-<STEMPEL>` (aus
# `tests/probe-stufen`, samt Image, Ordnern, Läufen und offenen Freigaben),
# ihre Freigaben an die drei Konten, ihre Zähler in `ausgang_zaehler` und den
# Wegwerf-Schlüssel. Andere Apps fasst es nicht an.
#
# Rückgabe 0, wenn jede Prüfung grün war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:-jetson}"
QUELLE="$WURZEL/tests/probe-stufen"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="probe-seite-$STEMPEL"
NAME="Probe: Seite ($STEMPEL)"
FLOW="zwei-stufen"
TEXT_NEU="Neu: der Beleg zeigt seine Nummer im Titel."
GEDULD=900
HALT_GEDULD=240

A="${ARASUL_A:-}"
A_PASS="${ARASUL_A_PASSWORT:-}"
B="${ARASUL_B:-}"
B_PASS="${ARASUL_B_PASSWORT:-}"

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

if [ -z "$A" ] || [ -z "$A_PASS" ] || [ -z "$B" ] || [ -z "$B_PASS" ]; then
  echo "ARASUL_A, ARASUL_A_PASSWORT, ARASUL_B, ARASUL_B_PASSWORT fehlen (vorhandene Probekonten)."
  exit 2
fi
for wer in "$ARASUL_BENUTZER" "$A" "$B"; do
  if [ "$wer" = "admin" ]; then
    echo "Nie das Konto admin: das ist Koljas Konto. Probekonten nehmen."
    exit 2
  fi
done

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""

# ruf <token|schluessel:…> <verb> <pfad> [leib] -- setzt $CODE, Rumpf in $RUMPF_DATEI
ruf() {
  local wer="$1" verb="$2" pfad="$3" leib="${4:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD")
  case "$wer" in
    schluessel:*) argumente+=(-H "x-api-key: ${wer#schluessel:}") ;;
    *) argumente+=(-H "authorization: Bearer $wer") ;;
  esac
  [ -n "$leib" ] && argumente+=(-H 'content-type: application/json' -d "$leib")
  CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    if isinstance(d, list):
        try: d = d[int(k)]
        except Exception: d = None
    elif isinstance(d, dict): d = d.get(k)
    else: d = None
    if d is None: break
print("" if d is None else (json.dumps(d, ensure_ascii=False) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

anmelden() {
  curl -sk -X POST -H 'content-type: application/json' --max-time 30 \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2")" \
    "$BASIS/api/auth/login" | feld token
}

baue_paket() { # version
  local version="$1" ordner="$ARBEIT/paket-$1"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$version" "$NAME" <<'PY'
import json, sys
quelle, ziel, kennung, version, name = sys.argv[1:6]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = name
m["beschreibung"] = "Messgeraet fuer scripts/test/app-seite-abnahme.sh (M5)."
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
m["backend"]["umgebung"]["PROBE_VERSION"] = version
# example.org geht hinaus, localtest.me zeigt auf 127.0.0.1 und wird trotz
# Eintrag abgewiesen: die eine Stoerung, die rot sein darf.
m["verbindungen"] = ["example.org", "localtest.me"]
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket-$version.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket-$version.tgz"
}

ausrollen() { # version [aenderungstext]
  local paket text="${2:-}"
  local -a mit_text=()
  paket=$(baue_paket "$1") || return 1
  [ -n "$text" ] && mit_text=(-F "aenderungstext=$text")
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$paket" "${mit_text[@]}" "$BASIS/api/v1/external/apps")
}

laeufe() { # Zahl der Läufe der App
  curl -sk --max-time 30 -H "authorization: Bearer $TOK" "$BASIS/api/apps/$APP/laeufe?limit=100" |
    python3 -c 'import sys,json
try: print(len(json.load(sys.stdin)["data"]))
except Exception: print("")' 2>/dev/null
}

flow_feld() { # stand feld
  curl -sk --max-time 30 -H "authorization: Bearer $TOK" "$BASIS/api/apps/$APP" |
    python3 -c 'import sys,json
stand, feld, flow = sys.argv[1:4]
try: d = json.load(sys.stdin)["data"]["staende"][stand]
except Exception: print(""); raise SystemExit
f = next((x for x in (d or {}).get("flows", []) if x["name"] == flow), None)
v = None if f is None else f.get(feld)
print("" if v is None else (json.dumps(v, ensure_ascii=False) if isinstance(v,(bool,dict,list)) else v))' "$1" "$2" "$FLOW" 2>/dev/null
}

bilder() { # phase
  [ "${ARASUL_BILDER:-}" = "1" ] || return 0
  ARASUL_A="$A" ARASUL_A_PASSWORT="$A_PASS" ARASUL_B="$B" ARASUL_B_PASSWORT="$B_PASS" \
    ARASUL_SEITE_APP="$APP" ARASUL_SEITE_NAME="$NAME" ARASUL_SEITE_FLOW="$FLOW" \
    ARASUL_SEITE_TEXT="$TEXT_NEU" \
    node "$WURZEL/scripts/test/app-seite-bilder.mjs" "$1" | sed 's/^/  bild /'
  local ergebnis="${PIPESTATUS[0]}"
  pruefe "Browser: $1" "$(ja_wenn "$ergebnis" 0)"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Gerät unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 $GERAET"
  exit 1
fi

echo "=== Abnahme M5: eine Seite je App, $APP gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && exit 1
TOK_A=$(anmelden "$A" "$A_PASS")
TOK_B=$(anmelden "$B" "$B_PASS")
pruefe "$A und $B melden sich an" "$([ -n "$TOK_A" ] && [ -n "$TOK_B" ] && echo ja || echo nein)"
{ [ -z "$TOK_A" ] || [ -z "$TOK_B" ]; } && exit 1

ruf "$TOK" GET /api/benutzer
benutzer_feld() {
  rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
print(next((str(b[sys.argv[2]]) for b in d if b["username"] == sys.argv[1]), ""))' "$1" "$2"
}
ID_ADMIN=$(benutzer_feld "$ARASUL_BENUTZER" id)
ID_A=$(benutzer_feld "$A" id)
ID_B=$(benutzer_feld "$B" id)
ROLLE_B=$(benutzer_feld "$B" role)
pruefe 'Drei vorhandene Probekonten, keine neuen' \
  "$([ -n "$ID_ADMIN" ] && [ -n "$ID_A" ] && [ -n "$ID_B" ] && echo ja || echo nein)" \
  "$ARASUL_BENUTZER=$ID_ADMIN $A=$ID_A $B=$ID_B"

SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=()
aufraeumen() {
  local id
  for id in "${FREIGEGEBEN[@]:-}"; do
    [ -n "$id" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/freigaben/$APP/$id"
  done
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  # Die Zähler des Ausgangs gehören der Probe-App und gehen mit ihr.
  am_geraet "docker exec postgres-db psql -U arasul -d arasul_db -qAt -c \"DELETE FROM public.ausgang_zaehler WHERE app_id = '$APP'\"" >/dev/null 2>&1
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  Freigaben zurückgenommen, %s entfernt (mit Ordnern und Zählern), Wegwerf-Schlüssel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 App-Seite ($APP)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schlüssel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 1. Die Probe-App: 1.0.0 live, 1.1.0 mit Änderungstext im Test ---------------
ausrollen 1.0.0
pruefe "$APP 1.0.0 in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe '1.0.0 live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ausrollen 1.1.0 "$TEXT_NEU"
pruefe "$APP 1.1.0 mit Änderungstext in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }

# probe-admin und B: Livefassung; A: Testperson.
codes=""
for paar in "$ID_ADMIN:live" "$ID_A:test" "$ID_B:live"; do
  ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":${paar%%:*},\"stand\":\"${paar##*:}\"}"
  codes="$codes $CODE"
  [[ "$CODE" =~ ^20[01]$ ]] && FREIGEGEBEN+=("${paar%%:*}")
done
pruefe "Zugang: $ARASUL_BENUTZER und $B Live, $A Testperson" \
  "$([ "${#FREIGEGEBEN[@]}" = 3 ] && echo ja || echo nein)" "HTTP$codes"

if arasul_warte_auf_app "/apps/$APP/api/gesund" 240 "$TOK_A" &&
  arasul_warte_auf_app "/apps/$APP/test/api/gesund" 240 "$TOK_A"; then
  pruefe 'Live- und Testfassung antworten' ja
else
  pruefe 'Live- und Testfassung antworten' nein 'Zeitgrenze 240s'
  exit 1
fi

ruf "$TOK" GET "/api/apps/$APP"
pruefe 'GET /api/apps/:id: live 1.0.0, Test 1.1.0 mit Änderungstext' \
  "$([ "$(rumpf | feld data.staende.live.version)" = 1.0.0 ] && [ "$(rumpf | feld data.staende.test.version)" = 1.1.0 ] && [ "$(rumpf | feld data.staende.test.aenderungstext)" = "$TEXT_NEU" ] && echo ja || echo nein)"
pruefe 'Der Flow nennt Schritte, Auslöser und aktiv' \
  "$([ "$(flow_feld live aktiv)" = true ] && [ "$(flow_feld live schritte | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))')" = 2 ] && [ "$(flow_feld live ausloeser)" = '[{"typ": "hand"}]' ] && echo ja || echo nein)" \
  "aktiv=$(flow_feld live aktiv) ausloeser=$(flow_feld live ausloeser)"

# --- 2. Testpersonen ------------------------------------------------------------
meine() { # token -> "live,test" der App
  curl -sk --max-time 30 -H "authorization: Bearer $1" "$BASIS/api/apps/meine" |
    python3 -c 'import sys,json
try: d = json.load(sys.stdin)["data"]
except Exception: print("kein-ergebnis"); raise SystemExit
a = next((x for x in d if x["id"] == sys.argv[1]), None)
print("-" if a is None else ",".join(s for s in ("live","test") if a.get(s)))' "$APP"
}
pruefe "$A (Testperson) bekommt Live und Test" "$(ja_wenn "$(meine "$TOK_A")" live,test)" "$(meine "$TOK_A")"
pruefe "$B bekommt nur Live" "$(ja_wenn "$(meine "$TOK_B")" live)" "$(meine "$TOK_B")"
ruf "$TOK_B" GET "/apps/$APP/test/api/gesund"
pruefe "$B auf die Testfassung: 403" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"

# --- 3. aktiv: aus heißt, er startet nicht --------------------------------------
if [ "$ROLLE_B" != admin ]; then
  ruf "$TOK_B" PUT "/api/apps/$APP/flows/$FLOW/aktiv" '{"aktiv":false}'
  pruefe "$B (Mitarbeiter) darf keinen Flow ausschalten (403)" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
fi
ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/aktiv" '{"aktiv":"nein"}'
pruefe 'aktiv ohne Wahrheitswert: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
ruf "$TOK" PUT "/api/apps/$APP/flows/erfunden/aktiv" '{"aktiv":false}'
pruefe 'aktiv für einen Flow, den die App nicht hat: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/aktiv" '{"aktiv":false}'
pruefe 'Flow über die Schnittstelle ausgeschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe '… in Live und Test aus (eine Wahl je Flow)' \
  "$([ "$(flow_feld live aktiv)" = false ] && [ "$(flow_feld test aktiv)" = false ] && echo ja || echo nein)"

inaktiv_abgewiesen() { # pfad-praefix -> prüft 409 FLOW_INAKTIV und keinen neuen Lauf
  local vorher nachher
  vorher=$(laeufe)
  ruf "$TOK_A" POST "/apps/$APP$1/api/einreichen?beleg=1004"
  local fehlercode
  fehlercode=$(rumpf | feld fehler.code)
  sleep 2
  nachher=$(laeufe)
  pruefe "Inaktiv ($2): der Start bekommt 409 FLOW_INAKTIV" \
    "$([ "$CODE" = 409 ] && [ "$fehlercode" = FLOW_INAKTIV ] && echo ja || echo nein)" \
    "HTTP $CODE $fehlercode"
  pruefe "Inaktiv ($2): es entsteht kein Lauf" \
    "$([ -n "$vorher" ] && [ "$vorher" = "$nachher" ] && echo ja || echo nein)" "$vorher -> $nachher"
}
inaktiv_abgewiesen "" Live
inaktiv_abgewiesen "/test" Test

ruf "$TOK" PUT "/api/apps/$APP/flows/$FLOW/aktiv" '{"aktiv":true}'
pruefe 'Flow wieder eingeschaltet' \
  "$([ "$CODE" = 200 ] && [ "$(flow_feld live aktiv)" = true ] && echo ja || echo nein)" "HTTP $CODE"
vorher=$(laeufe)
ruf "$TOK_A" POST "/apps/$APP/api/einreichen?beleg=1004"
LAUF=$(rumpf | feld lauf)
pruefe 'Aktiv startet er wieder: ein Lauf entsteht' \
  "$([ -n "$LAUF" ] && [ "$(laeufe)" = $((vorher + 1)) ] && echo ja || echo nein)" "HTTP $CODE lauf=${LAUF:-—}"
ende=$((SECONDS + HALT_GEDULD))
status=""
while [ "$SECONDS" -lt "$ende" ] && [ -n "$LAUF" ]; do
  ruf "$TOK_A" GET "/apps/$APP/api/lauf?lauf=$LAUF"
  status=$(rumpf | feld status)
  [ "$status" = wartend ] && break
  case "$status" in fertig | fehler | abgebrochen | abgelaufen) break ;; esac
  sleep 2
done
pruefe '… und hält an der ersten Freigabe an (wartend)' "$(ja_wenn "$status" wartend)" "$status"

# --- 4. Verbindungen aus dem Container der Livefassung -------------------------
CONTAINER="arasul-app-$APP-live"
# Der Proxy holt Regeln alle zehn Sekunden: die neue App kennt er danach.
sleep 12
cat >"$ARBEIT/messen.js" <<'JS'
const http = require('http');
const proxy = new URL(process.env.HTTPS_PROXY);
const zugang = 'Basic ' + Buffer.from(decodeURIComponent(proxy.username) + ':' + proxy.password).toString('base64');
const ueberProxy = host =>
  new Promise(fertig => {
    const q = http.request({
      host: proxy.hostname, port: proxy.port, method: 'CONNECT', path: host + ':443',
      headers: { 'Proxy-Authorization': zugang, Host: host + ':443' },
      timeout: 15000, agent: new http.Agent(),
    });
    q.on('timeout', () => { q.destroy(); fertig(0); });
    q.on('error', () => fertig(0));
    q.on('connect', (res, sock) => { sock.destroy(); fertig(res.statusCode); });
    q.end();
  });
(async () => {
  const org = [await ueberProxy('example.org'), await ueberProxy('example.org')];
  const com = [await ueberProxy('example.com'), await ueberProxy('example.com'), await ueberProxy('example.com')];
  const lokal = [await ueberProxy('localtest.me')];
  console.log(JSON.stringify({ org, com, lokal }));
})();
JS
ERGEBNIS=$(am_geraet "docker exec -i -w /app $CONTAINER node -" <"$ARBEIT/messen.js" 2>"$ARBEIT/fehler")
[ -z "$ERGEBNIS" ] && cat "$ARBEIT/fehler"
pruefe 'Aus der App: example.org (eingetragen) geht hinaus' "$(ja_wenn "$(printf '%s' "$ERGEBNIS" | feld org.0)" 200)" "$ERGEBNIS"
pruefe 'Aus der App: example.com (nicht eingetragen) wird abgewiesen' "$(ja_wenn "$(printf '%s' "$ERGEBNIS" | feld com.0)" 403)"
pruefe 'Aus der App: localtest.me (eingetragen, zeigt ins Haus) wird abgewiesen' "$(ja_wenn "$(printf '%s' "$ERGEBNIS" | feld lokal.0)" 403)"

ausgang() {
  curl -sk --max-time 30 -H "authorization: Bearer $TOK" "$BASIS/api/ausgang" |
    python3 -c 'import sys,json
try: d = json.load(sys.stdin)["data"]
except Exception: print("kein-ergebnis"); raise SystemExit
a = next((x for x in d["apps"] if x["id"] == sys.argv[1]), None)
if not a: print("keine-app"); raise SystemExit
def z(l, h, mit=False):
    e = next((x for x in l if x["host"] == h), None)
    if not e: return "-"
    return "%s%s" % (e["anzahl"], ("/stoerung" if e.get("stoerung") else "/still") if mit else "")
print("|".join([z(a["genutzt"], "example.org"), z(a["abgewiesen"], "example.com", True), z(a["abgewiesen"], "localtest.me", True)]))' "$APP"
}
SOLL='2|3/still|1/stoerung'
ende=$((SECONDS + 30))
while [ "$SECONDS" -lt "$ende" ]; do
  [ "$(ausgang)" = "$SOLL" ] && break
  sleep 3
done
pruefe 'GET /api/ausgang: genutzt 2, fremd abgewiesen 3 (still), eingetragen abgewiesen 1 (Störung)' \
  "$(ja_wenn "$(ausgang)" "$SOLL")" "$(ausgang)"

# --- 5. Im Browser: die Seite, aktiv im Browser, (Test) in der Leiste ---------------
if [ "${ARASUL_BILDER:-}" = "1" ]; then
  bilder seite
  # Die Seite hat den Flow im Browser ausgeschaltet: das Backend weist ab.
  pruefe 'Im Browser ausgeschaltet: das Backend nennt den Flow aus' "$(ja_wenn "$(flow_feld live aktiv)" false)"
  ruf "$TOK_A" POST "/apps/$APP/api/einreichen?beleg=1004"
  pruefe '… und weist den Start ab (409 FLOW_INAKTIV)' \
    "$([ "$CODE" = 409 ] && [ "$(rumpf | feld fehler.code)" = FLOW_INAKTIV ] && echo ja || echo nein)" "HTTP $CODE"
  bilder einschalten
  pruefe 'Im Browser wieder eingeschaltet: das Backend nennt den Flow aktiv' "$(ja_wenn "$(flow_feld live aktiv)" true)"
  bilder testperson
fi

# --- 6. Aufräumen und nachsehen -------------------------------------------------
trap - EXIT
aufraeumen
RUMPF_DATEI="$(mktemp)"
pruefe "Nach dem Aufräumen sieht $A die App nicht mehr" "$(ja_wenn "$(meine "$TOK_A")" -)"
ruf "$TOK" GET "/api/apps/$APP"
pruefe 'Die App ist entfernt (404)' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
REST=$(am_geraet "docker exec dashboard-backend ls /arasul/apps" 2>/dev/null | grep -c "^$APP$")
pruefe 'Unter /arasul/apps bleibt kein Ordner der Probe-App' "$(ja_wenn "$REST" 0)"
ZAEHLER=$(am_geraet "docker exec postgres-db psql -U arasul -d arasul_db -qAt -c \"SELECT COUNT(*) FROM public.ausgang_zaehler WHERE app_id = '$APP'\"" 2>/dev/null | tr -d '\r')
pruefe 'Keine Zähler der Probe-App im Ausgang' "$(ja_wenn "$ZAEHLER" 0)" "$ZAEHLER"
rm -f "$RUMPF_DATEI"

echo
echo "$gruen grün, $rot rot"
[ "$rot" -eq 0 ]
