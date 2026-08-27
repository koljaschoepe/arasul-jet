#!/bin/bash
# =============================================================================
# Abnahme der Shell und der Anmeldung, Phase D1 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "Login als Mitarbeiter zeigt nur freigegebene Apps,
# Screenshot in drei Breiten." Dieses Skript misst den ersten Teil gegen das
# laufende Geraet und stoesst den zweiten an (`shell-bilder.mjs`, Playwright).
#
# WAS GEMESSEN WIRD, und in dieser Reihenfolge:
#
#   1. Die gerenderte Shell kommt ueberhaupt an (HTML, Buendel, kein Login-Zwang
#      auf der Startseite).
#   2. Ein frisch angelegter Mitarbeiter meldet sich mit seiner E-MAIL an (C1).
#   3. Er sieht unter /api/apps/meine NICHTS, solange nichts freigegeben ist.
#   4. Nach der Freigabe sieht er GENAU die eine App -- und keine zweite, die
#      am Geraet steht.
#   5. Die App selbst laesst ihn durch (`/apps/<id>/`, Forward-Auth aus C4),
#      eine nicht freigegebene nicht.
#   6. Die Verwaltungswege der Shell (Modelle, Benutzer, Sicherung,
#      Einstellungen) antworten ihm mit 403. Die Rolle blendet in der
#      Oberflaeche aus; ENTSCHEIDEN tut das Backend, und genau das steht hier.
#   7. Sein Zettel (`/api/notizen`, D1) und die Zahl der offenen Freigaben
#      (`/api/freigabe-anfragen`, C7) sind fuer ihn da.
#   8. Ein vom Administrator gesetztes Passwort ist ein STARTPASSWORT: die
#      Anmeldung sagt `passwortWechselNoetig`, und der Selbstwechsel nimmt es
#      zurueck.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/shell-abnahme.sh
#
# Voreinstellungen: ARASUL_URL=https://localhost:8443, ARASUL_BENUTZER=admin.
#
# WARUM DIESE ABNAHME NEBEN `abnahmen.sh` STEHT UND NICHT DARIN.
# `loginLimiter` erlaubt ZEHN Anmeldungen je Viertelstunde und IP, und die
# Reihe in `abnahmen.sh` sitzt seit Phase C4 mit GENAU ZEHN auf dieser Grenze
# (zwei fuer `rollen`, fuenf fuer `mitarbeiter`, zwei fuer `app-anmeldung`, eine
# geteilte -- nachgerechnet im Kopf von `anmeldung.sh`). Dieser Lauf braucht
# DREI eigene: einmal mit dem Startpasswort, einmal nach dem Selbstwechsel,
# einmal fuer den Bilderlauf im Browser. In die Reihe gestellt fiele mitten
# darin ein 429, und die Abnahme danach meldete etwas ueber den Messaufbau
# statt ueber das Geraet. Die Drossel zu lockern, damit die eigenen Messungen
# bequemer werden, hiesse das Geraet fuer den Messaufbau zu schwaechen.
#
# Nicht zerstoerend fuer den Bestand: angelegt wird ein Benutzer mit
# Zeitstempel im Namen, freigegeben wird eine App, die schon da ist, und beides
# wird am Ende entfernt, auch wenn unterwegs etwas rot war.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
STEMPEL="$(date +%s)"
MITARB="abnahme-shell-$STEMPEL"
MAIL="$MITARB@abnahme.local"
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
  local was="$1" ok="$2" detail="${3:-}"
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
# aufgerufen, und eine Kommandosubstitution ist eine Subshell (dieselbe Falle
# wie in der C2-Abnahme).
ANM_DATEI="$(mktemp)"
trap 'rm -f "$ANM_DATEI"' EXIT
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
  local verb="$1" pfad="$2" token="$3" leib="${4:-}"
  local code versuch
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

echo "=== Abnahme der Shell und der Anmeldung (Phase D1) gegen $BASIS ==="
echo

# --- 1. Die gerenderte Shell -------------------------------------------------
# Ohne Anmeldung: das Buendel kommt, die Seite entscheidet danach selbst, ob sie
# die Anmeldung oder die Shell zeigt. Ein 302 auf eine Anmeldeseite gaebe es
# hier gar nicht -- die Oberflaeche ist EINE Seite.
SEITE="$(curl -sk --max-time 30 "$BASIS/")"
pruefe 'Die Startseite liefert das Oberflaechen-Buendel' \
  "$(grep -q '<div id="root"' <<<"$SEITE" && echo ja || echo nein)" \
  "$(printf '%s' "$SEITE" | wc -c | tr -d ' ') Zeichen"
pruefe 'und sie traegt keine alten Seiten mehr im Buendelnamen' \
  "$(grep -qiE 'wissensgraph|dokumente\.js|terminal\.js' <<<"$SEITE" && echo nein || echo ja)"

# --- 2. Administrator, Mitarbeiter, App --------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung geht nichts weiter (429 heisst Anmeldedrossel)."; exit 1; }

# Zwei Apps waeren schoener (dann zeigt sich das Sieben unmittelbar); mit einer
# wird die Gegenprobe uebersprungen statt rot gemeldet.
APPS_ROH=$(hole GET /api/apps "$TOK")
APP=$(printf '%s' "$APPS_ROH" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print(d[0]["id"] if d else "")' 2>/dev/null)
ANDERE=$(printf '%s' "$APPS_ROH" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print(d[1]["id"] if len(d)>1 else "")' 2>/dev/null)
if [ -n "$APP" ]; then
  printf 'gefunden  App %s%s\n' "$APP" "${ANDERE:+, Gegenprobe mit $ANDERE}"
else
  printf 'gefunden  keine App am Geraet\n'
  printf '          (erst: bash scripts/test/beispielapp.sh einspielen)\n'
fi

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

ID=$(hole POST /api/benutzer "$TOK" \
  "{\"username\":\"$MITARB\",\"password\":\"$PASS_START\",\"email\":\"$MAIL\",\"rolle\":\"mitarbeiter\"}" |
  json_feld data.id)
pruefe 'Mitarbeiter angelegt' "$([ -n "$ID" ] && echo ja || echo nein)" "id=$ID"
[ -z "$ID" ] && { echo; echo "Ohne den Mitarbeiter gibt es nichts zu messen."; exit 1; }

# --- 3. Anmeldung mit der E-Mail, und das Startpasswort ----------------------
ANTWORT=$(hole_token "$MAIL" "$PASS_START")
TOK_M=$(printf '%s' "$ANTWORT" | json_feld token)
pruefe 'Mitarbeiter meldet sich mit seiner E-Mail an (C1)' \
  "$([ -n "$TOK_M" ] && echo ja || echo nein)" "HTTP $(anm_code)"
[ -z "$TOK_M" ] && { echo; echo "Ohne die Sitzung des Mitarbeiters gibt es nichts zu messen."; exit 1; }

WECHSEL=$(printf '%s' "$ANTWORT" | json_feld user.passwortWechselNoetig)
pruefe 'Das vom Administrator vergebene Passwort gilt als Startpasswort' \
  "$(ja_nein "$WECHSEL" true)" "passwortWechselNoetig=$WECHSEL"

ROLLE=$(hole GET /api/auth/me "$TOK_M" | json_feld user.role)
pruefe 'Die Sitzung nennt die Rolle, nach der die Oberflaeche ausblendet' \
  "$(ja_nein "$ROLLE" mitarbeiter)" "role=$ROLLE"

# --- 4. Ohne Freigabe keine App ---------------------------------------------
ANZAHL=$(hole GET /api/apps/meine "$TOK_M" |
  python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("data",[])))' 2>/dev/null)
pruefe 'Ohne Freigabe sieht er KEINE App' "$(ja_nein "$ANZAHL" 0)" "$ANZAHL Stueck"

# --- 5. Mit Freigabe genau die eine ------------------------------------------
if [ -z "$APP" ]; then
  ueberspringe 'Freigabe und App-Liste' 'keine App am Geraet'
else
  code=$(rufe POST /api/freigaben "$TOK" "{\"app_id\":\"$APP\",\"benutzer_id\":$ID}")
  pruefe "App $APP freigegeben" "$(ja_nein "$code" 201)" "HTTP $code"

  MEINE=$(hole GET /api/apps/meine "$TOK_M")
  LISTE=$(printf '%s' "$MEINE" | python3 -c 'import sys,json
print(",".join(a["id"] for a in json.load(sys.stdin).get("data",[])))' 2>/dev/null)
  pruefe 'Er sieht GENAU die freigegebene App' "$(ja_nein "$LISTE" "$APP")" "gesehen: ${LISTE:-nichts}"

  PFAD=$(printf '%s' "$MEINE" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print((d[0].get("live") or {}).get("pfad","") if d else "")' 2>/dev/null)
  pruefe 'Die Antwort nennt den Weg, unter dem die App im Rahmen laeuft' \
    "$(ja_nein "$PFAD" "/apps/$APP/")" "pfad=${PFAD:-keiner}"

  if [ -z "$ANDERE" ]; then
    ueberspringe 'Gegenprobe: eine zweite App bleibt unsichtbar' 'nur eine App am Geraet'
  else
    pruefe 'Eine zweite App am Geraet bleibt unsichtbar' \
      "$(grep -q "$ANDERE" <<<"$LISTE" && echo nein || echo ja)" "$ANDERE nicht in der Liste"
    code=$(rufe GET "/apps/$ANDERE/" "$TOK_M")
    pruefe 'und ihr Weg antwortet ihm mit 403' "$(ja_nein "$code" 403)" "HTTP $code"
  fi

  # Die App selbst: die Forward-Auth aus C4 laesst ihn durch. 200 oder 404 sind
  # beide ein Ja auf die Frage nach dem ZUGANG -- 404 heisst "diese App bringt
  # in diesem Stand kein Frontend mit", nicht "du darfst nicht".
  code=$(rufe GET "/apps/$APP/" "$TOK_M")
  pruefe 'Die freigegebene App laesst ihn durch' \
    "$([ "$code" = "200" ] || [ "$code" = "404" ] && echo ja || echo nein)" "HTTP $code"
fi

# --- 6. Die Verwaltung bleibt zu ---------------------------------------------
# Die Oberflaeche blendet diese Wege fuer ihn aus. Hier steht, dass das
# Ausblenden nicht die Berechtigung IST.
while read -r verb pfad; do
  [ -z "$verb" ] && continue
  code=$(rufe "$verb" "$pfad" "$TOK_M")
  pruefe "Mitarbeiter: $verb $pfad ist 403" "$(ja_nein "$code" 403)" "HTTP $code"
done <<VERWALTUNG
GET /api/models/catalog
GET /api/benutzer
GET /api/freigaben
GET /api/backup/status
GET /api/settings
GET /api/apps
VERWALTUNG

# --- 7. Was IHM gehoert ------------------------------------------------------
code=$(rufe GET /api/freigabe-anfragen "$TOK_M")
pruefe 'Die offenen Freigaben (der Zaehler der Shell) sind fuer ihn da' \
  "$(ja_nein "$code" 200)" "HTTP $code"

ZETTEL=$(hole PUT /api/notizen "$TOK_M" '{"inhalt":"Abnahme D1"}' | json_feld data.inhalt)
pruefe 'Sein Zettel in der rechten Spalte laesst sich schreiben' \
  "$(ja_nein "$ZETTEL" 'Abnahme D1')" "inhalt=${ZETTEL:-leer}"
ZETTEL=$(hole GET /api/notizen "$TOK_M" | json_feld data.inhalt)
pruefe 'und wieder lesen' "$(ja_nein "$ZETTEL" 'Abnahme D1')" "inhalt=${ZETTEL:-leer}"

# --- 8. Der Wechsel nimmt das Kennzeichen zurueck ----------------------------
code=$(rufe POST /api/auth/change-password "$TOK_M" \
  "{\"currentPassword\":\"$PASS_START\",\"newPassword\":\"$PASS_SELBST\"}")
pruefe 'Er wechselt das Startpasswort selbst' "$(ja_nein "$code" 200)" "HTTP $code"

ANTWORT=$(hole_token "$MAIL" "$PASS_SELBST")
TOK_M=$(printf '%s' "$ANTWORT" | json_feld token)
WECHSEL=$(printf '%s' "$ANTWORT" | json_feld user.passwortWechselNoetig)
pruefe 'Danach verlangt die Anmeldung keinen Wechsel mehr' \
  "$([ -n "$TOK_M" ] && [ "$WECHSEL" = "false" ] && echo ja || echo nein)" \
  "HTTP $(anm_code), passwortWechselNoetig=$WECHSEL"

# --- 9. Die drei Breiten -----------------------------------------------------
# Die Bilder gehoeren zur Messregel der Phase. Sie brauchen Playwright; ohne es
# wird uebersprungen und gesagt, warum. Der Lauf bekommt den Zugang des
# Mitarbeiters mit, damit er die Mitarbeiter-Sicht zeigt und keine eigene
# Anmeldung an der Drossel verbraucht.
if node -e 'require.resolve("playwright")' 2>/dev/null; then
  if ARASUL_URL="$BASIS" ARASUL_BENUTZER="$MAIL" ARASUL_PASSWORT="$PASS_SELBST" \
     node "$WURZEL/scripts/test/shell-bilder.mjs"; then
    pruefe 'Screenshots in drei Breiten (390, 1024, 1440)' ja "docs/plans/audits/"
  else
    pruefe 'Screenshots in drei Breiten (390, 1024, 1440)' nein 'shell-bilder.mjs war rot'
  fi
else
  ueberspringe 'Screenshots in drei Breiten' 'playwright nicht installiert (npm ci)'
fi

# --- 10. Freigabe zuruecknehmen ---------------------------------------------
if [ -n "$APP" ]; then
  code=$(rufe DELETE "/api/freigaben/$APP/$ID" "$TOK")
  pruefe 'Freigabe zurueckgenommen' "$(ja_nein "$code" 200)" "HTTP $code"
fi

echo
if [ "$uebersprungen" -gt 0 ]; then
  echo "$gruen von $((gruen + rot)) gruen, $uebersprungen uebersprungen"
else
  echo "$gruen von $((gruen + rot)) gruen"
fi
[ "$rot" -eq 0 ] || exit 1
