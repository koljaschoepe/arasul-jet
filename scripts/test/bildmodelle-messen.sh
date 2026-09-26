#!/bin/bash
# =============================================================================
# Messung „welches Bildmodell liest Belege" (J35, 26.09.2026)
# =============================================================================
# Eine Kanzlei fotografiert Belege. Welches Modell eine App ohne `model`
# bekommt, entscheidet, ob die Bildfunktion etwas taugt -- und das entscheidet
# eine Messung, nicht der Name eines Modells. Gemessen wird:
#
#   je Bildmodell des Geraets (laut `GET models`, `supports_vision_input`)
#   je Beleg aus tests/belege/ (fuenf erfundene Fotos, Wahrheit in wahrheit.json)
#   ueber `llm/chat` mit `images` -- den Weg, den eine App nimmt --
#   wie viele der sechs Felder stimmen (Haendler, Datum, Brutto, Netto,
#   Steuersatz, Steuerbetrag) und wie lange der Aufruf dauerte.
#
# Dazu, zur Einordnung und abschaltbar (ARASUL_OCR_MODELL=aus), der zweite Weg
# des Kontrakts: `document/extract-structured` -- Texterkennung und danach ein
# Textmodell (Vorgabe das Standardmodell der Flows).
#
# WAS ES ANLEGT, RAEUMT ES WEG: einen Wegwerf-Schluessel. Keine App, kein
# Container, kein Konto, kein Modell (es werden nur Modelle benutzt, die schon
# am Geraet liegen).
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 arasul@192.168.0.197
#   ARASUL_PASSWORT=... bash scripts/test/bildmodelle-messen.sh
# Optional: ARASUL_WIEDERHOLUNGEN (Vorgabe 1, Laeufe je Beleg und Modell),
# ARASUL_BILDMODELLE (Leerzeichen-Liste statt aller Bildmodelle am Geraet),
# ARASUL_OCR_MODELL (Textmodell fuer den zweiten Weg, `aus` schaltet ihn ab),
# ARASUL_TEMPERATUR (ohne Angabe die Vorgabe des Geraets, wie bei einer App).
#
# Ausgabe: je Aufruf eine Zeile, am Ende eine Tabelle in Markdown (fuer den PR).
# Ein Aufruf ohne Antwort (Abbruch, Zeitgrenze) zaehlt als Beleg mit null
# Feldern und steht in der Spalte Abbrueche -- weglassen hiesse, ein Modell
# dafuer zu belohnen, dass es sich festredet.
# Rueckgabe 0, wenn jeder Aufruf eine Antwort bekam (die Zahl der richtigen
# Felder ist ein Messwert, kein Rot); sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

if ! arasul_geraet_erreichbar "$ARASUL_URL"; then
  echo "Kein Geraet unter $ARASUL_URL. Erst: ssh -f -N -L 8443:localhost:443 arasul@192.168.0.197"
  exit 1
fi

TOK=$(arasul_token)
[ -z "$TOK" ] && { echo "Anmeldung gescheitert (HTTP $(arasul_anmeldecode))."; exit 1; }

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Messung J35 (bildmodelle)","allowed_endpoints":["llm:chat","llm:status","document:extract"]}' \
  "$ARASUL_URL/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("api_key",""))' 2>/dev/null)
KEY_ID=$(printf '%s' "$ANTWORT" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("key_id",""))' 2>/dev/null)
[ -z "$SCHLUESSEL" ] && { echo "Kein Wegwerf-Schluessel: $ANTWORT"; exit 1; }
aufraeumen() {
  curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
    "$ARASUL_URL/api/v1/external/api-keys/$KEY_ID"
  printf 'aufgeraeumt  Wegwerf-Schluessel widerrufen\n'
}
trap aufraeumen EXIT

ARASUL_URL="$ARASUL_URL" SCHLUESSEL="$SCHLUESSEL" BELEGE="$WURZEL/tests/belege" \
  python3 "$WURZEL/scripts/test/bildmodelle_messen.py"
