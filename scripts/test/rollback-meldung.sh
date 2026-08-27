#!/bin/bash
# =============================================================================
# rollback-meldung.sh — der Rollback sagt die Wahrheit ueber sich selbst.
#
# Bis zum 23.08.2026 meldete `rollback()` in deploy-local.sh unbedingt
# "Produktivstand wiederhergestellt", auch wenn jeder seiner Schritte an
# `|| true` gescheitert war. Auf dem kritischsten Pfad des Geraets las der
# Betreiber damit einen Erfolg, waehrend der kaputte Stand weiterlief.
#
# Der Test schneidet die Funktion aus dem Skript, ersetzt docker, compose und
# git durch Attrappen und sieht nach, was sie sagt. Zwei Faelle: alles klappt,
# und `git reset` scheitert.
#
# Aufruf: bash scripts/test/rollback-meldung.sh
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QUELLE="$WURZEL/scripts/deploy/deploy-local.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FEHLER=0
pruefe() { # name, erwartet-im-text, tatsaechlicher-text
  if grep -qi -- "$2" <<<"$3"; then
    printf '   ok    %s\n' "$1"
  else
    printf '   FEHLT %s\n      erwartet: %s\n      bekommen: %s\n' "$1" "$2" "$(printf '%s' "$3" | tr '\n' ' ')"
    FEHLER=1
  fi
}
nicht() { # name, verboten-im-text, tatsaechlicher-text
  if grep -qi -- "$2" <<<"$3"; then
    printf '   FEHLT %s\n      verboten: %s\n' "$1" "$2"
    FEHLER=1
  else
    printf '   ok    %s\n' "$1"
  fi
}

# Die Funktion herausschneiden, von ihrer Zeile bis zur schliessenden Klammer.
sed -n '/^rollback() {/,/^}/p' "$QUELLE" > "$TMP/rollback.sh"
if [ ! -s "$TMP/rollback.sh" ]; then
  echo "   FEHLT rollback() nicht in $QUELLE gefunden"
  exit 1
fi

# Der Vorspann steht in EINEM Heredoc ohne Ersetzung ('INNEN' in
# Anfuehrungszeichen), sonst zerlegt die Shell `declare -A` und die Arrays.
# Der Rueckgabewert von `git` kommt ueber die Umgebung herein.
#
# Die beiden SHAs sind absichtlich verschieden. PREV_SHA kommt von GitHub und
# sagt, was gebaut werden muss; GERAET_SHA ist der Stand, aus dem die laufenden
# Images gebaut wurden. Am 24.08.2026 fielen sie auseinander, und der Rollback
# setzte git auf den falschen von beiden. `git` gibt hier seine Argumente aus,
# damit der Test sieht, WOHIN zurueckgesetzt wird.
cat > "$TMP/vorspann.sh" <<'INNEN'
set -uo pipefail
PROJECT=test
PREV_SHA=aaaaaaaaaaaaaaaa_von_github
GERAET_SHA=bbbbbbbbbbbbbbbb_vom_geraet
SERVICES=(backend)
declare -A HAD_IMAGE
HAD_IMAGE[backend]=1
COMPOSE=(true)
err() { echo "ERR $*"; }
summary() { echo "SUMMARY $*"; }
docker() { return 0; }
git() { echo "GIT $*"; return "${GIT_ERFOLG:-0}"; }
exit() { return 0; }
INNEN

lauf() { # git_erfolg (0/1)
  cat "$TMP/vorspann.sh" "$TMP/rollback.sh" > "$TMP/lauf.sh"
  echo 'rollback' >> "$TMP/lauf.sh"
  GIT_ERFOLG="$1" bash "$TMP/lauf.sh" 2>&1
}

# `deploy-local.sh` benutzt `declare -A`, das braucht bash 4. macOS liefert 3.2
# aus. Statt still durchzugehen sagt der Test das und geht mit 0 raus: in der
# CI (Ubuntu) und auf dem Geraet laeuft er wirklich.
if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
  echo "   uebersprungen: bash ${BASH_VERSION} kann kein 'declare -A' (Test braucht bash 4+)"
  echo "   Rollback-Meldung: nicht geprueft"
  exit 0
fi

echo "-> Rollback-Meldung"
AUS_OK="$(lauf 0)"
pruefe "alles geklappt: meldet Wiederherstellung" "wiederhergestellt" "$AUS_OK"
nicht "alles geklappt: kein Wort von unvollstaendig" "UNVOLLSTAENDIG" "$AUS_OK"

AUS_ROT="$(lauf 1)"
pruefe "git reset gescheitert: meldet UNVOLLSTAENDIG" "UNVOLLSTAENDIG" "$AUS_ROT"
pruefe "git reset gescheitert: nennt den Schritt" "git reset" "$AUS_ROT"
nicht "git reset gescheitert: behauptet KEINE Wiederherstellung" "Produktivstand wiederhergestellt" "$AUS_ROT"

# Der Gleichlauf zwischen git und Abbild. Bis zum 24.08.2026 setzte der
# Rollback git auf PREV_SHA — den Stand von GitHub — waehrend er die Images auf
# den Stand des GERAETS zuruecktaggte. Nach zwei fehlgeschlagenen Deploys
# hintereinander sind das zwei verschiedene Staende, und das Geraet behauptet
# danach einen Stand, den es nicht faehrt.
pruefe "Gleichlauf: setzt git auf den Stand der Images" "GIT reset --hard bbbbbbbbbbbbbbbb_vom_geraet" "$AUS_OK"
nicht "Gleichlauf: setzt git NICHT auf den GitHub-Stand" "reset --hard aaaaaaaaaaaaaaaa_von_github" "$AUS_OK"
pruefe "Gleichlauf: die Meldung nennt den Stand der Images" "bbbbbbbbbbbbbbbb_vom_geraet" "$AUS_OK"

if [ "$FEHLER" = "0" ]; then
  echo "   Rollback-Meldung: in Ordnung"
else
  echo "   Rollback-Meldung: FEHLGESCHLAGEN"
fi
exit "$FEHLER"
