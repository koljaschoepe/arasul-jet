#!/bin/bash
# =============================================================================
# Selbsttest der Shell-Seite der Anmeldung, ohne Geraet (28.08.2026).
# =============================================================================
# Drei Dinge, die sonst nur am Orin auffallen, und dort erst, wenn die Drossel
# wirklich voll ist:
#   1. die Drossel-Helfer in `anmeldung.sh` lesen die Kopfzeilen richtig und
#      warten so lange, wie das Geraet sagt (mit gefaelschten Kopfzeilen);
#   2. `scripts/util/pruefbenutzer.sh` weist ab, was es abweisen muss, und
#      haengt nicht, wenn kein Geraet da ist;
#   3. die drei Skripte sind syntaktisch heil (und shellcheck-sauber, wo es
#      shellcheck gibt).
#
# Aufruf: bash scripts/test/anmeldung-selbsttest.sh
# Rueckgabe 0, wenn jede Frage gruen war.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"
fehler=0
pruefe() {
  if [ "$2" = "$3" ]; then
    echo "gruen  $1"
  else
    echo "ROT    $1 (erwartet '$2', ist '$3')"
    fehler=$((fehler + 1))
  fi
}
ORDNER="$(mktemp -d)"
trap 'rm -rf "$ORDNER"' EXIT

for f in scripts/test/anmeldung.sh scripts/util/pruefbenutzer.sh scripts/test/abnahmen.sh; do
  bash -n "$f"
  pruefe "Syntax $f" 0 $?
done
if command -v shellcheck >/dev/null; then
  shellcheck -S warning scripts/test/anmeldung.sh scripts/util/pruefbenutzer.sh scripts/test/abnahmen.sh
  pruefe "shellcheck" 0 $?
else
  echo "weg    shellcheck fehlt hier"
fi

export ARASUL_DROSSEL_DATEI="$ORDNER/drossel.json"
# shellcheck source=scripts/test/anmeldung.sh
source scripts/test/anmeldung.sh
kopf="$ORDNER/kopf"
namen() { python3 -c 'import json,sys; print(",".join(sorted(json.load(open(sys.argv[1])))))' "$1"; }

printf 'HTTP/2 200\r\nRateLimit-Remaining: 0\r\nRateLimit-Reset: 2\r\n' > "$kopf"
arasul_drossel_merken GET /api/auth/session "$kopf" 200
pruefe "die Sitzungsprobe wird als sitzung gemerkt" "sitzung" "$(namen "$ARASUL_DROSSEL_DATEI")"
pruefe "sitzung: Restzeit 3 s (2 s plus Rand)" "3" "$(_arasul_drossel_py restzeit sitzung 1)"
pruefe "auth: frei" "0" "$(_arasul_drossel_py restzeit auth 2)"
start=$SECONDS
arasul_drossel_abwarten sitzung 1 2>/dev/null
if [ $((SECONDS - start)) -ge 2 ]; then geschlafen=ja; else geschlafen=nein; fi
pruefe "abwarten hat geschlafen" ja "$geschlafen"

printf 'HTTP/2 429\r\n' > "$kopf"
arasul_drossel_merken POST /api/auth/login "$kopf" 429
pruefe "429 ohne Zahlen: ein Fenster (901 s)" "901" "$(_arasul_drossel_py restzeit anmeldung 1)"
printf 'HTTP/2 200\r\nRateLimit: limit=10, remaining=7, reset=880\r\n' > "$kopf"
arasul_drossel_merken POST /api/auth/login "$kopf" 200
pruefe "gebuendelte Kopfzeile: sieben uebrig, frei fuer zwei" "0" "$(_arasul_drossel_py restzeit anmeldung 2)"
printf 'HTTP/2 200\r\nRateLimit-Remaining: 99\r\n' > "$kopf"
arasul_drossel_merken GET /api/apps "$kopf" 200
pruefe "ein Weg ohne Drossel steht nicht in der Datei" "anmeldung,sitzung" "$(namen "$ARASUL_DROSSEL_DATEI")"

ARASUL_PASSWORT= bash scripts/util/pruefbenutzer.sh >/dev/null 2>&1
pruefe "pruefbenutzer ohne Passwort: 2" 2 $?
ARASUL_BENUTZER="x'; drop" ARASUL_PASSWORT=p bash scripts/util/pruefbenutzer.sh >/dev/null 2>&1
pruefe "pruefbenutzer mit unzulaessigem Namen: 2" 2 $?
# Kein Container hier, kein Geraet unter dem Namen: ein Fehler in Sekunden,
# kein Haenger. 124 waere die Zeitgrenze von `timeout`.
ARASUL_GERAET=gibt-es-nicht.invalid ARASUL_PASSWORT=p timeout 60 bash scripts/util/pruefbenutzer.sh >/dev/null 2>&1
rc=$?
if [ "$rc" -ne 0 ] && [ "$rc" -ne 124 ]; then ohne=ja; else ohne="nein ($rc)"; fi
pruefe "pruefbenutzer ohne Geraet: Fehler, kein Haenger" ja "$ohne"

if [ "$fehler" = 0 ]; then echo "alles gruen"; else echo "$fehler rot"; fi
exit "$fehler"
