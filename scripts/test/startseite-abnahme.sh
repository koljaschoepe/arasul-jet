#!/bin/bash
# =============================================================================
# startseite-abnahme.sh — Startseite und Statusleiste, am Orin (M5)
# =============================================================================
# Auftrag startseite-und-statusleiste (04.10.2026). Gemessen wird:
#
#   GRUSS       Die Startseite grüßt mit dem Vornamen (ohne Vornamen mit dem
#               Anzeigenamen).
#   FÜR SIE     B reicht einen Beleg ein. Die Freigabe liegt (ohne
#               Standardperson) bei jedem mit Zugang außer bei B: je Zeile App,
#               Gegenstand, seit wann; ein Klick öffnet die App mit
#               ?freigabe=<nummer> im Rahmen. B sieht keine Zeile.
#   HAUS        Das Haus trägt die Zahl der Freigaben für mich.
#   KACHELN     Die Kacheln der eigenen Apps stehen darunter.
#   HINWEISE    Beim Admin steht „Fassung wartet auf Live", solange die Probe-App
#               im Test eine Fassung hat, die nicht live ist; nach „live" ist der
#               Hinweis weg. Ein Mitarbeiter sieht nie einen Hinweis. Was sonst
#               am Gerät ansteht (Sicherung, Update, Lizenz), wird nur
#               aufgeschrieben, nicht erzwungen (Tests belegen die Regeln).
#   STATUSLEISTE  Name, Datum, Uhrzeit, nie Modell, Speicher, Verbindung, Stand;
#               kein Modell-Umschalter, keine Anzeige „Freigabe wartet".
#   WECHSEL     App zur Startseite und zurück: höchstens 200 ms (zehn Wechsel).
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
#   bash scripts/test/startseite-abnahme.sh
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
APP="probe-start-$STEMPEL"
NAME="Probe: Start ($STEMPEL)"
FLOW="zwei-stufen"
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
m["beschreibung"] = "Messgeraet fuer scripts/test/startseite-abnahme.sh (M5)."
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
m["backend"]["umgebung"]["PROBE_VERSION"] = version
# example.org geht hinaus, haus.arasul.localhost zeigt auf 127.0.0.1 und wird trotz
# Eintrag abgewiesen: die eine Stoerung, die rot sein darf.
m["verbindungen"] = ["example.org", "haus.arasul.localhost"]
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
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$paket" ${mit_text[@]+"${mit_text[@]}"} "$BASIS/api/v1/external/apps")
}

laeufe() { # Zahl der Läufe der App (`gesamt` aus der Verwaltungsliste)
  curl -sk --max-time 30 -H "authorization: Bearer $TOK" "$BASIS/api/laeufe?app=$APP&limit=1" |
    python3 -c 'import sys,json
try: print(int(json.load(sys.stdin)["gesamt"]))
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

bilder() { # phase [erwartung]
  [ "${ARASUL_BILDER:-}" = "1" ] || return 0
  ARASUL_BENUTZER="$ARASUL_BENUTZER" ARASUL_A="$A" ARASUL_A_PASSWORT="$A_PASS" \
    ARASUL_B="$B" ARASUL_B_PASSWORT="$B_PASS" \
    ARASUL_START_APP="$APP" ARASUL_START_NAME="$NAME" \
    node "$WURZEL/scripts/test/startseite-bilder.mjs" "$1" | sed 's/^/  bild /'
  local ergebnis="${PIPESTATUS[0]}"
  pruefe "Browser: $1" "$(ja_wenn "$ergebnis" 0)"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Gerät unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 $GERAET"
  exit 1
fi

echo "=== Abnahme M5: Startseite und Statusleiste, $APP gegen $BASIS ==="
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
  -d "{\"name\":\"Abnahme M5 Startseite ($APP)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schlüssel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# Der Browser-Teil braucht die Zugangsdaten der Probekonten in der Umgebung.
export ARASUL_URL ARASUL_PASSWORT

# --- 1. Die Probe-App: 1.0.0 live, 1.1.0 im Test (wartet auf Live) ----------------
ausrollen 1.0.0
pruefe "$APP 1.0.0 in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe '1.0.0 live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ausrollen 1.1.0 "Neu: Probe für die Startseite."
pruefe "$APP 1.1.0 in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }

# probe-admin, A und B haben Livezugang. B reicht ein und entscheidet nicht selbst:
# bei B liegt nichts, bei A und probe-admin liegt die Freigabe.
codes=""
for paar in "$ID_ADMIN:live" "$ID_A:live" "$ID_B:live"; do
  ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":${paar%%:*},\"stand\":\"${paar##*:}\"}"
  codes="$codes $CODE"
  [[ "$CODE" =~ ^20[01]$ ]] && FREIGEGEBEN+=("${paar%%:*}")
done
pruefe "Zugang: $ARASUL_BENUTZER, $A und $B (Live)" \
  "$([ "${#FREIGEGEBEN[@]}" = 3 ] && echo ja || echo nein)" "HTTP$codes"

if arasul_warte_auf_app "/apps/$APP/api/gesund" 240 "$TOK_A"; then
  pruefe 'Livefassung antwortet' ja
else
  pruefe 'Livefassung antwortet' nein 'Zeitgrenze 240s'
  exit 1
fi

# --- 2. Eine Freigabe, die bei A und probe-admin liegt ---------------------------
ruf "$TOK_B" POST "/apps/$APP/api/einreichen?beleg=$STEMPEL"
LAUF=$(rumpf | feld lauf)
pruefe "$B reicht einen Beleg ein: ein Lauf entsteht" "$([ -n "$LAUF" ] && echo ja || echo nein)" "HTTP $CODE lauf=${LAUF:-—}"
ende=$((SECONDS + HALT_GEDULD))
status=""
while [ "$SECONDS" -lt "$ende" ] && [ -n "$LAUF" ]; do
  ruf "$TOK_B" GET "/apps/$APP/api/lauf?lauf=$LAUF"
  status=$(rumpf | feld status)
  [ "$status" = wartend ] && break
  case "$status" in fertig | fehler | abgebrochen | abgelaufen) break ;; esac
  sleep 2
done
pruefe '… und hält an der ersten Freigabe an (wartend)' "$(ja_wenn "$status" wartend)" "$status"

anfrage_id() { # token -> Nummer der Anfrage der Probe-App oder leer
  curl -sk --max-time 30 -H "authorization: Bearer $1" "$BASIS/api/freigabe-anfragen" |
    python3 -c 'import sys,json
try: d = json.load(sys.stdin)["data"]
except Exception: print(""); raise SystemExit
print(next((str(x["id"]) for x in d if x["app_id"] == sys.argv[1]), ""))' "$APP"
}
ID_FREIGABE=$(anfrage_id "$TOK_A")
pruefe "Für $A liegt die Anfrage vor (bei mir)" "$([ -n "$ID_FREIGABE" ] && echo ja || echo nein)" "Nummer ${ID_FREIGABE:-—}"
pruefe "Für $ARASUL_BENUTZER liegt sie auch vor (ohne Standardperson bei allen mit Zugang)" \
  "$([ "$(anfrage_id "$TOK")" = "$ID_FREIGABE" ] && [ -n "$ID_FREIGABE" ] && echo ja || echo nein)"
pruefe "Für $B (hat eingereicht) liegt nichts vor, vier Augen" "$([ -z "$(anfrage_id "$TOK_B")" ] && echo ja || echo nein)"
export ARASUL_START_FREIGABE="$ID_FREIGABE"

# --- 3. Im Browser ---------------------------------------------------------------
if [ "${ARASUL_BILDER:-}" = "1" ]; then
  bilder mitarbeiter
  bilder admin
  bilder fremd
  # Fassung 1.1.0 live: der Hinweis „wartet auf Live" muss verschwinden.
  ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
  pruefe '1.1.0 live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  bilder admin-nach-live
fi

# --- 4. Aufräumen und nachsehen -------------------------------------------------
trap - EXIT
aufraeumen
RUMPF_DATEI="$(mktemp)"
ruf "$TOK" GET "/api/apps/$APP"
pruefe 'Die App ist entfernt (404)' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
pruefe "Nach dem Aufräumen liegt für $A keine Anfrage der Probe-App mehr" "$([ -z "$(anfrage_id "$TOK_A")" ] && echo ja || echo nein)"
REST=$(am_geraet "docker exec dashboard-backend ls /arasul/apps" 2>/dev/null | grep -c "^$APP$")
pruefe 'Unter /arasul/apps bleibt kein Ordner der Probe-App' "$(ja_wenn "$REST" 0)"
rm -f "$RUMPF_DATEI"

echo
echo "$gruen grün, $rot rot"
[ "$rot" -eq 0 ]
