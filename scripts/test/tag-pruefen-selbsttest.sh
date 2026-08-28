#!/bin/bash
# =============================================================================
# Selbsttest der Tag-Sperre aus release.yml (28.08.2026).
# =============================================================================
# `scripts/deploy/tag-pruefen.sh` laeuft im Ernstfall genau einmal je Release,
# und wenn es dann durchwinkt, was es haette anhalten muessen, steht der Fehler
# fuer immer im Netz. Ein Waechter, den niemand prueft, hoert lautlos auf zu
# wachen.
#
# Gemessen wird in einem eigenen Wegwerf-Repo, nicht an den Tags dieses hier:
# ein Selbsttest, der sich auf v0.1.0 bis v0.3.0 stuetzt, faellt an dem Tag,
# an dem jemand einen Tag setzt.
#
#   A ── B ── C ── D  (main)
#        │         └─ v0.9.0  Spitze          -> gruen
#        │    └───── v0.9.0  hinter der Spitze -> ROT (Regel 3)
#        │    └───── v0.9.0  als Nachtrag      -> gruen (Ausnahme zu Regel 3)
#        └────────── v0.8.0
#   B ── S  (nie gemergt)   └─ v0.9.0          -> ROT (Regel 1)
#   v1.0.0 auf A, waehrend v0.8.0 auf B steht  -> ROT (Regel 2)
#
# Aufruf: bash scripts/test/tag-pruefen-selbsttest.sh
# Rueckgabe 0, wenn jede Frage gruen war.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRUEFER="$WURZEL/scripts/deploy/tag-pruefen.sh"
fehler=0

pruefe() {
  if [ "$2" = "$3" ]; then
    echo "gruen  $1"
  else
    echo "ROT    $1 (erwartet Rueckgabe '$2', war '$3')"
    fehler=$((fehler + 1))
  fi
}

bash -n "$PRUEFER"; pruefe "Syntax tag-pruefen.sh" 0 $?
if command -v shellcheck >/dev/null; then
  shellcheck -S warning "$PRUEFER"; pruefe "shellcheck" 0 $?
else
  echo "weg    shellcheck fehlt hier"
fi

ORDNER="$(mktemp -d)"
trap 'rm -rf "$ORDNER"' EXIT
cd "$ORDNER" || exit 1

git init -q -b main .
git config user.email selbsttest@arasul.local
git config user.name  Selbsttest
git config commit.gpgsign false
git config tag.gpgsign false

mach() { echo "$1" > datei.txt; git add datei.txt; git commit -qm "$1"; git rev-parse HEAD; }
A="$(mach A)"; B="$(mach B)"; C="$(mach C)"; D="$(mach D)"

# Die Sperre misst gegen `origin/main`. Ohne Fernkopie gibt es die nicht, also
# wird sie hier von Hand gesetzt -- im Lauf tut das der `git fetch` davor.
git update-ref refs/remotes/origin/main "$D"

# --- Regel 3: die Spitze ist erlaubt, alles darunter nicht ------------------
git tag v0.8.0 "$B"
git tag v0.9.0 "$D"
"$PRUEFER" v0.9.0 origin/main >/dev/null 2>&1
pruefe "Tag auf der Spitze von main" 0 $?

git tag -d v0.9.0 >/dev/null
git tag v0.9.0 "$C"
"$PRUEFER" v0.9.0 origin/main >/dev/null 2>&1
pruefe "Tag ein Commit hinter der Spitze" 1 $?

# --- Die Ausnahme: annotiert, mit Grund -------------------------------------
git tag -d v0.9.0 >/dev/null
git tag -a v0.9.0 "$C" -m "Nachtrag: Sicherheitsfix fuer Geraete auf 0.8.x"
"$PRUEFER" v0.9.0 origin/main >/dev/null 2>&1
pruefe "derselbe Tag, als Nachtrag erklaert" 0 $?

# Ein annotierter Tag OHNE die Zeile bleibt rot -- sonst reichte die Bauform
# als Ausrede, und die kostet einen Tastendruck.
git tag -d v0.9.0 >/dev/null
git tag -a v0.9.0 "$C" -m "irgendein Text ohne das Wort"
"$PRUEFER" v0.9.0 origin/main >/dev/null 2>&1
pruefe "annotiert, aber ohne Nachtrag-Zeile" 1 $?
git tag -d v0.9.0 >/dev/null

# --- Regel 1: nicht auf main ------------------------------------------------
git checkout -q -b seitenzweig "$B"
S="$(mach S)"
git checkout -q main
git tag v0.9.0 "$S"
"$PRUEFER" v0.9.0 origin/main >/dev/null 2>&1
pruefe "Tag auf einem nie gemergten Zweig" 1 $?
git tag -d v0.9.0 >/dev/null

# --- Regel 2: hinter dem Vorgaenger -----------------------------------------
# v0.8.0 steht auf B; ein v1.0.0 auf A wuerde B zuruecknehmen. Es sitzt
# ausserdem hinter der Spitze -- geprueft wird trotzdem Regel 2, denn sie
# laeuft vorher, und ihre Meldung ist die, die den Fehler erklaert.
git tag v1.0.0 "$A"
meldung="$("$PRUEFER" v1.0.0 origin/main 2>&1)"
pruefe "Tag vor seinem Vorgaenger" 1 $?
case "$meldung" in
  *"Vorgaenger v0.8.0"*) echo "gruen  die Meldung nennt v0.8.0" ;;
  *) echo "ROT    die Meldung nennt den Vorgaenger nicht:"; echo "$meldung" | sed 's/^/       /'
     fehler=$((fehler + 1)) ;;
esac
git tag -d v1.0.0 >/dev/null

# --- Der erste Tag ueberhaupt hat keinen Vorgaenger -------------------------
git tag -d v0.8.0 >/dev/null
git tag v0.1.0 "$D"
"$PRUEFER" v0.1.0 origin/main >/dev/null 2>&1
pruefe "erster Tag, kein Vorgaenger" 0 $?

echo
if [ "$fehler" -eq 0 ]; then
  echo "Alles gruen."
else
  echo "$fehler Frage(n) rot."
fi
exit $((fehler > 0))
