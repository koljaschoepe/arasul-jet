#!/bin/bash
# =============================================================================
# Abnahme M5: Korrekturfelder in der Freigabe
# =============================================================================
# Die Abnahme des Auftrags freigabe-korrekturfelder (04.10.2026), Probe-App
# `tests/probe-korrektur`: ein erkennender Flow `beleg` mit der Rolle `leser`
# (Felder betrag und datum, `aenderbar: [datum]`), dem Original
# `api/belege/<nr>.png`, einem Schritt `buchen` danach und einer zweiten Stufe
# `leitung`.
#
#   KONTRAKT     Fassung 10, die Regeln nennen `aenderbar` und `original`.
#   FEST         `beleg` rechnet mit der festen Antwort der Probe-App (externes
#                Modell im Netz der Apps), nicht mit dem echten Modell.
#   ANSICHT      Die Freigabe aus der Erkennung traegt die Felder (Vorschlag,
#                pruefen, aenderbar), keine Prozentzahl, das Original als
#                Adresse gleicher Herkunft, und das Original laedt.
#   KORREKTUR    Ein nicht freigegebenes Feld: 400, die Freigabe bleibt offen.
#                Der Einreicher: 403. Eine andere Person aendert `datum` und
#                bestaetigt: Vorschlag und Aenderung je Feld, wer und wann.
#   WEITER       Der Schritt danach bucht mit dem geaenderten Wert; die Stufe
#                Leitung sieht ihn und, was bisher geschah. Der Lauf endet fertig
#                und sein Ergebnis traegt den geaenderten Wert.
#   NACHLESEN    Die App liest Vorschlag und Aenderung (`GET /freigaben`), die
#                Laeufe-Ansicht der Verwaltung ebenso.
#   BAUSTEIN     (ARASUL_BILDER=1) `korrektur-bilder.mjs`: dieselbe Freigabe in
#                Arasul und in der App mit dem Muster von /marken/5/, Original
#                links, pruefen oben; in der App korrigiert und bestaetigt, danach
#                wieder die Liste.
#
# Konten: drei VORHANDENE Probekonten, nie `admin`, keine neuen. Passwoerter
# nur zur Laufzeit:
#
#   ARASUL_URL=https://100.121.244.80 \
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   ARASUL_B=probe-j36-b ARASUL_B_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-b')" \
#   ARASUL_GERAET=arasul@<orin> ARASUL_BILDER=1 bash scripts/test/korrektur-abnahme.sh
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-korrektur-<MMDD>` (samt Image und
# Ordner), die Freigaben der App an die drei Konten, den Wegwerf-Schluessel.
# Ob unter /arasul/apps ein Ordner bleibt, prueft der Aufrufer am Geraet.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-korrektur"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="${ARASUL_KORREKTUR_APP:-probe-korrektur-$STEMPEL}"
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
# Mindestens: eine Kontraktfassung zaehlt hoch, ein fester Wert wird mit jeder
# neuen Fassung rot, ohne dass etwas kaputt waere. Eine Zahl, die kleiner ist
# oder fehlt, ist der Fehler.
mind_wenn() { if [ "${1:-}" -ge "$2" ] 2>/dev/null; then echo ja; else echo nein; fi; }

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

# Die offene Anfrage eines Laufs (mit Titel, wenn genannt) aus einer Liste `data`, als JSON.
anfrage_zu_lauf() {
  python3 -c 'import sys,json
lauf = int(sys.argv[1]); titel = sys.argv[2] if len(sys.argv) > 2 else ""
try: liste = json.load(sys.stdin)["data"]
except Exception: print(""); raise SystemExit
for a in liste:
    # Seit Kontrakt 14 (#929) steht der Titel des Laufs vorn: „12,50 – Erkennung …".
    t = a.get("titel") or ""
    if int(a.get("run_id", -1)) == lauf and (not titel or t == titel or t.endswith(" – " + titel)):
        print(json.dumps(a, ensure_ascii=False)); raise SystemExit
print("")' "$@" 2>/dev/null
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
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$VERSION" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Probe: Korrektur (%s)" % kennung.rsplit("-", 1)[-1]
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket.tgz"
}

# Den Flow `beleg` als A starten. Setzt $LAUF.
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
    case "$STATUS" in fertig | fehler | abgebrochen | abgelaufen) return 1 ;; esac
    sleep 2
  done
  return 1
}

# Die offene Anfrage mit Titel $2 zum Lauf in der Liste von $1. Setzt $ANFRAGE
# (id) und $ANFRAGE_JSON.
ANFRAGE=""
ANFRAGE_JSON=""
warte_auf_anfrage() {
  local tok="$1" titel="$2" ende=$((SECONDS + HALT_GEDULD))
  ANFRAGE=""
  ANFRAGE_JSON=""
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$tok" GET /api/freigabe-anfragen
    ANFRAGE_JSON=$(rumpf | anfrage_zu_lauf "$LAUF" "$titel")
    if [ -n "$ANFRAGE_JSON" ]; then
      ANFRAGE=$(printf '%s' "$ANFRAGE_JSON" | feld id)
      return 0
    fi
    sleep 3
  done
  return 1
}

# Ein Feld der Anfrage aus $ANFRAGE_JSON nach Name: `feld_der_anfrage datum aenderbar`.
feld_der_anfrage() {
  printf '%s' "$ANFRAGE_JSON" | python3 -c 'import sys,json
a = json.load(sys.stdin); f = next((x for x in (a.get("felder") or []) if x["name"] == sys.argv[1]), {})
v = f.get(sys.argv[2])
print(json.dumps(v) if isinstance(v, bool) else ("" if v is None else v))' "$1" "$2" 2>/dev/null
}

bilder() {
  [ "${ARASUL_BILDER:-}" = "1" ] || return 0
  ARASUL_A="$A" ARASUL_A_PASSWORT="$A_PASS" ARASUL_B="$B" ARASUL_B_PASSWORT="$B_PASS" \
    ARASUL_KORREKTUR_APP="$APP" ARASUL_LAUF="$LAUF" \
    node "$WURZEL/scripts/test/korrektur-bilder.mjs" "$1" | sed 's/^/  bild /'
  local ergebnis="${PIPESTATUS[0]}"
  pruefe "Bilder: $1" "$(ja_wenn "$ergebnis" 0)"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi

echo "=== Abnahme M5: Korrekturfelder in der Freigabe, $APP gegen $BASIS ==="
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
pruefe 'Drei vorhandene Probekonten, keine neuen' \
  "$([ -n "$ID_ADMIN" ] && [ -n "$ID_A" ] && [ -n "$ID_B" ] && echo ja || echo nein)"

SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=()
aufraeumen() {
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
  printf 'aufgeraeumt  Freigaben zurueckgenommen, %s entfernt (mit Ordnern), Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Korrektur ($APP)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 2. Kontrakt 10 ---------------------------------------------------------------
ruf "schluessel:$SCHLUESSEL" GET /api/v1/external/contract
KONTRAKT=$(rumpf | feld data.kontrakt)
[ -z "$KONTRAKT" ] && KONTRAKT=$(rumpf | feld kontrakt)
pruefe 'Der Kontrakt hat mindestens Fassung 10' "$(mind_wenn "$KONTRAKT" 10)" "kontrakt=${KONTRAKT:-—}"
pruefe 'Die Regeln nennen ergebnis.aenderbar und original' \
  "$(grep -q 'ergebnis.aenderbar' "$RUMPF_DATEI" && grep -q '`original` an einem erkennenden Schritt' "$RUMPF_DATEI" && echo ja || echo nein)"

# --- 3. Einspielen, live, drei Freigaben, feste Antwort -----------------------------
PAKET=$(baue_paket)
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET" "$BASIS/api/v1/external/apps")
pruefe "$APP in den Teststand (Flow mit aenderbar und original)" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
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

# Gemessen wird die Freigabe, nicht ein Modell: `beleg` rechnet ueber den Weg des
# Administrators mit einem externen Modell, das die Probe-App selbst ist
# (`/v1/chat/completions`, tests/probe-korrektur/backend/server.js).
ruf "$TOK" PUT "/api/apps/$APP/flows/beleg/modell" \
  "{\"extern\":{\"anbieter\":\"Probe\",\"modell\":\"fest\",\"basis_url\":\"http://arasul-app-$APP-live:8080/v1\"}}"
pruefe 'beleg rechnet mit der festen Antwort der Probe-App, ohne Modell' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# --- 4. Die Freigabe aus der Erkennung -----------------------------------------------
TITEL_ERKENNUNG='Erkennung unsicher: Feld datum'
TITEL_LEITUNG='Beleg 4711 zeichnen'
if ! starten 'beleg=4711&datum=&unsicher='; then
  pruefe 'beleg gestartet' nein
  exit 1
fi
warte_status wartend
pruefe 'Datum nicht erkannt: der Lauf haelt an' "$(ja_wenn "$STATUS" wartend)" "lauf=$LAUF status=${STATUS:-—}"
warte_auf_anfrage "$TOK_B" "$TITEL_ERKENNUNG"
pruefe "$B sieht \"$TITEL_ERKENNUNG\" in der Stufe Pruefung" \
  "$([ -n "$ANFRAGE" ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld stufe)" = pruefung ] && echo ja || echo nein)" "anfrage=${ANFRAGE:-—}"
P1="$ANFRAGE"
pruefe 'Felder: datum zu pruefen (nicht erkannt) und aenderbar, oben' \
  "$([ "$(printf '%s' "$ANFRAGE_JSON" | feld felder.0.name)" = datum ] && [ "$(feld_der_anfrage datum fehlend)" = true ] && [ "$(feld_der_anfrage datum aenderbar)" = true ] && echo ja || echo nein)"
pruefe 'Felder: betrag mit Vorschlag 12,50, nicht aenderbar' \
  "$([ "$(feld_der_anfrage betrag vorschlag)" = '12,50' ] && [ "$(feld_der_anfrage betrag aenderbar)" = false ] && echo ja || echo nein)"
pruefe 'Keine Prozentzahl an den Feldern' \
  "$(grep -q '%' <<<"$(printf '%s' "$ANFRAGE_JSON" | feld felder)" && echo nein || echo ja)"
ORIGINAL=$(printf '%s' "$ANFRAGE_JSON" | feld original)
pruefe 'Das Original ist eine Adresse der App' "$(ja_wenn "$ORIGINAL" "/apps/$APP/api/belege/4711.png")" "$ORIGINAL"
ruf "$TOK_B" GET "$ORIGINAL"
# Die Bytes 2 bis 4 des PNG-Kopfs. Nicht `grep PNG`: hinter dem Byte 0x89
# fand grep unter macOS (UTF-8) nichts, das Original war trotzdem da.
pruefe "Das Original laedt mit der Sitzung von $B" \
  "$([ "$CODE" = 200 ] && [ "$(head -c 4 "$RUMPF_DATEI" | tail -c 3)" = PNG ] && echo ja || echo nein)" "HTTP $CODE"

bilder vorher

# --- 5. Korrigieren: nur, was die App freigibt ---------------------------------------
ruf "$TOK_B" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{"felder":{"betrag":"99,00"}}'
pruefe 'Ein nicht freigegebenes Feld (betrag): 400, mit Grund' \
  "$([ "$CODE" = 400 ] && grep -q 'nicht änderbar' "$RUMPF_DATEI" && echo ja || echo nein)" "HTTP $CODE $(rumpf | feld error.message | cut -c1-70)"
ruf "$TOK_B" GET /api/freigabe-anfragen
pruefe 'Danach ist die Freigabe noch offen' \
  "$([ -n "$(rumpf | anfrage_zu_lauf "$LAUF" "$TITEL_ERKENNUNG")" ] && echo ja || echo nein)"
ruf "$TOK_B" POST "/api/freigabe-anfragen/$P1/ablehnen" '{"begruendung":"x","felder":{"datum":"x"}}'
pruefe 'Eine Ablehnung traegt keine Felder: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
ruf "$TOK_A" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{"felder":{"datum":"01.10.2026"}}'
pruefe "$A (Einreicher) bestaetigt nicht: 403" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
ruf "$TOK_B" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{"felder":{"datum":"01.10.2026"}}'
pruefe "$B aendert datum und bestaetigt" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe 'Die Antwort nennt Vorschlag, Aenderung, wer und wann' \
  "$([ "$(rumpf | feld data.korrekturen.0.feld)" = datum ] && [ "$(rumpf | feld data.korrekturen.0.vorschlag)" = '' ] && [ "$(rumpf | feld data.korrekturen.0.wert)" = '01.10.2026' ] && [ "$(rumpf | feld data.korrekturen.0.von)" = "$B" ] && [ -n "$(rumpf | feld data.korrekturen.0.am)" ] && echo ja || echo nein)" \
  "$(rumpf | feld data.korrekturen | cut -c1-120)"

# --- 6. Der weitere Lauf arbeitet mit dem geaenderten Wert ---------------------------
warte_auf_anfrage "$TOK" "$TITEL_LEITUNG"
pruefe 'Danach haelt der Lauf in der Stufe Leitung' \
  "$([ -n "$ANFRAGE" ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld stufe)" = leitung ] && echo ja || echo nein)" "anfrage=${ANFRAGE:-—}"
P2="$ANFRAGE"
pruefe 'Die Buchung davor nennt den geaenderten Wert 01.10.2026' \
  "$(grep -q 'datum: 01.10.2026' <<<"$(printf '%s' "$ANFRAGE_JSON" | feld zusammenhang)" && echo ja || echo nein)" \
  "$(printf '%s' "$ANFRAGE_JSON" | feld zusammenhang | cut -c1-90)"
pruefe 'Was bisher geschah: Pruefung bestaetigt von B, mit der Aenderung' \
  "$([ "$(printf '%s' "$ANFRAGE_JSON" | feld frueher.0.status)" = bestaetigt ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld frueher.0.entschieden_von)" = "$B" ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld frueher.0.korrekturen.0.wert)" = '01.10.2026' ] && echo ja || echo nein)"

bilder leitung

ruf "$TOK" POST "/api/freigabe-anfragen/$P2/bestaetigen" '{}'
pruefe "$ARASUL_BENUTZER bestaetigt die Leitung" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
warte_status fertig "$LAUF_GEDULD"
pruefe 'Der Lauf endet fertig' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
ruf "$TOK_A" GET "/apps/$APP/api/lauf?lauf=$LAUF"
pruefe 'Sein Ergebnis traegt den geaenderten Wert' \
  "$(grep -q '01.10.2026' <<<"$(rumpf | feld ergebnis)" && echo ja || echo nein)" "$(rumpf | feld ergebnis | cut -c1-100)"

# --- 7. Nachlesen: die App und die Laeufe-Ansicht -------------------------------------
ruf "$TOK_A" GET "/apps/$APP/api/freigaben?lauf=$LAUF"
APP_SICHT=$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
a = next((x for x in d if x.get("felder_schritt") == "lesen"), {})
k = (a.get("korrekturen") or [{}])[0]
print("|".join(str(v) for v in [a.get("status"), k.get("feld"), k.get("vorschlag"), k.get("wert"), k.get("von"), bool(k.get("am"))]))' 2>/dev/null)
pruefe 'Die App liest Vorschlag und Aenderung (GET /freigaben)' \
  "$(ja_wenn "$APP_SICHT" "bestaetigt|datum||01.10.2026|$B|True")" "$APP_SICHT"

ruf "$TOK" GET "/api/laeufe/$LAUF"
LAUF_SICHT=$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
f = next((x for x in d.get("freigaben", []) if x.get("felder")), {})
k = (f.get("korrekturen") or [{}])[0]
lesen = next((s for s in d["steps"] if s["kind"] == "subagent" and s["name"] == "leser"), {})
buchen = next((s for s in d["steps"] if s["kind"] == "subagent" and s["name"] == "bucher"), {})
frei = next((s for s in d["steps"] if s["kind"] == "werkzeug" and "Geändert" in (s.get("output") or "")), {})
print("|".join([
  "vorschlag" if "datum: " in (lesen.get("output") or "") and "01.10.2026" not in (lesen.get("output") or "") else "?",
  "korrektur" if k.get("wert") == "01.10.2026" and k.get("vorschlag") == "" else "?",
  "buchung" if "01.10.2026" in (buchen.get("output") or "") else "?",
  "protokoll" if frei else "?"]))' 2>/dev/null)
pruefe 'Laeufe-Ansicht: Vorschlag am Schritt, Korrektur an der Freigabe, Buchung mit neuem Wert' \
  "$(ja_wenn "$LAUF_SICHT" 'vorschlag|korrektur|buchung|protokoll')" "$LAUF_SICHT"

bilder lauf

# --- 8. Alles erkannt: keine Freigabe der Erkennung ------------------------------------
if starten 'beleg=4712&datum=02.10.2026&unsicher='; then
  warte_auf_anfrage "$TOK" 'Beleg 4712 zeichnen'
  pruefe 'Alles erkannt: gleich die Stufe Leitung, ohne Felder und ohne fruehere Stufe' \
    "$([ -n "$ANFRAGE" ] && [ -z "$(printf '%s' "$ANFRAGE_JSON" | feld felder)" ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld frueher)" = '[]' ] && echo ja || echo nein)"
  ruf "$TOK" POST "/api/freigabe-anfragen/$ANFRAGE/ablehnen" '{"begruendung":"Abnahme M5 Korrektur: nicht gebraucht"}'
  warte_status 'abgebrochen' 60
  pruefe 'abgelehnt, der Lauf endet abgebrochen' "$(ja_wenn "$STATUS" abgebrochen)" "status=${STATUS:-—}"
else
  pruefe 'Zweiter Lauf gestartet' nein
fi

# --- 9. Der Baustein in der App: korrigieren und bestaetigen im Browser ---------------
if [ "${ARASUL_BILDER:-}" = "1" ]; then
  if starten 'beleg=4713&datum=&unsicher=%22betrag%22'; then
    warte_auf_anfrage "$TOK_B" 'Erkennung unsicher: Felder datum, betrag'
    pruefe 'Datum fehlt, Betrag unsicher: beide zu pruefen' "$([ -n "$ANFRAGE" ] && echo ja || echo nein)" "anfrage=${ANFRAGE:-—}"
    bilder baustein
    warte_auf_anfrage "$TOK" 'Beleg 4713 zeichnen'
    pruefe 'Im Baustein korrigiert: die Freigabe traegt 03.10.2026 von B' \
      "$([ "$(printf '%s' "$ANFRAGE_JSON" | feld frueher.0.korrekturen.0.wert)" = '03.10.2026' ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld frueher.0.korrekturen.0.von)" = "$B" ] && echo ja || echo nein)" \
      "$(printf '%s' "$ANFRAGE_JSON" | feld frueher.0.korrekturen | cut -c1-100)"
    [ -n "$ANFRAGE" ] && ruf "$TOK" POST "/api/freigabe-anfragen/$ANFRAGE/ablehnen" '{"begruendung":"Abnahme M5 Korrektur: Ende"}'
  else
    pruefe 'Dritter Lauf gestartet' nein
  fi
fi

if [ -n "${ARASUL_GERAET:-}" ]; then
  ZEILEN="$(ssh -o BatchMode=yes "$ARASUL_GERAET" \
    "docker exec postgres-db psql -U arasul -d arasul_db -At -c \"SELECT details FROM audit_logs WHERE action = 'freigabe_bestaetigt' AND timestamp >= '$BEGINN' ORDER BY timestamp\"" 2>/dev/null)"
  pruefe 'audit_logs: freigabe_bestaetigt nennt das geaenderte Feld, nicht seinen Inhalt' \
    "$(grep -q '"geaendert": *\["datum"\]' <<<"$ZEILEN" && ! grep -q '01.10.2026' <<<"$ZEILEN" && echo ja || echo nein)" \
    "$(printf '%s\n' "$ZEILEN" | wc -l | tr -d ' ') Zeilen"
else
  echo "(ohne ARASUL_GERAET kein Blick in audit_logs)"
fi

# --- 10. Aufraeumen ist Teil der Messung ------------------------------------------------
fehl=""
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
