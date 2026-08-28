#!/bin/bash
# =============================================================================
# Abnahme A4: die Verwaltung. Phase D3 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "Admin legt im Browser einen Mitarbeiter an, setzt
# das Startpasswort, gibt genau eine App frei; der Mitarbeiter meldet sich an,
# wechselt das Startpasswort, sieht nur diese App, und jede Admin-Route
# antwortet ihm mit 403."
#
# WAS GEMESSEN WIRD, und in dieser Reihenfolge:
#
#   1. IM BROWSER (`admin-bilder.mjs`): anlegen, Startpasswort
#      setzen, genau eine App freigeben. Das ist der Teil, den D3 hinzufuegt --
#      die Wege dahinter stehen seit C1 und C2, die Oberflaeche davor nicht.
#   2. Am Backend: der im Browser angelegte Mensch ist wirklich da, traegt sein
#      Startpasswort-Kennzeichen und hat GENAU EINE Freigabe.
#   3. Er meldet sich mit dem gesetzten Startpasswort an. Die Anmeldung sagt
#      `passwortWechselNoetig` (Zeile 34 vom 27.08.2026, gebaut in D1).
#   4. Er wechselt es selbst, meldet sich neu an, und das Kennzeichen ist weg.
#   5. Er sieht GENAU die freigegebene App -- und keine zweite, die am Geraet
#      steht.
#   6. Jeder Verwaltungsweg dieser Phase antwortet ihm mit 403, aus der Route
#      und nicht aus der Oberflaeche. Die Rolle blendet aus; ENTSCHEIDEN tut
#      das Backend, und genau das steht hier.
#   7. Aufgeraeumt wird, auch wenn unterwegs etwas rot war.
#
# WARUM DER ADMIN-TEIL IM BROWSER PASSIERT UND NICHT PER curl. Dass
# `POST /api/benutzer` und `POST /api/freigaben` funktionieren, misst
# `mitarbeiter-abnahme.sh` seit Phase C2. Was D3 hinzufuegt, ist ausschliesslich
# die Frage, ob ein Administrator diese Wege FINDET und bedient. Eine Antwort
# darauf per `curl` gaebe es nicht.
#
# WARUM DIESE ABNAHME NEBEN `abnahmen.sh` STEHT, wie schon `shell-abnahme.sh`
# und `dashboard-abnahme.sh`: `loginLimiter` erlaubt ZEHN Anmeldungen je
# Viertelstunde und IP, und die Reihe dort sitzt seit Phase C4 mit genau zehn
# auf der Grenze. Dieser Lauf braucht DREI (eine als Administrator, zwei als
# Mitarbeiter -- einmal mit dem Startpasswort, einmal nach dem Selbstwechsel);
# der Browser bekommt die fertige Sitzung des Administrators gereicht und
# meldet sich gar nicht an.
#
# NICHT IN DERSELBEN VIERTELSTUNDE WIE `shell-abnahme.sh` ODER
# `dashboard-abnahme.sh`. Die drei brauchen zusammen acht Anmeldungen; mit
# einer Reihe aus `abnahmen.sh` davor waeren es achtzehn, und die spaeteren
# Messungen meldeten dann etwas ueber den Messaufbau statt ueber das Geraet.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/admin-abnahme.sh
#
# Auf dem Geraet:
#   cd ~/arasul/arasul-jet
#   ARASUL_URL=https://localhost:443 ARASUL_PASSWORT=... \
#     bash scripts/test/admin-abnahme.sh
#
# Voreinstellungen: ARASUL_URL=https://localhost:8443, ARASUL_BENUTZER=admin,
# ARASUL_ADMIN_APP=beispielapp.
#
# Nicht zerstoerend fuer den Bestand: angelegt wird ein Benutzer mit
# Zeitstempel im Namen, freigegeben wird eine App, die schon da ist, und beides
# wird am Ende entfernt.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
APP="${ARASUL_ADMIN_APP:-beispielapp}"
STEMPEL="$(date +%s)"
MITARB="abnahme-admin-$STEMPEL"
MAIL="$MITARB@abnahme.local"
# Drei Passwoerter, drei Rollen im Ablauf: eines beim Anlegen, eines vom
# Administrator gesetzt (mit dem der Mitarbeiter hereinkommt), eines selbst
# gewaehlt. Nur das dritte ist am Ende noch gueltig.
PASS_ERST="Erst-$STEMPEL"
PASS_START="Start-$STEMPEL"
PASS_SELBST="Selbst-$STEMPEL"

gruen=0
rot=0
uebersprungen=0

ueberspringe() {
  uebersprungen=$((uebersprungen + 1))
  printf 'weg    %s  (%s)\n' "$1" "$2"
}
pruefe() {
  local was="$1"
  local ok="$2"
  local detail="${3:-}"
  if [ "$ok" = "ja" ]; then
    gruen=$((gruen + 1))
    printf 'gruen  %s%s\n' "$was" "${detail:+  ($detail)}"
  else
    rot=$((rot + 1))
    printf 'ROT    %s%s\n' "$was" "${detail:+  ($detail)}"
  fi
}
ja_nein() { [ "$1" = "$2" ] && echo ja || echo nein; }

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

# Anmelden und dabei sagen, WARUM es nicht geht. Der Code landet in einer
# DATEI, nicht in einer Variablen: `hole_token` wird als `TOK=$(hole_token ...)`
# aufgerufen, und eine Kommandosubstitution ist eine Subshell (Falle aus der
# C2-Abnahme).
ANM_DATEI="$(mktemp)"
SITZUNG_A="${TMPDIR:-/tmp}/arasul-admin-d3-sitzung.json"
hole_token() {
  local antwort
  antwort=$(curl -sk -w '\n%{http_code}' -X POST -H 'content-type: application/json' \
    --max-time 30 -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
    "$BASIS/api/auth/login")
  printf '%s' "$antwort" | tail -n1 > "$ANM_DATEI"
  printf '%s' "$antwort" | sed '$d'
}
anm_code() { cat "$ANM_DATEI" 2>/dev/null; }

# Nur der HTTP-Code. Wiederholt bei 429 (Drossel) und 000 (Zeitueberschreitung):
# beides sagt etwas ueber den Zeitpunkt, nichts ueber die Sache.
rufe() {
  local verb="$1"
  local pfad="$2"
  local token="$3"
  local leib="${4:-}"
  local code
  [ -z "$leib" ] && leib='{}'
  # shellcheck disable=SC2034  # der Zaehler zaehlt, mehr soll er nicht
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

hole() {
  local verb="$1"
  local pfad="$2"
  local token="$3"
  local leib="${4:-}"
  [ -z "$leib" ] && leib='{}'
  curl -sk --max-time 30 -X "$verb" -H "authorization: Bearer $token" \
    -H 'content-type: application/json' -d "$leib" "$BASIS$pfad"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme A4: die Verwaltung (Phase D3) gegen $BASIS ==="
echo

# --- 1. Administrator und App ------------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung geht nichts weiter (429 heisst Anmeldedrossel)."; exit 1; }

APPS_ROH=$(hole GET /api/apps "$TOK")
DA=$(printf '%s' "$APPS_ROH" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print("ja" if any(a["id"]==sys.argv[1] for a in d) else "nein")' "$APP" 2>/dev/null)
if [ "$DA" != "ja" ]; then
  echo "Die App '$APP' steht nicht am Geraet."
  echo "Erst einspielen: bash scripts/test/beispielapp.sh"
  echo "(oder eine andere ueber ARASUL_ADMIN_APP nennen)"
  exit 1
fi
# Eine zweite App macht aus "er sieht die eine" eine echte Gegenprobe. Mit nur
# einer wird sie uebersprungen statt rot gemeldet.
ANDERE=$(printf '%s' "$APPS_ROH" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print(next((a["id"] for a in d if a["id"]!=sys.argv[1]), ""))' "$APP" 2>/dev/null)
printf 'gefunden  App %s%s\n' "$APP" "${ANDERE:+, Gegenprobe mit $ANDERE}"

# Der angelegte Mensch wird IMMER wieder entfernt, auch wenn unterwegs etwas
# rot war. Seine Nummer steht erst nach dem Browserlauf fest; bis dahin ist der
# Aufraeumer eine Nullnummer.
ID=""
aufraeumen() {
  rm -f "$ANM_DATEI" "$SITZUNG_A"
  [ -z "$ID" ] && return
  local code
  code=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE \
    -H "authorization: Bearer $TOK" "$BASIS/api/freigaben/$APP/$ID")
  printf 'aufgeraeumt  Freigabe zurueckgenommen (HTTP %s)\n' "$code"
  code=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE \
    -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$ID")
  printf 'aufgeraeumt  Benutzer %s geloescht (HTTP %s)\n' "$ID" "$code"
}
trap aufraeumen EXIT

# --- 2. Der Browser: anlegen, Passwort setzen, freigeben ---------------------
# OHNE PLAYWRIGHT GIBT ES HIER NICHTS ZU MESSEN. Diese Abnahme misst die
# Oberflaeche der Verwaltung; alles Weitere baut auf dem auf, was der Browser
# angelegt hat. Ein gruener Lauf ohne ihn waere eine Aussage ueber nichts.
if ! node -e 'require.resolve("playwright")' 2>/dev/null; then
  echo "Playwright fehlt. Diese Abnahme misst den Browser; ohne ihn gibt es"
  echo "nichts zu messen. Erst: npm ci"
  exit 1
fi

(
  # In einer Subshell, damit die Namen NUR hier gelten: `$ARASUL_SITZUNG` traegt
  # sonst die Sitzung, die sich die ganze Reihe teilt.
  # shellcheck disable=SC2034  # von `arasul_sitzung_bauen` aus der Umgebung gelesen
  ARASUL_SITZUNG="$SITZUNG_A"
  arasul_sitzung_bauen "$TOK"
)
pruefe 'Die Sitzung des Administrators fuer den Browser' \
  "$([ -s "$SITZUNG_A" ] && echo ja || echo nein)" "$SITZUNG_A"
[ -s "$SITZUNG_A" ] || { echo; echo "Ohne Sitzung faehrt der Browser nicht."; exit 1; }

if ARASUL_URL="$BASIS" ARASUL_SITZUNG="$SITZUNG_A" ARASUL_MITARBEITER="$MITARB" \
   ARASUL_MAIL="$MAIL" ARASUL_PASS_ERST="$PASS_ERST" ARASUL_PASS_START="$PASS_START" \
   ARASUL_APP="$APP" node "$WURZEL/scripts/test/admin-bilder.mjs"; then
  pruefe 'Verwaltung im Browser: anlegen, Passwort, Freigabe' ja \
    'docs/plans/audits/'
else
  pruefe 'Verwaltung im Browser: anlegen, Passwort, Freigabe' nein \
    'admin-bilder.mjs war rot'
fi

# --- 3. Was der Browser angerichtet hat --------------------------------------
# Ab hier misst das Skript den ZUSTAND, nicht die Bedienung: der Browser kann
# gruen gemeldet haben und trotzdem nichts geschrieben haben.
BENUTZER=$(hole GET /api/benutzer "$TOK")
ID=$(printf '%s' "$BENUTZER" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print(next((str(b["id"]) for b in d if b["username"]==sys.argv[1]), ""))' "$MITARB" 2>/dev/null)
pruefe 'Der im Browser angelegte Mensch steht in der Datenbank' \
  "$([ -n "$ID" ] && echo ja || echo nein)" "id=${ID:-keine}"
[ -z "$ID" ] && { echo; echo "Ohne ihn gibt es nichts weiter zu messen."; exit 1; }

VOM_ADMIN=$(printf '%s' "$BENUTZER" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
b=next((x for x in d if x["username"]==sys.argv[1]), {})
print("true" if b.get("passwort_vom_admin") else "false")' "$MITARB" 2>/dev/null)
pruefe 'Sein Passwort ist als Startpasswort gekennzeichnet' \
  "$(ja_nein "$VOM_ADMIN" true)" "passwort_vom_admin=$VOM_ADMIN"

FREI=$(hole GET "/api/freigaben?benutzer_id=$ID" "$TOK")
ANZAHL=$(printf '%s' "$FREI" |
  python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("data",[])))' 2>/dev/null)
pruefe 'Er hat GENAU EINE Freigabe' "$(ja_nein "$ANZAHL" 1)" "${ANZAHL:-?} Stueck"
FREI_APP=$(printf '%s' "$FREI" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print(d[0]["app_id"] if d else "")' 2>/dev/null)
pruefe "und sie gilt fuer $APP" "$(ja_nein "$FREI_APP" "$APP")" "app=${FREI_APP:-keine}"

# --- 4. Er kommt mit dem gesetzten Startpasswort herein ----------------------
# Mit dem ZWEITEN Passwort, nicht dem beim Anlegen: der Administrator hat es im
# Browser ueberschrieben, und dass das wirkt, ist die halbe Messung dieser
# Phase.
ANTWORT=$(hole_token "$MAIL" "$PASS_START")
TOK_M=$(printf '%s' "$ANTWORT" | json_feld token)
pruefe 'Der Mitarbeiter meldet sich mit dem gesetzten Passwort an' \
  "$([ -n "$TOK_M" ] && echo ja || echo nein)" "HTTP $(anm_code)"
[ -z "$TOK_M" ] && { echo; echo "Ohne seine Sitzung gibt es nichts zu messen."; exit 1; }

WECHSEL=$(printf '%s' "$ANTWORT" | json_feld user.passwortWechselNoetig)
pruefe 'Die Anmeldung verlangt den Wechsel (Zeile 34 vom 27.08.2026)' \
  "$(ja_nein "$WECHSEL" true)" "passwortWechselNoetig=$WECHSEL"

# --- 5. Er wechselt selbst ---------------------------------------------------
code=$(rufe POST /api/auth/change-password "$TOK_M" \
  "{\"currentPassword\":\"$PASS_START\",\"newPassword\":\"$PASS_SELBST\"}")
pruefe 'Er wechselt das Startpasswort selbst' "$(ja_nein "$code" 200)" "HTTP $code"

# Der Wechsel entwertet ALLE seine Sitzungen (`blacklistAllUserTokens`).
ANTWORT=$(hole_token "$MAIL" "$PASS_SELBST")
TOK_M=$(printf '%s' "$ANTWORT" | json_feld token)
WECHSEL=$(printf '%s' "$ANTWORT" | json_feld user.passwortWechselNoetig)
pruefe 'Danach verlangt die Anmeldung keinen Wechsel mehr' \
  "$([ -n "$TOK_M" ] && [ "$WECHSEL" = "false" ] && echo ja || echo nein)" \
  "HTTP $(anm_code), passwortWechselNoetig=$WECHSEL"
[ -z "$TOK_M" ] && { echo; echo "Ohne seine Sitzung gibt es nichts zu messen."; exit 1; }

# --- 6. Er sieht GENAU die eine App ------------------------------------------
LISTE=$(hole GET /api/apps/meine "$TOK_M" | python3 -c 'import sys,json
print(",".join(a["id"] for a in json.load(sys.stdin).get("data",[])))' 2>/dev/null)
pruefe 'Er sieht GENAU die im Browser freigegebene App' \
  "$(ja_nein "$LISTE" "$APP")" "gesehen: ${LISTE:-nichts}"

if [ -z "$ANDERE" ]; then
  ueberspringe 'Gegenprobe: eine zweite App bleibt unsichtbar' 'nur eine App am Geraet'
else
  pruefe 'Eine zweite App am Geraet bleibt unsichtbar' \
    "$(grep -q "$ANDERE" <<<"$LISTE" && echo nein || echo ja)" "$ANDERE nicht in der Liste"
fi

# --- 7. Jede Admin-Route antwortet ihm mit 403 -------------------------------
# Die Oberflaeche blendet die Verwaltung fuer ihn aus. Hier steht, dass das
# Ausblenden nicht die Berechtigung IST -- und zwar fuer JEDEN Weg, den die
# Seite aus D3 benutzt.
#
# Die schreibenden Wege zeigen bewusst auf SEIN EIGENES Konto: `requireRole`
# sitzt vor `validateParams`, es kommt also gar nichts an. Griffe die Regel
# dennoch nicht, traefe der Schaden den Wegwerf-Zugang dieser Abnahme und
# keinen echten Menschen.
while read -r verb pfad; do
  [ -z "$verb" ] && continue
  code=$(rufe "$verb" "$pfad" "$TOK_M")
  pruefe "Mitarbeiter: $verb $pfad ist 403" "$(ja_nein "$code" 403)" "HTTP $code"
done <<VERWALTUNG
GET /api/benutzer
POST /api/benutzer
PUT /api/benutzer/$ID/passwort
PUT /api/benutzer/$ID/aktiv
DELETE /api/benutzer/$ID
GET /api/freigaben
POST /api/freigaben
DELETE /api/freigaben/$APP/$ID
GET /api/apps
VERWALTUNG

# Und die Gegenprobe zur Gegenprobe: er ist immer noch da. Waere eine der
# schreibenden Zeilen oben durchgekommen, stuende hier der Beweis.
NOCH=$(hole GET /api/auth/me "$TOK_M" | json_feld user.username)
pruefe 'Sein Konto hat die neun Versuche unveraendert ueberstanden' \
  "$(ja_nein "$NOCH" "$MITARB")" "me=${NOCH:-nichts}"

echo
if [ "$uebersprungen" -gt 0 ]; then
  echo "$gruen von $((gruen + rot)) gruen, $uebersprungen uebersprungen"
else
  echo "$gruen von $((gruen + rot)) gruen"
fi
[ "$rot" -eq 0 ] || exit 1
