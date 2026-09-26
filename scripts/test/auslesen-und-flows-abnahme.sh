#!/bin/bash
# =============================================================================
# Abnahme „Flows im KI-Protokoll, Auslesen ohne 408" (J35, 26.09.2026)
# =============================================================================
# Die App-Bau-Probe vom 26.09.2026 fand zwei Luecken am Produkt:
#
#   1. Nach einer Freigabe schrieb ein Flow einen Satz mit dem Modell, und in
#      `ki_aufrufe` standen nur die Auslesungen.
#   2. Bei sechs gleichzeitigen Auslesungen bekam ein Foto nach 60 s ein 408,
#      und das Geraet hatte es zehn Sekunden spaeter fertig.
#
# Gemessen wird mit der Proben-App `tests/probe-auslesen`:
#
#   KONTRAKT  nennt `warten` (202) und den Abholweg des Auslesens.
#   SECHS     sechs Auslesungen gleichzeitig ueber die App: alle kommen an,
#             keine 408, jede steht als `fertig` im Protokoll.
#   ABHOLEN   eine Auslesung mit `timeout_seconds=1`: erst 202, dann holt die
#             App ab und bekommt 200 mit `data` -- ohne die Datei zweimal zu
#             schicken.
#   FLOW      ein Mitarbeiter reicht ueber die App ein, bestaetigt die
#             Freigabe, der Flow schreibt seinen Satz, und der Modellschritt
#             steht im Protokoll: App, Einreicher, Modell, Dauer, Lauf.
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-auslesen` (samt Image und
# Freigaben), einen Mitarbeiter mit Stempel, einen Wegwerf-Schluessel. Die
# Zeilen im Protokoll BLEIBEN -- das ist die Zusage aus Migration 187.
#
# Aufruf (am Orin ueber LAN):
#   ARASUL_URL=https://192.168.0.197 ARASUL_PASSWORT=... \
#   bash scripts/test/auslesen-und-flows-abnahme.sh
# Optional ARASUL_PROBE_MODELL=<id> fuer das Auslesen (Vorgabe: das
# Standardmodell des Geraets, wie in der App-Bau-Probe) und
# ARASUL_PARALLEL=6.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-auslesen"
APP="probe-auslesen"
MODELL="${ARASUL_PROBE_MODELL:-}"
PARALLEL="${ARASUL_PARALLEL:-6}"
STEMPEL="$(date +%H%M%S)"
M1="abnahme-auslesen-$STEMPEL"
PASS="Abnahme-$STEMPEL!"
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

# Die Zeilen des Protokolls zu einem Schluessel (job_id oder lauf_id), als
# JSON-Liste.
zeilen_zu() {
  python3 -c 'import sys,json
schluessel, wert = sys.argv[1], sys.argv[2]
try: liste = json.load(sys.stdin)["data"]
except Exception: print("[]"); raise SystemExit
print(json.dumps([z for z in liste if str(z.get(schluessel)) == wert], ensure_ascii=False))' "$1" "$2" 2>/dev/null
}

# Die Anfrage zu einem Lauf aus `GET /api/freigabe-anfragen`, oder leer.
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
    -d "$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2")" \
    "$BASIS/api/auth/login" | feld token
}

baue_paket() {
  local ordner="$ARBEIT/paket"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/app.json" "$ordner/"
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket.tgz"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi

echo "=== Abnahme Flows im KI-Protokoll, Auslesen ohne 408 (J35) gegen $BASIS ==="
echo

# --- 1. Zugaenge -------------------------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && { echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

SCHLUESSEL=""
KEY_ID=""
ID_M1=""
aufraeumen() {
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  [ -n "$ID_M1" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
    -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$ID_M1"
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  %s entfernt, Mitarbeiter geloescht, Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme J35 (auslesen und flows)","allowed_endpoints":["app:deploy"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

ruf "$TOK" POST /api/benutzer \
  "{\"username\":\"$M1\",\"password\":\"$PASS\",\"email\":\"$M1@abnahme.local\",\"rolle\":\"mitarbeiter\"}"
ID_M1=$(rumpf | feld data.id)
pruefe 'Wegwerf-Mitarbeiter angelegt' "$([ -n "$ID_M1" ] && echo ja || echo nein)" \
  "$M1=${ID_M1:-HTTP $CODE $(rumpf | feld error.message)}"
TOK_M1=$(anmelden "$M1" "$PASS")
pruefe 'und meldet sich an' "$([ -n "$TOK_M1" ] && echo ja || echo nein)"
[ -z "$TOK_M1" ] && exit 1

# --- 2. Der Kontrakt nennt 202 und den Weg -------------------------------------
ruf "schluessel:$SCHLUESSEL" GET /api/v1/external/contract
pruefe 'Der Kontrakt nennt warten: 202' "$(ja_wenn "$(rumpf | feld data.warten.status)" 202)" \
  "kontrakt=$(rumpf | feld data.kontrakt)"
pruefe 'und den Abholweg des Auslesens' \
  "$(ja_wenn "$(rumpf | feld data.auslesen.abholen)" 'document/extract-structured/:job_id')"
pruefe 'und Flows unter den Wegen des Protokolls' \
  "$([[ "$(rumpf | feld data.protokoll.wege)" == *'flows/:name/run'* ]] && echo ja || echo nein)"

# --- 3. Einspielen, live, freigeben --------------------------------------------
PAKET=$(baue_paket)
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET" "$BASIS/api/v1/external/apps")
pruefe "$APP in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE $(rumpf | feld error.message)"
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_M1}"
pruefe 'Dem Mitarbeiter freigegeben' "$([[ "$CODE" =~ ^20[01]$ ]] && echo ja || echo nein)" \
  "HTTP $CODE"

LIVE="/apps/$APP/api"
ende=$((SECONDS + 180))
while [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK_M1" GET "$LIVE/gesund"
  [ "$CODE" = "200" ] && break
  sleep 3
done
pruefe 'Die App antwortet dem Mitarbeiter' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# --- 4. Sechs Auslesungen gleichzeitig -----------------------------------------
MODELL_Q="${MODELL:+&modell=$MODELL}"
echo "        ($PARALLEL Belege gleichzeitig; die Warteschlange rechnet einen nach dem anderen)"
BEGINN=$SECONDS
for i in $(seq 1 "$PARALLEL"); do
  (
    TEXT_Q=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' \
      "Rechnung Nr. R-$STEMPEL-$i vom 2$i.09.2026. Buerobedarf Schulze GmbH, Hauptstrasse $i, 10115 Berlin, St-Nr. 27/123/4567$i. Positionen: $i x Druckerpapier A4 zu 4,90 EUR; 2 x Toner schwarz zu 39,90 EUR; 1 x Ordner-Set zu 12,50 EUR; 3 x Kugelschreiber zu 1,20 EUR. Netto $((i + 100)),40 EUR, USt 19 %, Brutto $((i + 120)),08 EUR. Zahlbar bis 10.10.2026 auf DE89 3704 0044 0532 0130 0$i.")
    curl -sk -o "$ARBEIT/beleg-$i.json" -w '%{http_code}' --max-time "$GEDULD" -X POST \
      -H "authorization: Bearer $TOK_M1" "$BASIS$LIVE/beleg?text=$TEXT_Q$MODELL_Q" \
      >"$ARBEIT/beleg-$i.code"
  ) &
done
wait
DAUER=$((SECONDS - BEGINN))

ANGEKOMMEN=0
ABGEHOLT=0
EIN_408=0
JOBS=()
for i in $(seq 1 "$PARALLEL"); do
  code=$(cat "$ARBEIT/beleg-$i.code" 2>/dev/null)
  erst=$(feld erst <"$ARBEIT/beleg-$i.json")
  schluss=$(feld ende <"$ARBEIT/beleg-$i.json")
  job=$(feld job_id <"$ARBEIT/beleg-$i.json")
  printf '        Beleg %s: App %s, Geraet erst %s, zuletzt %s, abgeholt %sx, %s ms, job %s\n' \
    "$i" "$code" "${erst:-—}" "${schluss:-—}" "$(feld abgeholt <"$ARBEIT/beleg-$i.json")" \
    "$(feld dauer_ms <"$ARBEIT/beleg-$i.json")" "${job:-—}"
  [ "$erst" = 408 ] || [ "$schluss" = 408 ] && EIN_408=$((EIN_408 + 1))
  [ "$code" = 200 ] && [ "$schluss" = 200 ] && [ -n "$job" ] && ANGEKOMMEN=$((ANGEKOMMEN + 1)) &&
    JOBS+=("$job")
  [ "$erst" = 202 ] && ABGEHOLT=$((ABGEHOLT + 1))
done
pruefe "Alle $PARALLEL Auslesungen kommen an" "$(ja_wenn "$ANGEKOMMEN" "$PARALLEL")" \
  "$ANGEKOMMEN von $PARALLEL in ${DAUER} s, davon $ABGEHOLT abgeholt"
pruefe 'Keine davon ein 408' "$(ja_wenn "$EIN_408" 0)" "$EIN_408"
# Ohne mehr als 60 s haette die Probe nichts gemessen: das alte Netz schnitt
# nach 60 s ab.
pruefe 'Die letzte kam nach mehr als 60 s (sonst misst die Probe das alte Netz nicht)' \
  "$([ "$DAUER" -gt 60 ] && echo ja || echo nein)" "${DAUER} s"

# Die Zeilen schliesst der Dienst im Takt einer Sekunde.
sleep 3
ruf "$TOK" GET "/api/apps/$APP/ki-aufrufe?limit=200"
ALLES="$(rumpf)"
FERTIG=0
for job in "${JOBS[@]}"; do
  z=$(printf '%s' "$ALLES" | zeilen_zu job_id "$job")
  [ "$(printf '%s' "$z" | feld 0.status)" = fertig ] &&
    [ "$(printf '%s' "$z" | feld 0.benutzer_name)" = "$M1" ] && FERTIG=$((FERTIG + 1))
done
pruefe 'Jede steht als fertig mit dem Menschen im Protokoll' "$(ja_wenn "$FERTIG" "$PARALLEL")" \
  "$FERTIG von $PARALLEL"

# --- 5. Abholen nach der Wartezeit ---------------------------------------------
ruf "$TOK_M1" POST "$LIVE/beleg?warten=1$MODELL_Q"
pruefe 'Mit timeout_seconds=1 antwortet das Geraet erst 202' "$(ja_wenn "$(rumpf | feld erst)" 202)" \
  "erst=$(rumpf | feld erst)"
pruefe 'und die App holt 200 mit data ab' \
  "$([ "$(rumpf | feld ende)" = 200 ] && [ -n "$(rumpf | feld daten)" ] && echo ja || echo nein)" \
  "ende=$(rumpf | feld ende) abgeholt=$(rumpf | feld abgeholt)x daten=$(rumpf | feld daten) $(rumpf | feld fehler)"
JOB_A=$(rumpf | feld job_id)
ruf "$TOK" GET "/api/apps/$APP/ki-aufrufe?limit=200"
pruefe 'und es ist EIN Aufruf im Protokoll, nicht zwei' \
  "$(ja_wenn "$(rumpf | zeilen_zu job_id "$JOB_A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')" 1)"

# --- 6. Der Satz eines Flows nach der Freigabe --------------------------------
ruf "$TOK_M1" POST "$LIVE/einreichen?vorgang=V-$STEMPEL"
LAUF=$(rumpf | feld lauf)
pruefe "$M1 reicht ueber die App ein" "$([ -n "$LAUF" ] && echo ja || echo nein)" \
  "HTTP $CODE lauf=${LAUF:-—}"
ANFRAGE=""
ende=$((SECONDS + 180))
while [ -n "$LAUF" ] && [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK_M1" GET /api/freigabe-anfragen
  ANFRAGE=$(rumpf | anfrage_zu_lauf "$LAUF")
  [ -n "$ANFRAGE" ] && break
  sleep 2
done
pruefe 'Der Lauf haelt an der Freigabe' "$([ -n "$ANFRAGE" ] && echo ja || echo nein)" \
  "anfrage=${ANFRAGE:-—}"
ruf "$TOK_M1" POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
pruefe 'und wird bestaetigt' "$(ja_wenn "$CODE" 200)" "HTTP $CODE $(rumpf | feld error.message)"
echo "        (das Modell schreibt seinen Satz)"
STATUS=""
ende=$((SECONDS + 600))
while [ -n "$LAUF" ] && [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK_M1" GET "$LIVE/lauf?lauf=$LAUF"
  STATUS=$(rumpf | feld status)
  case "$STATUS" in fertig | fehler | abgebrochen | abgelaufen) break ;; esac
  sleep 3
done
SATZ=$(rumpf | feld ergebnis)
pruefe 'Der Flow schreibt seinen Satz' "$(ja_wenn "$STATUS" fertig)" "$STATUS: ${SATZ:0:160}"

sleep 2
ruf "$TOK" GET "/api/apps/$APP/ki-aufrufe?limit=200"
SCHRITTE=$(rumpf | zeilen_zu lauf_id "$LAUF")
ANZAHL=$(printf '%s' "$SCHRITTE" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
pruefe 'Der Modellschritt des Flows steht im Protokoll' "$([ "${ANZAHL:-0}" -ge 1 ] && echo ja || echo nein)" \
  "$ANZAHL Zeile(n) zu Lauf $LAUF"
if [ "${ANZAHL:-0}" -ge 1 ]; then
  s() { printf '%s' "$SCHRITTE" | feld "0.$1"; }
  pruefe 'mit App und Stand' "$([ "$(s app_id)" = "$APP" ] && [ "$(s stand)" = live ] && echo ja || echo nein)" \
    "app=$(s app_id) stand=$(s stand)"
  pruefe 'mit dem Einreicher' "$(ja_wenn "$(s benutzer_name)" "$M1")" "benutzer=$(s benutzer_name)"
  pruefe 'mit Modell, Dauer und Ausgang' \
    "$([ -n "$(s modell)" ] && [ "$(s status)" = fertig ] && [ "$(s dauer_ms)" -gt 0 ] && echo ja || echo nein)" \
    "modell=$(s modell) dauer_ms=$(s dauer_ms) status=$(s status)"
  pruefe 'mit dem Weg flows/satz und dem sha256 der Antwort' \
    "$([ "$(s endpunkt)" = flows/satz ] && [[ "$(s antwort_sha256)" =~ ^[0-9a-f]{64}$ ]] && echo ja || echo nein)" \
    "endpunkt=$(s endpunkt)"
  pruefe 'und ohne den Satz selbst' \
    "$([ -n "$SATZ" ] && [[ "$(rumpf)" != *"${SATZ:0:40}"* ]] && echo ja || echo nein)"
fi

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
