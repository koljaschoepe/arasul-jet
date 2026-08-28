#!/bin/bash
# =============================================================================
# Abnahme A5: die App-Ansicht des Administrators. Phase D4 vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "die Beispielapp startet ihren Flow `freigabe`, ein
# Mitarbeiter bestaetigt im Dashboard, der Admin liest den Lauf in der
# App-Ansicht mit Schritten und Gedankengang, stellt das Modell des Flows auf
# ein anderes aus der Kurzliste um und zurueck."
#
# WAS GEMESSEN WIRD, und in dieser Reihenfolge:
#
#   1. Die Beispielapp steht am Geraet, und ihr Flow `freigabe` ist im
#      Livestand registriert (C6). Ohne beides gibt es nichts zu messen.
#   2. Ein Wegwerf-Mitarbeiter wird angelegt und bekommt die App freigegeben.
#      Er ist der Mensch, der gleich entscheidet -- "wer die App freigegeben
#      hat, bestaetigt" (C7).
#   3. Die App startet ihren Flow selbst, ueber ihre eigene Schnittstelle. Der
#      Lauf haelt an: `wartend`.
#   4. IM BROWSER (`app-admin-bilder.mjs`), zwei Sitzungen hintereinander:
#      der Mitarbeiter bestaetigt auf dem Dashboard (D2), danach liest der
#      Administrator in der App-Ansicht die Staende und den Lauf mit seinen
#      Schritten und dem Gedankengang, und stellt das Modell um und zurueck.
#   5. Am Backend nachgerechnet: der Lauf ist weitergelaufen und beendet, und
#      das Modell des Flows steht wieder auf dem des Pakets.
#   6. Aufgeraeumt wird, auch wenn unterwegs etwas rot war.
#
# WARUM DER ADMIN-TEIL IM BROWSER PASSIERT UND NICHT PER curl. Dass die Wege
# antworten, misst `apps-abnahme.sh` (C3), `flow-abnahme.sh` (C6) und
# `freigabe-abnahme.sh` (C7). Was D4 hinzufuegt, ist ausschliesslich die Frage,
# ob ein Administrator diese Auskuenfte FINDET: bis heute las er einen Flow-Lauf
# mit `psql`.
#
# WARUM DIESE ABNAHME NEBEN `abnahmen.sh` STEHT, wie `shell-`, `dashboard-` und
# `admin-abnahme.sh`: `loginLimiter` erlaubt ZEHN Anmeldungen je Viertelstunde
# und IP, und die Reihe dort sitzt seit C4 mit genau zehn auf der Grenze.
# Dieser Lauf braucht DREI (Administrator, Mitarbeiter, und der Mitarbeiter
# noch einmal nach seinem Passwortwechsel); der Browser bekommt beide
# Sitzungen fertig gereicht und meldet sich gar nicht an.
#
# NICHT IN DERSELBEN VIERTELSTUNDE WIE `shell-`, `dashboard-` ODER
# `admin-abnahme.sh`. Die vier brauchen zusammen zehn Anmeldungen.
#
# WAS LANGE DAUERT: der Flow laeuft auf dem Jetson. Nach der Bestaetigung kommt
# ein Modell-Aufruf, und der teilt sich die GPU mit allem anderen. Die
# Wartezeiten unten sind grosszuegig; sie messen nicht das Geraet, sie geben ihm
# Zeit.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/app-admin-abnahme.sh
#
# Auf dem Geraet:
#   cd ~/arasul/arasul-jet
#   ARASUL_URL=https://localhost:443 ARASUL_PASSWORT=... \
#     bash scripts/test/app-admin-abnahme.sh
#
# Voreinstellungen: ARASUL_URL=https://localhost:8443, ARASUL_BENUTZER=admin,
# ARASUL_APP=beispielapp, ARASUL_FLOW=freigabe.
#
# Nicht zerstoerend fuer den Bestand: angelegt wird ein Benutzer mit Zeitstempel
# im Namen, benutzt wird eine App, die schon da ist, und die Modell-Einstellung
# steht am Ende wieder so, wie sie stand.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
APP="${ARASUL_APP:-beispielapp}"
FLOW="${ARASUL_FLOW:-freigabe}"
STEMPEL="$(date +%s)"
MITARB="abnahme-d4-$STEMPEL"
MAIL="$MITARB@abnahme.local"
PASS="Abnahme-D4-$STEMPEL"
# Das zweite Passwort, das er sich selbst gibt. Ohne diesen Wechsel bliebe sein
# Konto auf „Startpasswort", und die Shell schickte ihn im Browser auf die
# Seite „Neues Passwort" statt auf das Dashboard.
PASS_SELBST="Selbst-D4-$STEMPEL!"

# So lange darf ein Lauf brauchen, bis er an der Freigabe anhaelt. Er startet
# losgeloest, und die GPU-Warteschlange laesst strikt einen nach dem anderen
# durch (Zahl aus `freigabe-abnahme.sh`, dort am Orin gemessen).
HALT_GEDULD=180
# So lange auf das ENDE nach der Bestaetigung: danach kommt der Synthese-Aufruf
# ans Modell.
LAUF_GEDULD=600

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

# Ein Aufruf, zwei Ergebnisse: `$CODE` und der Rumpf in `$RUMPF`. Bewusst ohne
# Rueckgabe ueber die Standardausgabe -- eine Kommandosubstitution ist eine
# Subshell, und `$CODE` waere beim naechsten Befehl wieder weg (Falle aus der
# Messung zu C2).
RUMPF="$(mktemp)"
ANM_DATEI="$(mktemp)"
SITZUNG_A="${TMPDIR:-/tmp}/arasul-d4-admin.json"
SITZUNG_M="${TMPDIR:-/tmp}/arasul-d4-mitarbeiter.json"
CODE=""

ruf() {
  local verb="$1" pfad="$2" token="$3" leib="${4:-}"
  local -a argumente=(-sk -o "$RUMPF" -w '%{http_code}' -X "$verb" --max-time 60
    -H "authorization: Bearer $token")
  [ -n "$leib" ] && argumente+=(-H 'content-type: application/json' -d "$leib")
  CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
}

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

hole_token() {
  local antwort
  antwort=$(curl -sk -w '\n%{http_code}' -X POST -H 'content-type: application/json' \
    --max-time 30 -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
    "$BASIS/api/auth/login")
  printf '%s' "$antwort" | tail -n1 > "$ANM_DATEI"
  printf '%s' "$antwort" | sed '$d'
}
anm_code() { cat "$ANM_DATEI" 2>/dev/null; }

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme A5: die App-Ansicht (Phase D4) gegen $BASIS ==="
echo

# --- 1. Administrator, App und Flow -----------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung geht nichts weiter (429 heisst Anmeldedrossel)."; exit 1; }

ruf GET "/api/apps/$APP" "$TOK"
if [ "$CODE" != "200" ]; then
  echo "Die App '$APP' steht nicht am Geraet (HTTP $CODE)."
  echo "Erst einspielen: bash scripts/test/beispielapp.sh"
  exit 1
fi
LIVE_VERSION=$(feld data.staende.live.version < "$RUMPF")
pruefe "Die App $APP hat einen Livestand" \
  "$([ -n "$LIVE_VERSION" ] && echo ja || echo nein)" "${LIVE_VERSION:-keiner}"
[ -z "$LIVE_VERSION" ] && { echo; echo "Ohne Livestand laesst sich kein Flow starten."; exit 1; }

# ZWEI ANGABEN, ZWEI FRAGEN, und sie hangen nicht aneinander: ob es den Flow
# gibt, und womit er laeuft. Ein Flow ohne `modell:` im Frontmatter ist der
# Normalfall -- dann gilt das Standardmodell des Geraets, und `modell` ist
# `null`. Wer beides in einer Zeile prueft, meldet genau diesen Normalfall rot.
# Das Modell steht deshalb als JSON da (`null` oder `"name"`), damit der
# Vergleich am Ende beide Faelle trifft.
ruf GET "/api/apps/$APP/flows" "$TOK"
FLOW_DA=$(python3 -c 'import sys,json
d=json.load(sys.stdin)["data"]["live"]
print("ja" if any(x["name"]==sys.argv[1] for x in d) else "nein")' "$FLOW" < "$RUMPF" 2>/dev/null)
PAKET_MODELL=$(python3 -c 'import sys,json
d=json.load(sys.stdin)["data"]["live"]
f=next((x for x in d if x["name"]==sys.argv[1]), None)
print(json.dumps(f["modell"]) if f else "null")' "$FLOW" < "$RUMPF" 2>/dev/null)
pruefe "Ihr Flow '$FLOW' ist im Livestand registriert" "${FLOW_DA:-nein}" \
  "Modell aus dem Paket: $PAKET_MODELL"
[ "$FLOW_DA" != "ja" ] && { echo; echo "Ohne den Flow gibt es nichts zu starten."; exit 1; }

# Ein zweites Modell aus der Kurzliste, auf das umgestellt werden kann. Es muss
# INSTALLIERT sein: ein Flow auf ein Modell zu stellen, das nicht am Geraet
# liegt, waere eine Einstellung, die beim naechsten Lauf scheitert.
ruf GET "/api/models/catalog" "$TOK"
ANDERES=$(python3 -c 'import sys,json
d=json.load(sys.stdin).get("models",[])
aktuell=json.loads(sys.argv[1])
for m in d:
    if m.get("install_status")=="available" and m["id"]!=aktuell and (m.get("model_type") or "") not in ("embedding","ocr"):
        print(m["id"]); break' "$PAKET_MODELL" < "$RUMPF" 2>/dev/null)
if [ -z "$ANDERES" ]; then
  echo "Am Geraet liegt kein zweites Modell aus der Kurzliste."
  echo "Erst eines laden: die Ansicht Modelle, oder POST /api/models/download"
  exit 1
fi
printf 'gefunden  App %s %s, Flow %s (Paket-Modell %s), zweites Modell %s\n' \
  "$APP" "$LIVE_VERSION" "$FLOW" "$PAKET_MODELL" "$ANDERES"

# --- 2. Der Mensch, der gleich entscheidet ----------------------------------
# Der Administrator braucht die App ebenfalls freigegeben: der Flow-Start geht
# durch die Forward-Auth aus C4, und die fragt die Freigabe und nicht die Rolle.
ICH=$(curl -sk -H "authorization: Bearer $TOK" --max-time 30 "$BASIS/api/auth/me" | feld user.id)
ruf POST /api/freigaben "$TOK" "{\"app_id\":\"$APP\",\"benutzer_id\":$ICH,\"stand\":\"live\"}"
# 201 heisst „neu angelegt", 200 „stand schon" (`routes/admin/freigaben.js`).
# Nur im ersten Fall raeumt diese Abnahme sie am Ende wieder weg.
ADMIN_FREIGABE_NEU=$([ "$CODE" = "201" ] && echo ja || echo nein)
case "$CODE" in
  200 | 201) ADMIN_DARF=ja ;;
  *) ADMIN_DARF=nein ;;
esac
pruefe 'Der Administrator darf die App benutzen' "$ADMIN_DARF" "HTTP $CODE"

# `rolle` und nicht `role`: `CreateBenutzerBody` ist `.strict()`, ein fremder
# Schluessel ist ein 400 und der Mitarbeiter entstuende gar nicht (Fund der
# D4-Abnahme, in D5 zu).
ruf POST /api/benutzer "$TOK" \
  "{\"username\":\"$MITARB\",\"email\":\"$MAIL\",\"password\":\"$PASS\",\"rolle\":\"mitarbeiter\"}"
ID=$(feld data.id < "$RUMPF")
pruefe 'Ein Wegwerf-Mitarbeiter ist angelegt' "$([ -n "$ID" ] && echo ja || echo nein)" \
  "HTTP $CODE, id=${ID:-keine}"

# Aufgeraeumt wird IMMER, auch wenn unterwegs etwas rot war.
aufraeumen() {
  rm -f "$RUMPF" "$ANM_DATEI" "$SITZUNG_A" "$SITZUNG_M"
  if [ -n "${ID:-}" ]; then
    curl -sk -o /dev/null -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/freigaben/$APP/$ID"
    local code
    code=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$ID")
    printf 'aufgeraeumt  Benutzer %s geloescht (HTTP %s)\n' "$ID" "$code"
  fi
  # Die Freigabe des Administrators nur zuruecknehmen, wenn DIESER Lauf sie
  # angelegt hat -- sonst nimmt die Abnahme ihm eine App weg, die er benutzt.
  if [ "${ADMIN_FREIGABE_NEU:-nein}" = "ja" ]; then
    curl -sk -o /dev/null -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/freigaben/$APP/$ICH"
    printf 'aufgeraeumt  Freigabe des Administrators zurueckgenommen\n'
  fi
  # Und das Modell zurueck auf das Paket, falls der Browserlauf mittendrin
  # abgebrochen ist.
  curl -sk -o /dev/null -X PUT -H "authorization: Bearer $TOK" \
    -H 'content-type: application/json' -d '{"modell":null}' \
    "$BASIS/api/apps/$APP/flows/$FLOW/modell"
}
trap aufraeumen EXIT

[ -z "$ID" ] && { echo; echo "Ohne ihn gibt es niemanden, der bestaetigt."; exit 1; }

ruf POST /api/freigaben "$TOK" "{\"app_id\":\"$APP\",\"benutzer_id\":$ID,\"stand\":\"live\"}"
pruefe 'Er hat die App freigegeben und darf deshalb entscheiden' \
  "$(ja_nein "$CODE" 201)" "HTTP $CODE"

# --- 3. Die App startet ihren Flow ------------------------------------------
# Ueber IHRE Schnittstelle und nicht ueber `/api/flows/laeufe`: ein App-Flow
# gehoert der App, und ihr Schluessel traegt App und Stand (C4/C6). Genau so
# entsteht ein Lauf, den die App-Ansicht spaeter zeigen soll.
if ! arasul_warte_auf_app "/apps/$APP/api/flow" 120 "$TOK"; then
  echo "Die App antwortet nicht unter /apps/$APP/api/. Laeuft ihr Container?"
  exit 1
fi
ruf POST "/apps/$APP/api/flow?flow=$FLOW&woche=$(date +%V)" "$TOK"
LAUF=$(feld lauf < "$RUMPF")
pruefe 'Die App hat ihren Flow gestartet' \
  "$([ "$CODE" = "202" ] && [ -n "$LAUF" ] && echo ja || echo nein)" \
  "HTTP $CODE, Lauf ${LAUF:-keiner}"
[ -z "$LAUF" ] && { echo; echo "Antwort der App: $(cat "$RUMPF")"; exit 1; }

# Warten, bis er anhaelt. `wartend` ist der Zustand, den C7 eingefuehrt hat:
# der Lauf steht und ist NICHT beendet.
ENDE=$((SECONDS + HALT_GEDULD))
STATUS=""
while [ "$SECONDS" -lt "$ENDE" ]; do
  ruf GET "/api/apps/$APP/laeufe/$LAUF" "$TOK"
  STATUS=$(feld data.status < "$RUMPF")
  [ "$STATUS" = "wartend" ] && break
  sleep 3
done
pruefe 'Der Lauf haelt an der Freigabe an' "$(ja_nein "$STATUS" wartend)" "Status ${STATUS:-?}"

ruf GET /api/freigabe-anfragen "$TOK"
ANFRAGE=$(python3 -c 'import sys,json
lauf=int(sys.argv[1])
for a in json.load(sys.stdin).get("data",[]):
    if int(a.get("run_id",-1))==lauf: print(a["id"]); break' "$LAUF" < "$RUMPF" 2>/dev/null)
pruefe 'Die Freigabe-Anfrage dazu steht offen' \
  "$([ -n "$ANFRAGE" ] && echo ja || echo nein)" "Anfrage ${ANFRAGE:-keine}"

# --- 4. Der Browser ----------------------------------------------------------
# OHNE PLAYWRIGHT GIBT ES HIER NICHTS ZU MESSEN. Diese Abnahme misst die
# Oberflaeche; ein gruener Lauf ohne sie waere eine Aussage ueber nichts.
if ! node -e 'require.resolve("playwright")' 2>/dev/null; then
  echo "Playwright fehlt. Diese Abnahme misst den Browser; ohne ihn gibt es"
  echo "nichts zu messen. Erst: npm ci"
  exit 1
fi

ANTWORT=$(hole_token "$MAIL" "$PASS")
TOK_M=$(printf '%s' "$ANTWORT" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("token",""))
except Exception: print("")' 2>/dev/null)
pruefe 'Der Mitarbeiter meldet sich an' "$([ -n "$TOK_M" ] && echo ja || echo nein)" \
  "HTTP $(anm_code)"
[ -z "$TOK_M" ] && { echo; echo "Ohne seine Sitzung kann niemand bestaetigen."; exit 1; }

# DAS STARTPASSWORT MUSS WEG, sonst zeigt der Browser ihm „Neues Passwort"
# statt der Shell (Migration 178, D1) und der Klick auf die Freigabe geht ins
# Leere. Zweiter Fund der D4-Abnahme, in D5 zu. Der Selbstwechsel entwertet
# alle seine Sitzungen (`blacklistAllUserTokens`), deshalb danach noch einmal
# anmelden: das ist die DRITTE Anmeldung dieses Laufs, und mehr braucht er
# nicht.
ruf POST /api/auth/change-password "$TOK_M" \
  "{\"currentPassword\":\"$PASS\",\"newPassword\":\"$PASS_SELBST\"}"
pruefe 'Er wechselt sein Startpasswort selbst' "$(ja_nein "$CODE" 200)" "HTTP $CODE"

ANTWORT=$(hole_token "$MAIL" "$PASS_SELBST")
TOK_M=$(printf '%s' "$ANTWORT" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("token",""))
except Exception: print("")' 2>/dev/null)
WECHSEL=$(printf '%s' "$ANTWORT" | python3 -c 'import sys,json
try: print(json.dumps(json.load(sys.stdin).get("user",{}).get("passwortWechselNoetig")))
except Exception: print("null")' 2>/dev/null)
pruefe 'und kommt danach ohne Passwortwechsel herein' \
  "$([ -n "$TOK_M" ] && [ "$WECHSEL" = "false" ] && echo ja || echo nein)" \
  "HTTP $(anm_code), passwortWechselNoetig=$WECHSEL"
[ -z "$TOK_M" ] && { echo; echo "Ohne seine Sitzung kann niemand bestaetigen."; exit 1; }

# Je eine Sitzung als `storageState`. In Subshells, damit `$ARASUL_SITZUNG` die
# der Reihe bleibt.
(
  # shellcheck disable=SC2034  # von `arasul_sitzung_bauen` aus der Umgebung gelesen
  ARASUL_SITZUNG="$SITZUNG_A"
  arasul_sitzung_bauen "$TOK"
)
(
  # Der Cookie-Jar gehoert dem Administrator; fuer den Mitarbeiter darf nur
  # sein eigener Token in die Sitzung. Beide Namen liest
  # `arasul_sitzung_bauen` aus der Umgebung.
  # shellcheck disable=SC2030,SC2034
  ARASUL_SITZUNG="$SITZUNG_M"
  # shellcheck disable=SC2030,SC2034
  ARASUL_TOKEN_DATEI="${TMPDIR:-/tmp}/arasul-d4-mitarbeiter-token"
  arasul_sitzung_bauen "$TOK_M"
)
pruefe 'Zwei Sitzungen fuer den Browser' \
  "$([ -s "$SITZUNG_A" ] && [ -s "$SITZUNG_M" ] && echo ja || echo nein)" \
  "$(basename "$SITZUNG_A"), $(basename "$SITZUNG_M")"

if ARASUL_URL="$BASIS" ARASUL_SITZUNG_ADMIN="$SITZUNG_A" \
   ARASUL_SITZUNG_MITARBEITER="$SITZUNG_M" ARASUL_APP="$APP" ARASUL_FLOW="$FLOW" \
   ARASUL_LAUF="$LAUF" ARASUL_FREIGABE="$ANFRAGE" ARASUL_MODELL="$ANDERES" \
   node "$WURZEL/scripts/test/app-admin-bilder.mjs"; then
  pruefe 'Im Browser: bestaetigen, Lauf lesen, Modell umstellen und zurueck' ja \
    'docs/plans/audits/'
else
  pruefe 'Im Browser: bestaetigen, Lauf lesen, Modell umstellen und zurueck' nein \
    'app-admin-bilder.mjs war rot'
fi

# --- 5. Was daraus geworden ist ---------------------------------------------
# Ab hier misst das Skript den ZUSTAND, nicht die Bedienung: der Browser kann
# gruen gemeldet haben und trotzdem nichts bewirkt haben.
ENDE=$((SECONDS + LAUF_GEDULD))
STATUS=""
while [ "$SECONDS" -lt "$ENDE" ]; do
  ruf GET "/api/apps/$APP/laeufe/$LAUF" "$TOK"
  STATUS=$(feld data.status < "$RUMPF")
  case "$STATUS" in
    fertig | fehler | abgebrochen | abgelaufen) break ;;
  esac
  sleep 5
done
pruefe 'Der bestaetigte Lauf ist weitergelaufen und fertig' "$(ja_nein "$STATUS" fertig)" \
  "Status ${STATUS:-?}"

SCHRITTE=$(python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"].get("steps",[])))' \
  < "$RUMPF" 2>/dev/null)
pruefe 'Der Lauf hat Schritte hinterlassen' \
  "$([ -n "$SCHRITTE" ] && [ "$SCHRITTE" -gt 0 ] && echo ja || echo nein)" \
  "${SCHRITTE:-0} Schritte"

# Der Gedankengang ist ein Schritt der Art `modell` (D4). Er entsteht NUR, wenn
# das Modell neben einem Werkzeug-Aufruf auch etwas gesagt hat -- bei einem
# Flow mit einer festen Schritt-Kette wie `freigabe` muss es das nicht. Deshalb
# uebersprungen statt rot: es waere eine Aussage ueber das Modell, nicht ueber
# das Geraet.
GEDANKE=$(python3 -c 'import sys,json
print(sum(1 for s in json.load(sys.stdin)["data"].get("steps",[]) if s.get("kind")=="modell"))' \
  < "$RUMPF" 2>/dev/null)
if [ "${GEDANKE:-0}" -gt 0 ]; then
  pruefe 'und darunter einen Gedankengang (Schritt der Art modell)' ja "$GEDANKE Stueck"
else
  ueberspringe 'Gedankengang im Lauf' \
    'dieser Flow ist eine feste Schritt-Kette; das Modell redet nur am Ende'
fi

# Das Modell steht wieder auf dem des Pakets: der Browserlauf hat umgestellt UND
# zurueckgenommen. Stuende hier noch das andere, waere der Rueckweg kaputt.
ruf GET "/api/apps/$APP/flows" "$TOK"
JETZT=$(python3 -c 'import sys,json
d=json.load(sys.stdin)["data"]["live"]
f=next((x for x in d if x["name"]==sys.argv[1]), None)
print(json.dumps([f["modell"], f["modell_ueberschrieben"]]) if f else "[]")' "$FLOW" < "$RUMPF" 2>/dev/null)
pruefe 'Das Modell des Flows steht wieder auf dem des Pakets' \
  "$(ja_nein "$JETZT" "[$PAKET_MODELL, false]")" "$JETZT"

echo
if [ "$uebersprungen" -gt 0 ]; then
  echo "$gruen von $((gruen + rot)) gruen, $uebersprungen uebersprungen"
else
  echo "$gruen von $((gruen + rot)) gruen"
fi
[ "$rot" -eq 0 ] || exit 1
