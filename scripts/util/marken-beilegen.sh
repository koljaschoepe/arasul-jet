#!/bin/bash
# =============================================================================
# Das Designsystem neben eine App legen (Phase D7, 28.08.2026)
# =============================================================================
# Eine App auf diesem Geraet benutzt die Bausteine aus `packages/marken/`. Wer
# einen Buendler hat (die Vorlage des Ara-Kits, Phase E5), zieht die Quelle
# ueber den Spiegel und uebersetzt sie mit. Wer keinen hat -- die Beispielapp,
# und jede kleine App, die ein Mensch im Unternehmen selbst hinlegt --,
# bekommt die zwei fertigen Dateien daneben gelegt:
#
#   marken.js    das Buendel, React liegt darin (eingecheckt, `npm run marken`)
#   marken.css   dieselbe Datei, die die Shell laedt
#
# `theme.css` ist ABSICHTLICH NICHT dabei (Phase H3). Es traegt die Tokens fuer
# die Primitive, und die stehen auf Tailwind: eine App ohne Buendler hat kein
# Tailwind, also gaebe es die Klassen nicht, die die Tokens faerben wuerden.
# Ihre Farben kommen aus den Rueckfaellen in `marken.css`
# (`var(--token, <Wert>)`), und `scripts/test/marken.py` haelt die an
# `theme.css` fest.
#
# EINE STELLE DAFUER, und darum dieses Skript: es kopiert an zwei Orten
# dasselbe (beim Einspielen am Geraet und beim Bauen eines Pakets fuer den
# Deploy-Endpunkt). Zwei Kopierbefehle, die auseinanderlaufen, waeren eine App
# mit halbem Designsystem -- und das faellt erst im Browser auf.
#
# Aufruf:  bash scripts/util/marken-beilegen.sh <frontend-verzeichnis>
# Rueckgabe 0, wenn beide Dateien liegen.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ZIEL="${1:-}"
if [ -z "$ZIEL" ] || [ ! -d "$ZIEL" ]; then
  echo "marken-beilegen: kein Verzeichnis (Aufruf: $0 <frontend-verzeichnis>)"
  exit 1
fi

BUENDEL="$WURZEL/packages/marken/browser/marken.js"
STIL="$WURZEL/packages/marken/src/marken.css"

if [ ! -f "$BUENDEL" ]; then
  echo "marken-beilegen: $BUENDEL fehlt. Im Wurzelverzeichnis: npm run marken"
  exit 1
fi
if [ ! -f "$STIL" ]; then
  echo "marken-beilegen: $STIL fehlt."
  exit 1
fi

cp "$BUENDEL" "$ZIEL/marken.js" || exit 1
cp "$STIL" "$ZIEL/marken.css" || exit 1
echo "beigelegt  marken.js und marken.css in $ZIEL"
