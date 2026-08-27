#!/bin/bash
# =============================================================================
# Abnahme der App-Anmeldung, Phase C4 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "Beispielapp zeigt den angemeldeten Namen, Fremder
# bekommt 403." Genau das misst dieses Skript, gegen das laufende Geraet.
#
# Es legt sich seine beiden Menschen SELBST an, gibt einem von ihnen die App
# frei und raeumt am Ende beide wieder weg -- auch dann, wenn unterwegs etwas
# rot war. Zwei Benutzer und nicht einer, weil die Aussage aus zwei Haelften
# besteht: der eine sieht seinen Namen, der andere bekommt 403, und beide sind
# angemeldet. Ein Fremder ganz ohne Sitzung kommt als dritter Fall dazu; fuer
# ihn braucht es niemanden.
#
#   drin     angelegt, freigegeben          sieht seinen Namen
#   draussen angelegt, NICHT freigegeben    403 an der Route
#   niemand  keine Sitzung                  Umzug zur Anmeldung
#
# Der Administrator ist der vierte Fall, und der kostet keine Anmeldung: er ist
# angemeldet und hat die App trotzdem nicht freigegeben. "Admins sehen alles"
# gibt es nicht (Entscheidung aus C2), und dass es das nicht gibt, gehoert
# gemessen.
#
# ANMELDEDROSSEL: `loginLimiter` erlaubt ZEHN Anmeldungen je Viertelstunde und
# IP. Dieser Lauf braucht ZWEI eigene, eine je Mensch. Zusammen mit
# `rollen-abnahme.sh` (zwei), `mitarbeiter-abnahme.sh` (fuenf) und der einen
# geteilten Anmeldung der Reihe sind das genau zehn -- die Reihe sitzt damit
# auf der Grenze. Ein zweiter Lauf innerhalb einer Viertelstunde bekommt 429,
# und ein 429 wird hier ausdruecklich als 429 gemeldet: ein Waechter, der die
# Ursache verschweigt, kostet mehr Zeit als er spart.
#
# Voraussetzung: die Beispielapp ist eingespielt.
#   bash scripts/test/beispielapp.sh einspielen     (auf dem Geraet)
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/app-anmeldung-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
APP="${ARASUL_BEISPIELAPP:-beispielapp}"
STEMPEL="$(date +%s)"
DRIN="abnahme-drin-$STEMPEL"
DRAUSSEN="abnahme-draussen-$STEMPEL"
PASSWORT="Anmeldung-$STEMPEL"

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
ja_nein() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }

# Ein Aufruf, drei Ergebnisse: `$CODE`, `$ORT` (die Kopfzeile Location) und der
# Rumpf in `$RUMPF_DATEI`.
#
# Bewusst OHNE Rueckgabe ueber die Standardausgabe: `code=$(hole ...)` waere
# eine Kommandosubstitution und damit eine Subshell, und `$ORT` waere beim
# naechsten Befehl wieder weg. Dieselbe Falle wie bei `hole_token` in der
# Rollen-Abnahme, festgehalten in der Messung zu C2.
#
# KEIN `-L`: ob umgezogen wird, IST hier die Messung.
#
# Wiederholt wird bei 000 (curl bekam keine Antwort) und bei 502/503: ein
# Container, der gerade hochkommt, ist kein Befund.
RUMPF_DATEI="$(mktemp)"
KOPF_DATEI="$(mktemp)"
CODE=""
ORT=""
hole() {
  local pfad="$1" versuch
  shift
  local -a argumente
  argumente=(-sk -o "$RUMPF_DATEI" -D "$KOPF_DATEI" -w '%{http_code}' --max-time 25)
  # Das zweite Argument ist der Token; leer heisst: keine Sitzung.
  if [ $# -gt 0 ]; then
    [ -n "$1" ] && argumente+=(-H "authorization: Bearer $1")
    shift
  fi
  # Alles danach sind zusaetzliche Kopfzeilen des Aufrufers.
  while [ $# -gt 0 ]; do
    argumente+=(-H "$1")
    shift
  done
  for versuch in 1 2 3 4 5; do
    CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
    ORT=$(grep -i '^location:' "$KOPF_DATEI" | tail -1 | tr -d '\r' | sed 's/^[Ll]ocation: *//')
    case "$CODE" in
      000 | 502 | 503) sleep 3 ;;
      *) break ;;
    esac
  done
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }

# Ein Feld aus der letzten Antwort, mit Punkten geschachtelt.
feld() {
  rumpf | python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k, {}) if isinstance(d, dict) else {}
if isinstance(d, bool): print("true" if d else "false")
elif isinstance(d, (str, int)): print(d)
else: print("")' "$1" 2>/dev/null
}

ANM_DATEI="$(mktemp)"
anmelden() {
  local antwort
  antwort=$(curl -sk -w '\n%{http_code}' -X POST -H 'content-type: application/json' \
    --max-time 30 -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
    "$BASIS/api/auth/login")
  printf '%s' "$antwort" | tail -n1 > "$ANM_DATEI"
  printf '%s' "$antwort" | sed '$d' | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("token") or "")
except Exception: print("")' 2>/dev/null
}
anm_code() { cat "$ANM_DATEI" 2>/dev/null; }

verwalte() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a argumente=(-sk --max-time 30 -X "$verb"
    -H "authorization: Bearer $TOK" -H 'content-type: application/json')
  [ -n "$leib" ] && argumente+=(-d "$leib")
  curl "${argumente[@]}" "$BASIS$pfad"
}

if ! nc -z "$(echo "$BASIS" | sed -E 's#https?://##; s#:.*##')" "$(echo "$BASIS" | sed -E 's#.*:##')" 2>/dev/null; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme der App-Anmeldung (Phase C4) gegen $BASIS ==="
echo

# --- 1. Administrator und App --------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

hole "/api/apps/$APP" "$TOK"
if [ "$CODE" != "200" ]; then
  echo
  echo "Die App $APP ist nicht eingespielt (HTTP $CODE). Auf dem Geraet:"
  echo "  bash scripts/test/beispielapp.sh einspielen"
  exit 1
fi
VERSION=$(feld data.staende.live.version)
pruefe "$APP hat einen Livestand" "$([ -n "$VERSION" ] && echo ja || echo nein)" "version=$VERSION"
[ -z "$VERSION" ] && { echo; echo "Ohne Livestand gibt es nichts zu messen."; exit 1; }

# --- 2. Die beiden Menschen anlegen, Aufraeumen sicherstellen -------------
ID_DRIN=""
ID_DRAUSSEN=""
aufraeumen() {
  rm -f "$RUMPF_DATEI" "$KOPF_DATEI" "$ANM_DATEI"
  local id code
  for id in "$ID_DRIN" "$ID_DRAUSSEN"; do
    [ -z "$id" ] && continue
    code=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$id")
    # Die Freigabe faellt mit dem Benutzer (ON DELETE CASCADE, Migration 168).
    printf 'aufgeraeumt  Benutzer %s geloescht (HTTP %s)\n' "$id" "$code"
  done
}
trap aufraeumen EXIT

anlegen() {
  verwalte POST /api/benutzer \
    "{\"username\":\"$1\",\"password\":\"$PASSWORT\",\"email\":\"$1@abnahme.local\",\"rolle\":\"mitarbeiter\"}" |
    python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("data",{}).get("id") or "")
except Exception: print("")' 2>/dev/null
}

ID_DRIN=$(anlegen "$DRIN")
ID_DRAUSSEN=$(anlegen "$DRAUSSEN")
pruefe 'Beide Benutzer angelegt' \
  "$([ -n "$ID_DRIN" ] && [ -n "$ID_DRAUSSEN" ] && echo ja || echo nein)" \
  "drin=$ID_DRIN draussen=$ID_DRAUSSEN"
[ -z "$ID_DRIN" ] || [ -z "$ID_DRAUSSEN" ] && { echo; echo "Ohne die beiden gibt es nichts zu messen."; exit 1; }

TOK_DRIN=$(anmelden "$DRIN" "$PASSWORT")
pruefe 'Der eine meldet sich an' "$([ -n "$TOK_DRIN" ] && echo ja || echo nein)" \
  "HTTP $(anm_code)"
TOK_DRAUSSEN=$(anmelden "$DRAUSSEN" "$PASSWORT")
pruefe 'Der andere meldet sich an' "$([ -n "$TOK_DRAUSSEN" ] && echo ja || echo nein)" \
  "HTTP $(anm_code)"
if [ -z "$TOK_DRIN" ] || [ -z "$TOK_DRAUSSEN" ]; then
  echo
  echo "Ohne beide Sitzungen gibt es nichts zu messen (429 heisst Anmeldedrossel:"
  echo "zehn je Viertelstunde und IP, eine Viertelstunde warten)."
  exit 1
fi

# Nur EINER bekommt die App.
verwalte POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_DRIN}" > /dev/null
hole "/api/apps/meine" "$TOK_DRIN"
MEINE=$(rumpf | python3 -c "import sys,json
try: d = json.load(sys.stdin).get('data', [])
except Exception: d = []
print(next((a['id'] for a in d if a['id'] == '$APP'), ''))" 2>/dev/null)
pruefe "$APP ist fuer $DRIN freigegeben" "$(ja_nein "$MEINE" "$APP")" "GET /api/apps/meine"

# --- 3. Der Freigegebene sieht seinen Namen ------------------------------
hole "/apps/$APP/api/me" "$TOK_DRIN"
pruefe "GET /apps/$APP/api/me ist 200" "$(ja_nein "$CODE" 200)" "HTTP $CODE"
pruefe 'und nennt genau diesen Menschen' "$(ja_nein "$(feld data.benutzer)" "$DRIN")" \
  "benutzer=$(feld data.benutzer)"
pruefe 'samt seiner Rolle' "$(ja_nein "$(feld data.rolle)" mitarbeiter)" "rolle=$(feld data.rolle)"

hole "/apps/$APP/" "$TOK_DRIN"
pruefe "GET /apps/$APP/ liefert ihm die Seite" "$(ja_nein "$CODE" 200)" "HTTP $CODE"

# Der Kopf, den die Plattform dem CONTAINER der App setzt. Das ist die zweite
# Haelfte von "die App zeigt den angemeldeten Namen": `api/me` beantwortet
# Arasul selbst, `api/hallo` das Backend der App aus dem, was es bekommen hat.
hole "/apps/$APP/api/hallo" "$TOK_DRIN"
pruefe "GET /apps/$APP/api/hallo ist 200" "$(ja_nein "$CODE" 200)" "HTTP $CODE"
pruefe 'Die App sieht denselben Namen in X-Arasul-User' \
  "$(ja_nein "$(feld nutzer)" "$DRIN")" "nutzer=$(feld nutzer)"
pruefe 'und die Rolle in X-Arasul-Role' "$(ja_nein "$(feld rolle)" mitarbeiter)" \
  "rolle=$(feld rolle)"

# Faelschungssicherheit: Traefik LOESCHT beide Koepfe aus der eingehenden
# Anfrage, bevor es sie aus der Antwort der Anmeldung neu setzt. Ohne das waere
# die ganze Anmeldung eine Zeile, die jeder Browser selbst schreiben kann.
hole "/apps/$APP/api/hallo" "$TOK_DRIN" 'x-arasul-user: chef' 'x-arasul-role: admin'
pruefe 'Ein selbst mitgeschickter X-Arasul-User kommt nicht durch' \
  "$(ja_nein "$(feld nutzer)" "$DRIN")" "nutzer=$(feld nutzer)"
pruefe 'und X-Arasul-Role genauso wenig' "$(ja_nein "$(feld rolle)" mitarbeiter)" \
  "rolle=$(feld rolle)"

# Der API-Schluessel, den das Geraet beim Einspielen in den Container gesetzt
# hat. Die App gibt nur den HTTP-Code der externen Schnittstelle zurueck.
hole "/apps/$APP/api/schluessel" "$TOK_DRIN"
pruefe 'Der API-Schluessel der App steht in ihrer Umgebung' \
  "$(ja_nein "$(feld gesetzt)" true)" "gesetzt=$(feld gesetzt)"
pruefe 'und die externe Schnittstelle nimmt ihn an' "$(ja_nein "$(feld antwort)" 200)" \
  "HTTP $(feld antwort) von $(feld url)"

# Er ist fuer `live` freigegeben, nicht als Tester.
hole "/apps/$APP/test/" "$TOK_DRIN"
pruefe 'Der Teststand bleibt ihm zu' "$(ja_nein "$CODE" 403)" "HTTP $CODE"

# --- 4. Der Fremde bekommt 403 -------------------------------------------
for pfad in "/apps/$APP/" "/apps/$APP/api/me" "/apps/$APP/api/hallo"; do
  hole "$pfad" "$TOK_DRAUSSEN"
  pruefe "Nicht freigegeben: GET $pfad ist 403" "$(ja_nein "$CODE" 403)" "HTTP $CODE"
done

hole "/apps/$APP/api/me" "$TOK_DRAUSSEN"
pruefe 'und die Antwort ist eine Begruendung, keine Seite' \
  "$(ja_nein "$(feld error.code)" FORBIDDEN)" "code=$(feld error.code)"

# Der Administrator ist angemeldet und hat die App trotzdem nicht freigegeben.
# "Admins sehen alles" gibt es nicht (Entscheidung aus C2).
hole "/apps/$APP/api/me" "$TOK"
pruefe 'Auch der Administrator bekommt ohne Freigabe 403' "$(ja_nein "$CODE" 403)" "HTTP $CODE"

# --- 5. Ohne Sitzung -----------------------------------------------------
hole "/apps/$APP/"
pruefe "Ohne Sitzung zieht GET /apps/$APP/ zur Anmeldung um" "$(ja_nein "$CODE" 302)" "HTTP $CODE"
pruefe 'und zwar auf /' "$(ja_nein "$ORT" /)" "Location: ${ORT:-fehlt}"

# Die Schnittstelle zieht NICHT um: ein `fetch` der App bekaeme sonst die
# Anmeldeseite als HTML und meldete einen Fehler, der nach einem Fehler der App
# aussieht.
for pfad in "/apps/$APP/api/me" "/apps/$APP/api/hallo"; do
  hole "$pfad"
  pruefe "Ohne Sitzung ist GET $pfad 401, kein Umzug" "$(ja_nein "$CODE" 401)" "HTTP $CODE"
done

# --- 6. Tester und Rueckgabe ---------------------------------------------
# Aus dem Nutzer einen Tester machen: derselbe Mensch, eine Tuer mehr. Ohne
# eingespielten Teststand ist die Antwort dann 404 statt 403 -- und genau der
# Unterschied belegt, dass die Freigabe VOR der Existenz geprueft wird.
verwalte POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_DRIN,\"stand\":\"test\"}" > /dev/null
hole "/api/apps/$APP" "$TOK"
STAND_TEST=$(feld data.staende.test.version)
hole "/apps/$APP/test/" "$TOK_DRIN"
if [ -n "$STAND_TEST" ]; then
  pruefe 'Als Tester sieht er den Teststand' "$(ja_nein "$CODE" 200)" "HTTP $CODE"
else
  pruefe 'Als Tester ist der fehlende Teststand 404 und nicht mehr 403' \
    "$(ja_nein "$CODE" 404)" "HTTP $CODE"
fi

# Zurueckgenommen heisst sofort zu. Ein Zwischenspeicher ueber der Freigabe
# haette hier bis zu einer Minute lang noch 200 geliefert.
verwalte DELETE "/api/freigaben/$APP/$ID_DRIN" > /dev/null
hole "/apps/$APP/api/me" "$TOK_DRIN"
pruefe 'Zurueckgenommene Freigabe wirkt sofort' "$(ja_nein "$CODE" 403)" "HTTP $CODE"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
