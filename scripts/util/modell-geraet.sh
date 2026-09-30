#!/bin/bash
# =============================================================================
# Modelle am Geraet laden, per SSH und ohne Admin-Passwort (Auftrag J4)
# =============================================================================
# Wer einem Kunden ein Modell auf das Geraet legt -- das Ara-Kit, ein Partner,
# Kolja --, hat am Geraet SSH, aber kein Passwort des Kunden, und das Kit
# traegt nur einen Schluessel mit `app:deploy`. `POST /api/models/download`
# verlangt eine Sitzung als Administrator. Deshalb dieser Weg, nach dem Muster
# von `lizenz-geraet.sh`: der Backend-Container laedt selbst, mit demselben
# Dienst wie die Schnittstelle (`apps/dashboard-backend/src/cli/modell.js`).
# Eine zweite Pruefung gibt es damit nicht: dieselbe Kennungspruefung, dieselbe
# Groessenpruefung gegen das Speicherbudget, dieselbe Abweisung mit Grund.
#
# DER VERTRAG NACH AUSSEN -- andere Karten (der Skill im Ara-Kit) bauen darauf.
# Jeder Aufruf gibt auf STDOUT genau EINE Zeile JSON aus, auch im Fehlerfall;
# der Fortschritt eines Ladevorgangs steht auf STDERR.
#
#   modell-geraet.sh laden <kennung>
#       {"ok":true,"modell":"<kennung>","gemessen":false,"digest_vorab":false}
#       {"ok":false,"fehler":"...","grund":"ZU_GROSS","groesse_gb":..,
#        "memory_budget_gb":..}           mit Rueckgabe 1
#       <kennung>: Ollama-Bibliothek (name:tag) oder Hugging Face
#       (hf.co/nutzer/repo:quant); `gemessen` ist nur bei der Kurzliste true
#   modell-geraet.sh liste
#       {"modelle":[{"id":"..","name":"..","gemessen":true,"groesse_bytes":..,
#                    "standard":false}]}  nur, was am Geraet liegt
#   modell-geraet.sh entfernen <kennung>
#       {"ok":true,"modell":"<kennung>"}
#
# Andere Fehler (Container laeuft nicht, kein Docker) sind {"fehler":"..."}
# bzw. {"ok":false,"fehler":"..."} mit Rueckgabe 1.
#
# Aufruf vom Arbeitsrechner:
#   ssh arasul@arasul '~/arasul-<fassung>/scripts/util/modell-geraet.sh liste'
#
# Das Skript braucht nur Docker (der Benutzer steht in der Gruppe `docker`).
# =============================================================================
set -uo pipefail

CONTAINER="${ARASUL_BACKEND_CONTAINER:-dashboard-backend}"
EINSTIEG="/app/apps/dashboard-backend/src/cli/modell.js"
BEFEHL="${1:-}"
KENNUNG="${2:-}"

json_text() {
  local t="$1"
  t="${t//\\/\\\\}"
  t="${t//\"/\\\"}"
  t="$(printf '%s' "$t" | tr '\n\r\t' '   ')"
  printf '"%s"' "$t"
}

fehler() {
  local meldung="$1" code="${2:-1}"
  if [ "$BEFEHL" = "laden" ] || [ "$BEFEHL" = "entfernen" ]; then
    printf '{"ok":false,"fehler":%s}\n' "$(json_text "$meldung")"
  else
    printf '{"fehler":%s}\n' "$(json_text "$meldung")"
  fi
  exit "$code"
}

case "$BEFEHL" in
  laden | entfernen)
    [ -n "$KENNUNG" ] || fehler "Aufruf: modell-geraet.sh $BEFEHL <kennung>" 2
    ;;
  liste) ;;
  *)
    fehler "Aufruf: modell-geraet.sh laden <kennung> | liste | entfernen <kennung>" 2
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  fehler "Kein docker auf diesem Rechner. Das Skript laeuft auf dem Geraet (per SSH)."
fi
if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  fehler "Der Container ${CONTAINER} laeuft nicht. Laeuft die Plattform? docker compose ps"
fi

# STDOUT des Containers wird aufgefangen (die Antwort ist die LETZTE Zeile),
# STDERR laeuft durch -- ein Pull dauert Minuten, und wer per SSH davorsitzt,
# soll den Fortschritt sehen.
ANTWORT_DATEI="$(mktemp)"
trap 'rm -f "$ANTWORT_DATEI"' EXIT
docker exec "$CONTAINER" node "$EINSTIEG" "$BEFEHL" ${KENNUNG:+"$KENNUNG"} </dev/null >"$ANTWORT_DATEI"
CODE=$?

LETZTE="$(tail -n 1 "$ANTWORT_DATEI")"
case "$LETZTE" in
  \{*\})
    printf '%s\n' "$LETZTE"
    exit "$CODE"
    ;;
esac
if [ "$CODE" -eq 0 ]; then
  CODE=1
fi
fehler "Keine Antwort aus ${CONTAINER} (Rueckgabe ${CODE}): $(cat "$ANTWORT_DATEI")" "$CODE"
