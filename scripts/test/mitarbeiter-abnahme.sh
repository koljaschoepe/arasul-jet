#!/bin/bash
# =============================================================================
# Abnahme der Mitarbeiterverwaltung, Phase C2 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "curl-Reihe legt Mitarbeiter an und gibt frei."
# Genau das tut dieses Skript, und zwar gegen das laufende Geraet.
#
# Der ganze Lebenslauf eines Mitarbeiters, in einem Durchgang:
#
#   anlegen, anmelden (mit E-Mail), App freigeben, Freigabe sehen,
#   Passwort vom Administrator setzen lassen, eigenes Passwort wechseln,
#   stilllegen, wieder zulassen, Freigabe zuruecknehmen, loeschen.
#
# Dazwischen steht jedes Mal die Gegenprobe: der Mitarbeiter selbst bekommt auf
# jeden Verwaltungsweg 403, und der Administrator kann sich nicht selbst
# aussperren.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/mitarbeiter-abnahme.sh
#
# Voreinstellungen: ARASUL_URL=https://localhost:8443, ARASUL_BENUTZER=admin.
#
# ANMELDEDROSSEL: `loginLimiter` erlaubt ZEHN Anmeldungen je Viertelstunde und
# IP, und dabei bleibt es. Dieser Lauf braucht FUENF eigene -- der Mitarbeiter
# meldet sich mehrfach an, und genau das ist der Punkt der Messung. Die sechste,
# die des Administrators, entfaellt seit dem 27.08.2026, wenn `abnahmen.sh` den
# Lauf startet: die Reihe teilt sich einen Token. Ein 429 wird ausdruecklich als
# 429 gemeldet und nicht als "Anmeldung fehlgeschlagen" -- ein Waechter, der die
# Ursache verschweigt, kostet mehr Zeit als er spart.
#
# Nicht zerstoerend fuer den Bestand: angelegt wird ein Benutzer mit
# Zeitstempel im Namen, freigegeben wird eine App, die schon da ist, und die
# Freigabe wie der Benutzer werden am Ende entfernt, auch wenn unterwegs etwas
# rot war.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Der geteilte Token der Reihe (Entscheidung 27.08.2026).
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
STEMPEL="$(date +%s)"
MITARB="abnahme-mitarbeiter-$STEMPEL"
MAIL="$MITARB@abnahme.local"
# Die App, fuer die freigegeben wird. Bis Phase C3 war das eine erfundene
# Kennung mit Zeitstempel; seit Migration 169 zeigt `app_members.app_id` als
# Fremdschluessel auf `apps.id`, und eine Freigabe fuer eine App, die es am
# Geraet nicht gibt, ist jetzt zu Recht ein 400. Genommen wird deshalb die
# erste App, die wirklich da ist; gibt es keine, werden die Freigabe-Pruefungen
# uebersprungen und gezaehlt, statt rot zu melden.
APP=""

PASS1="Start-$STEMPEL"        # vom Administrator beim Anlegen vergeben
PASS2="Gesetzt-$STEMPEL"      # vom Administrator nachtraeglich gesetzt
PASS3="Selbst-$STEMPEL"       # vom Mitarbeiter selbst gewaehlt

gruen=0
rot=0
uebersprungen=0
# Eine Pruefung, deren Voraussetzung fehlt, ist weder gruen noch rot. Sie rot
# zu melden waere ein Befund ueber den Messaufbau, der wie einer ueber das
# Geraet aussieht; sie wegzulassen waere ein stilles Gruen.
ueberspringe() {
  uebersprungen=$((uebersprungen + 1))
  printf 'weg    %s  (%s)\n' "$1" "$2"
}
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

# Ein Feld aus einer JSON-Antwort, mit Punkten geschachtelt. Wahrheitswerte
# kommen als `true`/`false` heraus, nicht als Pythons `True`/`False`: verglichen
# wird gegen das, was in der Antwort steht.
json_feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k, {}) if isinstance(d, dict) else {}
if isinstance(d, bool): print("true" if d else "false")
elif isinstance(d, (str, int)): print(d)
else: print("")' "$1" 2>/dev/null
}

# Anmelden und dabei sagen, WARUM es nicht geht. `hole_token` gab in der
# Rollen-Abnahme nur den Token zurueck; war er leer, stand da "Anmeldung
# fehlgeschlagen" ohne Grund, und 429 (Drossel), 403 (stillgelegt) und 401
# (falsches Passwort) sahen alle gleich aus. Hier liefert `anm_code` den Code.
#
# Der Code landet in einer DATEI, nicht in einer Variablen: `hole_token` wird
# als `TOK=$(hole_token ...)` aufgerufen, und eine Kommandosubstitution ist eine
# Subshell. Was sie in eine Variable schreibt, ist beim naechsten Befehl wieder
# weg -- der erste Entwurf meldete deshalb "HTTP " ohne Zahl.
ANM_DATEI="$(mktemp)"
# Bis das eigentliche Aufraeumen steht, raeumt wenigstens die Datei sich selbst.
trap 'rm -f "$ANM_DATEI"' EXIT
hole_token() {
  local antwort
  antwort=$(curl -sk -w '\n%{http_code}' -X POST -H 'content-type: application/json' \
    --max-time 30 -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
    "$BASIS/api/auth/login")
  printf '%s' "$antwort" | tail -n1 > "$ANM_DATEI"
  printf '%s' "$antwort" | sed '$d' | json_feld token
}
anm_code() { cat "$ANM_DATEI" 2>/dev/null; }

# Ein Aufruf, der nur den HTTP-Code liefert.
#   rufe VERB PFAD TOKEN [BODY]
# Wiederholt wird bei 429 (Drossel) und bei 000 (Zeitueberschreitung oder
# abgebrochene Verbindung). Beides sagt etwas ueber den Zeitpunkt, nichts ueber
# die Sache, die hier gemessen wird.
rufe() {
  local verb="$1" pfad="$2" token="$3" leib="${4:-}" code versuch
  [ -z "$leib" ] && leib='{}'
  for versuch in 1 2 3; do
    code=$(curl -sk -o /dev/null -w '%{http_code}' -X "$verb" --max-time 30 \
      -H "authorization: Bearer $token" -H 'content-type: application/json' \
      -d "$leib" "$BASIS$pfad")
    case "$code" in
      429) sleep 20 ;;
      000) sleep 5 ;;
      *) break ;;
    esac
  done
  echo "$code"
}

# Derselbe Aufruf, aber mit dem Rumpf statt dem Code:
#   hole VERB PFAD TOKEN [LEIB]
hole() {
  local verb="$1" pfad="$2" token="$3" leib="${4:-}"
  [ -z "$leib" ] && leib='{}'
  curl -sk --max-time 30 -X "$verb" -H "authorization: Bearer $token" \
    -H 'content-type: application/json' -d "$leib" "$BASIS$pfad"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme der Mitarbeiterverwaltung (Phase C2) gegen $BASIS ==="
echo

# --- 1. Administrator anmelden ----------------------------------------------
# `arasul_token` nimmt den geteilten Token, den abgelegten oder meldet einmal an.
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung geht nichts weiter (HTTP $(arasul_anmeldecode); 429 heisst Anmeldedrossel)."; exit 1; }

# Die eigene Nummer wird in Abschnitt 8 gebraucht. Ohne sie stuende dort
# `/api/benutzer//aktiv`, und ein 404 saehe aus wie eine fehlende Pruefung.
ICH=$(hole GET /api/auth/me "$TOK" | json_feld user.id)
pruefe 'Der Administrator kennt seine eigene Nummer' "$([ -n "$ICH" ] && echo ja || echo nein)" "id=$ICH"

# Die App, fuer die freigegeben wird: die erste, die am Geraet steht.
APP=$(hole GET /api/apps "$TOK" |
  python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print(d[0]["id"] if d else "")' 2>/dev/null)
if [ -n "$APP" ]; then
  printf 'gefunden  App %s, fuer sie wird freigegeben\n' "$APP"
else
  printf 'gefunden  keine App am Geraet, die Freigabe-Pruefungen entfallen\n'
  printf '          (erst: bash scripts/test/beispielapp.sh einspielen)\n'
fi

# --- 2. Mitarbeiter anlegen, Aufraeumen sicherstellen ------------------------
ID=""
aufraeumen() {
  rm -f "$ANM_DATEI"
  [ -z "$ID" ] && return
  local code
  code=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE \
    -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$ID")
  printf 'aufgeraeumt  Benutzer %s geloescht (HTTP %s)\n' "$ID" "$code"
}
trap aufraeumen EXIT

ID=$(curl -sk -X POST -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d "{\"username\":\"$MITARB\",\"password\":\"$PASS1\",\"email\":\"$MAIL\",\"rolle\":\"mitarbeiter\"}" \
  "$BASIS/api/benutzer" | json_feld data.id)
pruefe 'Mitarbeiter angelegt' "$([ -n "$ID" ] && echo ja || echo nein)" "id=$ID"
[ -z "$ID" ] && { echo; echo "Ohne den Mitarbeiter gibt es nichts zu messen."; exit 1; }

TOK_M=$(hole_token "$MAIL" "$PASS1")
pruefe 'Mitarbeiter meldet sich mit E-Mail an' "$([ -n "$TOK_M" ] && echo ja || echo nein)" "HTTP $(anm_code)"
[ -z "$TOK_M" ] && { echo; echo "Ohne die Sitzung des Mitarbeiters gibt es nichts zu messen."; exit 1; }

ROLLE=$(hole GET /api/auth/me "$TOK_M" | json_feld user.role)
pruefe 'Mitarbeiter sieht seine Rolle' "$([ "$ROLLE" = "mitarbeiter" ] && echo ja || echo nein)" "role=$ROLLE"

# --- 3. Freigeben ------------------------------------------------------------
if [ -z "$APP" ]; then
  ueberspringe 'Freigeben und Freigabe sehen' 'keine App am Geraet'
else
code=$(rufe POST /api/freigaben "$TOK" "{\"app_id\":\"$APP\",\"benutzer_id\":$ID}")
pruefe "App $APP fuer den Mitarbeiter freigegeben" "$([ "$code" = "201" ] && echo ja || echo nein)" "HTTP $code"

# Zweimal dieselbe Freigabe ist derselbe Zustand, kein Fehler: 200 statt 409.
code=$(rufe POST /api/freigaben "$TOK" "{\"app_id\":\"$APP\",\"benutzer_id\":$ID}")
pruefe 'Dieselbe Freigabe noch einmal ist 200, nicht 409' "$([ "$code" = "200" ] && echo ja || echo nein)" "HTTP $code"

GEFUNDEN=$(hole GET "/api/freigaben?benutzer_id=$ID" "$TOK" |
  python3 -c "import sys,json
d=json.load(sys.stdin).get('data',[])
print(next((f['app_id'] for f in d if f['app_id']=='$APP'), ''))" 2>/dev/null)
pruefe 'Freigabe steht beim Mitarbeiter' "$([ "$GEFUNDEN" = "$APP" ] && echo ja || echo nein)" "app_id=$GEFUNDEN"

NAME=$(hole GET "/api/freigaben?app_id=$APP" "$TOK" |
  python3 -c "import sys,json
d=json.load(sys.stdin).get('data',[])
print(d[0]['username'] if d else '')" 2>/dev/null)
pruefe 'Freigabe nennt den Menschen, nicht nur seine Nummer' "$([ "$NAME" = "$MITARB" ] && echo ja || echo nein)" "username=$NAME"

# Der Tester-Kreis (Phase C3): dieselbe Freigabe noch einmal, diesmal mit
# `stand: test`. Sie wird nicht zur zweiten Zeile, sondern die eine Zeile
# aendert ihr Wort -- und der Zeitstempel der ersten bleibt stehen.
STAND=$(hole POST /api/freigaben "$TOK" "{\"app_id\":\"$APP\",\"benutzer_id\":$ID,\"stand\":\"test\"}" |
  json_feld data.stand)
pruefe 'Aus dem Nutzer wird ein Tester (stand=test)' "$([ "$STAND" = "test" ] && echo ja || echo nein)" "stand=$STAND"

ZEILEN=$(hole GET "/api/freigaben?app_id=$APP&benutzer_id=$ID" "$TOK" |
  python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("data",[])))' 2>/dev/null)
pruefe 'und bleibt dabei EINE Freigabe' "$([ "$ZEILEN" = "1" ] && echo ja || echo nein)" "$ZEILEN Zeile(n)"

STAND=$(hole POST /api/freigaben "$TOK" "{\"app_id\":\"$APP\",\"benutzer_id\":$ID,\"stand\":\"live\"}" |
  json_feld data.stand)
pruefe 'und wieder zurueck (stand=live)' "$([ "$STAND" = "live" ] && echo ja || echo nein)" "stand=$STAND"

# Was das dem Mitarbeiter bringt: er sieht die App in seiner eigenen Liste.
MEINE=$(hole GET /api/apps/meine "$TOK_M" |
  python3 -c "import sys,json
d=json.load(sys.stdin).get('data',[])
print(next((a['id'] for a in d if a['id']=='$APP'), ''))" 2>/dev/null)
pruefe 'Der Mitarbeiter sieht die App unter /api/apps/meine' \
  "$([ "$MEINE" = "$APP" ] && echo ja || echo nein)" "id=$MEINE"
fi

# --- 4. Der Mitarbeiter verwaltet nichts -------------------------------------
while read -r verb pfad; do
  [ -z "$verb" ] && continue
  code=$(rufe "$verb" "$pfad" "$TOK_M")
  pruefe "Mitarbeiter: $verb $pfad ist 403" "$([ "$code" = "403" ] && echo ja || echo nein)" "HTTP $code"
done <<VERWALTUNG
GET /api/freigaben
POST /api/freigaben
DELETE /api/freigaben/${APP:-platzhalter}/$ID
GET /api/benutzer
POST /api/benutzer
PUT /api/benutzer/$ID/passwort
PUT /api/benutzer/$ID/aktiv
DELETE /api/benutzer/$ID
VERWALTUNG

# --- 5. Der Administrator setzt das Passwort ---------------------------------
code=$(rufe PUT "/api/benutzer/$ID/passwort" "$TOK" "{\"password\":\"$PASS2\"}")
pruefe 'Administrator setzt das Passwort' "$([ "$code" = "200" ] && echo ja || echo nein)" "HTTP $code"

code=$(rufe GET /api/auth/me "$TOK_M")
pruefe 'Die alte Sitzung des Mitarbeiters ist danach tot' "$([ "$code" = "401" ] && echo ja || echo nein)" "HTTP $code"

TOK_M=$(hole_token "$MAIL" "$PASS2")
pruefe 'Mitarbeiter meldet sich mit dem gesetzten Passwort an' "$([ -n "$TOK_M" ] && echo ja || echo nein)" "HTTP $(anm_code)"

# --- 6. Der Mitarbeiter wechselt sein eigenes Passwort -----------------------
if [ -n "$TOK_M" ]; then
  code=$(rufe POST /api/auth/change-password "$TOK_M" \
    "{\"currentPassword\":\"$PASS2\",\"newPassword\":\"$PASS3\"}")
  pruefe 'Mitarbeiter wechselt sein eigenes Passwort' "$([ "$code" = "200" ] && echo ja || echo nein)" "HTTP $code"
  TOK_M=$(hole_token "$MAIL" "$PASS3")
  pruefe 'Mitarbeiter meldet sich mit dem selbst gewaehlten Passwort an' \
    "$([ -n "$TOK_M" ] && echo ja || echo nein)" "HTTP $(anm_code)"
fi

# --- 7. Stilllegen und wieder zulassen ---------------------------------------
AKTIV=$(hole PUT "/api/benutzer/$ID/aktiv" "$TOK" '{"aktiv":false}' | json_feld data.is_active)
pruefe 'Administrator legt den Mitarbeiter still' "$([ "$AKTIV" = "false" ] && echo ja || echo nein)" "is_active=$AKTIV"

code=$(rufe GET /api/auth/me "$TOK_M")
pruefe 'Die Sitzung des Stillgelegten ist tot' "$([ "$code" = "401" ] && echo ja || echo nein)" "HTTP $code"

TOT=$(hole_token "$MAIL" "$PASS3")
pruefe 'Der Stillgelegte kommt nicht mehr herein' \
  "$([ -z "$TOT" ] && [ "$(anm_code)" = "403" ] && echo ja || echo nein)" "HTTP $(anm_code)"

AKTIV=$(hole PUT "/api/benutzer/$ID/aktiv" "$TOK" '{"aktiv":true}' | json_feld data.is_active)
pruefe 'Administrator laesst ihn wieder zu' "$([ "$AKTIV" = "true" ] && echo ja || echo nein)" "is_active=$AKTIV"

TOK_M=$(hole_token "$MAIL" "$PASS3")
pruefe 'Er kommt wieder herein' "$([ -n "$TOK_M" ] && echo ja || echo nein)" "HTTP $(anm_code)"

# --- 8. Der Administrator sperrt sich nicht selbst aus -----------------------
# Die Pruefung steht in der Route VOR jedem Schreibzugriff; ein 400 ist der
# Beleg, dass nichts geschrieben wurde.
if [ -n "$ICH" ]; then
  code=$(rufe PUT "/api/benutzer/$ICH/aktiv" "$TOK" '{"aktiv":false}')
  pruefe 'Der Administrator kann sich nicht selbst stilllegen' "$([ "$code" = "400" ] && echo ja || echo nein)" "HTTP $code"

  code=$(rufe GET /api/auth/me "$TOK")
  pruefe 'und ist danach immer noch angemeldet' "$([ "$code" = "200" ] && echo ja || echo nein)" "HTTP $code"

  # Und er setzt sich hier auch nicht selbst ein Passwort: dieser Weg prueft
  # das alte nicht und kennt die Komplexitaetsregeln nicht. Fuer das eigene
  # Konto gibt es POST /api/auth/change-password.
  code=$(rufe PUT "/api/benutzer/$ICH/passwort" "$TOK" '{"password":"Umgehung-12345"}')
  pruefe 'Der Administrator setzt sich nicht selbst ein Passwort' "$([ "$code" = "400" ] && echo ja || echo nein)" "HTTP $code"
fi

# --- 9. Freigabe zuruecknehmen -----------------------------------------------
if [ -z "$APP" ]; then
  ueberspringe 'Freigabe zuruecknehmen' 'keine App am Geraet'
else
code=$(rufe DELETE "/api/freigaben/$APP/$ID" "$TOK")
pruefe 'Freigabe zurueckgenommen' "$([ "$code" = "200" ] && echo ja || echo nein)" "HTTP $code"

code=$(rufe DELETE "/api/freigaben/$APP/$ID" "$TOK")
pruefe 'Zweimal zuruecknehmen ist 404, kein stiller Erfolg' "$([ "$code" = "404" ] && echo ja || echo nein)" "HTTP $code"

# --- 10. Loeschen raeumt die Freigaben mit -----------------------------------
code=$(rufe POST /api/freigaben "$TOK" "{\"app_id\":\"$APP\",\"benutzer_id\":$ID}")
pruefe 'Noch einmal freigegeben, um die Loeschung zu pruefen' "$([ "$code" = "201" ] && echo ja || echo nein)" "HTTP $code"
fi

# Die Nummer wird nach dem Loeschen noch gebraucht. `ID` selbst muss leer
# werden, sonst versucht das Aufraeumen den Benutzer ein zweites Mal zu
# loeschen und meldet ein 404 als Rest.
GEWESEN="$ID"
WEG=$(hole DELETE "/api/benutzer/$ID" "$TOK" | json_feld deleted)
pruefe 'Administrator loescht den Mitarbeiter' "$([ "$WEG" = "true" ] && echo ja || echo nein)" "deleted=$WEG"
[ "$WEG" = "true" ] && ID=""

if [ -z "$APP" ]; then
  ueberspringe 'Freigaben sind mit dem Benutzer weg' 'keine App am Geraet'
else
# Nach BENUTZER gefiltert, nicht nur nach App: die App ist eine echte App am
# Geraet und kann Freigaben fuer andere Menschen tragen. Bis Phase C3 war sie
# eine erfundene Kennung, die nur diesem Lauf gehoerte, und `?app_id=` allein
# reichte.
REST=$(hole GET "/api/freigaben?app_id=$APP&benutzer_id=$GEWESEN" "$TOK" |
  python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("data",[])))' 2>/dev/null)
pruefe 'Seine Freigaben sind mit ihm weg' "$([ "$REST" = "0" ] && echo ja || echo nein)" "$REST uebrig"
fi

echo
if [ "$uebersprungen" -gt 0 ]; then
  echo "$gruen von $((gruen + rot)) gruen, $uebersprungen uebersprungen"
else
  echo "$gruen von $((gruen + rot)) gruen"
fi
[ "$rot" -eq 0 ] || exit 1
