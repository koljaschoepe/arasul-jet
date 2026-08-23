#!/bin/bash
# =============================================================================
# Wartet auf die CI eines PR und mergt NUR bei gruen
# =============================================================================
# Warum es diese Datei gibt: zweimal an zwei Tagen habe ich diese Schleife von
# Hand improvisiert und zweimal den Zustand falsch gelesen.
#
#   22.08.2026  Das Skript gab die Fehlzeilen aus und darunter "(leer=gruen)".
#               Ich las die letzte Zeile und mergte PR #605 mit roter CI.
#   23.08.2026  Das Skript kannte `PENDING` und `QUEUED`, aber nicht
#               `IN_PROGRESS`. Es hielt jede laufende Pruefung fuer rot und
#               meldete acht rote Namen, waehrend in Wahrheit noch nichts
#               entschieden war.
#
# Beide Male war nicht die CI das Problem, sondern mein Blick darauf. Deshalb
# steht das hier jetzt als Datei und liest `bucket` statt `state`: `bucket`
# ist genau dafuer da und kennt nur pass, fail, pending und skipping. Neue
# Zustandsnamen von GitHub aendern daran nichts.
#
# Aufruf:
#   scripts/util/pr-gruen-mergen.sh <PR-Nummer> [Minuten]     Vorgabe: 40
#
# Ausgang:
#   0  gruen und gemergt
#   1  rot, mit den Namen der roten Pruefungen
#   2  Zeit abgelaufen, nichts entschieden, nichts gemergt
# =============================================================================
set -uo pipefail

PR="${1:?PR-Nummer fehlt}"
MINUTEN="${2:-40}"
FRIST=$(( $(date +%s) + MINUTEN * 60 ))

while [ "$(date +%s)" -lt "$FRIST" ]; do
  # --watch waere bequemer, laeuft aber ohne Deckel und haengt in einer
  # Sitzung im Hintergrund weiter, wenn die CI nie fertig wird.
  offen=$(gh pr checks "$PR" --json bucket --jq '[.[] | select(.bucket=="pending")] | length' 2>/dev/null)
  if [ -z "$offen" ]; then
    echo "Kein Pruefstand lesbar fuer PR ${PR} — noch keine Laeufe gestartet?"
    sleep 20
    continue
  fi
  if [ "$offen" != "0" ]; then
    sleep 20
    continue
  fi

  rot=$(gh pr checks "$PR" --json bucket,name --jq '.[] | select(.bucket=="fail") | .name')
  if [ -n "$rot" ]; then
    echo "ROT:"
    printf '  %s\n' $rot
    exit 1
  fi

  gh pr merge "$PR" --squash --delete-branch && echo "GRUEN, gemergt" && exit 0
  echo "Gruen, aber der Merge selbst ist gescheitert."
  exit 1
done

echo "Zeit abgelaufen nach ${MINUTEN} min. Nichts gemergt."
exit 2
