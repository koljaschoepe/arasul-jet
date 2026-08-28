#!/bin/bash
# =============================================================================
# Die Beispielapp am Geraet einspielen oder entfernen (Phase C3, 27.08.2026)
# =============================================================================
# Die Beispielapp liegt unter `tests/beispielapp/` und gehoert NICHT zum
# Auslieferungsumfang: keine Compose-Datei erwaehnt sie, kein Setup installiert
# sie, `.dockerignore` schliesst `**/tests/` aus jedem Image aus. Auf das Geraet
# kommt sie mit dem Git-Checkout des Deploys, und dort tut sie nichts, bis
# dieses Skript sie einspielt.
#
# LAEUFT AUF DEM GERAET, nicht vom Arbeitsrechner: es baut ein Image und legt
# Dateien unter `data/apps/` ab. Beides geht nur dort, wo Docker und die
# Datenordner sind.
#
#   ssh jetson
#   cd ~/arasul/arasul-jet
#   bash scripts/test/beispielapp.sh einspielen
#   bash scripts/test/beispielapp.sh entfernen
#
# Was `einspielen` tut, in der Reihenfolge:
#   1. `app.json` lesen (Kennung und Version kommen von dort, nicht von hier)
#   2. das Paket nach `data/apps/<id>/<version>/` kopieren, samt `backend/`
#      und `flows/` -- und das Designsystem daneben legen
#      (`scripts/util/marken-beilegen.sh`, Phase D7)
#   3. `POST /api/apps/<id>/einspielen` -- ab hier arbeitet die Plattform
#   4. die App dem angemeldeten Administrator freigeben (ARASUL_FREIGABE=nein
#      laesst es bleiben)
#
# Schritt 3 ist der eigentliche Punkt: das Geraet BAUT das Image aus dem
# `backend/`-Ordner (das Manifest sagt mit `backend.bauen`, wo er liegt),
# startet den Container mit seinen eigenen Regeln (Traefik-Beschriftung,
# Grenzen, kein Port am Host) und traegt den Stand in `app_staende` ein.
#
# Bis Phase C5 baute dieses Skript das Image selbst und legte es dem Geraet
# fertig hin. Das ist jetzt der Weg der Plattform, und ein zweiter Bau daneben
# waere ein zweiter Ort, an dem etwas anders sein koennte. Wer den Deploy
# ueber die Schnittstelle sehen will, nimmt `scripts/test/deploy-abnahme.sh`:
# dasselbe Ergebnis, aber ohne SSH und ohne diesen Ordner.
#
# Rueckgabe 0 bei Erfolg.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# VOR dem Einbinden gesetzt, weil `anmeldung.sh` sonst seine eigene
# Voreinstellung nimmt: `https://localhost:8443`. Das ist die Adresse des
# SSH-Tunnels vom Arbeitsrechner, und die gibt es hier nicht. Dieses Skript
# laeuft AUF DEM GERAET, dort haengt Traefik an 443. Am 27.08.2026 hat es
# deshalb am Orin keine Anmeldung bekommen und mit "429 heisst Anmeldedrossel"
# aufgehoert, obwohl auf 8443 einfach niemand horchte.
ARASUL_URL="${ARASUL_URL:-https://localhost}"

# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

QUELLE="$WURZEL/tests/beispielapp"
DATEN="${DATA_PATH:-$WURZEL/data}"
STAND="${ARASUL_STAND:-live}"
BEFEHL="${1:-einspielen}"

lies_manifest() {
  python3 -c "import json,sys; print(json.load(open('$QUELLE/app.json'))['$1'])"
}

if [ ! -f "$QUELLE/app.json" ]; then
  echo "Kein $QUELLE/app.json. Falscher Ordner?"
  exit 1
fi
ID=$(lies_manifest id)
VERSION=$(lies_manifest version)
IMAGE=$(python3 -c "import json; print(json.load(open('$QUELLE/app.json'))['backend']['image'])")
ZIEL="$DATEN/apps/$ID/$VERSION"

# Aus welchem Ordner liest das Backend wirklich? Am Orin liegen zwei Checkouts
# nebeneinander, der Deploy-Ordner (`~/arasul/arasul-jet`) und der Ordner des
# GitHub-Runners; in den Container gebunden ist nur einer. Wer im falschen
# steht, legt das Paket dorthin, wo es niemand liest, und bekommt beim
# Einspielen einen Fehler ueber ein Manifest, das er gerade selbst hingelegt
# hat. Docker weiss es genau, also wird gefragt statt geraten.
GEBUNDEN=$(docker inspect dashboard-backend \
  --format '{{range .Mounts}}{{if eq .Destination "/arasul/apps"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)
if [ -n "$GEBUNDEN" ] && [ "$GEBUNDEN" != "$DATEN/apps" ]; then
  echo "Falscher Ordner. Der Backend-Container liest:"
  echo "  $GEBUNDEN"
  echo "dieses Skript wuerde ablegen nach:"
  echo "  $DATEN/apps"
  echo "Von dort starten:  cd ${GEBUNDEN%/data/apps} && bash scripts/test/beispielapp.sh $BEFEHL"
  exit 1
fi

api() {
  local verb="$1" pfad="$2" leib="${3:-}"
  # Die Argumente in einem Feld, nicht in einer Zeichenkette: eine
  # unquotierte `${leib:+-d "$leib"}`-Ersetzung zerlegt der Shell den Rumpf an
  # jedem Leerzeichen, und das faellt erst bei dem Manifest auf, das eines hat.
  # 600 und nicht 120: seit C5 baut das GERAET das Image, und der Bau haengt
  # an diesem einen Aufruf. Beim ersten Mal laedt Docker dafuer ein
  # Basis-Image; auf einem Jetson an einer maessigen Leitung sind zwei Minuten
  # dann zu knapp, und ein Abbruch hier saehe aus wie ein Fehler der App.
  local -a argumente=(-sk -w '\n%{http_code}' -X "$verb" --max-time 600
    -H "authorization: Bearer $TOKEN" -H 'content-type: application/json')
  [ -n "$leib" ] && argumente+=(-d "$leib")
  curl "${argumente[@]}" "$ARASUL_URL$pfad"
}

case "$BEFEHL" in
  einspielen)
    echo "=== Beispielapp $ID $VERSION einspielen ==="

    echo "1/3  Paket nach $ZIEL"
    mkdir -p "$ZIEL" || exit 1
    # `--delete` gibt es in `cp` nicht: der Zielordner wird vorher geleert,
    # damit eine Datei, die aus dem Paket verschwunden ist, nicht liegenbleibt
    # und weiter ausgeliefert wird.
    rm -rf "${ZIEL:?}"/* 2>/dev/null
    # `backend/` gehoert seit C5 dazu: das Geraet baut daraus das Image,
    # `flows/` seit C6 -- das Manifest verspricht sie, und ein Paket, das sie
    # nicht mitbringt, weist das Geraet mit 400 ab ("Das Manifest verspricht
    # Flows in flows/, im Paket gibt es den Ordner nicht"). Genau daran ist das
    # Einspielen am Orin am 27.08.2026 gescheitert.
    cp -R "$QUELLE/app.json" "$QUELLE/frontend" "$QUELLE/backend" "$QUELLE/flows" \
      "$ZIEL/" || exit 1
    # Das Designsystem (Phase D7): die App ist React-Code auf den Bausteinen
    # aus `packages/marken/` und bringt kein eigenes Erscheinungsbild mehr mit.
    # Ohne Buendler kommen die zwei fertigen Dateien daneben; eine App MIT
    # Buendler (die Kit-Vorlage aus E5) uebersetzt stattdessen die Quelle mit.
    bash "$WURZEL/scripts/util/marken-beilegen.sh" "$ZIEL/frontend" || exit 1

    echo "2/3  Anmelden"
    TOKEN=$(arasul_token)
    if [ -z "$TOKEN" ]; then
      echo "Keine Anmeldung an $ARASUL_URL (HTTP $(arasul_anmeldecode))."
      echo "429 heisst Anmeldedrossel, 000 heisst: dort horcht niemand."
      exit 1
    fi

    echo "3/3  POST /api/apps/$ID/einspielen (stand=$STAND, das Geraet baut das Image)"
    ANTWORT=$(api POST "/api/apps/$ID/einspielen" "{\"version\":\"$VERSION\",\"stand\":\"$STAND\"}")
    CODE=$(printf '%s' "$ANTWORT" | tail -n1)
    printf '%s' "$ANTWORT" | sed '$d'
    echo
    if [ "$CODE" != "201" ]; then
      echo "ROT   HTTP $CODE"
      exit 1
    fi
    # Die Freigabe. Ohne sie steht die Forward-Auth aus C4 vor jeder Seite und
    # vor jedem Aufruf an das Backend der App -- auch fuer den Administrator,
    # der sie gerade eingespielt hat (es gibt keine Sonderregel fuer ihn,
    # `services/app/appZugang.js`). Und ohne den Weg durch die App darf sie
    # ihren Flow nicht starten. Wer das nicht will, setzt ARASUL_FREIGABE=nein.
    if [ "${ARASUL_FREIGABE:-ja}" = "ja" ]; then
      ICH=$(api GET /api/auth/me | sed '$d' |
        python3 -c 'import sys,json
try: print(json.load(sys.stdin)["user"]["id"])
except Exception: print("")' 2>/dev/null)
      if [ -n "$ICH" ]; then
        FREI=$(api POST /api/freigaben "{\"app_id\":\"$ID\",\"benutzer_id\":$ICH}" | tail -n1)
        case "$FREI" in
          200 | 201) echo "Freigegeben fuer Benutzer $ICH (HTTP $FREI)." ;;
          *) echo "ACHTUNG  Freigabe fehlgeschlagen (HTTP $FREI). Ohne sie ist die App gesperrt." ;;
        esac
      else
        echo "ACHTUNG  Eigene Benutzerkennung nicht lesbar, keine Freigabe angelegt."
      fi
    else
      echo "Keine Freigabe angelegt (ARASUL_FREIGABE=nein). Die App bleibt gesperrt,"
      echo "bis ein Admin sie freigibt:  POST /api/freigaben {app_id, benutzer_id}"
    fi

    echo "Eingespielt. Jetzt zu erreichen unter:"
    if [ "$STAND" = "test" ]; then
      echo "  $ARASUL_URL/apps/$ID/test/        und  $ARASUL_URL/apps/$ID/test/api/hallo"
    else
      echo "  $ARASUL_URL/apps/$ID/             und  $ARASUL_URL/apps/$ID/api/hallo"
    fi
    ;;

  entfernen)
    echo "=== Beispielapp $ID entfernen ==="
    TOKEN=$(arasul_token)
    if [ -z "$TOKEN" ]; then
      echo "Keine Anmeldung an $ARASUL_URL (HTTP $(arasul_anmeldecode))."
      exit 1
    fi
    ANTWORT=$(api DELETE "/api/apps/$ID")
    CODE=$(printf '%s' "$ANTWORT" | tail -n1)
    printf '%s' "$ANTWORT" | sed '$d'
    echo
    # Die Dateien bleiben liegen, wenn die Plattform die App entfernt (siehe
    # `appStore.entferneApp`). Hier duerfen sie weg: dieses Skript hat sie
    # hingelegt.
    rm -rf "${DATEN:?}/apps/${ID:?}"
    docker image rm -f "$IMAGE" >/dev/null 2>&1
    [ "$CODE" = "200" ] || { echo "ROT   HTTP $CODE"; exit 1; }
    echo "Entfernt: Zeile, Container, Dateien, Image."
    ;;

  *)
    echo "Aufruf: $0 [einspielen|entfernen]"
    exit 2
    ;;
esac
