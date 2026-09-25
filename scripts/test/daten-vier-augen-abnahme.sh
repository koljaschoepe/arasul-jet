#!/bin/bash
# =============================================================================
# Abnahme „Apps halten Daten, Freigaben mit vier Augen" (J35, 25.09.2026)
# =============================================================================
# Zwei Zusagen, ohne die eine Kanzlei-App nicht verkaeuflich ist:
#
#   DATEN   Ein Update loescht keine Daten. Die Proben-App (`tests/probe-daten`)
#           schreibt in ihre Datenbank (`umgebung.datenbank`), wird in den
#           Teststand neu eingespielt und live geschaltet, und die Daten sind
#           da -- in beiden Staenden, jeder mit seinen eigenen. Eine Datei im
#           Container dagegen ist weg; das ist der zweite Satz des Kontraktes,
#           und das Kit hatte beide behauptet. Eine Sicherung enthaelt die
#           Daten, und nach dem ENTFERNEN der App holt
#           `POST /api/backup/wiederherstellung/app/:id` sie zurueck.
#
#   AUGEN   Niemand gibt seinen eigenen Vorschlag frei. Zwei Wegwerf-
#           Mitarbeiter: der eine reicht ein, der andere entscheidet. Mit
#           `ohne_einreicher` sieht der Einreicher die Anfrage nicht und
#           bekommt 403; mit benannten Entscheidern (Rolle admin oder eine
#           Liste von Konten) sieht sie niemand sonst. Der Kontrakt nennt
#           beides, damit das Kit es liest.
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-daten` (samt Datenbanken und
# Images), zwei Mitarbeiter mit Stempel, einen Wegwerf-Schluessel. Die
# Sicherung, die es ausloest, ist eine gewoehnliche Sicherung des Geraets und
# bleibt liegen -- sie loescht nichts und ersetzt nichts.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/daten-vier-augen-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-daten"
APP="${ARASUL_PROBE_APP:-probe-daten}"
STEMPEL="$(date +%H%M%S)"
M1="abnahme-einreicher-$STEMPEL"
M2="abnahme-pruefer-$STEMPEL"
PASS="Abnahme-$STEMPEL!"

# Der erste Bau laedt `node:22-alpine` und `pg`; auf einem Jetson an einer
# maessigen Leitung ist alles unter zehn Minuten geraten.
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
# Ein Wahrheitswert kommt als JSON heraus (`true`), nicht als Python (`True`):
# der erste Lauf am Orin meldete viermal Rot an Werten, die stimmten.
print("" if d is None else (json.dumps(d) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

# Die Nummer der offenen Freigabe zu einem Lauf, aus `GET /api/freigabe-anfragen`.
anfrage_zu_lauf() {
  python3 -c 'import sys,json
lauf = int(sys.argv[1])
try: liste = json.load(sys.stdin)["data"]
except Exception: print(""); raise SystemExit
for a in liste:
    if int(a.get("run_id", -1)) == lauf:
        print(a["id"]); raise SystemExit
print("")' "$1" 2>/dev/null
}

anmelden() {
  curl -sk -X POST -H 'content-type: application/json' --max-time 30 \
    -d "{\"username\":\"$1\",\"password\":\"$PASS\"}" "$BASIS/api/auth/login" | feld token
}

# Ein Paket der Proben-App in einer Version bauen. Die Version steht im
# Manifest, im Image-Namen und in der Umgebung -- so sagt die App selbst, welche
# Fassung gerade antwortet.
baue_paket() {
  local version="$1" ordner="$ARBEIT/paket-$1"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$version" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
m["backend"]["umgebung"]["PROBE_VERSION"] = version
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket-$version.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket-$version.tgz"
}

einspielen() {
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$1" "$BASIS/api/v1/external/apps")
}

# Warten, bis die App unter ihrem Pfad in der erwarteten Version antwortet.
# Nach jedem Einspielen und Schalten kennt Traefik den neuen Container einen
# Augenblick nicht (Befund der C6-Abnahme).
warte_auf_version() {
  local pfad="$1" version="$2" ende=$((SECONDS + 180))
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK" GET "$pfad/gesund"
    [ "$CODE" = "200" ] && [ "$(rumpf | feld version)" = "$version" ] && return 0
    sleep 3
  done
  return 1
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme Daten und vier Augen (J35) gegen $BASIS ==="
echo

# --- 1. Zugaenge -------------------------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

SCHLUESSEL=""
KEY_ID=""
ID_M1=""
ID_M2=""
aufraeumen() {
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  for id in "$ID_M1" "$ID_M2"; do
    [ -n "$id" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$id"
  done
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  %s entfernt, zwei Mitarbeiter geloescht, Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme J35 (daten und vier augen)","allowed_endpoints":["app:deploy","flow:run"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' \
  "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)" "${SCHLUESSEL:0:12}…"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

lege_an() {
  ruf "$TOK" POST /api/benutzer \
    "{\"username\":\"$1\",\"password\":\"$PASS\",\"email\":\"$1@abnahme.local\",\"rolle\":\"mitarbeiter\"}"
  rumpf | feld data.id
}
ID_M1=$(lege_an "$M1")
ID_M2=$(lege_an "$M2")
pruefe 'Zwei Wegwerf-Mitarbeiter angelegt' \
  "$([ -n "$ID_M1" ] && [ -n "$ID_M2" ] && echo ja || echo nein)" "$M1=$ID_M1 $M2=$ID_M2"
TOK_M1=$(anmelden "$M1")
TOK_M2=$(anmelden "$M2")
pruefe 'Beide melden sich an' "$([ -n "$TOK_M1" ] && [ -n "$TOK_M2" ] && echo ja || echo nein)"
[ -z "$TOK_M1" ] || [ -z "$TOK_M2" ] && exit 1

ruf "$TOK" GET /api/auth/me
ID_ADMIN=$(rumpf | feld user.id)
ADMIN_NAME=$(rumpf | feld user.username)

# --- 2. Der Kontrakt nennt beides --------------------------------------------
ruf "schluessel:$SCHLUESSEL" GET /api/v1/external/contract
pruefe 'Der Kontrakt nennt den dauerhaften Ort (daten.ort)' \
  "$(ja_wenn "$(rumpf | feld data.daten.ort)" datenbank)" "ort=$(rumpf | feld data.daten.ort)"
pruefe 'und dass das Dateisystem des Containers nicht bleibt' \
  "$(enthaelt "$(rumpf | feld data.daten.ueberlebt_nicht)" dateisystem_des_containers)"
pruefe 'Der Kontrakt nennt einreicher und freigabe am Start eines Laufs' \
  "$(enthaelt "$(rumpf | feld data.freigaben.start.properties)" ohne_einreicher)"
pruefe 'und die Rolle als Entscheider-Kreis' \
  "$(enthaelt "$(rumpf | feld data.freigaben.rollen)" admin)"

# --- 3. Einspielen v1, Daten in beiden Staenden -----------------------------
P1=$(baue_paket 1.0.0)
P2=$(baue_paket 1.0.1)
einspielen "$P1"
pruefe "$APP 1.0.0 in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe '1.0.0 live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# Der Administrator ist Tester (sieht beide Staende), die zwei Mitarbeiter
# benutzen den Livestand.
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_ADMIN,\"stand\":\"test\"}"
F_A=$CODE
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_M1}"
F_1=$CODE
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_M2}"
F_2=$CODE
pruefe 'Die App ist Admin (test) und beiden Mitarbeitern (live) freigegeben' \
  "$([[ "$F_A$F_1$F_2" =~ ^(20[01]){3}$ ]] && echo ja || echo nein)" "$F_A $F_1 $F_2"

LIVE="/apps/$APP/api"
TEST="/apps/$APP/test/api"
if warte_auf_version "$LIVE" 1.0.0 && warte_auf_version "$TEST" 1.0.0; then
  pruefe 'Beide Staende antworten in 1.0.0' ja
else
  pruefe 'Beide Staende antworten in 1.0.0' nein "HTTP $CODE $(rumpf)"
  exit 1
fi

ruf "$TOK" POST "$TEST/eintrag?text=test-vor-update"
pruefe 'Der Teststand schreibt in seine Datenbank' "$(ja_wenn "$CODE" 201)" "HTTP $CODE $(rumpf)"
ruf "$TOK" POST "$LIVE/eintrag?text=live-vor-update"
pruefe 'Der Livestand schreibt in seine Datenbank' "$(ja_wenn "$CODE" 201)" "HTTP $CODE $(rumpf)"
ruf "$TOK" POST "$LIVE/datei?text=marke-im-container"
pruefe 'und legt eine Datei in seinen Container' "$(ja_wenn "$CODE" 201)" "HTTP $CODE"

# --- 4. Zweimal neu einspielen: Test, dann live ------------------------------
einspielen "$P2"
pruefe "$APP 1.0.1 in den Teststand (neu eingespielt)" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
warte_auf_version "$TEST" 1.0.1
ruf "$TOK" GET "$TEST/eintraege"
pruefe 'Nach dem Einspielen hat der Teststand seine Daten' \
  "$(enthaelt "$(rumpf)" test-vor-update)" "$(rumpf)"
pruefe 'und nur seine: nichts aus dem Livestand' "$(fehlt "$(rumpf)" live-vor-update)"

ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe '1.0.1 live geschaltet (neu eingespielt)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
warte_auf_version "$LIVE" 1.0.1
ruf "$TOK" GET "$LIVE/eintraege"
pruefe 'Nach dem Schalten hat der Livestand seine Daten' \
  "$(enthaelt "$(rumpf)" live-vor-update)" "$(rumpf)"
pruefe 'und die Daten des Teststandes sind NICHT mitgekommen' "$(fehlt "$(rumpf)" test-vor-update)"
ruf "$TOK" GET "$LIVE/datei"
pruefe 'Die Datei im Container ist weg (so sagt es der Kontrakt)' \
  "$(ja_wenn "$(rumpf | feld text)" '')" "text=$(rumpf | feld text)"

# --- 5. Vier Augen ------------------------------------------------------------
# Ein Lauf je Regel. Gestartet wird ueber die App mit der Sitzung des
# Einreichers: die App nimmt ihn aus X-Arasul-User, wie eine echte App es tut.
starte() {
  local token="$1" regel="$2"
  ruf "$token" POST "$LIVE/flow?flow=freigabe&$regel"
  LAUF=$(rumpf | feld lauf)
}
warte_auf_wartend() {
  local lauf="$1" ende=$((SECONDS + 180))
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK" GET "$LIVE/flow?lauf=$lauf"
    [ "$(rumpf | feld status)" = "wartend" ] && return 0
    sleep 2
  done
  return 1
}
offen_fuer() {
  ruf "$1" GET /api/freigabe-anfragen
  rumpf | anfrage_zu_lauf "$2"
}

# 5a. ohne_einreicher: M1 reicht ein, M1 darf nicht, M2 darf.
LAUF=""
starte "$TOK_M1" "ohne_einreicher=1"
pruefe 'M1 reicht einen Vorgang mit ohne_einreicher ein' "$(ja_wenn "$CODE" 202)" \
  "HTTP $CODE lauf=${LAUF:-—} einreicher=$(rumpf | feld einreicher)"
LAUF_A="$LAUF"
if [ -n "$LAUF_A" ] && warte_auf_wartend "$LAUF_A"; then
  pruefe 'Der Lauf haelt an (wartend)' ja "lauf=$LAUF_A"
  pruefe 'Der Einreicher sieht die Anfrage NICHT' "$(ja_wenn "$(offen_fuer "$TOK_M1" "$LAUF_A")" '')"
  ANFRAGE_A=$(offen_fuer "$TOK_M2" "$LAUF_A")
  pruefe 'Ein anderer Mitarbeiter sieht sie' "$([ -n "$ANFRAGE_A" ] && echo ja || echo nein)" \
    "anfrage=${ANFRAGE_A:-—}"
  ruf "$TOK" GET "$LIVE/freigaben?lauf=$LAUF_A"
  pruefe 'Die App liest Einreicher und Kennzeichen an ihrer Freigabe' \
    "$([ "$(rumpf | feld freigaben.0.einreicher)" = "$M1" ] &&
      [ "$(rumpf | feld freigaben.0.ohne_einreicher)" = "true" ] && echo ja || echo nein)" \
    "einreicher=$(rumpf | feld freigaben.0.einreicher) ohne=$(rumpf | feld freigaben.0.ohne_einreicher)"
  ruf "$TOK_M1" POST "/api/freigabe-anfragen/$ANFRAGE_A/bestaetigen" '{}'
  pruefe 'Der Einreicher bestaetigt selbst: 403' "$(ja_wenn "$CODE" 403)" \
    "HTTP $CODE $(rumpf | feld error.message)"
  ruf "$TOK_M2" POST "/api/freigabe-anfragen/$ANFRAGE_A/bestaetigen" '{}'
  pruefe 'Der andere Mitarbeiter bestaetigt: 200, der Lauf geht weiter' \
    "$([ "$CODE" = "200" ] && [ "$(rumpf | feld data.fortgesetzt)" = "true" ] && echo ja || echo nein)" \
    "HTTP $CODE von=$(rumpf | feld data.benutzer) fortgesetzt=$(rumpf | feld data.fortgesetzt)"
else
  pruefe 'Der Lauf haelt an (wartend)' nein "lauf=${LAUF_A:-—} $(rumpf)"
fi

# 5b. benannte Konten: nur M2 sieht und entscheidet.
LAUF=""
starte "$TOK_M1" "konten=$M2"
pruefe 'M1 reicht einen Vorgang fuer das Konto M2 ein' "$(ja_wenn "$CODE" 202)" "HTTP $CODE"
LAUF_B="$LAUF"
if [ -n "$LAUF_B" ] && warte_auf_wartend "$LAUF_B"; then
  pruefe 'Der Administrator sieht sie NICHT' "$(ja_wenn "$(offen_fuer "$TOK" "$LAUF_B")" '')"
  pruefe 'Der Einreicher sieht sie NICHT' "$(ja_wenn "$(offen_fuer "$TOK_M1" "$LAUF_B")" '')"
  ANFRAGE_B=$(offen_fuer "$TOK_M2" "$LAUF_B")
  pruefe 'M2 sieht sie' "$([ -n "$ANFRAGE_B" ] && echo ja || echo nein)" "anfrage=${ANFRAGE_B:-—}"
  ruf "$TOK" POST "/api/freigabe-anfragen/$ANFRAGE_B/ablehnen" '{"begruendung":"nicht benannt"}'
  pruefe 'Der Administrator entscheidet: 403' "$(ja_wenn "$CODE" 403)" \
    "HTTP $CODE $(rumpf | feld error.message)"
  ruf "$TOK_M2" POST "/api/freigabe-anfragen/$ANFRAGE_B/ablehnen" '{"begruendung":"Abnahme J35"}'
  pruefe 'M2 entscheidet: 200' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
else
  pruefe 'Der Lauf fuer M2 haelt an' nein "lauf=${LAUF_B:-—}"
fi

# 5c. Rolle admin: kein Mitarbeiter sieht sie.
LAUF=""
starte "$TOK_M1" "entscheider=admin"
pruefe 'M1 reicht einen Vorgang fuer die Rolle admin ein' "$(ja_wenn "$CODE" 202)" "HTTP $CODE"
LAUF_C="$LAUF"
if [ -n "$LAUF_C" ] && warte_auf_wartend "$LAUF_C"; then
  pruefe 'M2 sieht sie NICHT' "$(ja_wenn "$(offen_fuer "$TOK_M2" "$LAUF_C")" '')"
  ANFRAGE_C=$(offen_fuer "$TOK" "$LAUF_C")
  pruefe 'Der Administrator sieht sie' "$([ -n "$ANFRAGE_C" ] && echo ja || echo nein)"
  ruf "$TOK_M2" POST "/api/freigabe-anfragen/$ANFRAGE_C/bestaetigen" '{}'
  pruefe 'M2 entscheidet: 403' "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
  ruf "$TOK" POST "/api/freigabe-anfragen/$ANFRAGE_C/ablehnen" '{"begruendung":"Abnahme J35"}'
  pruefe "Der Administrator ($ADMIN_NAME) entscheidet: 200" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
else
  pruefe 'Der Lauf fuer die Rolle admin haelt an' nein "lauf=${LAUF_C:-—}"
fi

# 5d. Eine Regel, nach der niemand entscheiden koennte: 400, kein Lauf.
starte "$TOK_M1" "ohne_einreicher=1&konten=$M1"
pruefe 'Ein leerer Kreis wird beim Start abgewiesen: 400' "$(ja_wenn "$CODE" 400)" \
  "HTTP $CODE $(rumpf | feld fehler)"

# --- 6. Sicherung, entfernen, zurueckholen -----------------------------------
echo "        (Sicherung laeuft, am Jetson einige Minuten)"
ruf "$TOK" POST /api/backup/sicherung
pruefe 'Eine Sicherung des Geraets laeuft durch' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" GET /api/backup/sicherungen
DB_LIVE="arasul_app_${APP//-/_}_live"
DB_TEST="arasul_app_${APP//-/_}_test"
pruefe 'Sie enthaelt die Datenbank des Livestandes' "$(enthaelt "$(rumpf)" "\"datenbank\":\"$DB_LIVE\"")"
pruefe 'und die des Teststandes' "$(enthaelt "$(rumpf)" "\"datenbank\":\"$DB_TEST\"")"

ruf "schluessel:$SCHLUESSEL" DELETE "/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
pruefe 'Die App wird entfernt, samt ihren Datenbanken' \
  "$([ "$CODE" = "200" ] && [ -n "$(rumpf | feld data.datenbanken_entfernt)" ] && echo ja || echo nein)" \
  "HTTP $CODE $(rumpf | feld data.datenbanken_entfernt)"

ruf "$TOK" POST "/api/backup/wiederherstellung/app/$APP" '{"bestaetigung":"falsch"}'
pruefe 'Zurueckholen ohne die Kennung als Bestaetigung: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
ruf "$TOK" POST "/api/backup/wiederherstellung/app/$APP" "{\"bestaetigung\":\"$APP\"}"
pruefe 'Die Daten der entfernten App kommen aus der Sicherung zurueck' \
  "$([ "$CODE" = "200" ] && [ "$(rumpf | feld data.erfolg)" = "true" ] && echo ja || echo nein)" \
  "HTTP $CODE staende=$(rumpf | feld data.staende.0.stand),$(rumpf | feld data.staende.1.stand)"

# Die App kommt wieder -- so, wie ein Partner sie wieder einspielt.
einspielen "$P2"
pruefe "$APP 1.0.1 wieder eingespielt" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'und live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_ADMIN,\"stand\":\"test\"}"
warte_auf_version "$LIVE" 1.0.1 && warte_auf_version "$TEST" 1.0.1

ruf "$TOK" GET "$LIVE/eintraege"
pruefe 'Der Livestand hat nach dem Entfernen seine Daten wieder' \
  "$(enthaelt "$(rumpf)" live-vor-update)" "$(rumpf)"
ruf "$TOK" GET "$TEST/eintraege"
pruefe 'der Teststand auch' "$(enthaelt "$(rumpf)" test-vor-update)" "$(rumpf)"
ruf "$TOK" POST "$LIVE/eintrag?text=live-nach-rueckholung"
pruefe 'und die App darf wieder schreiben (die Tabellen gehoeren ihrer Rolle)' \
  "$(ja_wenn "$CODE" 201)" "HTTP $CODE $(rumpf)"

# Und derselbe Weg bei einer App, die LAEUFT: was nach der Sicherung kam, ist
# danach weg, und der Container ist neu verbunden.
ruf "$TOK" POST "/api/backup/wiederherstellung/app/$APP" "{\"bestaetigung\":\"$APP\",\"stand\":\"live\"}"
pruefe 'Zurueckholen bei laufender App: Container neu gestartet' \
  "$([ "$CODE" = "200" ] && [ "$(rumpf | feld data.staende.0.neu_gestartet)" = "true" ] && echo ja || echo nein)" \
  "HTTP $CODE neu_gestartet=$(rumpf | feld data.staende.0.neu_gestartet)"
warte_auf_version "$LIVE" 1.0.1
ruf "$TOK" GET "$LIVE/eintraege"
pruefe 'und der Stand ist der der Sicherung' \
  "$([ "$(enthaelt "$(rumpf)" live-vor-update)" = ja ] &&
    [ "$(fehlt "$(rumpf)" live-nach-rueckholung)" = ja ] && echo ja || echo nein)" "$(rumpf)"
ruf "$TOK" POST "$LIVE/eintrag?text=live-danach"
pruefe 'und die App schreibt weiter' "$(ja_wenn "$CODE" 201)" "HTTP $CODE"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
