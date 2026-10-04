#!/bin/bash
# =============================================================================
# Abnahme M5: Rückfall im Gerät, Freigaben ohne eigene Ansicht der App
# =============================================================================
# Die Abnahme des Auftrags freigabe-rueckfall-im-geraet (04.10.2026). PR 886
# nahm das Entscheiden von der Startseite; eine App, die `?freigabe=` nicht
# liest, hatte danach keinen Weg mehr, ihre Freigaben zu entscheiden. Seit
# Kontrakt 12 gilt: erklärt eine App im Manifest nicht `zeigt_freigaben`,
# öffnet ein Klick in „Für Sie" die Freigabe in Arasul selbst.
#
# Zwei Probe-Apps aus `tests/probe-rueckfall` (Flow `beleg` mit änderbarem Feld
# datum, Original und zwei Stufen), nur das Manifest unterscheidet sie:
#
#   probe-rueckfall-<STEMPEL>   ohne `zeigt_freigaben`: „zeigt nicht selbst"
#   probe-tieflink-<STEMPEL>    mit `zeigt_freigaben: true`
#
#   KONTRAKT   Fassung 12, die Regeln nennen `zeigt_freigaben`; ein Manifest mit
#              einem Text statt true/false wird abgewiesen.
#   LISTE      B reicht ein, A sieht die Freigabe in „Für Sie" mit
#              app_zeigt_freigaben=false (Rückfall), bei der Tieflink-App true.
#   REGELN     Der Einreicher B sieht nichts und bekommt 403; liegt die nächste
#              Stufe bei einem anderen (Standardperson), bekommt A 409.
#   BROWSER    A öffnet die Freigabe in Arasul (Original links, Felder rechts,
#              „prüfen" oben), ändert datum, bestätigt, steht wieder in der Liste;
#              bei der Tieflink-App öffnet derselbe Klick die App mit ?freigabe=.
#   LAUF       Der Lauf geht weiter: Stufe Leitung mit dem geänderten Wert und
#              dem Satz Bisheriges; der Admin bestätigt, der Lauf endet fertig.
#   BELEGE     NUR LESEND: die Freigaben der echten App `belege` tragen
#              app_zeigt_freigaben=false, ihre Manifeste nennen das Feld nicht
#              (Auskunft aus der Datenbank, nichts wird entschieden oder
#              geändert; braucht ARASUL_GERAET).
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
#   bash scripts/test/rueckfall-abnahme.sh
#
# WAS ES ANLEGT, RÄUMT ES WEG: beide Apps (samt Image und Ordnern), die
# Freigaben der Apps an die drei Konten, die Standardperson, den Wegwerf-
# Schlüssel. Ist `belege` am Gerät, wird dort nichts angefasst.
#
# Rückgabe 0, wenn jede Prüfung grün war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:-}"
QUELLE="$WURZEL/tests/probe-rueckfall"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="probe-rueckfall-$STEMPEL"
TIEF="probe-tieflink-$STEMPEL"
VERSION="1.0.0"
GEDULD=900
HALT_GEDULD=300
LAUF_GEDULD=600

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

# Die offene Anfrage eines Laufs (mit Titel, wenn genannt) aus einer Liste `data`, als JSON.
anfrage_zu_lauf() {
  python3 -c 'import sys,json
lauf = int(sys.argv[1]); titel = sys.argv[2] if len(sys.argv) > 2 else ""
try: liste = json.load(sys.stdin)["data"]
except Exception: print(""); raise SystemExit
for a in liste:
    if int(a.get("run_id", -1)) == lauf and (not titel or a.get("titel") == titel):
        print(json.dumps(a, ensure_ascii=False)); raise SystemExit
print("")' "$@" 2>/dev/null
}

anmelden() {
  curl -sk -X POST -H 'content-type: application/json' --max-time 30 \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2")" \
    "$BASIS/api/auth/login" | feld token
}


baue_paket() { # app zeigt(ja|nein)
  local app="$1" zeigt="$2" ordner="$ARBEIT/paket-$1"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$app" "$VERSION" "$zeigt" <<'PY'
import json, sys
quelle, ziel, kennung, version, zeigt = sys.argv[1:6]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Probe: %s" % kennung.replace("probe-", "").replace("-", " ")
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
if zeigt == "ja":
    m["zeigt_freigaben"] = True
    m["beschreibung"] = "Messgeraet fuer scripts/test/rueckfall-abnahme.sh: erklaert zeigt_freigaben, die Startseite oeffnet sie mit ?freigabe= (M5)."
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket-$app.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket-$app.tgz"
}

# Eine Probe-App einspielen, live schalten, den drei Konten freigeben, feste Antwort.
spiele_ein() { # app zeigt
  local app="$1" zeigt="$2" paket id codes=""
  paket=$(baue_paket "$app" "$zeigt") || return 1
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$paket" "$BASIS/api/v1/external/apps")
  pruefe "$app in den Teststand (zeigt_freigaben: $zeigt)" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
  [ "$CODE" != "201" ] && { rumpf; echo; return 1; }
  ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$app/schalten" '{"ziel":"live"}'
  pruefe "$app live geschaltet" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  for id in "$ID_ADMIN" "$ID_A" "$ID_B"; do
    ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$app\",\"benutzer_id\":$id}"
    codes="$codes $CODE"
    [[ "$CODE" =~ ^20[01]$ ]] && FREIGEGEBEN+=("$app:$id")
  done
  pruefe "$app ist $ARASUL_BENUTZER, $A und $B freigegeben" "$([[ "$codes" =~ ^(\ 20[01]){3}$ ]] && echo ja || echo nein)" "HTTP$codes"
  if arasul_warte_auf_app "/apps/$app/api/gesund" 240 "$TOK_A"; then
    pruefe "$app antwortet" ja
  else
    pruefe "$app antwortet" nein 'Zeitgrenze 240s'
    return 1
  fi
  # Gemessen wird die Freigabe, nicht ein Modell: `beleg` rechnet mit der festen
  # Antwort der Probe-App (wie in korrektur-abnahme.sh).
  ruf "$TOK" PUT "/api/apps/$app/flows/beleg/modell" \
    "{\"extern\":{\"anbieter\":\"Probe\",\"modell\":\"fest\",\"basis_url\":\"http://arasul-app-$app-live:8080/v1\"}}"
  pruefe "$app: beleg rechnet mit der festen Antwort" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
}

# Den Flow `beleg` der App $1 als B starten (B ist der Einreicher). Setzt $LAUF.
LAUF=""
starten() { # app abfrage
  local app="$1" abfrage="$2"
  LAUF=""
  ruf "$TOK_B" POST "/apps/$app/api/starten?$abfrage"
  if [ "$CODE" = "404" ]; then
    sleep 5
    ruf "$TOK_B" POST "/apps/$app/api/starten?$abfrage"
  fi
  LAUF=$(rumpf | feld lauf)
  [ -n "$LAUF" ] || { echo "        Antwort der App: HTTP $CODE $(rumpf)"; return 1; }
}

# Wartet bis der Lauf der App $1 einen der Status $2 (mit | getrennt) hat; setzt $STATUS.
STATUS=""
warte_status() { # app status [geduld]
  local app="$1" gesucht="$2" geduld="${3:-$HALT_GEDULD}"
  local ende=$((SECONDS + geduld))
  STATUS=""
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK_B" GET "/apps/$app/api/lauf?lauf=$LAUF"
    STATUS=$(rumpf | feld status)
    case "|$gesucht|" in *"|$STATUS|"*) return 0 ;; esac
    case "$STATUS" in fertig | fehler | abgebrochen | abgelaufen) return 1 ;; esac
    sleep 2
  done
  return 1
}

# Die offene Anfrage mit Titel $2 zum Lauf in der Liste von $1. Setzt $ANFRAGE und $ANFRAGE_JSON.
ANFRAGE=""
ANFRAGE_JSON=""
warte_auf_anfrage() { # token titel
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

bilder() { # phase
  [ "${ARASUL_BILDER:-}" = "1" ] || return 0
  ARASUL_BENUTZER="$ARASUL_BENUTZER" ARASUL_A="$A" ARASUL_A_PASSWORT="$A_PASS" \
    ARASUL_RUECKFALL_APP="$APP" ARASUL_TIEFLINK_APP="$TIEF" \
    ARASUL_ANFRAGE="$ANFRAGE" \
    node "$WURZEL/scripts/test/rueckfall-bilder.mjs" "$1" | sed 's/^/  bild /'
  local ergebnis="${PIPESTATUS[0]}"
  pruefe "Browser: $1" "$(ja_wenn "$ergebnis" 0)"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Gerät unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 ${GERAET:-jetson}"
  exit 1
fi

echo "=== Abnahme M5: Rückfall im Gerät, $APP und $TIEF gegen $BASIS ==="
echo

# --- 1. Zugänge ----------------------------------------------------------------
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
  local paar
  for paar in "${FREIGEGEBEN[@]:-}"; do
    [ -n "$paar" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/freigaben/${paar%%:*}/${paar##*:}"
  done
  if [ -n "$SCHLUESSEL" ]; then
    for paar in "$APP" "$TIEF"; do
      curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
        "$BASIS/api/v1/external/apps/$paar?bestaetigung=$paar&dateien=true"
    done
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  Freigaben zurückgenommen, %s und %s entfernt (mit Ordnern), Wegwerf-Schlüssel widerrufen\n' "$APP" "$TIEF"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Rückfall ($APP)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schlüssel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

export ARASUL_URL ARASUL_PASSWORT

# --- 2. Kontrakt 12 ----------------------------------------------------------------
ruf "schluessel:$SCHLUESSEL" GET /api/v1/external/contract
KONTRAKT=$(rumpf | feld data.kontrakt)
[ -z "$KONTRAKT" ] && KONTRAKT=$(rumpf | feld kontrakt)
pruefe 'Der Kontrakt hat Fassung 12' "$(ja_wenn "$KONTRAKT" 12)" "kontrakt=${KONTRAKT:-—}"
pruefe 'Die Regeln nennen zeigt_freigaben' "$(grep -q 'zeigt_freigaben' "$RUMPF_DATEI" && echo ja || echo nein)"

# --- 3. Beide Probe-Apps: nur das Manifest unterscheidet sie ------------------------
spiele_ein "$APP" nein || exit 1
spiele_ein "$TIEF" ja || exit 1

# Die Stufe Leitung liegt bei probe-admin (Standardperson), die Prüfung bei allen.
ruf "$TOK" PUT "/api/apps/$APP/stufen/leitung" "{\"benutzer_id\":$ID_ADMIN}"
pruefe "Standardperson der Stufe Leitung: $ARASUL_BENUTZER" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# --- 4. Rückfall: eine App ohne eigene Ansicht ---------------------------------------
TITEL_PRUEFUNG='Erkennung unsicher: Feld datum'
TITEL_LEITUNG='Beleg 4711 zeichnen'
if ! starten "$APP" 'beleg=4711&datum=&unsicher='; then
  pruefe "beleg in $APP gestartet" nein
  exit 1
fi
warte_status "$APP" wartend
pruefe "$B reicht ein, der Lauf hält an" "$(ja_wenn "$STATUS" wartend)" "lauf=$LAUF status=${STATUS:-—}"
warte_auf_anfrage "$TOK_A" "$TITEL_PRUEFUNG"
pruefe "$A sieht die Freigabe in „Für Sie\"" "$([ -n "$ANFRAGE" ] && echo ja || echo nein)" "anfrage=${ANFRAGE:-—}"
P1="$ANFRAGE"
pruefe 'Sie zeigt nicht selbst: app_zeigt_freigaben=false (Rückfall in Arasul)' \
  "$(ja_wenn "$(printf '%s' "$ANFRAGE_JSON" | feld app_zeigt_freigaben)" false)"
pruefe 'Sie trägt Felder (datum zu prüfen, änderbar) und das Original' \
  "$([ "$(printf '%s' "$ANFRAGE_JSON" | feld felder.0.name)" = datum ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld felder.0.aenderbar)" = true ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld original)" = "/apps/$APP/api/belege/4711.svg" ] && echo ja || echo nein)"
ruf "$TOK_B" GET /api/freigabe-anfragen
pruefe "$B (Einreicher) sieht die Freigabe nicht, vier Augen" \
  "$([ -z "$(rumpf | anfrage_zu_lauf "$LAUF" "$TITEL_PRUEFUNG")" ] && echo ja || echo nein)"
ruf "$TOK_B" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{}'
pruefe "$B bestätigt nicht: 403" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"

# --- 5. Dieselbe Lage bei der App, die es erklärt: Tieflink ------------------------------
LAUF_RUECKFALL="$LAUF"
if starten "$TIEF" 'beleg=4750&datum=&unsicher='; then
  LAUF_TIEF="$LAUF"
  warte_status "$TIEF" wartend
  warte_auf_anfrage "$TOK_A" "$TITEL_PRUEFUNG"
  P_TIEF="$ANFRAGE"
  pruefe "$A sieht auch die Freigabe von $TIEF, mit app_zeigt_freigaben=true" \
    "$(ja_wenn "$(printf '%s' "$ANFRAGE_JSON" | feld app_zeigt_freigaben)" true)" "anfrage=${ANFRAGE:-—}"
else
  pruefe "beleg in $TIEF gestartet" nein
  LAUF_TIEF=""
fi
LAUF="$LAUF_RUECKFALL"
ANFRAGE="$P1"

# --- 6. Im Browser: A öffnet, ändert, bestätigt -----------------------------------------
# Ohne ARASUL_BILDER entscheidet A über die API, mit derselben Änderung wie der
# Browserteil. Bis zum 04.10.2026 entschied nur der Browser, und ohne ihn fielen
# die sieben Prüfungen danach um, obwohl am Gerät nichts falsch war.
if [ "${ARASUL_BILDER:-}" = "1" ]; then
  bilder fuer-sie
  ANFRAGE="${P_TIEF:-}"
  bilder tieflink
  ANFRAGE="$P1"
else
  ruf "$TOK_A" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{"felder":{"datum":"03.10.2026"}}'
  pruefe "$A bestätigt über die API und ändert datum (ohne Browser)" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
fi

# --- 7. Der Lauf geht weiter -----------------------------------------------------------------
warte_auf_anfrage "$TOK" "$TITEL_LEITUNG"
pruefe 'Danach hält der Lauf in der Stufe Leitung' \
  "$([ -n "$ANFRAGE" ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld stufe)" = leitung ] && echo ja || echo nein)" "anfrage=${ANFRAGE:-—}"
P2="$ANFRAGE"
pruefe 'Die Buchung davor nennt den geänderten Wert 03.10.2026' \
  "$(grep -q 'datum: 03.10.2026' <<<"$(printf '%s' "$ANFRAGE_JSON" | feld zusammenhang)" && echo ja || echo nein)" \
  "$(printf '%s' "$ANFRAGE_JSON" | feld zusammenhang | cut -c1-90)"
pruefe "Bisheriges: Prüfung bestätigt von $A, mit der Änderung von datum" \
  "$([ "$(printf '%s' "$ANFRAGE_JSON" | feld frueher.0.status)" = bestaetigt ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld frueher.0.entschieden_von)" = "$A" ] && [ "$(printf '%s' "$ANFRAGE_JSON" | feld frueher.0.korrekturen.0.wert)" = '03.10.2026' ] && echo ja || echo nein)"
ruf "$TOK_A" POST "/api/freigabe-anfragen/$P2/bestaetigen" '{}'
pruefe "Die Leitung liegt bei $ARASUL_BENUTZER: $A bekommt 409" "$(ja_wenn "$CODE" 409)" "HTTP $CODE"
ruf "$TOK" POST "/api/freigabe-anfragen/$P2/bestaetigen" '{}'
pruefe "$ARASUL_BENUTZER bestätigt die Leitung" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
warte_status "$APP" fertig "$LAUF_GEDULD"
pruefe 'Der Lauf endet fertig' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
ruf "$TOK_B" GET "/apps/$APP/api/lauf?lauf=$LAUF"
pruefe 'Sein Ergebnis trägt den in Arasul geänderten Wert' \
  "$(grep -q '03.10.2026' <<<"$(rumpf | feld ergebnis)" && echo ja || echo nein)" "$(rumpf | feld ergebnis | cut -c1-100)"

# Die Freigabe der Tieflink-App bleibt unberührt; sie wird abgelehnt, damit nichts liegen bleibt.
if [ -n "${P_TIEF:-}" ]; then
  ruf "$TOK" POST "/api/freigabe-anfragen/$P_TIEF/ablehnen" '{"begruendung":"Abnahme M5 Rückfall: Ende"}'
  pruefe "Die Freigabe von $TIEF wird abgelehnt (Aufräumen)" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
fi

# --- 8. Die echte App belege: NUR LESEND --------------------------------------------------
if [ -n "$GERAET" ]; then
  BELEGE=$(ssh -o BatchMode=yes "$GERAET" "docker exec postgres-db psql -U arasul -d arasul_db -qAt -F '|' -c \"SELECT s.stand, s.version, COALESCE(s.manifest->>'zeigt_freigaben','-') FROM public.app_staende s WHERE s.app_id = 'belege' ORDER BY s.stand\"" 2>/dev/null)
  if [ -z "$BELEGE" ]; then
    echo "(belege ist an diesem Gerät nicht eingespielt: nichts zu lesen)"
  else
    pruefe 'belege: kein Manifest nennt zeigt_freigaben, der Rückfall greift' \
      "$([ -z "$(grep -v '|-$' <<<"$BELEGE")" ] && echo ja || echo nein)" "$(tr '\n' ' ' <<<"$BELEGE")"
  fi
else
  echo "(ohne ARASUL_GERAET kein lesender Blick auf belege)"
fi

# --- 9. Aufräumen ist Teil der Messung ----------------------------------------------------
fehl=""
for paar in "${FREIGEGEBEN[@]:-}"; do
  [ -n "$paar" ] || continue
  ruf "$TOK" DELETE "/api/freigaben/${paar%%:*}/${paar##*:}"
  [[ "$CODE" =~ ^20[04]$ ]] || fehl="$fehl $paar:$CODE"
done
FREIGEGEBEN=()
pruefe 'Die vergebenen Freigaben sind zurückgenommen' "$([ -z "$fehl" ] && echo ja || echo nein)" "${fehl:-alle sechs}"
for app in "$APP" "$TIEF"; do
  ruf "schluessel:$SCHLUESSEL" DELETE "/api/v1/external/apps/$app?bestaetigung=$app&dateien=true"
  pruefe "DELETE entfernt $app samt Ordnern" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  ruf "$TOK" GET "/api/apps/$app"
  pruefe "Danach kennt das Gerät $app nicht mehr (404)" "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
done

echo
echo "$gruen von $((gruen + rot)) grün"
[ "$rot" -eq 0 ] || exit 1
