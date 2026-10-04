#!/bin/bash
# =============================================================================
# Abnahme M5: Abschluss ueber die App (Kontrakt 11)
# =============================================================================
# Die Abnahme des Auftrags flow-abschluss-ueber-app (04.10.2026), Probe-App
# `tests/probe-abschluss`: `buch` und `beleg` nennen eine Abschluss-Route der
# App, `ohne` nicht. Die App nimmt an `/abschluss/<flow>` an, prueft das
# Geheimnis des Geraets und legt ein Ergebnis zu einer Lauf-Nummer nur einmal
# an; ein Schalter (`/schalter?modus=`) stoert genau diese Route -- nie einen
# fremden Container.
#
#   KONTRAKT     Fassung 11, die Regeln nennen `abschluss`; der Flow-Kopf nennt
#                die Route.
#   FEST         die Flows rechnen mit der festen Antwort der Probe-App (externes
#                Modell im Netz der Apps), nicht mit dem echten Modell.
#   UEBERGABE    Nach der letzten Stufe ruft das Geraet die Route mit Ergebnis,
#                Lauf-Kennung und Geheimnis. Bis die App antwortet, ist der Lauf
#                NICHT fertig; erst 2xx macht ihn fertig. Ein Flow ohne Route
#                wird fertig wie bisher.
#   KORREKTUR    `beleg`: die Person aendert das Datum in der Freigabe, die App
#                bekommt den geaenderten Wert und die Korrektur (wer, wann).
#   ART          Bei `ergebnis_bestaetigen` kommt der Aufruf erst nach der
#                Bestaetigung.
#   AUSFALL      503 und Schweigen der App: der Lauf steht auf nicht_uebergeben,
#                mit Grund, das Ergebnis steht.
#   ERNEUT       Solange die App stoert, bleibt es nicht_uebergeben (neuer
#                Versuch, gleicher Lauf, gleiche Schritte); antwortet sie, wird
#                der Lauf fertig, die App hat das Ergebnis genau einmal.
#   RECHTE       Nur ein Admin loest „erneut" aus; nur bei nicht_uebergeben.
#   NEUSTART     (mit ARASUL_NEUSTART_BEFEHL) nicht_uebergeben ueberlebt einen
#                Neustart des Backends, „erneut" gelingt danach.
#   BAUSTEIN     (ARASUL_BILDER=1) `abschluss-bilder.mjs`: die Laeufe-Ansicht
#                und der Lauf in der Verwaltung mit „erneut".
#
# Konten: drei VORHANDENE Probekonten, nie `admin`, keine neuen. Passwoerter
# nur zur Laufzeit:
#
#   ARASUL_URL=https://100.121.244.80 \
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   ARASUL_B=probe-j36-b ARASUL_B_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-b')" \
#   ARASUL_NEUSTART_BEFEHL="ssh jetson 'cd ~/arasul && docker compose restart dashboard-backend'" \
#   ARASUL_BILDER=1 bash scripts/test/abschluss-abnahme.sh
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-abschluss-<MMDD>` (samt Image und
# Ordner), die Freigaben der App an die drei Konten, offene Laeufe, den
# Wegwerf-Schluessel. Ob unter /arasul/apps ein Ordner bleibt, prueft der
# Aufrufer am Geraet.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-abschluss"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="${ARASUL_ABSCHLUSS_APP:-probe-abschluss-$STEMPEL}"
VERSION="1.0.0"
GEDULD=900
HALT_GEDULD=300
LAUF_GEDULD=600
BEGINN="$(date -u '+%Y-%m-%d %H:%M:%S')"

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

if [ -z "$A" ] || [ -z "$A_PASS" ] || [ -z "$B" ] || [ -z "$B_PASS" ]; then
  echo "ARASUL_A, ARASUL_A_PASSWORT, ARASUL_B, ARASUL_B_PASSWORT fehlen (vorhandene Probekonten)."
  exit 1
fi
for wer in "$ARASUL_BENUTZER" "$A" "$B"; do
  if [ "$wer" = "admin" ]; then
    echo "Nie das Konto admin: das ist ein echtes Konto. Probekonten nehmen."
    exit 1
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

# Die offene Anfrage eines Laufs aus einer Liste `data`, als JSON, oder leer.
anfrage_zu_lauf() {
  python3 -c 'import sys,json
lauf = int(sys.argv[1])
try: liste = json.load(sys.stdin)["data"]
except Exception: print(""); raise SystemExit
for a in liste:
    if int(a.get("run_id", -1)) == lauf:
        print(json.dumps(a, ensure_ascii=False)); raise SystemExit
print("")' "$1" 2>/dev/null
}

anzahl() { python3 -c 'import sys,json
try: print(len(json.load(sys.stdin)["data"]))
except Exception: print("")' 2>/dev/null; }

anmelden() {
  curl -sk -X POST -H 'content-type: application/json' --max-time 30 \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2")" \
    "$BASIS/api/auth/login" | feld token
}

baue_paket() {
  local ordner="$ARBEIT/paket"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$VERSION" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Probe: Abschluss (%s)" % kennung.rsplit("-", 1)[-1]
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket.tgz"
}

# Einen Flow als A starten. Setzt $LAUF.
LAUF=""
starten() {
  local abfrage="$1"
  LAUF=""
  ruf "$TOK_A" POST "/apps/$APP/api/starten?$abfrage"
  if [ "$CODE" = "404" ]; then
    sleep 5
    ruf "$TOK_A" POST "/apps/$APP/api/starten?$abfrage"
  fi
  LAUF=$(rumpf | feld lauf)
  [ -n "$LAUF" ] || { echo "        Antwort der App: HTTP $CODE $(rumpf)"; return 1; }
}

# Wartet bis der Lauf einen der Status $1 (durch | getrennt) hat; setzt $STATUS.
STATUS=""
warte_status() {
  local gesucht="$1" geduld="${2:-$HALT_GEDULD}"
  local ende=$((SECONDS + geduld))
  STATUS=""
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK_A" GET "/apps/$APP/api/lauf?lauf=$LAUF"
    STATUS=$(rumpf | feld status)
    case "|$gesucht|" in *"|$STATUS|"*) return 0 ;; esac
    case "$STATUS" in fertig | fehler | abgebrochen | abgelaufen | nicht_uebergeben) return 1 ;; esac
    sleep 2
  done
  return 1
}

# Die offene Anfrage zum Lauf aus der Liste von $1 (Pfad), oder leer. Setzt
# $ANFRAGE (id) und $TITEL.
ANFRAGE=""
TITEL=""
warte_auf_anfrage() {
  local tok="$1" ende=$((SECONDS + HALT_GEDULD)) a=""
  ANFRAGE=""
  TITEL=""
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$tok" GET /api/freigabe-anfragen
    a=$(rumpf | anfrage_zu_lauf "$LAUF")
    if [ -n "$a" ]; then
      ANFRAGE=$(printf '%s' "$a" | feld id)
      TITEL=$(printf '%s' "$a" | feld titel)
      return 0
    fi
    sleep 3
  done
  return 1
}

# Offen am Lauf: gibt es (jetzt) eine offene Anfrage in der Liste des Admins
# oder von B? Fuer "keine Freigabe": der Lauf ist fertig UND nie angehalten.
art_setzen() { # flow art|null
  local wert="$2"
  [ "$wert" != null ] && wert="\"$wert\""
  ruf "$TOK" PUT "/api/apps/$APP/flows/$1/art" "{\"art\":$wert}"
}
flow_feld() { # flow feld
  ruf "$TOK" GET "/api/apps/$APP/flows"
  rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
liste = d["live"] if isinstance(d, dict) and "live" in d else d
f = next((x for x in (liste.get("flows", liste) if isinstance(liste, dict) else liste) if x["name"] == sys.argv[1]), {})
v = f.get(sys.argv[2])
print(json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict, bool)) else ("" if v is None else v))' "$1" "$2" 2>/dev/null
}

bilder() {
  [ "${ARASUL_BILDER:-}" = "1" ] || return 0
  ARASUL_A="$A" ARASUL_A_PASSWORT="$A_PASS" ARASUL_B="$B" ARASUL_B_PASSWORT="$B_PASS" \
    ARASUL_ABSCHLUSS_APP="$APP" ARASUL_LAUF="${LAUF:-}" node "$WURZEL/scripts/test/abschluss-bilder.mjs" "$1" | sed 's/^/  bild /'
  local ergebnis="${PIPESTATUS[0]}"
  pruefe "Bilder: $1" "$(ja_wenn "$ergebnis" 0)"
}

# Die App stoeren oder heilen: nur die eigene Route der Probe-App.
modus_setzen() {
  ruf "$TOK_A" POST "/apps/$APP/api/schalter?modus=$1"
  [ "$CODE" = 200 ] && [ "$(rumpf | feld modus)" = "$1" ]
}
# Was die App zu einer Lauf-Nummer angenommen hat: $1 = Feld (aufrufe, angenommen, body.…).
empfangen_feld() {
  ruf "$TOK_A" GET "/apps/$APP/api/empfangen?lauf=$LAUF"
  rumpf | feld "$1"
}
# Der Lauf, wie die Verwaltung ihn sieht: $1 = Feld (status, abschluss.versuche, error, …).
lauf_feld() {
  ruf "$TOK" GET "/api/apps/$APP/laeufe/$LAUF"
  rumpf | feld "data.$1"
}
schritte_zahl() {
  ruf "$TOK" GET "/api/apps/$APP/laeufe/$LAUF"
  rumpf | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]["steps"]))' 2>/dev/null
}
erneut() { ruf "$TOK" POST "/api/apps/$APP/laeufe/$LAUF/erneut" '{}'; }

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi

echo "=== Abnahme M5: Abschluss ueber die App, $APP gegen $BASIS ==="
echo

# --- 1. Zugaenge ---------------------------------------------------------------
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
ROLLE_A=$(benutzer_feld "$A" role)
ROLLE_B=$(benutzer_feld "$B" role)
pruefe 'Drei vorhandene Probekonten, keine neuen' \
  "$([ -n "$ID_ADMIN" ] && [ -n "$ID_A" ] && [ -n "$ID_B" ] && echo ja || echo nein)"

SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=()
OFFENE_LAEUFE=()
aufraeumen() {
  # Offene Laeufe der Probe abbrechen (nicht_uebergeben, wartend), bevor die App geht.
  for id in "${OFFENE_LAEUFE[@]:-}"; do
    [ -n "$id" ] && curl -sk -o /dev/null --max-time 30 -X POST \
      -H "authorization: Bearer $TOK" "$BASIS/api/flows/laeufe/$id/abbrechen"
  done
  for id in "${FREIGEGEBEN[@]:-}"; do
    [ -n "$id" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/freigaben/$APP/$id"
  done
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  offene Laeufe abgebrochen, Freigaben zurueckgenommen, %s entfernt (mit Ordnern), Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Abschluss ($APP)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 2. Kontrakt 11 ---------------------------------------------------------------
ruf "schluessel:$SCHLUESSEL" GET /api/v1/external/contract
KONTRAKT=$(rumpf | feld data.kontrakt)
[ -z "$KONTRAKT" ] && KONTRAKT=$(rumpf | feld kontrakt)
pruefe 'Der Kontrakt hat Fassung 11' "$(ja_wenn "$KONTRAKT" 11)" "kontrakt=${KONTRAKT:-—}"
pruefe 'Die Regeln nennen abschluss und ARASUL_ABSCHLUSS_TOKEN' \
  "$(grep -q '`abschluss` nennt die Abschluss-Route' "$RUMPF_DATEI" && grep -q 'ARASUL_ABSCHLUSS_TOKEN' "$RUMPF_DATEI" && echo ja || echo nein)"

# --- 3. Einspielen, live, drei Freigaben, feste Antwort -----------------------------
PAKET=$(baue_paket)
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET" "$BASIS/api/v1/external/apps")
pruefe "$APP in den Teststand (Flows mit Abschluss-Route)" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

codes=""
for id in "$ID_ADMIN" "$ID_A" "$ID_B"; do
  ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$id}"
  codes="$codes $CODE"
  [[ "$CODE" =~ ^20[01]$ ]] && FREIGEGEBEN+=("$id")
done
pruefe "Die App ist $ARASUL_BENUTZER, $A und $B freigegeben" \
  "$([ "${#FREIGEGEBEN[@]}" = 3 ] && echo ja || echo nein)" "HTTP$codes"

if arasul_warte_auf_app "/apps/$APP/api/gesund" 180 "$TOK_A"; then
  pruefe 'Die App antwortet' ja
else
  pruefe 'Die App antwortet' nein 'Zeitgrenze 180s'; exit 1
fi
ruf "$TOK_A" GET "/apps/$APP/api/info"
pruefe 'Die App bekommt ARASUL_ABSCHLUSS_TOKEN vom Geraet' \
  "$(ja_wenn "$(rumpf | feld token_gesetzt)" true)"

# Feste Antwort statt Modell (siehe arten-abnahme.sh): die Probe-App ist das
# externe Modell, Rolle, Vertrag, Freigabe und Abschluss laufen echt durch.
codes=""
for f in buch beleg ohne; do
  ruf "$TOK" PUT "/api/apps/$APP/flows/$f/modell" \
    "{\"extern\":{\"anbieter\":\"Probe\",\"modell\":\"fest\",\"basis_url\":\"http://arasul-app-$APP-live:8080/v1\"}}"
  codes="$codes $CODE"
done
pruefe 'buch, beleg und ohne rechnen mit der festen Antwort der Probe-App, ohne Modell' \
  "$(ja_wenn "$codes" ' 200 200 200')" "HTTP$codes"
art_setzen beleg autonom
modus_setzen ok

# --- 4. Der Flow-Kopf nennt die Route ----------------------------------------------
ruf "$TOK" GET "/api/apps/$APP/flows/buch?stand=live"
pruefe 'buch nennt abschluss.route /abschluss/buch' \
  "$(ja_wenn "$(rumpf | feld data.abschluss.route)" /abschluss/buch)"
ruf "$TOK" GET "/api/apps/$APP/flows/ohne?stand=live"
pruefe 'ohne nennt keine Abschluss-Route' "$([ -z "$(rumpf | feld data.abschluss)" ] && echo ja || echo nein)"
ruf "$TOK_A" POST "/apps/$APP/api/abschluss/buch" '{"lauf":1}'
pruefe 'Die Route der App kennt nur das Geraet: ohne Geheimnis 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"

# --- 5. Uebergabe: erst die Bestaetigung der App macht den Lauf fertig --------------
modus_setzen langsam
pruefe 'Probe-App antwortet 8 Sekunden spaeter (langsam)' "$([ "$CODE" = 200 ] && echo ja || echo nein)"
if starten 'flow=buch&thema=Wartung'; then
  # Sobald die Uebergabe laeuft (abschluss steht am Lauf), ist das Ergebnis
  # gespeichert, der Lauf aber NOCH nicht fertig.
  ende=$((SECONDS + LAUF_GEDULD)); WAEHREND=""; ERG_WAEHREND=""; ZEIT_UEBERGEBEN=""
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK" GET "/api/apps/$APP/laeufe/$LAUF"
    if [ -n "$(rumpf | feld data.abschluss.route)" ] || [ "$(rumpf | feld data.status)" != laeuft ]; then
      WAEHREND=$(rumpf | feld data.status)
      ERG_WAEHREND=$(rumpf | feld data.result)
      ZEIT_UEBERGEBEN=$(rumpf | feld data.abschluss.uebergeben_am)
      break
    fi
    sleep 1
  done
  pruefe 'Waehrend die App noch nicht antwortet, ist der Lauf NICHT fertig' \
    "$([ "$WAEHREND" = laeuft ] && [ -z "$ZEIT_UEBERGEBEN" ] && echo ja || echo nein)" "status=${WAEHREND:-—}"
  pruefe '… sein Ergebnis steht aber schon' "$([ -n "$ERG_WAEHREND" ] && echo ja || echo nein)" "$(printf '%s' "$ERG_WAEHREND" | cut -c1-50)"
  warte_status 'fertig|nicht_uebergeben|fehler' "$LAUF_GEDULD"
  pruefe 'Nach der Bestaetigung der App ist der Lauf fertig' "$(ja_wenn "$STATUS" fertig)" "lauf=$LAUF status=${STATUS:-—}"
  pruefe 'abschluss: Route, ein Versuch, uebergeben_am gesetzt' \
    "$([ "$(lauf_feld abschluss.route)" = /abschluss/buch ] && [ "$(lauf_feld abschluss.versuche)" = 1 ] && [ -n "$(lauf_feld abschluss.uebergeben_am)" ] && echo ja || echo nein)"
  pruefe 'Die App hat es genau einmal bekommen' \
    "$([ "$(empfangen_feld aufrufe)" = 1 ] && [ "$(empfangen_feld angenommen)" = 1 ] && echo ja || echo nein)"
  pruefe 'Mit Lauf-Kennung im Kopf (Idempotency-Key) und im Body' \
    "$([ "$(empfangen_feld schluessel)" = "arasul-lauf-$LAUF" ] && [ "$(empfangen_feld body.lauf)" = "$LAUF" ] && echo ja || echo nein)"
  pruefe 'Das Ergebnis, der Flow und der Stand kommen mit' \
    "$([ -n "$(empfangen_feld body.ergebnis)" ] && [ "$(empfangen_feld body.flow)" = buch ] && [ "$(empfangen_feld body.stand)" = live ] && [ "$(empfangen_feld body.argumente.thema)" = Wartung ] && echo ja || echo nein)" "$(empfangen_feld body.ergebnis | cut -c1-60)"
else
  pruefe 'Lauf gestartet (buch)' nein
fi
modus_setzen ok

# Ein Flow ohne Abschluss-Route verhaelt sich wie bisher.
if starten 'flow=ohne&thema=Wartung'; then
  warte_status 'fertig|nicht_uebergeben|fehler' "$LAUF_GEDULD"
  pruefe 'ohne: fertig wie bisher, ohne Uebergabe' \
    "$([ "$STATUS" = fertig ] && [ -z "$(lauf_feld abschluss)" ] && [ "$(empfangen_feld aufrufe)" = 0 ] && echo ja || echo nein)" "status=${STATUS:-—}"
else
  pruefe 'Lauf gestartet (ohne)' nein
fi

# --- 6. Korrektur: die App bekommt den geaenderten Wert ------------------------------
if starten 'flow=beleg&datum='; then
  warte_status wartend
  pruefe 'beleg, Datum nicht erkannt: der Lauf haelt an' "$(ja_wenn "$STATUS" wartend)" "lauf=$LAUF status=${STATUS:-—}"
  warte_auf_anfrage "$TOK_B"
  P1="$ANFRAGE"
  pruefe 'Waehrend die Freigabe offen ist, hat die App nichts bekommen' "$([ "$(empfangen_feld aufrufe)" = 0 ] && echo ja || echo nein)"
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{"felder":{"datum":"01.10.2026"}}'
  pruefe "$B aendert das Datum und bestaetigt" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  warte_status 'fertig|nicht_uebergeben|fehler' "$LAUF_GEDULD"
  pruefe 'beleg endet fertig' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
  pruefe 'Die App bekommt das geaenderte Datum (felder.datum)' \
    "$(ja_wenn "$(empfangen_feld body.felder.datum)" 01.10.2026)"
  pruefe 'und die Korrektur: Feld, Vorschlag, Wert, wer' \
    "$([ "$(empfangen_feld body.korrekturen.0.feld)" = datum ] && [ "$(empfangen_feld body.korrekturen.0.wert)" = 01.10.2026 ] && [ "$(empfangen_feld body.korrekturen.0.von)" = "$B" ] && echo ja || echo nein)" "von=$(empfangen_feld body.korrekturen.0.von)"
  pruefe 'Das Ergebnis traegt den geaenderten Wert' \
    "$(empfangen_feld body.ergebnis | grep -q '01.10.2026' && echo ja || echo nein)"
else
  pruefe 'Lauf gestartet (beleg)' nein
fi

# --- 7. Art: bei „Ergebnis bestaetigen" kommt der Aufruf nach der Bestaetigung -------
art_setzen beleg ergebnis_bestaetigen
if starten 'flow=beleg&datum=02.10.2026'; then
  warte_status wartend
  warte_auf_anfrage "$TOK_B"
  pruefe 'Der Lauf wartet auf die Bestaetigung des Ergebnisses' "$(ja_wenn "$TITEL" 'Ergebnis bestätigen: beleg')" "titel=${TITEL:-—}"
  pruefe 'Davor hat die App nichts bekommen' "$([ "$(empfangen_feld aufrufe)" = 0 ] && echo ja || echo nein)"
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
  warte_status 'fertig|nicht_uebergeben|fehler' "$LAUF_GEDULD"
  pruefe 'Danach uebergibt der Lauf und ist fertig' \
    "$([ "$STATUS" = fertig ] && [ "$(empfangen_feld aufrufe)" = 1 ] && echo ja || echo nein)" "status=${STATUS:-—}"
fi
art_setzen beleg autonom

# --- 8. Ausfall: 503, dann Schweigen ------------------------------------------------
modus_setzen 503
if starten 'flow=buch&thema=Ausfall'; then
  warte_status 'fertig|nicht_uebergeben|fehler' "$LAUF_GEDULD"
  OFFENE_LAEUFE+=("$LAUF")
  pruefe 'Die App antwortet 503: der Lauf steht auf nicht_uebergeben' "$(ja_wenn "$STATUS" nicht_uebergeben)" "lauf=$LAUF status=${STATUS:-—}"
  pruefe '… mit dem Grund (HTTP 503) und dem Ergebnis' \
    "$(lauf_feld error | grep -q 503 && [ -n "$(lauf_feld result)" ] && [ "$(lauf_feld abschluss.status_code)" = 503 ] && [ "$(lauf_feld abschluss.versuche)" = 1 ] && echo ja || echo nein)" "$(lauf_feld error | cut -c1-60)"
  pruefe '… ohne uebergeben_am' "$([ -z "$(lauf_feld abschluss.uebergeben_am)" ] && echo ja || echo nein)"
  SCHRITTE=$(schritte_zahl)
  AUSFALL_LAUF="$LAUF"
  ruf "$TOK" GET "/api/apps/$APP/laeufe?status=nicht_uebergeben"
  pruefe 'Die Liste der Laeufe filtert nach nicht_uebergeben' \
    "$(rumpf | grep -q "\"id\": *$LAUF" && echo ja || echo nein)"
  ruf "$TOK_A" GET "/apps/$APP/api/lauf?lauf=$LAUF"
  pruefe 'Die App sieht den Zustand ueber die Schnittstelle (status, abschluss)' \
    "$([ "$(rumpf | feld status)" = nicht_uebergeben ] && echo ja || echo nein)"
  bilder nicht-uebergeben

  # --- 9. Erneut -------------------------------------------------------------------
  erneut
  pruefe 'erneut, solange die App noch stoert: bleibt nicht_uebergeben, zweiter Versuch' \
    "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.status)" = nicht_uebergeben ] && [ "$(rumpf | feld data.abschluss.versuche)" = 2 ] && echo ja || echo nein)" "HTTP $CODE"
  modus_setzen ok
  erneut
  pruefe 'erneut, sobald die App antwortet: der Lauf ist fertig' \
    "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.status)" = fertig ] && [ "$(rumpf | feld data.abschluss.versuche)" = 3 ] && echo ja || echo nein)" "HTTP $CODE status=$(rumpf | feld data.status)"
  pruefe 'Ohne die Schritte neu zu laufen (gleiche Schrittzahl)' "$([ "$(schritte_zahl)" = "$SCHRITTE" ] && echo ja || echo nein)" "$SCHRITTE Schritte"
  pruefe 'Der Grund ist weg, uebergeben_am ist gesetzt' \
    "$([ -z "$(lauf_feld error)" ] && [ -n "$(lauf_feld abschluss.uebergeben_am)" ] && echo ja || echo nein)"
  pruefe 'Die App hat das Ergebnis genau einmal angelegt, bei drei Aufrufen, mit derselben Kennung' \
    "$([ "$(empfangen_feld aufrufe)" = 3 ] && [ "$(empfangen_feld angenommen)" = 1 ] && [ "$(empfangen_feld schluessel)" = "arasul-lauf-$LAUF" ] && echo ja || echo nein)" "aufrufe=$(empfangen_feld aufrufe)"
  erneut
  pruefe 'erneut bei einem fertigen Lauf: 409' "$(ja_wenn "$CODE" 409)" "HTTP $CODE"
else
  pruefe 'Lauf gestartet (Ausfall)' nein
fi

# Schweigen statt Fehler: die App antwortet gar nicht.
modus_setzen haengt
if starten 'flow=buch&thema=Schweigen'; then
  warte_status 'fertig|nicht_uebergeben|fehler' "$LAUF_GEDULD"
  OFFENE_LAEUFE+=("$LAUF")
  pruefe 'Die App schweigt: nach dem Zeitlimit nicht_uebergeben, mit Grund' \
    "$([ "$STATUS" = nicht_uebergeben ] && lauf_feld error | grep -q 'nicht innerhalb' && echo ja || echo nein)" "lauf=$LAUF status=${STATUS:-—}"
  SCHWEIGEN_LAUF="$LAUF"
fi
modus_setzen ok

# --- 10. Rechte ---------------------------------------------------------------------
if [ -n "${SCHWEIGEN_LAUF:-}" ]; then
  LAUF="$SCHWEIGEN_LAUF"
  if [ "$ROLLE_A" != admin ]; then
    ruf "$TOK_A" POST "/api/apps/$APP/laeufe/$LAUF/erneut" '{}'
    pruefe "$A (Mitarbeiter) darf nicht „erneut\"" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
  fi
  ruf "$TOK" POST "/api/apps/gibt-es-nicht/laeufe/$LAUF/erneut" '{}'
  pruefe 'Ein Lauf einer anderen App: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
  pruefe 'Die abgewiesenen Versuche haben den Lauf nicht veraendert' \
    "$([ "$(lauf_feld status)" = nicht_uebergeben ] && [ "$(lauf_feld abschluss.versuche)" = 1 ] && echo ja || echo nein)"
fi

# --- 11. Neustart des Backends ---------------------------------------------------------
NEUSTART_BEFEHL="${ARASUL_NEUSTART_BEFEHL:-}"
if [ -n "$NEUSTART_BEFEHL" ] && [ -n "${SCHWEIGEN_LAUF:-}" ]; then
  LAUF="$SCHWEIGEN_LAUF"
  eval "$NEUSTART_BEFEHL" >/dev/null 2>&1
  ende=$((SECONDS + 240)); da=nein
  sleep 5
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK" GET "/api/apps/$APP/laeufe/$LAUF"
    [ "$CODE" = 200 ] && { da=ja; break; }
    TOK=$(arasul_token)
    sleep 4
  done
  pruefe 'Das Backend antwortet nach dem Neustart wieder' "$da"
  pruefe 'nicht_uebergeben ueberlebt den Neustart, mit Ergebnis und Versuchen' \
    "$([ "$(lauf_feld status)" = nicht_uebergeben ] && [ -n "$(lauf_feld result)" ] && [ "$(lauf_feld abschluss.versuche)" = 1 ] && echo ja || echo nein)"
  SCHRITTE=$(schritte_zahl)
  erneut
  pruefe 'Danach gelingt „erneut", ohne Schritte' \
    "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.status)" = fertig ] && [ "$(schritte_zahl)" = "$SCHRITTE" ] && echo ja || echo nein)" "HTTP $CODE"
  pruefe 'Die App hat es genau einmal angelegt' "$([ "$(empfangen_feld angenommen)" = 1 ] && echo ja || echo nein)"
else
  echo "(ohne ARASUL_NEUSTART_BEFEHL kein Neustart des Backends)"
fi

# --- 12. Abbrechen: ein nicht uebergebener Lauf laesst sich beenden -----------------------
modus_setzen 503
if starten 'flow=buch&thema=Abbruch'; then
  warte_status 'fertig|nicht_uebergeben|fehler' "$LAUF_GEDULD"
  OFFENE_LAEUFE+=("$LAUF")
  ruf "$TOK" POST "/api/flows/laeufe/$LAUF/abbrechen" '{}'
  pruefe 'Ein nicht uebergebener Lauf laesst sich abbrechen' \
    "$([ "$CODE" = 200 ] && [ "$(lauf_feld status)" = abgebrochen ] && echo ja || echo nein)" "HTTP $CODE"
  erneut
  pruefe 'Ein abgebrochener Lauf wird nicht mehr uebergeben (409)' "$(ja_wenn "$CODE" 409)" "HTTP $CODE"
fi
modus_setzen ok

# --- 13. Bilder: Laeufe-Ansicht und Lauf in der Verwaltung ------------------------------
if [ -n "${AUSFALL_LAUF:-}" ]; then
  LAUF="$AUSFALL_LAUF"
fi
bilder uebergeben

# --- 14. Aufraeumen ist Teil der Messung -----------------------------------------------------
fehl=""
for id in "${OFFENE_LAEUFE[@]:-}"; do
  [ -n "$id" ] && ruf "$TOK" POST "/api/flows/laeufe/$id/abbrechen" '{}'
done
OFFENE_LAEUFE=()
ruf "$TOK" GET "/api/apps/$APP/laeufe?status=nicht_uebergeben"
pruefe 'Kein Lauf steht mehr auf nicht_uebergeben' \
  "$(ja_wenn "$(rumpf | python3 -c 'import sys,json
try: print(len(json.load(sys.stdin)["data"]))
except Exception: print("?")')" 0)"
for id in "${FREIGEGEBEN[@]:-}"; do
  [ -n "$id" ] || continue
  ruf "$TOK" DELETE "/api/freigaben/$APP/$id"
  [[ "$CODE" =~ ^20[04]$ ]] || fehl="$fehl $id:$CODE"
done
FREIGEGEBEN=()
pruefe 'Die vergebenen Freigaben sind zurueckgenommen' "$([ -z "$fehl" ] && echo ja || echo nein)" "${fehl:-alle drei}"
ruf "schluessel:$SCHLUESSEL" DELETE "/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
pruefe 'DELETE entfernt die App samt Ordnern' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" GET "/api/apps/$APP"
pruefe 'Danach kennt das Geraet die App nicht mehr (404)' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
