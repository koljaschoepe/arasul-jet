#!/bin/bash
# =============================================================================
# Die Lizenz dieses Geraets, per SSH und ohne Admin-Passwort (Auftrag J35)
# =============================================================================
# Wer einem Kunden die Lizenz einspielt -- das Ara-Kit, ein Partner, Kolja --,
# hat am Geraet SSH, aber kein Passwort des Kunden, und das Kit traegt nur
# einen Schluessel mit `app:deploy`. `POST /api/license/activate` verlangt eine
# Sitzung als Administrator. Deshalb dieser Weg: er laesst den Backend-Container
# selbst pruefen und schreiben, mit demselben Dienst wie die Schnittstelle
# (`apps/dashboard-backend/src/cli/lizenz.js` -> `licenseService`). Eine zweite
# Pruefung gibt es damit nicht, und das laufende Backend sieht die Lizenz
# sofort (sein Cache haengt an der Datei).
#
# DER VERTRAG NACH AUSSEN -- andere Karten bauen darauf (`kit-schaltet-lizenz-
# frei`). Jeder Aufruf gibt genau EINE Zeile JSON aus, auch im Fehlerfall:
#
#   lizenz-geraet.sh fingerabdruck
#       {"fingerabdruck":"<hex>"}          derselbe Wert wie GET /api/license/fingerprint
#   lizenz-geraet.sh status
#       {"stufe":"community","konten":{"belegt":2,"grenze":3},"apps":{"belegt":1,"grenze":3}}
#                                           -1 heisst unbegrenzt
#   lizenz-geraet.sh einspielen <lizenz>    (oder die Lizenz auf STDIN)
#       {"ok":true,"stufe":"professional"}
#       {"ok":false,"fehler":"..."}         mit Rueckgabe 1
#
# Andere Fehler (Container laeuft nicht, kein Docker) sind {"fehler":"..."}
# mit Rueckgabe 1; bei `einspielen` in der Form {"ok":false,"fehler":"..."}.
#
# Aufruf vom Arbeitsrechner:
#   ssh arasul@arasul '~/arasul-<fassung>/scripts/util/lizenz-geraet.sh status'
#
# Das Skript braucht nur Docker (der Benutzer steht in der Gruppe `docker`),
# kein sudo und kein Verzeichnis: es spricht den Container ueber seinen Namen
# an und laeuft deshalb aus jedem Fassungsordner gleich.
# =============================================================================
set -uo pipefail

CONTAINER="${ARASUL_BACKEND_CONTAINER:-dashboard-backend}"
EINSTIEG="/app/apps/dashboard-backend/src/cli/lizenz.js"
BEFEHL="${1:-}"

# Eine Zeile JSON aus einer Meldung, ohne jq: nur Anfuehrungszeichen und
# Rueckstriche muessen entwertet werden, Zeilenumbrueche werden Leerzeichen.
json_text() {
  local t="$1"
  t="${t//\\/\\\\}"
  t="${t//\"/\\\"}"
  t="$(printf '%s' "$t" | tr '\n\r\t' '   ')"
  printf '"%s"' "$t"
}

fehler() {
  local meldung="$1" code="${2:-1}"
  if [ "$BEFEHL" = "einspielen" ]; then
    printf '{"ok":false,"fehler":%s}\n' "$(json_text "$meldung")"
  else
    printf '{"fehler":%s}\n' "$(json_text "$meldung")"
  fi
  exit "$code"
}

case "$BEFEHL" in
  fingerabdruck | status | einspielen) ;;
  *)
    fehler "Aufruf: lizenz-geraet.sh fingerabdruck | status | einspielen <lizenz>" 2
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  fehler "Kein docker auf diesem Rechner. Das Skript laeuft auf dem Geraet (per SSH)."
fi
if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  fehler "Der Container ${CONTAINER} laeuft nicht. Laeuft die Plattform? docker compose ps"
fi

# Die Lizenz geht ueber STDIN in den Container, nicht als Argument: sie kann
# gut 1000 Zeichen lang sein, und ueber STDIN steht sie in keinem `ps`.
if [ "$BEFEHL" = "einspielen" ]; then
  if [ $# -ge 2 ] && [ "$2" != "-" ]; then
    LIZENZ="$2"
  elif [ ! -t 0 ]; then
    LIZENZ="$(cat)"
  else
    fehler "Keine Lizenz: lizenz-geraet.sh einspielen <lizenz>, oder die Lizenz auf STDIN."
  fi
  AUSGABE="$(printf '%s' "$LIZENZ" | docker exec -i "$CONTAINER" node "$EINSTIEG" einspielen 2>&1)"
  CODE=$?
else
  AUSGABE="$(docker exec "$CONTAINER" node "$EINSTIEG" "$BEFEHL" </dev/null 2>&1)"
  CODE=$?
fi

# Die Antwort ist die LETZTE Zeile, und sie muss JSON sein. Kommt etwas
# anderes (ein alter Container ohne den Einstieg, ein Absturz vor der ersten
# Zeile), wird daraus eine Fehlerzeile -- nie ein Text, den der Aufrufer nicht
# parsen kann.
LETZTE="$(printf '%s\n' "$AUSGABE" | tail -n 1)"
case "$LETZTE" in
  \{*\})
    printf '%s\n' "$LETZTE"
    exit "$CODE"
    ;;
esac
if [ "$CODE" -eq 0 ]; then
  CODE=1
fi
fehler "Keine Antwort aus ${CONTAINER} (Rueckgabe ${CODE}): ${AUSGABE:-leer}" "$CODE"
