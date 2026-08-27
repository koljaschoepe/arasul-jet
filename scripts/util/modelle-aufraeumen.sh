#!/bin/bash
# =============================================================================
# Gestrichene Modelle vom Geraet nehmen (Phase C8, Entscheidung 27.08.2026)
# =============================================================================
# Der Katalog ist seit Migration 175 die Kurzliste: vier Modelle. Was darueber
# hinaus in Ollama liegt, ist damit unsichtbar geworden -- aber nicht weg. Am
# Orin waren das am 27.08.2026 rund 60 GB (qwen3 8b/14b/14b-nothink/32b,
# qwen3-coder 30b, gemma3 1b/4b).
#
# WARUM DAS NICHT DER DEPLOY MACHT
#
# Ein Deploy, der ungefragt 60 GB Modelle loescht, waere die falsche Stelle fuer
# diese Entscheidung: er laeuft nach jedem Merge, er laeuft ohne Menschen davor,
# und ein Modell wieder zu holen dauert auf einem Jetson an einer maessigen
# Leitung Stunden. Also von Hand, mit Liste und Rueckfrage, nach gruener
# Abnahme -- diese Datei.
#
# WAS ES TUT
#
#   1. `ollama list` am Geraet lesen (ueber `docker exec llm-service`).
#   2. Jeden Eintrag gegen die Kurzliste halten (config/modelle/kurzliste.json).
#   3. Die Liste dessen zeigen, was ginge, mit Groesse und Summe.
#   4. Fragen. Erst dann loeschen.
#
# Ein Modell, das gerade im Speicher liegt (`ollama ps`), wird NICHT geloescht,
# sondern genannt und uebersprungen: es koennte mitten in einem Lauf stecken.
#
# Aufruf am Geraet:
#   cd ~/arasul/arasul-jet
#   bash scripts/util/modelle-aufraeumen.sh
#
#   --zeigen    nur auflisten, nichts loeschen und nichts fragen
#   --ja        ohne Rueckfrage loeschen (fuer einen Lauf ohne Menschen davor)
#
# Rueckgabe 0, wenn nichts zu tun war oder alles Gewuenschte geloescht wurde.
# =============================================================================
set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KURZLISTE="$WURZEL/config/modelle/kurzliste.json"
BEHAELTER="${ARASUL_LLM_CONTAINER:-llm-service}"

NUR_ZEIGEN=0
OHNE_FRAGE=0
for argument in "$@"; do
  case "$argument" in
    --zeigen) NUR_ZEIGEN=1 ;;
    --ja) OHNE_FRAGE=1 ;;
    -h | --help) sed -n '2,36p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unbekannt: $argument"; exit 2 ;;
  esac
done

if [ ! -f "$KURZLISTE" ]; then
  echo "Die Kurzliste fehlt: $KURZLISTE"
  exit 1
fi
if ! docker exec "$BEHAELTER" ollama list >/dev/null 2>&1; then
  echo "Kein Ollama unter 'docker exec $BEHAELTER'. Dieses Skript laeuft AM GERAET."
  exit 1
fi

# Die Kurzliste in beiden Schreibweisen: Ollama fuehrt ein tag-loses Modell als
# `name:latest`. Ohne diese Zeile stuende `nomic-embed-text` auf der Loeschliste
# (derselbe Fund wie 2026-07-27 im Abgleich, siehe modelSyncHelpers.tagVarianten).
BLEIBEN=$(python3 - "$KURZLISTE" <<'PY'
import json, sys
namen = []
for m in json.load(open(sys.argv[1], encoding='utf-8'))['modelle']:
    namen.append(m['id'])
    if ':' not in m['id']:
        namen.append(m['id'] + ':latest')
print('\n'.join(namen))
PY
)

# `ollama list` gibt NAME, ID, SIZE, MODIFIED durch mehrere Leerzeichen
# getrennt. Gelesen wird nur die erste Spalte und die Groesse als Text -- eine
# eigene Byte-Rechnung waere eine zweite Wahrheit neben der, die Ollama zeigt.
LISTE=$(docker exec "$BEHAELTER" ollama list 2>/dev/null | tail -n +2)
GELADEN=$(docker exec "$BEHAELTER" ollama ps 2>/dev/null | tail -n +2 | awk '{print $1}')

WEG=()
WEG_TEXT=()
STEHEN_LASSEN=()
while IFS= read -r zeile; do
  [ -n "$zeile" ] || continue
  name=$(printf '%s' "$zeile" | awk '{print $1}')
  groesse=$(printf '%s' "$zeile" | awk '{print $3, $4}')
  if grep -qxF "$name" <<<"$BLEIBEN"; then
    continue
  fi
  if grep -qxF "$name" <<<"$GELADEN"; then
    STEHEN_LASSEN+=("$name")
    continue
  fi
  WEG+=("$name")
  WEG_TEXT+=("$(printf '  %-44s %s' "$name" "$groesse")")
done <<<"$LISTE"

echo "=== Modelle am Geraet, gehalten gegen die Kurzliste ==="
echo
echo "Bleiben (Kurzliste):"
while IFS= read -r name; do
  if grep -qxF "$name" <<<"$(printf '%s\n' "$LISTE" | awk '{print $1}')"; then
    printf '  %s\n' "$name"
  else
    printf '  %-44s (nicht installiert)\n' "$name"
  fi
done <<<"$BLEIBEN"

if [ "${#STEHEN_LASSEN[@]}" -gt 0 ]; then
  echo
  echo "Im Speicher, deshalb nicht angefasst (koennte in einem Lauf stecken):"
  printf '  %s\n' "${STEHEN_LASSEN[@]}"
fi

echo
if [ "${#WEG[@]}" -eq 0 ]; then
  echo "Nichts zu loeschen. Am Geraet liegt nur die Kurzliste."
  exit 0
fi
echo "Wuerden geloescht (${#WEG[@]}):"
printf '%s\n' "${WEG_TEXT[@]}"
echo

if [ "$NUR_ZEIGEN" -eq 1 ]; then
  echo "Nur gezeigt (--zeigen). Nichts geloescht."
  exit 0
fi

if [ "$OHNE_FRAGE" -ne 1 ]; then
  # Kein blankes "j": wer die Liste nicht gelesen hat, tippt kein Wort.
  printf 'Wirklich loeschen? Tippe LOESCHEN: '
  read -r antwort
  if [ "$antwort" != "LOESCHEN" ]; then
    echo "Abgebrochen. Nichts geloescht."
    exit 0
  fi
fi

fehler=0
for name in "${WEG[@]}"; do
  if docker exec "$BEHAELTER" ollama rm "$name" >/dev/null 2>&1; then
    echo "geloescht  $name"
  else
    echo "FEHLER     $name liess sich nicht loeschen"
    fehler=$((fehler + 1))
  fi
done

echo
docker exec "$BEHAELTER" ollama list 2>/dev/null | tail -n +2 | awk '{print "  " $1}'
echo
if [ "$fehler" -eq 0 ]; then
  echo "Fertig. ${#WEG[@]} Modell(e) weg."
else
  echo "Fertig mit $fehler Fehler(n)."
fi
[ "$fehler" -eq 0 ]
