#!/bin/bash
# =============================================================================
# Abnahme des App-Modells, Phase C3 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "Beispielapp laeuft am Orin unter beiden Pfaden."
# Genau das misst dieses Skript, gegen das laufende Geraet:
#
#   /apps/beispielapp/            das Frontend, von Arasul ausgeliefert
#   /apps/beispielapp/api/hallo   das Backend, ueber Traefik aus dem Container
#
# Dazu die Zusagen, die daran haengen: das Backend sieht seine Pfade OHNE das
# Praefix der Plattform, ein Teststand liegt unter `/apps/<id>/test/` und stoert
# den Livestand nicht, eine App, die es nicht gibt, ist 404 und nicht die
# Startseite des Dashboards, und ein `/api/`-Pfad ohne Container gibt keine
# HTML-Seite zurueck.
#
# SEIT PHASE C4 steht vor jeder dieser Zusagen die Freigabe (sie selbst misst
# `app-anmeldung-abnahme.sh`). Diese Abnahme misst die AUSLIEFERUNG und nicht
# die Anmeldung, also gibt sie sich die App zu Beginn selbst frei und nimmt die
# Freigabe am Ende wieder zurueck -- als Tester, damit auch der Teststand
# erreichbar bleibt. Ohne das waere jede Zeile hier ein 403, und die Abnahme
# meldete etwas ueber die Anmeldung statt ueber die Auslieferung. Auch ein
# Administrator braucht eine Freigabe; "Admins sehen alles" gibt es nicht
# (Entscheidung aus C2).
#
# Voraussetzung: die Beispielapp ist eingespielt.
#   bash scripts/test/beispielapp.sh einspielen     (auf dem Geraet)
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/apps-abnahme.sh
#
# Eine Anmeldung, und auch die entfaellt, wenn `abnahmen.sh` den Lauf startet.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
APP="${ARASUL_BEISPIELAPP:-beispielapp}"

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

# Ein Aufruf, drei Ergebnisse: `$CODE`, `$TYP` und der Rumpf in `$RUMPF_DATEI`.
#
# Bewusst OHNE Rueckgabe ueber die Standardausgabe: `code=$(hole ...)` waere
# eine Kommandosubstitution und damit eine Subshell, und `$TYP` waere beim
# naechsten Befehl wieder weg. Dieselbe Falle wie bei `hole_token` in der
# Rollen-Abnahme, festgehalten in der Messung zu C2.
#
# Wiederholt wird bei 000 (curl bekam keine Antwort) und bei 502/503: ein
# Container, der gerade hochkommt, ist kein Befund, und Traefik braucht nach
# dem Start eines App-Containers einen Moment, bis er sein Etikett gesehen hat.
RUMPF_DATEI="$(mktemp)"
CODE=""
TYP=""
hole() {
  local pfad="$1" versuch kopf
  for versuch in 1 2 3 4 5; do
    kopf=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code} %{content_type}' \
      --max-time 25 -H "authorization: Bearer $TOK" "$BASIS$pfad")
    CODE="${kopf%% *}"
    TYP="${kopf#* }"
    case "$CODE" in
      000|502|503) sleep 3 ;;
      *) break ;;
    esac
  done
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }

# Beide Pruefungen des Inhaltstyps stehen als FUNKTION da, und das ist kein
# Geschmack: `$(case "$TYP" in text/html*) ... esac)` laeuft unter bash 3.2
# nicht. Die alte Shell beendet die Kommandosubstitution an der ersten
# schliessenden Klammer -- also an der des Musters -- und meldet zur LAUFZEIT
# "syntax error near unexpected token". `bash -n` sieht davon nichts, weil der
# Rumpf einer Substitution erst beim Ausfuehren geparst wird; die Datei ist
# also syntaktisch in Ordnung und faellt trotzdem um. macOS liefert bis heute
# bash 3.2 aus, und der Ueberordner misst von einem Mac (Fund aus C3).
ist_json() { case "$TYP" in application/json*) echo ja ;; *) echo nein ;; esac; }
ist_html() { case "$TYP" in text/html*) echo ja ;; *) echo nein ;; esac; }

json_feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k, {}) if isinstance(d, dict) else {}
print(d if isinstance(d, (str, int)) else "")' "$1" 2>/dev/null
}

if ! nc -z "$(echo "$BASIS" | sed -E 's#https?://##; s#:.*##')" "$(echo "$BASIS" | sed -E 's#.*:##')" 2>/dev/null; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme des App-Modells (Phase C3, Freigabe seit C4) gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

# --- 1. Die App steht in der Verwaltung --------------------------------------
# Erst die eigene Nummer, dann die Freigabe. Wer sie schon hatte, behaelt sie:
# das Aufraeumen nimmt nur zurueck, was dieser Lauf gegeben hat.
ICH=$(curl -sk --max-time 20 -H "authorization: Bearer $TOK" "$BASIS/api/auth/me" |
  python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("user",{}).get("id") or "")
except Exception: print("")' 2>/dev/null)
HATTE_FREIGABE=$(curl -sk --max-time 20 -H "authorization: Bearer $TOK" \
  "$BASIS/api/freigaben?app_id=$APP&benutzer_id=$ICH" |
  python3 -c 'import sys,json
try: print("ja" if json.load(sys.stdin).get("data") else "nein")
except Exception: print("nein")' 2>/dev/null)
aufraeumen() {
  rm -f "$RUMPF_DATEI"
  [ "$HATTE_FREIGABE" = "ja" ] && return
  [ -z "$ICH" ] && return
  local code
  code=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE \
    -H "authorization: Bearer $TOK" "$BASIS/api/freigaben/$APP/$ICH")
  printf 'aufgeraeumt  Freigabe von %s zurueckgenommen (HTTP %s)\n' "$APP" "$code"
}
trap aufraeumen EXIT
FREI=$(curl -sk -o /dev/null -w '%{http_code}' -X POST --max-time 20 \
  -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d "{\"app_id\":\"$APP\",\"benutzer_id\":$ICH,\"stand\":\"test\"}" \
  "$BASIS/api/freigaben")
pruefe 'Der Administrator gibt sich die App frei (auch er braucht das)' \
  "$([ "$FREI" = "201" ] || [ "$FREI" = "200" ] && echo ja || echo nein)" "HTTP $FREI"

hole "/api/apps/$APP"
pruefe "GET /api/apps/$APP" "$([ "$CODE" = "200" ] && echo ja || echo nein)" "HTTP $CODE"
if [ "$CODE" != "200" ]; then
  echo
  echo "Die Beispielapp ist nicht eingespielt. Auf dem Geraet:"
  echo "  bash scripts/test/beispielapp.sh einspielen"
  exit 1
fi

VERSION=$(rumpf | json_feld data.staende.live.version)
pruefe 'Sie hat einen Livestand mit Version' "$([ -n "$VERSION" ] && echo ja || echo nein)" "version=$VERSION"

LAEUFT=$(rumpf | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",{}).get("staende",{}).get("live") or {}
print("ja" if (d.get("backend") or {}).get("laeuft") else "nein")' 2>/dev/null)
pruefe 'Ihr Backend-Container laeuft' "${LAEUFT:-nein}" "laeuft=$LAEUFT"

# --- 2. Das Frontend, von Arasul ausgeliefert --------------------------------
hole "/apps/$APP/"
pruefe "GET /apps/$APP/ liefert die Seite" "$([ "$CODE" = "200" ] && echo ja || echo nein)" "HTTP $CODE"
pruefe 'und zwar als HTML' "$(ist_html)" "$TYP"
pruefe 'mit dem Namen der App darin' \
  "$(rumpf | grep -qi "$APP\|Beispielapp" && echo ja || echo nein)"

# Eine Datei aus dem Paket, nicht die Startseite: der Unterschied zwischen
# "liefert irgendwas" und "liefert das Verzeichnis dieser Version".
hole "/apps/$APP/app.js"
pruefe "GET /apps/$APP/app.js liefert die Datei" "$([ "$CODE" = "200" ] && echo ja || echo nein)" "HTTP $CODE"

# Ohne Schraegstrich am Ende: Umzug, keine kaputte Seite. Relative Verweise
# zeigten sonst eine Ebene zu hoch.
umzug=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 "$BASIS/apps/$APP")
pruefe "GET /apps/$APP zieht auf /apps/$APP/ um" "$([ "$umzug" = "301" ] && echo ja || echo nein)" "HTTP $umzug"

# Eine Datei, die es im Paket nicht gibt, ist 404 -- nicht die Startseite.
# Sonst bekaeme ein fehlendes Stylesheet HTML und der Browser zeigte eine Seite
# ohne Gestaltung statt eines Fehlers.
hole "/apps/$APP/gibt-es-nicht.css"
pruefe 'Eine fehlende Datei ist 404' "$([ "$CODE" = "404" ] && echo ja || echo nein)" "HTTP $CODE"

# --- 3. Das Backend, ueber Traefik aus dem Container -------------------------
hole "/apps/$APP/api/hallo"
pruefe "GET /apps/$APP/api/hallo antwortet" "$([ "$CODE" = "200" ] && echo ja || echo nein)" "HTTP $CODE"

PFAD=$(rumpf | json_feld pfad)
pruefe 'Das Backend sieht /hallo, nicht den ganzen Pfad' \
  "$([ "$PFAD" = "/hallo" ] && echo ja || echo nein)" "pfad=$PFAD"

NAME=$(rumpf | json_feld app)
pruefe 'Die Umgebungsvariable aus dem Manifest ist gesetzt' \
  "$([ -n "$NAME" ] && echo ja || echo nein)" "app=$NAME"

# Phase C4 reicht die Anmeldung an die App weiter. Bis dahin war dieser Kopf
# leer, und die Abnahme belegte GENAU DAS -- eine App, die sich auf einen Kopf
# verlaesst, den die Plattform nicht setzt, wuerde jeden Aufrufer fuer denselben
# halten. Seit C4 steht ein Name darin. Wessen Name das ist und wer keinen
# bekommt, misst `app-anmeldung-abnahme.sh`; hier reicht, DASS er da ist.
NUTZER=$(rumpf | python3 -c 'import sys,json; print(json.load(sys.stdin).get("nutzer") or "")' 2>/dev/null)
pruefe 'X-Arasul-User traegt den angemeldeten Menschen (seit C4)' \
  "$([ -n "$NUTZER" ] && echo ja || echo nein)" "nutzer=${NUTZER:-null}"

hole "/apps/$APP/api/gibt-es-nicht"
pruefe 'Die App beantwortet ihre eigenen 404' "$([ "$CODE" = "404" ] && echo ja || echo nein)" "HTTP $CODE"
pruefe 'und zwar als JSON aus ihrem Container, nicht als Seite' "$(ist_json)" "$TYP"
BLICK=$(rumpf | python3 -c 'import sys,json; print("fehler" if "fehler" in json.load(sys.stdin) else "")' 2>/dev/null)
pruefe 'mit der Meldung der App, nicht der der Plattform' \
  "$([ "$BLICK" = "fehler" ] && echo ja || echo nein)" "Feld ${BLICK:-fehlt}"

# --- 4. Eine App, die es nicht gibt ------------------------------------------
# Ohne den Router `apps-frontend` faellt `/apps/...` an den Catch-All des
# Dashboards, und der antwortet mit seiner eigenen HTML-Seite und HTTP 200.
# Genau das waere der stille Fehler: es SIEHT aus, als antworte etwas.
#
# Bis C3 stand hier 404. Seit C4 antwortet die Freigabe zuerst, und sie kennt
# keine App dieses Namens -- wer eine App nicht freigegeben hat, erfaehrt auch
# nicht, ob es sie am Geraet gibt. Die Aussage dieser Pruefung bleibt dieselbe:
# eine Begruendung als JSON und nicht die Seite des Dashboards.
hole "/apps/gibt-es-nicht-$$/"
pruefe 'Eine unbekannte App ist 403 (seit C4, davor 404)' \
  "$([ "$CODE" = "403" ] && echo ja || echo nein)" "HTTP $CODE"
pruefe 'und keine Seite des Dashboards' "$(ist_json)" "$TYP"

# --- 5. Der Teststand liegt woanders -----------------------------------------
# Beide Staende haben getrennte Pfade. Ohne eingespielten Teststand ist
# `/apps/<id>/test/` deshalb ein 404 aus der Auslieferung -- waeren es
# derselbe Pfad, saehe man hier den Livestand und die Antwort waere 200 mit
# HTML. Mit eingespieltem Teststand ist 200 richtig; beides ist gruen, ein
# 200 mit HTML aber nur, wenn wirklich ein Teststand steht.
hole "/apps/$APP/test/"
STAND_TEST=$(curl -sk --max-time 20 -H "authorization: Bearer $TOK" "$BASIS/api/apps/$APP" |
  python3 -c 'import sys,json; print("ja" if (json.load(sys.stdin).get("data",{}).get("staende",{}).get("test")) else "nein")' 2>/dev/null)
if [ "$STAND_TEST" = "ja" ]; then
  pruefe '/apps/<id>/test/ liefert den Teststand' "$([ "$CODE" = "200" ] && echo ja || echo nein)" "HTTP $CODE"
else
  pruefe '/apps/<id>/test/ ist ohne Teststand ein 404, nicht der Livestand' \
    "$([ "$CODE" = "404" ] && echo ja || echo nein)" "HTTP $CODE"
fi

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
