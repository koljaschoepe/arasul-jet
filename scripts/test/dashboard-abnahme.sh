#!/bin/bash
# =============================================================================
# Abnahme des Dashboards, Phase D2 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "Freigabe aus C7 im Dashboard bestaetigen, Notiz
# ueberlebt Neuladen." Dieses Skript baut den Fall am Geraet auf, laesst den
# KLICK im Browser passieren (`dashboard-bilder.mjs`) und misst danach am
# Backend, was daraus geworden ist.
#
# WAS GEMESSEN WIRD, und in dieser Reihenfolge:
#
#   1. Ein frisch angelegter Mitarbeiter bekommt die Beispielapp freigegeben.
#      Sein Passwort ist ein STARTPASSWORT (D1) -- er wechselt es sofort, sonst
#      steht im Browser der Passwortwechsel statt der Shell.
#   2. Er startet den Flow `freigabe` der App ueber ihren eigenen Weg
#      (`POST /apps/<id>/api/flow?flow=freigabe&woche=34`). Der Lauf haelt an.
#   3. Unter `GET /api/freigabe-anfragen` steht seine Anfrage -- mit Titel,
#      Zusammenhang und Frist. Das ist der Stoff, aus dem die Liste besteht.
#   4. Im BROWSER: die Notiz ueberlebt ein Neuladen, und der
#      Klick auf "Bestaetigen" laesst die Zeile ohne Neuladen verschwinden.
#   5. Danach wieder am Backend: der Lauf endet `fertig`, und seine offene
#      Anfrage ist keine mehr.
#
# WARUM DER KLICK IM BROWSER PASSIERT UND NICHT PER curl. Dass der Weg aus C7
# funktioniert, misst `freigabe-abnahme.sh` seit dem 27.08.2026. Was D2
# hinzufuegt, ist ausschliesslich die Frage, ob ein MENSCH ihn findet und
# drueckt. Eine Bestaetigung per `curl` beantwortete sie nicht.
#
# WARUM DIESE ABNAHME NEBEN `abnahmen.sh` STEHT, wie schon `shell-abnahme.sh`:
# `loginLimiter` erlaubt DREISSIG Fehlschlaege je Viertelstunde und IP, und die
# Reihe dort sitzt seit Phase C4 mit genau zehn auf der Grenze. Dieser Lauf
# braucht ZWEI eigene (einmal mit dem Startpasswort, einmal nach dem
# Selbstwechsel); der Browser bekommt die fertige Sitzung gereicht und meldet
# sich gar nicht an.
#
# NICHT ZUSAMMEN MIT `shell-abnahme.sh` IN DERSELBEN VIERTELSTUNDE. Die beiden
# brauchen zusammen fuenf Anmeldungen; mit einer Reihe aus `abnahmen.sh` davor
# waeren es fuenfzehn, und die spaeteren Messungen meldeten dann etwas ueber
# den Messaufbau statt ueber das Geraet.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/dashboard-abnahme.sh
#
# Auf dem Geraet:
#   cd ~/arasul/arasul-jet
#   ARASUL_URL=https://localhost:443 ARASUL_PASSWORT=... \
#     bash scripts/test/dashboard-abnahme.sh
#
# Voreinstellungen: ARASUL_URL=https://localhost:8443, ARASUL_BENUTZER=admin,
# ARASUL_DASHBOARD_APP=beispielapp.
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
APP="${ARASUL_DASHBOARD_APP:-beispielapp}"
FLOW="freigabe"
STEMPEL="$(date +%s)"
MITARB="abnahme-dash-$STEMPEL"
MAIL="$MITARB@abnahme.local"
PASS_START="Start-$STEMPEL"
PASS_SELBST="Selbst-$STEMPEL"

# So lange wird darauf gewartet, dass der Lauf anhaelt. Der Lauf startet
# losgeloest, und die GPU-Warteschlange laesst strikt einen nach dem anderen
# durch (`gpuQueue.js`).
HALT_GEDULD=180
# So lange auf das ENDE nach der Bestaetigung: danach kommt der Synthese-Aufruf
# ans Modell, und der ist auf einem Jetson kein Augenblick.
ENDE_GEDULD=600

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
    if isinstance(d, list):
        d = d[int(k)] if k.isdigit() and int(k) < len(d) else {}
    else:
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
SITZUNG_M="${TMPDIR:-/tmp}/arasul-dashboard-d2-sitzung.json"
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
  local code
  [ -z "$leib" ] && leib='{}'
  # shellcheck disable=SC2034  # der Zaehler zaehlt, mehr soll er nicht
  for versuch in 1 2 3; do
    code=$(curl -sk -o /dev/null -w '%{http_code}' -X "$verb" --max-time 60 \
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
  curl -sk --max-time 60 -X "$verb" -H "authorization: Bearer $token" \
    -H 'content-type: application/json' -d "$leib" "$BASIS$pfad"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme des Dashboards (Phase D2) gegen $BASIS ==="
echo

# --- 1. Administrator, App, Mitarbeiter --------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung geht nichts weiter (429 heisst Anmeldedrossel)."; exit 1; }

DA=$(hole GET /api/apps "$TOK" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print("ja" if any(a["id"]==sys.argv[1] for a in d) else "nein")' "$APP" 2>/dev/null)
if [ "$DA" != "ja" ]; then
  echo "Die App '$APP' steht nicht am Geraet."
  echo "Erst einspielen: bash scripts/test/beispielapp.sh"
  echo "(oder eine andere ueber ARASUL_DASHBOARD_APP nennen -- sie braucht"
  echo " einen Flow namens '$FLOW' mit Freigabe-Schritt)"
  exit 1
fi
printf 'gefunden  App %s\n' "$APP"

ID=""
aufraeumen() {
  rm -f "$ANM_DATEI" "$SITZUNG_M"
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

code=$(rufe POST /api/freigaben "$TOK" "{\"app_id\":\"$APP\",\"benutzer_id\":$ID}")
pruefe "App $APP fuer ihn freigegeben" "$(ja_nein "$code" 201)" "HTTP $code"

# --- 2. Anmelden und das Startpasswort ablegen -------------------------------
# ZWINGEND VOR DEM BROWSER: ein Passwort vom Administrator ist ein
# Startpasswort (D1, Migration 178), und die Oberflaeche zeigt dann den
# Passwortwechsel STATT der Shell. Der Bilderlauf faende dort kein Dashboard.
ANTWORT=$(hole_token "$MAIL" "$PASS_START")
TOK_M=$(printf '%s' "$ANTWORT" | json_feld token)
pruefe 'Mitarbeiter meldet sich an' "$([ -n "$TOK_M" ] && echo ja || echo nein)" \
  "HTTP $(anm_code)"
[ -z "$TOK_M" ] && { echo; echo "Ohne seine Sitzung gibt es nichts zu messen."; exit 1; }

code=$(rufe POST /api/auth/change-password "$TOK_M" \
  "{\"currentPassword\":\"$PASS_START\",\"newPassword\":\"$PASS_SELBST\"}")
pruefe 'Er legt das Startpasswort ab (sonst steht der Wechsel vor der Shell)' \
  "$(ja_nein "$code" 200)" "HTTP $code"

# Der Wechsel entwertet ALLE seine Sitzungen (`blacklistAllUserTokens`), der
# Token von eben traegt also nicht mehr.
ANTWORT=$(hole_token "$MAIL" "$PASS_SELBST")
TOK_M=$(printf '%s' "$ANTWORT" | json_feld token)
pruefe 'und meldet sich mit dem eigenen neu an' \
  "$([ -n "$TOK_M" ] && echo ja || echo nein)" "HTTP $(anm_code)"
[ -z "$TOK_M" ] && { echo; echo "Ohne seine Sitzung gibt es nichts zu messen."; exit 1; }

# --- 3. Den Flow starten, der anhaelt ----------------------------------------
# Erst warten, bis die App SELBST antwortet. Wer frueher startet, misst
# Traefiks Hochlauf und schreibt ihn der App zu (Befund der C6-Abnahme).
if arasul_warte_auf_app "/apps/$APP/api/flow" 120 "$TOK_M"; then
  printf 'bereit    Die App %s antwortet\n' "$APP"
else
  pruefe "Die App $APP antwortet" nein 'nach 120s nicht erreichbar'
  echo; echo "Ohne die App laesst sich kein Flow starten."; exit 1
fi

START=$(hole POST "/apps/$APP/api/flow?flow=$FLOW&woche=34" "$TOK_M")
LAUF=$(printf '%s' "$START" | json_feld lauf)
pruefe "Der Mitarbeiter startet den Flow $FLOW" \
  "$([ -n "$LAUF" ] && echo ja || echo nein)" "lauf=${LAUF:-keiner}"
if [ -z "$LAUF" ]; then
  echo "        Antwort der App: $(printf '%s' "$START" | head -c 300)"
  echo; echo "Ohne Lauf gibt es keine Freigabe zu entscheiden."; exit 1
fi

# --- 4. Die Anfrage steht in SEINER Liste ------------------------------------
# Der JOIN auf `app_members` IST die Berechtigung (C7). Dass sie hier auftaucht,
# ist deshalb zugleich die Probe darauf, dass die Freigabe von oben greift.
ANFRAGE=""
ende=$((SECONDS + HALT_GEDULD))
while [ "$SECONDS" -lt "$ende" ]; do
  OFFEN=$(hole GET /api/freigabe-anfragen "$TOK_M")
  ANFRAGE=$(printf '%s' "$OFFEN" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print(next((str(a["id"]) for a in d if str(a.get("run_id"))==sys.argv[1]), ""))' "$LAUF" 2>/dev/null)
  [ -n "$ANFRAGE" ] && break
  sleep 3
done
pruefe 'Der Lauf haelt an, und seine Freigabe steht in der Liste' \
  "$([ -n "$ANFRAGE" ] && echo ja || echo nein)" \
  "anfrage=${ANFRAGE:-keine} nach $((SECONDS))s"
[ -z "$ANFRAGE" ] && { echo; echo "Ohne offene Anfrage gibt es im Dashboard nichts zu druecken."; exit 1; }

# Der Stoff, aus dem die Liste im Dashboard besteht. Fehlte eines davon, stuende
# dort eine Karte ohne Aussage.
# Nach der NUMMER gesucht und nicht "das erste Element": am Geraet koennen
# aeltere Anfragen offen stehen, und dann beschriebe die Messung eine fremde.
feld_der_anfrage() {
  printf '%s' "$OFFEN" | python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
a=next((x for x in d if str(x["id"])==sys.argv[1]), {})
print(a.get(sys.argv[2]) or "")' "$ANFRAGE" "$1" 2>/dev/null
}
TITEL=$(feld_der_anfrage titel)
ZUS=$(feld_der_anfrage zusammenhang)
FRIST=$(feld_der_anfrage frist)
pruefe 'Die Anfrage nennt einen Titel' \
  "$([ -n "$TITEL" ] && echo ja || echo nein)" "${TITEL:-leer}"
pruefe 'einen Zusammenhang' "$([ -n "$ZUS" ] && echo ja || echo nein)" \
  "$(printf '%s' "${ZUS:-leer}" | head -c 60)"
pruefe 'und eine Frist' "$([ -n "$FRIST" ] && echo ja || echo nein)" "${FRIST:-leer}"

# --- 5. Der Browser: die Notiz, der Klick -----------------------------------
# Der Bilderlauf bekommt die FERTIGE Sitzung und meldet sich nicht selbst an.
# Sie liegt bewusst in einer eigenen Datei: `$ARASUL_SITZUNG` traegt die des
# Administrators und wird von der ganzen Reihe geteilt.
GEKLICKT=nein
if node -e 'require.resolve("playwright")' 2>/dev/null; then
  # In einer Subshell, damit die beiden Namen NUR hier gelten: `$ARASUL_SITZUNG`
  # traegt sonst die Sitzung des Administrators, die sich die ganze Reihe teilt,
  # und ein Ueberschreiben davon liesse jede spaetere Abnahme als Mitarbeiter
  # messen. `arasul_sitzung_bauen` liest beide Namen aus der Umgebung.
  # shellcheck disable=SC2034  # von der Funktion aus `anmeldung.sh` gelesen
  (
    ARASUL_SITZUNG="$SITZUNG_M"
    # Ohne den Keks-Topf des Administrators: sonst mischte sich sein
    # CSRF-Wert unter die Sitzung des Mitarbeiters. Die Oberflaeche holt
    # sich den eigenen ueber GET /api/auth/csrf.
    ARASUL_TOKEN_DATEI="${TMPDIR:-/tmp}/arasul-dashboard-d2-token"
    arasul_sitzung_bauen "$TOK_M"
  )
  if [ -s "$SITZUNG_M" ]; then
    if ARASUL_URL="$BASIS" ARASUL_SITZUNG="$SITZUNG_M" ARASUL_FREIGABE="$ANFRAGE" \
       node "$WURZEL/scripts/test/dashboard-bilder.mjs"; then
      pruefe 'Dashboard im Browser: Notiz, Bestaetigen' ja 'docs/plans/audits/'
      GEKLICKT=ja
    else
      pruefe 'Dashboard im Browser: Notiz, Bestaetigen' nein \
        'dashboard-bilder.mjs war rot'
    fi
  else
    pruefe 'Die Sitzung des Mitarbeiters fuer den Browser' nein 'nicht gebaut'
  fi
else
  ueberspringe 'Dashboard im Browser (Notiz, Klick)' \
    'playwright nicht installiert (npm ci)'
fi

# --- 6. Was der Klick bewirkt hat --------------------------------------------
# Ohne den Klick waere alles Folgende eine Aussage ueber den Messaufbau.
if [ "$GEKLICKT" != "ja" ]; then
  ueberspringe 'Der Lauf endet fertig' 'im Browser wurde nicht bestaetigt'
  ueberspringe 'Die Anfrage ist keine offene mehr' 'im Browser wurde nicht bestaetigt'
else
  STATUS=""
  ende=$((SECONDS + ENDE_GEDULD))
  while [ "$SECONDS" -lt "$ende" ]; do
    STATUS=$(hole GET "/apps/$APP/api/flow?lauf=$LAUF" "$TOK_M" | json_feld status)
    case "$STATUS" in
      fertig | fehler | abgebrochen | abgelaufen) break ;;
    esac
    sleep 5
  done
  # `fertig` und nicht nur "nicht mehr wartend": die Phase misst, dass der Lauf
  # AB DEM ANGEHALTENEN SCHRITT weiterlaeuft und zu Ende kommt.
  pruefe 'Der bestaetigte Lauf laeuft weiter und endet fertig' \
    "$(ja_nein "$STATUS" fertig)" "status=${STATUS:-—}"

  NOCH=$(hole GET /api/freigabe-anfragen "$TOK_M" |
    python3 -c 'import sys,json
d=json.load(sys.stdin).get("data",[])
print("ja" if any(str(a["id"])==sys.argv[1] for a in d) else "nein")' "$ANFRAGE" 2>/dev/null)
  pruefe 'Die entschiedene Anfrage steht nicht mehr in der Liste' \
    "$(ja_nein "$NOCH" nein)" "noch offen: ${NOCH:-?}"
fi

# --- 7. Die Notiz, noch einmal ueber die Schnittstelle ------------------------
# Der Browser hat sie geschrieben und nach einem Neuladen wiedergesehen. Hier
# steht, dass sie WIRKLICH am Menschen haengt und nicht am Fenster.
ZETTEL=$(hole GET /api/notizen "$TOK_M" | json_feld data.inhalt)
pruefe 'Sein Zettel liegt am Geraet, nicht im Browser' \
  "$(grep -q '^Abnahme D2' <<<"$ZETTEL" && echo ja || echo nein)" \
  "inhalt=$(printf '%s' "${ZETTEL:-leer}" | head -c 40)"

# --- 8. Freigabe zuruecknehmen -----------------------------------------------
code=$(rufe DELETE "/api/freigaben/$APP/$ID" "$TOK")
pruefe 'Freigabe zurueckgenommen' "$(ja_nein "$code" 200)" "HTTP $code"

echo
if [ "$uebersprungen" -gt 0 ]; then
  echo "$gruen von $((gruen + rot)) gruen, $uebersprungen uebersprungen"
else
  echo "$gruen von $((gruen + rot)) gruen"
fi
[ "$rot" -eq 0 ] || exit 1
