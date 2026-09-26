#!/bin/bash
# =============================================================================
# Abnahme „Freigabe sagt, wer entscheidet" (J35, 26.09.2026)
# =============================================================================
# Vier Augen ueberzeugen nur, wenn beide Seiten jederzeit sehen, wer dran ist.
# Gemessen wird mit zwei Mitarbeitern und der Proben-App `tests/probe-freigabe`:
#
#   LAUF     M1 reicht ueber die App ein (Einreicher aus X-Arasul-User,
#            `ohne_einreicher`). GET /flows/runs/:id nennt unter `freigabe`
#            Einreicher, Kreis (M2, nicht M1), Ort und einen Satz; der
#            Kontrakt nennt das Feld.
#   LISTEN   M2 bekommt die Anfrage mit `app_name`, `einreicher` und `kreis`;
#            M1 bekommt sie nicht, sieht sie aber unter `/eingereicht`.
#   GRENZE   /apps/<id>/ ohne Freigabe: der Browser bekommt HTML mit einem
#            Satz, `curl` weiter JSON.
#   BROWSER  `freigabe-wer-entscheidet-bilder.mjs`: die App zeigt den Satz,
#            die Karte, das Bestaetigen, die leere Zeile, die Grenzen und der
#            Rahmen einer echten App bei 1440 px. Bilder fuer den PR.
#
# Die zwei Mitarbeiter sind entweder vorhandene Konten (ARASUL_M1,
# ARASUL_M1_PASSWORT, ARASUL_M2, ARASUL_M2_PASSWORT -- am Orin die zwei
# Probe-Konten, die auch die Faktum-App benutzen) oder zwei Wegwerf-Konten mit
# Stempel, die das Skript anlegt und wieder loescht.
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-freigabe` (samt Freigaben und
# Image), den Wegwerf-Schluessel, die Wegwerf-Konten. Vorhandene Konten
# behalten alles, was sie vorher hatten.
#
# Aufruf:
#   ARASUL_URL=https://192.168.0.197 ARASUL_PASSWORT=... \
#   ARASUL_M1=... ARASUL_M1_PASSWORT=... ARASUL_M2=... ARASUL_M2_PASSWORT=... \
#   ARASUL_RAHMEN_APP=probe-faktum-belege ARASUL_SPERR_APP=belege \
#   bash scripts/test/freigabe-wer-entscheidet-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-freigabe"
APP="probe-freigabe"
APP_NAME="Probe: Wer entscheidet"
STEMPEL="$(date +%H%M%S)"
GEDULD=900

M1="${ARASUL_M1:-}"
M1_PASS="${ARASUL_M1_PASSWORT:-}"
M2="${ARASUL_M2:-}"
M2_PASS="${ARASUL_M2_PASSWORT:-}"
WEGWERF=""
if [ -z "$M1" ] || [ -z "$M2" ]; then
  WEGWERF=ja
  M1="abnahme-einreicher-$STEMPEL"
  M2="abnahme-entscheider-$STEMPEL"
  M1_PASS="Abnahme-$STEMPEL!"
  M2_PASS="$M1_PASS"
fi

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
enthaelt() { if grep -q -- "$2" <<<"$1"; then echo ja; else echo nein; fi; }
fehlt() { if grep -q -- "$2" <<<"$1"; then echo nein; else echo ja; fi; }

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""

# ruf <token|schluessel:…> <verb> <pfad> [leib]
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

# Die Anfrage zu einem Lauf aus einer Liste `data` als JSON, oder leer.
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

anmelden() {
  curl -sk -X POST -H 'content-type: application/json' --max-time 30 \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2")" \
    "$BASIS/api/auth/login" | feld token
}

baue_paket() {
  local ordner="$ARBEIT/paket"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$QUELLE/app.json" "$ordner/"
  # Dasselbe Stylesheet, das die Shell laedt: die Seite soll aussehen wie eine App.
  cp "$WURZEL/packages/marken/src/marken.css" "$ordner/frontend/"
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket.tgz"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi

echo "=== Abnahme Freigabe sagt, wer entscheidet (J35) gegen $BASIS ==="
echo

# --- 1. Zugaenge -------------------------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && { echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

SCHLUESSEL=""
KEY_ID=""
ID_M1=""
ID_M2=""
aufraeumen() {
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  if [ -n "$WEGWERF" ]; then
    for id in "$ID_M1" "$ID_M2"; do
      [ -n "$id" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
        -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$id"
    done
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  %s entfernt, Wegwerf-Schluessel widerrufen%s\n' "$APP" \
    "${WEGWERF:+, zwei Wegwerf-Mitarbeiter geloescht}"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme J35 (freigabe sagt wer entscheidet)","allowed_endpoints":["app:deploy","flow:run"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

if [ -n "$WEGWERF" ]; then
  for wer in "$M1" "$M2"; do
    ruf "$TOK" POST /api/benutzer \
      "{\"username\":\"$wer\",\"password\":\"$M1_PASS\",\"email\":\"$wer@abnahme.local\",\"rolle\":\"mitarbeiter\"}"
  done
fi
ruf "$TOK" GET /api/benutzer
ID_M1=$(rumpf | python3 -c 'import sys,json; print(next((str(b["id"]) for b in json.load(sys.stdin)["data"] if b["username"]==sys.argv[1]), ""))' "$M1")
ID_M2=$(rumpf | python3 -c 'import sys,json; print(next((str(b["id"]) for b in json.load(sys.stdin)["data"] if b["username"]==sys.argv[1]), ""))' "$M2")
pruefe "Zwei Mitarbeiter: $M1 und $M2" "$([ -n "$ID_M1" ] && [ -n "$ID_M2" ] && echo ja || echo nein)" \
  "${WEGWERF:+Wegwerf-Konten}${WEGWERF:-vorhandene Konten}"
TOK_M1=$(anmelden "$M1" "$M1_PASS")
TOK_M2=$(anmelden "$M2" "$M2_PASS")
pruefe 'Beide melden sich an' "$([ -n "$TOK_M1" ] && [ -n "$TOK_M2" ] && echo ja || echo nein)"
{ [ -z "$TOK_M1" ] || [ -z "$TOK_M2" ]; } && exit 1

# --- 2. Der Kontrakt nennt das Feld -------------------------------------------
ruf "schluessel:$SCHLUESSEL" GET /api/v1/external/contract
pruefe 'Der Kontrakt nennt `freigabe` am Lauf (freigaben.lauf)' \
  "$(enthaelt "$(rumpf | feld data.freigaben.lauf.felder)" kreis)" "$(rumpf | feld data.freigaben.lauf.weg)"

# --- 3. Einspielen, live, beiden freigeben ------------------------------------
PAKET=$(baue_paket)
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET" "$BASIS/api/v1/external/apps")
pruefe "$APP in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_M1}"
F1=$CODE
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_M2}"
F2=$CODE
pruefe 'Die App ist beiden freigegeben' "$([[ "$F1$F2" =~ ^(20[01]){2}$ ]] && echo ja || echo nein)" "$F1 $F2"

LIVE="/apps/$APP/api"
ende=$((SECONDS + 180))
while [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK_M1" GET "$LIVE/gesund"
  [ "$CODE" = "200" ] && break
  sleep 3
done
pruefe 'Die App antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# --- 4. Der Lauf sagt, wer entscheidet ------------------------------------------
ruf "$TOK_M1" POST "$LIVE/einreichen"
LAUF=$(rumpf | feld lauf)
pruefe "$M1 reicht ueber die App ein" "$([ -n "$LAUF" ] && echo ja || echo nein)" "HTTP $CODE lauf=${LAUF:-—}"
ende=$((SECONDS + 180))
while [ -n "$LAUF" ] && [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK_M1" GET "$LIVE/lauf?lauf=$LAUF"
  [ "$(rumpf | feld status)" = "wartend" ] && break
  sleep 2
done
pruefe 'Der Lauf haelt an (wartend)' "$(ja_wenn "$(rumpf | feld status)" wartend)" "$(rumpf | feld status)"
pruefe 'freigabe.einreicher ist M1' "$(ja_wenn "$(rumpf | feld freigabe.einreicher)" "$M1")"
pruefe 'freigabe.ohne_einreicher' "$(ja_wenn "$(rumpf | feld freigabe.ohne_einreicher)" true)"
KREIS=$(rumpf | feld freigabe.kreis)
pruefe 'freigabe.kreis nennt M2 und nicht M1' \
  "$([ "$(enthaelt "$KREIS" "\"$M2\"")" = ja ] && [ "$(fehlt "$KREIS" "\"$M1\"")" = ja ] && echo ja || echo nein)" "$KREIS"
pruefe 'freigabe.offen ist die wartende Anfrage' "$([ -n "$(rumpf | feld freigabe.offen.id)" ] && echo ja || echo nein)"
pruefe 'freigabe.satz sagt wer und wo' "$(enthaelt "$(rumpf | feld freigabe.satz)" 'auf der Übersicht')" \
  "$(rumpf | feld freigabe.satz)"

# --- 5. Beide Listen ----------------------------------------------------------
ruf "$TOK_M2" GET /api/freigabe-anfragen
A2=$(rumpf | anfrage_zu_lauf "$LAUF")
pruefe 'M2 bekommt die Anfrage' "$([ -n "$A2" ] && echo ja || echo nein)"
pruefe 'mit dem Namen der App' "$(ja_wenn "$(printf '%s' "$A2" | feld app_name)" "$APP_NAME")"
pruefe 'mit Einreicher und Kreis' \
  "$([ "$(printf '%s' "$A2" | feld einreicher)" = "$M1" ] && [ "$(enthaelt "$(printf '%s' "$A2" | feld kreis)" "$M2")" = ja ] && echo ja || echo nein)"
ruf "$TOK_M1" GET /api/freigabe-anfragen
pruefe 'M1 bekommt sie nicht (vier Augen)' "$([ -z "$(rumpf | anfrage_zu_lauf "$LAUF")" ] && echo ja || echo nein)"
ruf "$TOK_M1" GET /api/freigabe-anfragen/eingereicht
E1=$(rumpf | anfrage_zu_lauf "$LAUF")
pruefe 'aber unter /eingereicht, mit dem Kreis' "$(enthaelt "$(printf '%s' "$E1" | feld kreis)" "$M2")" \
  "$(printf '%s' "$E1" | feld kreis)"

# --- 6. Die Grenze im Browser -------------------------------------------------
# Eine App, die M1 nicht hat: die Proben-App vor dem Freigeben gibt es nicht
# mehr, also eine gewuerfelte Kennung -- die Freigabe antwortet zuerst.
FREMD="gibt-es-nicht-$STEMPEL"
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time 30 -H "authorization: Bearer $TOK_M1" \
  -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' "$BASIS/apps/$FREMD/")
pruefe 'Ein Browser bekommt an /apps/<id>/ ohne Freigabe eine Seite' \
  "$([ "$CODE" = 403 ] && [ "$(enthaelt "$(rumpf)" 'data-sperrseite')" = ja ] && echo ja || echo nein)" "HTTP $CODE"
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time 30 -H "authorization: Bearer $TOK_M1" \
  "$BASIS/apps/$FREMD/")
pruefe 'curl bekommt weiter JSON' "$(ja_wenn "$(rumpf | feld error.code)" FORBIDDEN)" "HTTP $CODE"

# --- 7. Browser ----------------------------------------------------------------
ARASUL_M1="$M1" ARASUL_M1_PASSWORT="$M1_PASS" ARASUL_M2="$M2" ARASUL_M2_PASSWORT="$M2_PASS" \
  ARASUL_PROBE_APP="$APP" ARASUL_PROBE_NAME="$APP_NAME" \
  node "$WURZEL/scripts/test/freigabe-wer-entscheidet-bilder.mjs"
BROWSER=$?
pruefe 'Der Browser-Teil' "$(ja_wenn "$BROWSER" 0)"

# Die Freigabe ist nach dem Browser-Teil bestaetigt. Gefragt wird der Lauf
# selbst: eine leere Liste hiesse sonst auch „die Anfrage ist gescheitert".
ruf "$TOK_M1" GET "$LIVE/lauf?lauf=$LAUF"
STATUS=$(rumpf | feld status)
pruefe 'Nach dem Bestaetigen wartet der Lauf nicht mehr' \
  "$([ "$CODE" = 200 ] && [ -n "$STATUS" ] && [ "$STATUS" != wartend ] && echo ja || echo nein)" \
  "HTTP $CODE $STATUS"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
