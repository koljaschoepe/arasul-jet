#!/bin/bash
# =============================================================================
# Abnahme der Freigaben, Phase C7 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "Flow haelt, `curl` bestaetigt, Flow laeuft weiter."
# Genau das misst dieses Skript, und dazu die beiden anderen Ausgaenge, die
# eine Freigabe hat -- sonst waere nur der freundliche Fall belegt:
#
#   1. Die Beispielapp bekommt einen Flow mit Freigabe-Schritt und geht ueber
#      `POST /api/v1/external/apps` auf das Geraet, danach live.
#   2. Die App startet ihn selbst. Der Lauf haelt an: `wartend`.
#   3. Ein Mensch sieht ihn unter `GET /api/freigabe-anfragen` und bestaetigt.
#      Der Lauf laeuft weiter und endet `fertig`.
#   4. Zweiter Lauf, ABGELEHNT: er endet `abgebrochen`, und die Begruendung
#      steht als sein Grund darin.
#   5. Dritter Lauf mit zwoelf Sekunden Frist, NIEMAND entscheidet: er endet
#      `abgelaufen` -- nicht `fehler`, denn nichts ist kaputtgegangen.
#   6. Die App darf ihre Freigaben LESEN und nicht entscheiden.
#
# ES WIRD NICHT DIE BEISPIELAPP SELBST EINGESPIELT, sondern ihr Inhalt unter
# einer eigenen Kennung (`beispielapp-freigabe`). Dieselben Gruende wie bei
# `deploy-abnahme.sh` und `flow-abnahme.sh`: die C3/C4-Abnahmen brauchen
# `beispielapp` eingespielt und laufend, und dieses Skript raeumt am Ende alles
# weg, was es angelegt hat.
#
# DER SCHLUESSEL. Vorzugsweise steckt er in `ARASUL_KIT_SCHLUESSEL`. Ohne ihn
# meldet sich das Skript einmal als Administrator an (ueber `anmeldung.sh`,
# also mit dem GETEILTEN Token der Reihe) und legt sich einen Wegwerf-Schluessel
# an. Die Sitzung braucht es ohnehin: entscheiden tut ein MENSCH.
#
# WARTEN GEHOERT ZUR MESSUNG. Nach dem Schalten kennt Traefik den Router des
# Live-Containers einen Moment lang nicht, und Arasuls Auffangpfad antwortet
# 404 "Endpoint not found". Wer da schon startet, misst den Messaufbau (Befund
# der C6-Abnahme am Orin, 27.08.2026); `arasul_warte_auf_app` wartet, bis die
# App selbst antwortet.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/freigabe-abnahme.sh
#
# Auf dem Geraet (dort zaehlt auch die Tabelle mit):
#   cd ~/arasul/arasul-jet
#   ARASUL_URL=https://localhost:443 bash scripts/test/freigabe-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/beispielapp"
APP="${ARASUL_FREIGABE_APP:-beispielapp-freigabe}"
FLOW="freigabe"
FLOW_KURZ="freigabe-frist"
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
baue_paket() {
  local ordner="$ARBEIT/paket"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/frontend" "$QUELLE/backend" "$QUELLE/flows" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$VERSION" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Beispielapp (Freigabe-Abnahme)"
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

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme der Freigaben (Phase C7) gegen $BASIS ==="
echo

# --- 1. Sitzung und Schluessel -----------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

SCHLUESSEL="${ARASUL_KIT_SCHLUESSEL:-}"
KEY_ID=""

aufraeumen() {
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 120 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  # Freigaben und Anfragen brauchen keinen eigenen Aufruf: `app_members` haengt
  # mit ON DELETE CASCADE an `apps`, `approvals` an den Laeufen -- und die App
  # ist eben gefallen.
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  printf 'aufgeraeumt  App entfernt (samt Freigaben und Images), Wegwerf-Schluessel widerrufen\n'
}
trap aufraeumen EXIT

if [ -n "$SCHLUESSEL" ]; then
  pruefe 'Schluessel aus ARASUL_KIT_SCHLUESSEL' ja "${SCHLUESSEL:0:12}…"
else
  ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
    -H 'content-type: application/json' \
    -d '{"name":"Abnahme C7 (freigabe)","allowed_endpoints":["app:deploy","flow:run"]}' \
    "$BASIS/api/v1/external/api-keys")
  SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
  KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
  pruefe 'Ein Wegwerf-Schluessel mit app:deploy und flow:run entsteht' \
    "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)" "${SCHLUESSEL:0:12}…"
  [ -z "$SCHLUESSEL" ] && { echo; echo "Ohne Schluessel gibt es nichts zu messen."; echo "$ANTWORT"; exit 1; }
fi

# --- 2. Der Kontrakt kennt das Werkzeug --------------------------------------
schluessel_ruf GET /api/v1/external/contract
pruefe 'GET /contract antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
KONTRAKT=$(rumpf | feld data.kontrakt)
pruefe 'Die Kontraktversion ist mit C7 auf 3 gegangen' "$(ja_wenn "$KONTRAKT" 3)" \
  "kontrakt=$KONTRAKT"
WERKZEUGE=$(rumpf | feld data.flow_frontmatter.schema.properties.werkzeuge)
pruefe 'Das Werkzeug freigabe_anfordern steht im Flow-Schema' \
  "$(grep -q freigabe_anfordern <<<"$WERKZEUGE" && echo ja || echo nein)"

# --- 3. Einspielen, schalten, freigeben --------------------------------------
PAKET=$(baue_paket)
pruefe "Paket mit flows/$FLOW.md gebaut" "$([ -n "$PAKET" ] && echo ja || echo nein)" \
  "$(basename "${PAKET:-—}")"
[ -z "$PAKET" ] && { echo; echo "Ohne Paket gibt es nichts zu schicken."; exit 1; }

paket_ruf /api/v1/external/apps "$PAKET"
pruefe "POST /apps spielt $APP $VERSION ein" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
if [ "$CODE" != "201" ]; then
  echo; echo "Antwort des Geraets:"; rumpf; echo
  exit 1
fi
FLOWS=$(rumpf | feld data.flows)
pruefe 'Die Antwort nennt beide Freigabe-Flows' \
  "$(grep -q "$FLOW_KURZ" <<<"$FLOWS" && echo ja || echo nein)" "flows=$FLOWS"

schluessel_ruf POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'Schalten nach live' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

sitzungs_ruf GET /api/auth/me
ADMIN_ID=$(rumpf | feld user.id)
sitzungs_ruf POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ADMIN_ID}"
case "$CODE" in
  200 | 201) FREI=ja ;;
  *) FREI=nein ;;
esac
pruefe 'Die App ist dem Administrator freigegeben' "$FREI" "HTTP $CODE benutzer=$ADMIN_ID"

# Erst warten, dann messen (siehe Kopf).
if arasul_warte_auf_app "/apps/$APP/api/flow" 180 "$TOK"; then
  pruefe 'Die App ist unter ihrem eigenen Pfad erreichbar' ja "nach $((SECONDS))s"
else
  pruefe 'Die App ist unter ihrem eigenen Pfad erreichbar' nein \
    'Zeitgrenze 180s, Traefik kennt den Router nicht'
  echo; echo "Ohne erreichbare App gibt es nichts zu messen."; exit 1
fi

# --- 4. Der Flow haelt an ----------------------------------------------------
if starte_und_warte_auf_halt "$FLOW" "$HALT_GEDULD"; then
  pruefe 'Die App startet ihren Flow, und er HAELT AN (Status wartend)' ja "lauf=$LAUF"
else
  pruefe 'Die App startet ihren Flow, und er HAELT AN (Status wartend)' nein \
    "lauf=${LAUF:-—} status=$(rumpf | feld status)"
fi
LAUF_JA="$LAUF"

ANFRAGE=""
if [ -n "$LAUF_JA" ]; then
  sitzungs_ruf GET /api/freigabe-anfragen
  pruefe 'GET /api/freigabe-anfragen antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  ANFRAGE=$(rumpf | anfrage_zu_lauf "$LAUF_JA")
  pruefe 'Die offene Freigabe dieses Laufs steht darin' \
    "$([ -n "$ANFRAGE" ] && echo ja || echo nein)" "anfrage=${ANFRAGE:-—}"

  # Die App darf LESEN, woran ihr Lauf haengt -- mit ihrem eigenen Schluessel.
  sitzungs_ruf GET "/apps/$APP/api/freigaben?lauf=$LAUF_JA"
  pruefe 'Die App liest den Stand ihrer Freigabe' \
    "$(ja_wenn "$(rumpf | feld freigaben.0.status)" offen)" \
    "status=$(rumpf | feld freigaben.0.status)"
fi

# --- 5. Bestaetigen: der Lauf laeuft weiter ----------------------------------
if [ -n "$ANFRAGE" ]; then
  sitzungs_ruf POST "/api/freigabe-anfragen/$ANFRAGE/ablehnen" '{}'
  pruefe 'Eine Ablehnung ohne Begruendung wird abgewiesen' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"

  sitzungs_ruf POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
  pruefe 'Ein Mensch bestaetigt per curl' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  pruefe 'und der Lauf wird fortgesetzt' \
    "$(ja_wenn "$(rumpf | feld data.fortgesetzt)" true)" \
    "fortgesetzt=$(rumpf | feld data.fortgesetzt)"

  sitzungs_ruf POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
  pruefe 'Zweimal dasselbe bestaetigen: 409, nicht stillschweigend' \
    "$(ja_wenn "$CODE" 409)" "HTTP $CODE"

  STATUS=$(warte_auf_ende "$LAUF_JA" "$LAUF_GEDULD")
  pruefe 'Der Lauf laeuft weiter und endet fertig' "$(ja_wenn "$STATUS" fertig)" \
    "status=${STATUS:-—} nach $((SECONDS))s"
  if [ "$STATUS" != "fertig" ]; then
    echo; echo "Letzte Antwort der App:"; rumpf; echo
  fi
else
  uebergehen 'Bestaetigen, und der Lauf laeuft weiter' 'keine offene Anfrage gefunden'
fi

sitzungs_ruf POST "/api/freigabe-anfragen/999999999/bestaetigen" '{}'
pruefe 'Eine Anfrage, die es nicht gibt: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

# --- 6. Ablehnen: der Lauf endet mit Begruendung -----------------------------
GRUND="Die Zahlen der Abnahme stimmen nicht"
if starte_und_warte_auf_halt "$FLOW" "$HALT_GEDULD"; then
  LAUF_NEIN="$LAUF"
  sitzungs_ruf GET /api/freigabe-anfragen
  ANFRAGE2=$(rumpf | anfrage_zu_lauf "$LAUF_NEIN")
  sitzungs_ruf POST "/api/freigabe-anfragen/$ANFRAGE2/ablehnen" "{\"begruendung\":\"$GRUND\"}"
  pruefe 'Ein Mensch lehnt ab' "$(ja_wenn "$CODE" 200)" "HTTP $CODE anfrage=$ANFRAGE2"

  STATUS=$(warte_auf_ende "$LAUF_NEIN" 120)
  pruefe 'Der Lauf endet abgebrochen (kein Fehler: ein Mensch hat entschieden)' \
    "$(ja_wenn "$STATUS" abgebrochen)" "status=${STATUS:-—}"
  pruefe 'und traegt die Begruendung als Grund' \
    "$(grep -q "$GRUND" <<<"$(rumpf | feld fehler)" && echo ja || echo nein)" \
    "fehler=$(rumpf | feld fehler)"
else
  uebergehen 'Ablehnen beendet den Lauf mit Begruendung' 'der Lauf hielt nicht an'
fi

# --- 7. Ablauf: niemand entscheidet ------------------------------------------
# Die Frist steht im Frontmatter des Flows (`freigabe-frist.md`, 0,2 Minuten).
# Hier wird NICHTS entschieden -- das ist die Messung.
if starte_und_warte_auf_halt "$FLOW_KURZ" "$HALT_GEDULD"; then
  LAUF_FRIST="$LAUF"
  STATUS=$(warte_auf_ende "$LAUF_FRIST" "$FRIST_GEDULD")
  pruefe 'Ohne Entscheidung endet der Lauf als abgelaufen' \
    "$(ja_wenn "$STATUS" abgelaufen)" "status=${STATUS:-—}"
  pruefe 'und sagt, dass die Frist es war' \
    "$(grep -qi frist <<<"$(rumpf | feld fehler)" && echo ja || echo nein)" \
    "fehler=$(rumpf | feld fehler)"

  sitzungs_ruf GET /api/freigabe-anfragen
  pruefe 'Danach steht sie nicht mehr als offene Aufgabe da' \
    "$([ -z "$(rumpf | anfrage_zu_lauf "$LAUF_FRIST")" ] && echo ja || echo nein)"
else
  uebergehen 'Ohne Entscheidung endet der Lauf als abgelaufen' 'der Lauf hielt nicht an'
fi

# --- 8. Die Zeilen in der Tabelle --------------------------------------------
# Nur am Geraet: vom Arbeitsrechner aus gibt es keinen Weg zur Datenbank, und
# einen zu bauen hiesse, fuer eine Messung eine Tuer aufzumachen, die es sonst
# nicht gibt. Zwei Gruende, hier nichts zu messen, und sie bekommen zwei
# Meldungen -- eine gemeinsame Bedingung hat bei der C6-Abnahme den falschen
# Grund genannt.
if [ -z "$LAUF_JA" ]; then
  uebergehen 'Die Freigaben stehen in approvals' 'kein Lauf gestartet'
elif ! docker exec postgres-db pg_isready -U arasul >/dev/null 2>&1; then
  uebergehen 'Die Freigaben stehen in approvals' \
    'nur am Geraet: docker exec postgres-db nicht erreichbar'
else
  ZUSTAENDE=$(docker exec postgres-db psql -U arasul -d arasul_db -tAF',' -c \
    "SELECT string_agg(DISTINCT status, ',' ORDER BY status)
       FROM public.approvals WHERE app_id = '$APP'" 2>/dev/null)
  pruefe 'approvals kennt die bestaetigte Freigabe' \
    "$(grep -q bestaetigt <<<"$ZUSTAENDE" && echo ja || echo nein)" \
    "zustaende=$ZUSTAENDE"
  pruefe 'die abgelehnte' \
    "$(grep -q abgelehnt <<<"$ZUSTAENDE" && echo ja || echo nein)"
  pruefe 'und die abgelaufene' \
    "$(grep -q abgelaufen <<<"$ZUSTAENDE" && echo ja || echo nein)"

  WER=$(docker exec postgres-db psql -U arasul -d arasul_db -tA -c \
    "SELECT count(*) FROM public.approvals
      WHERE app_id = '$APP' AND status = 'bestaetigt' AND entschieden_von IS NOT NULL" 2>/dev/null)
  pruefe 'und haelt fest, WER entschieden hat' \
    "$([ "${WER:-0}" -gt 0 ] 2>/dev/null && echo ja || echo nein)" "zeilen=$WER"
fi

# --- 9. Aufraeumen ist Teil der Messung --------------------------------------
schluessel_ruf DELETE "/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
pruefe 'DELETE entfernt die App' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
sitzungs_ruf GET "/api/apps/$APP/flows"
pruefe 'Danach kennt das Geraet die App nicht mehr' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

echo
if [ "$uebersprungen" -gt 0 ]; then
  echo "$gruen von $((gruen + rot)) gruen, $uebersprungen uebersprungen"
else
  echo "$gruen von $((gruen + rot)) gruen"
fi
[ "$rot" -eq 0 ] || exit 1
