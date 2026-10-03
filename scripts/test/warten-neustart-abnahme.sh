#!/bin/bash
# =============================================================================
# Abnahme M5: ein wartender Flow-Lauf ueberlebt den Neustart des Backends
# =============================================================================
# Die Abnahme des Auftrags: "Am Orin: ein Lauf wartet auf Freigabe,
# `docker compose restart dashboard-backend`, danach steht er weiter auf
# wartend, wird bestaetigt und laeuft ab dem angehaltenen Schritt zu Ende;
# Frist je Stufe, Vorgabe 7 Tage."
#
#   1. Eine Wegwerf-App (`beispielapp-neustart`) bekommt drei Flows: den mit
#      Freigabe-Schritt der Beispielapp, einen mit Stufe `leitung` (Frist 120
#      Minuten) und einen ganz ohne Frist.
#   2. Ein Lauf haelt an. Das Backend wird NEU GESTARTET. Der Lauf steht weiter
#      auf wartend, seine Anfrage weiter offen.
#   3. Ein Mensch bestaetigt: der Lauf geht in DERSELBEN Zeile ab dem
#      angehaltenen Schritt weiter und endet fertig. Der Freigabe-Schritt steht
#      genau einmal im Protokoll (nicht noch einmal gelaufen).
#   4. Zweiter Lauf, Neustart, ABGELEHNT: endet abgebrochen mit Begruendung.
#   5. Die Frist je Stufe (120 Minuten) und die Vorgabe (7 Tage) stehen an den
#      Anfragen -- gelesen aus `frist - angefragt_am`.
#
# Alles, was entsteht, hat `neustart` im Namen und wird am Ende wieder
# entfernt. Als Konto dient `probe-admin`, nie `admin`:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_NEUSTART_BEFEHL="ssh jetson 'cd ~/arasul-0.8.17 && docker compose restart dashboard-backend'" \
#     bash scripts/test/warten-neustart-abnahme.sh
#
# `ARASUL_NEUSTART_BEFEHL` ist der Befehl, der das Backend neu startet; auf dem
# Geraet selbst genuegt `docker compose restart dashboard-backend`.
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/beispielapp"
APP="${ARASUL_NEUSTART_APP:-beispielapp-neustart}"
FLOW="freigabe"
FLOW_STUFE="freigabe-stufe"
FLOW_VORGABE="freigabe-vorgabe"
VERSION="1.0.0"

# Der Bau des Images passiert AM GERAET. Beim ersten Mal laedt Docker dafuer
# ein Basis-Image; auf einem Jetson an einer maessigen Leitung ist alles unter
# zehn Minuten geraten.
GEDULD=900

# So lange wird darauf gewartet, dass ein Lauf anhaelt. Bis dahin liegt nur ein
# Werkzeug-Schritt vor ihm, aber der Lauf startet losgeloest und die
# Warteschlange laesst strikt einen nach dem anderen durch.
HALT_GEDULD=180

# So lange wird auf das ENDE eines Laufs gewartet. Nach der Bestaetigung kommt
# der Synthese-Aufruf ans Modell, und der ist auf einem Jetson, der die GPU
# vielleicht gerade haelt, kein Augenblick.
LAUF_GEDULD=600

# Die Frist des kurzen Flows steht in `flows/freigabe-frist.md` (0,2 Minuten).
# Hier steht, wie lange die Abnahme darauf wartet -- mit Luft fuer den
# Zeitgeber und die Datenbank.
FRIST_GEDULD=60

gruen=0
rot=0
uebersprungen=0
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
uebergehen() {
  uebersprungen=$((uebersprungen + 1))
  printf '  --   %s%s\n' "$1" "${2:+  ($2)}"
}
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }

# Ein Aufruf, zwei Ergebnisse: `$CODE` und der Rumpf in `$RUMPF_DATEI`.
# Bewusst ohne Rueckgabe ueber die Standardausgabe -- eine Kommandosubstitution
# waere eine Subshell, und `$CODE` waere beim naechsten Befehl wieder weg
# (Falle aus der Messung zu C2).
RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""

schluessel_ruf() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD"
    -H "x-api-key: $SCHLUESSEL")
  [ -n "$leib" ] && argumente+=(-H 'content-type: application/json' -d "$leib")
  CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
}

sitzungs_ruf() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD"
    -H "authorization: Bearer $TOK")
  [ -n "$leib" ] && argumente+=(-H 'content-type: application/json' -d "$leib")
  CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
}

paket_ruf() {
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$2" "$BASIS$1")
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
print("" if d is None else (d if isinstance(d,(str,int,float)) else json.dumps(d)))' "$1" 2>/dev/null
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

# --- Das Paket bauen ---------------------------------------------------------
# Der Inhalt der Beispielapp, mit getauschter Kennung und Image-Name. Der
# Image-Name muss mit: sonst baute das Geraet unter `arasul-beispielapp:…` und
# ueberschriebe das Image der App, die die C3-Abnahme laufen laesst.
# Zwei Flows nur fuer diese Abnahme, nicht im Beispiel der App: der eine nennt
# die Frist ueber eine STUFE im Kopf, der andere gar keine.
schreibe_stufenflows() {
  local ziel="$1"
  cat >"$ziel/$FLOW_STUFE.md" <<'MD'
---
name: freigabe-stufe
beschreibung: Freigabe mit der Frist der Stufe "leitung" (120 Minuten), Abnahme M5.
argumente:
  - name: woche
    typ: freitext
    pflicht: true
    beschreibung: Die Kalenderwoche, um die es geht
werkzeuge: [freigabe_anfordern]
stufen:
  - name: leitung
    bezeichnung: Leitung
    frist_minuten: 120
schritte:
  - name: freigeben
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Stufenfrist-Abnahme KW {{woche}}
      stufe: leitung
grenzen:
  zeitlimit_s: 300
---

Schreibe einen Satz: die Stufenfrist-Abnahme ist freigegeben. Keine Erfindungen.
MD
  cat >"$ziel/$FLOW_VORGABE.md" <<'MD'
---
name: freigabe-vorgabe
beschreibung: Freigabe ganz ohne Frist, es gilt die Vorgabe des Geraets, Abnahme M5.
argumente:
  - name: woche
    typ: freitext
    pflicht: true
    beschreibung: Die Kalenderwoche, um die es geht
werkzeuge: [freigabe_anfordern]
schritte:
  - name: freigeben
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Vorgabefrist-Abnahme KW {{woche}}
grenzen:
  zeitlimit_s: 300
---

Schreibe einen Satz: die Vorgabefrist-Abnahme ist freigegeben. Keine Erfindungen.
MD
}

baue_paket() {
  local ordner="$ARBEIT/paket"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/frontend" "$QUELLE/backend" "$QUELLE/flows" "$ordner/"
  # Das Designsystem gehoert ins Paket (Phase D7): das Frontend laedt
  # `marken.js` und `marken.css`, und ohne sie bliebe die Seite im Rahmen leer.
  schreibe_stufenflows "$ordner/flows" || return 1
  bash "$WURZEL/scripts/util/marken-beilegen.sh" "$ordner/frontend" >/dev/null || return 1
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$VERSION" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Beispielapp (Neustart-Abnahme M5)"
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  # COPYFILE_DISABLE: BSD-tar auf macOS legt sonst zu jeder Datei einen
  # `._`-Begleiter mit erweiterten Attributen ins Archiv.
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket.tgz"
}

# Einen Lauf starten und warten, bis er anhaelt. Setzt $LAUF.
LAUF=""
starte_und_warte_auf_halt() {
  local flow="$1" grenze="$2"
  LAUF=""
  sitzungs_ruf POST "/apps/$APP/api/flow?flow=$flow&woche=34"
  # Einmal nachfassen, und nur bei 404. Selbst nach einer Antwort der App kann
  # der naechste Aufruf noch an Arasuls Auffangpfad landen: Traefik traegt
  # seine Router je Anfrage nach, und zwischen zwei Aufrufen liegt ein Moment
  # (bei der C7-Abnahme am Orin gesehen -- „erreichbar nach 8s", direkt danach
  # 404). Bei jedem anderen Code hat die App geantwortet, und ein zweiter Start
  # waere ein zweiter Lauf.
  if [ "$CODE" = "404" ]; then
    sleep 5
    sitzungs_ruf POST "/apps/$APP/api/flow?flow=$flow&woche=34"
  fi
  if [ "$CODE" != "202" ]; then
    echo "        Antwort der App: $(rumpf)"
    return 1
  fi
  LAUF=$(rumpf | feld lauf)
  [ -n "$LAUF" ] || return 1
  local ende=$((SECONDS + grenze))
  while [ "$SECONDS" -lt "$ende" ]; do
    sitzungs_ruf GET "/apps/$APP/api/flow?lauf=$LAUF"
    case "$(rumpf | feld status)" in
      wartend) return 0 ;;
      fertig | fehler | abgebrochen | abgelaufen) return 1 ;;
    esac
    sleep 2
  done
  return 1
}

# Auf einen Endzustand warten. Gibt ihn auf der Standardausgabe zurueck.
warte_auf_ende() {
  local lauf="$1" grenze="$2" status=""
  local ende=$((SECONDS + grenze))
  while [ "$SECONDS" -lt "$ende" ]; do
    sitzungs_ruf GET "/apps/$APP/api/flow?lauf=$lauf"
    status=$(rumpf | feld status)
    case "$status" in
      fertig | fehler | abgebrochen | abgelaufen) break ;;
    esac
    sleep 3
  done
  echo "$status"
}


NEUSTART_BEFEHL="${ARASUL_NEUSTART_BEFEHL:-docker compose restart dashboard-backend}"
NEUSTART_GEDULD=240

# Das Backend neu starten und warten, bis es wieder antwortet. Der Token bleibt
# gueltig (er ist signiert, nicht im Speicher), aber Traefik braucht einen
# Moment, bis der Router wieder steht.
neustart() {
  local ab=$SECONDS
  eval "$NEUSTART_BEFEHL" >/dev/null 2>&1
  local ende=$((SECONDS + NEUSTART_GEDULD))
  sleep 5
  while [ "$SECONDS" -lt "$ende" ]; do
    sitzungs_ruf GET /api/auth/me
    [ "$CODE" = "200" ] && break
    sleep 3
  done
  NEUSTART_DAUER=$((SECONDS - ab))
  [ "$CODE" = "200" ]
}

# Die Lauf-Zeile ueber die Sitzung (Besitzer ist der Administrator), samt Schritten.
lauf_lesen() { sitzungs_ruf GET "/api/flows/laeufe/$1"; }

# Die Zeile einer Anfrage aus `GET /api/freigabe-anfragen`, als JSON.
anfrage_json() {
  python3 -c 'import sys,json
lauf = int(sys.argv[1])
try: liste = json.load(sys.stdin)["data"]
except Exception: print("{}"); raise SystemExit
for a in liste:
    if int(a.get("run_id", -1)) == lauf:
        print(json.dumps(a)); raise SystemExit
print("{}")' "$1" 2>/dev/null
}

# Minuten zwischen angefragt_am und frist.
frist_minuten() {
  python3 -c 'import sys,json
from datetime import datetime
a = json.loads(sys.stdin.read() or "{}")
f = lambda s: datetime.fromisoformat(s.replace("Z","+00:00"))
print(round((f(a["frist"]) - f(a["angefragt_am"])).total_seconds() / 60) if a.get("frist") else "")' 2>/dev/null
}

# Die Zahl der Schritte mit diesem Namen im Protokoll eines Laufs.
schritte_mit_namen() {
  python3 -c 'import sys,json
d = json.load(sys.stdin)
d = d.get("data", d)
print(sum(1 for s in d.get("steps", []) if s.get("name") == sys.argv[1]))' "$1" 2>/dev/null
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme M5: wartender Lauf ueberlebt den Neustart, gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }
if [ "$ARASUL_BENUTZER" = "admin" ]; then
  echo "Nicht als admin: das ist ein echtes Konto. ARASUL_BENUTZER=probe-admin setzen."; exit 1
fi

SCHLUESSEL=""
KEY_ID=""
aufraeumen() {
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 120 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  printf 'aufgeraeumt  App entfernt (samt Freigaben und Images), Wegwerf-Schluessel widerrufen\n'
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme M5 (neustart)","allowed_endpoints":["app:deploy","flow:run"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Ein Wegwerf-Schluessel entsteht' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)" "${SCHLUESSEL:0:12}…"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

PAKET=$(baue_paket)
pruefe 'Paket mit drei Freigabe-Flows gebaut' "$([ -n "$PAKET" ] && echo ja || echo nein)"
[ -z "$PAKET" ] && exit 1
paket_ruf /api/v1/external/apps "$PAKET"
pruefe "POST /apps spielt $APP ein" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" = "201" ] || { rumpf; echo; exit 1; }
schluessel_ruf POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'Schalten nach live' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

sitzungs_ruf GET /api/auth/me
ADMIN_ID=$(rumpf | feld user.id)
sitzungs_ruf POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ADMIN_ID}"
case "$CODE" in 200 | 201) FREI=ja ;; *) FREI=nein ;; esac
pruefe 'Die App ist dem Konto freigegeben' "$FREI" "HTTP $CODE"

if arasul_warte_auf_app "/apps/$APP/api/flow" 180 "$TOK"; then
  pruefe 'Die App ist erreichbar' ja "nach ${SECONDS}s"
else
  pruefe 'Die App ist erreichbar' nein 'Zeitgrenze 180s'; exit 1
fi

# --- 1. Lauf haelt, Neustart, Lauf wartet weiter -----------------------------
if starte_und_warte_auf_halt "$FLOW" "$HALT_GEDULD"; then
  pruefe 'Ein Lauf haelt an (wartend)' ja "lauf=$LAUF"
else
  pruefe 'Ein Lauf haelt an (wartend)' nein "lauf=${LAUF:-—}"; exit 1
fi
LAUF_A="$LAUF"
sitzungs_ruf GET /api/freigabe-anfragen
ANFRAGE_A=$(rumpf | anfrage_zu_lauf "$LAUF_A")
pruefe 'Seine Anfrage ist offen' "$([ -n "$ANFRAGE_A" ] && echo ja || echo nein)" "anfrage=${ANFRAGE_A:-—}"

if neustart; then
  pruefe 'docker compose restart dashboard-backend: das Backend antwortet wieder' ja "nach ${NEUSTART_DAUER}s"
else
  pruefe 'docker compose restart dashboard-backend: das Backend antwortet wieder' nein "nach ${NEUSTART_DAUER}s"; exit 1
fi
lauf_lesen "$LAUF_A"
STATUS_A=$(rumpf | feld status)
[ -z "$STATUS_A" ] && STATUS_A=$(rumpf | feld data.status)
pruefe 'Danach steht der Lauf weiter auf wartend (nicht fehler)' "$(ja_wenn "$STATUS_A" wartend)" "status=$STATUS_A"
sitzungs_ruf GET /api/freigabe-anfragen
pruefe 'und seine Anfrage steht weiter offen' \
  "$([ "$(rumpf | anfrage_zu_lauf "$LAUF_A")" = "$ANFRAGE_A" ] && echo ja || echo nein)"

# --- 2. Bestaetigen: ab dem angehaltenen Schritt zu Ende ---------------------
sitzungs_ruf POST "/api/freigabe-anfragen/$ANFRAGE_A/bestaetigen" '{}'
pruefe 'Ein Mensch bestaetigt nach dem Neustart' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe 'und der Lauf wird fortgesetzt (fortgesetzt: true)' \
  "$(ja_wenn "$(rumpf | feld data.fortgesetzt | tr '[:upper:]' '[:lower:]')" true)" \
  "fortgesetzt=$(rumpf | feld data.fortgesetzt)"
STATUS=$(warte_auf_ende "$LAUF_A" "$LAUF_GEDULD")
pruefe 'Der Lauf laeuft zu Ende: fertig' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
lauf_lesen "$LAUF_A"
pruefe 'Der Freigabe-Schritt steht genau EINMAL im Protokoll (nicht noch einmal gelaufen)' \
  "$(ja_wenn "$(rumpf | schritte_mit_namen freigabe_anfordern)" 1)" \
  "anzahl=$(rumpf | schritte_mit_namen freigabe_anfordern)"
pruefe 'und das Ergebnis nennt, wer freigegeben hat' \
  "$(grep -q "$ARASUL_BENUTZER" <<<"$(rumpf | feld result)$(rumpf | feld data.result)" && echo ja || echo nein)" \
  "$(rumpf | feld result | cut -c1-90)"

# --- 3. Neustart, dann Ablehnung ---------------------------------------------
GRUND="Die Zahlen der Neustart-Abnahme stimmen nicht"
if starte_und_warte_auf_halt "$FLOW" "$HALT_GEDULD"; then
  LAUF_B="$LAUF"
  neustart
  sitzungs_ruf GET /api/freigabe-anfragen
  ANFRAGE_B=$(rumpf | anfrage_zu_lauf "$LAUF_B")
  pruefe 'Zweiter Lauf: nach dem Neustart steht seine Anfrage offen' \
    "$([ -n "$ANFRAGE_B" ] && echo ja || echo nein)" "anfrage=${ANFRAGE_B:-—}"
  sitzungs_ruf POST "/api/freigabe-anfragen/$ANFRAGE_B/ablehnen" "{\"begruendung\":\"$GRUND\"}"
  pruefe 'Ein Mensch lehnt ab' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  STATUS=$(warte_auf_ende "$LAUF_B" 60)
  pruefe 'Der Lauf endet abgebrochen, mit der Begruendung' \
    "$(grep -q "$GRUND" <<<"$(rumpf | feld fehler)$(rumpf | feld data.error)$(rumpf | feld error)" && [ "$STATUS" = abgebrochen ] && echo ja || echo nein)" \
    "status=${STATUS:-—}"
else
  uebergehen 'Neustart, dann Ablehnung' 'der Lauf hielt nicht an'
fi

# --- 4. Frist je Stufe, Vorgabe ----------------------------------------------
if starte_und_warte_auf_halt "$FLOW_STUFE" "$HALT_GEDULD"; then
  sitzungs_ruf GET /api/freigabe-anfragen
  MIN=$(rumpf | anfrage_json "$LAUF" | frist_minuten)
  pruefe 'Frist je Stufe: "leitung" hat 120 Minuten' "$(ja_wenn "$MIN" 120)" "minuten=$MIN"
  sitzungs_ruf POST "/api/flows/laeufe/$LAUF/abbrechen" '{}'
else
  uebergehen 'Frist je Stufe' 'der Lauf hielt nicht an'
fi
if starte_und_warte_auf_halt "$FLOW_VORGABE" "$HALT_GEDULD"; then
  sitzungs_ruf GET /api/freigabe-anfragen
  MIN=$(rumpf | anfrage_json "$LAUF" | frist_minuten)
  pruefe 'Vorgabe ohne Angabe: 7 Tage (10080 Minuten)' "$(ja_wenn "$MIN" 10080)" "minuten=$MIN"
  sitzungs_ruf POST "/api/flows/laeufe/$LAUF/abbrechen" '{}'
else
  uebergehen 'Vorgabe 7 Tage' 'der Lauf hielt nicht an'
fi

# --- 5. Aufraeumen ist Teil der Messung --------------------------------------
schluessel_ruf DELETE "/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
pruefe 'DELETE entfernt die App' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

echo
if [ "$uebersprungen" -gt 0 ]; then
  echo "$gruen von $((gruen + rot)) gruen, $uebersprungen uebersprungen"
else
  echo "$gruen von $((gruen + rot)) gruen"
fi
[ "$rot" -eq 0 ] || exit 1
