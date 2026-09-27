#!/bin/bash
# =============================================================================
# sicherung-waehrend-schreiben.sh — wer waehrend der Sicherung schreibt, laesst
# sie nicht scheitern (J35, 27.09.2026).
#
# Am 27.09.2026 um 05:21 schrieb der Abgleich eines Rechners knapp tausend
# Dateien in den Firmenordner, waehrend `backup-service` neu startete und
# sicherte. GNU tar endete mit 1 ("file changed as we read it"), `backup.sh`
# las das als "Archiv liess sich nicht anlegen", der Healthcheck fiel und der
# Deploy von PR 801 rollte zurueck.
#
# Der Test schneidet `sichere_ordner` aus `backup.sh` (wie rollback-meldung.sh
# die Funktion aus deploy-local.sh), legt `/backups` in einen Wegwerfordner um
# und sichert einen Baum, in den waehrenddessen tausend Dateien geschrieben,
# einige vorhandene umgeschrieben und eine geloescht werden. Er verlangt:
#   1. die Sicherung gelingt (ARCHIV_STATUS=true),
#   2. jede Datei, die VOR dem Lauf da war und nicht angefasst wurde, kommt
#      Byte fuer Byte aus dem Archiv zurueck,
#   3. die Liste der bewegten Dateien nennt, was waehrend des Laufs kam, und
#      nichts, was unberuehrt blieb,
#   4. ein echter Fehlschlag bleibt einer (Quelle nicht lesbar -> tar 2).
# Dazu: das Image bringt mit, was die Funktion braucht (findutils, jq).
#
# Braucht GNU tar und GNU find (die CI hat beide; am Mac ueber Homebrew:
# gnu-tar, findutils, coreutils -- der Test legt deren gnubin vorn in PATH).
#
# Aufruf: bash scripts/test/sicherung-waehrend-schreiben.sh
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QUELLE="$WURZEL/services/backup-service/backup.sh"
TMP="$(mktemp -d)"
SCHREIBER=""
trap '[ -n "$SCHREIBER" ] && kill "$SCHREIBER" 2>/dev/null; chmod -R u+rwx "$TMP" 2>/dev/null; rm -rf "$TMP"' EXIT
[ -n "${BEHALTEN:-}" ] && trap - EXIT && echo "TMP=$TMP"

for gnu in gnu-tar findutils coreutils; do
  [ -d "/opt/homebrew/opt/$gnu/libexec/gnubin" ] && PATH="/opt/homebrew/opt/$gnu/libexec/gnubin:$PATH"
done
if ! grep -q GNU <<<"$(tar --version 2>/dev/null)" || ! grep -q GNU <<<"$(find --version 2>/dev/null)"; then
  echo "FEHLT: GNU tar und GNU find (am Mac: brew install gnu-tar findutils coreutils)"
  exit 1
fi

FEHLER=0
ok() { printf '   ok    %s\n' "$1"; }
fehlt() { printf '   FEHLT %s\n' "$1"; FEHLER=1; }

echo "Sicherung haelt Schreiben aus"

# Das Image: ohne findutils kennt `find` kein -cnewer, ohne jq kein Bericht.
for paket in findutils jq; do
  if grep -qE "^[[:space:]]+${paket}( |\\\\|$)" "$WURZEL/services/backup-service/Dockerfile"; then
    ok "Image bringt ${paket} mit"
  else
    fehlt "Image bringt ${paket} mit"
  fi
done

# Die Funktion herausschneiden und /backups in den Wegwerfordner legen.
FUNKTION="$TMP/funktion.sh"
sed -n '/^sichere_ordner() {/,/^}/p' "$QUELLE" | sed "s#/backups#$TMP/backups#g" >"$FUNKTION"
if ! grep -q 'ARCHIV_GEAENDERT' "$FUNKTION"; then
  fehlt "sichere_ordner steht in backup.sh und fuehrt ARCHIV_GEAENDERT"
  exit 1
fi
mkdir -p "$TMP/backups"

# Ein Baum, gross genug, dass tar eine Weile daran liest: 3000 Dateien zu
# je 8 KiB Zufall (gzip verdichtet Zufall nicht, das kostet Zeit).
BAUM="$TMP/firmenordner"
mkdir -p "$BAUM/vorher" "$BAUM/.oc-nodes"
for i in $(seq 1 30); do
  mkdir -p "$BAUM/vorher/ordner$i"
  for j in $(seq 1 100); do
    head -c 8192 /dev/urandom >"$BAUM/vorher/ordner$i/datei$j.bin"
  done
done
echo "Regel" >"$BAUM/umgeschrieben.txt"
echo "weg" >"$BAUM/geloescht.txt"
(cd "$BAUM" && find . -type f ! -name umgeschrieben.txt ! -name geloescht.txt -print0 | xargs -0 sha256sum | sort -k2) >"$TMP/vorher.sha"

lauf() { # name quelle -> setzt ARCHIV_STATUS, ARCHIV_GEAENDERT, liefert Rueckgabe
  (
    # Die Umgebung, die backup.sh der Funktion vorher setzt.
    # shellcheck disable=SC2034
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)_$1
    # shellcheck disable=SC2034
    DAY_OF_WEEK=1
    # shellcheck disable=SC2034
    DAY_OF_MONTH=15
    BACKUP_OK=true
    encrypt_file() { return 0; }
    # shellcheck disable=SC1090
    source "$FUNKTION"
    sichere_ordner "$1" "$2"
    rc=$?
    printf '%s\n' "$ARCHIV_STATUS" >"$TMP/$1.status"
    printf '%s\n' "$ARCHIV_GEAENDERT" >"$TMP/$1.geaendert"
    printf '%s\n' "$BACKUP_OK" >"$TMP/$1.ok"
    exit $rc
  )
}

# Der Schreiber: tausend Dateien in einen Bereich mit Stempel, dazwischen eine
# vorhandene Datei umschreiben und eine loeschen -- waehrend tar liest. Ob tar
# dabei wirklich etwas sich bewegen sieht, haengt am Takt; der Lauf zaehlt nur,
# wenn tar mit 1 endete (das ist der Fall vom 27.09.2026), sonst wird er
# wiederholt, hoechstens fuenfmal.
STEMPEL=""
HERGESTELLT=0
for versuch in 1 2 3 4 5; do
  rm -rf "$TMP/backups/firmenordner" "$BAUM"/wegwerf-*
  echo "Regel" >"$BAUM/umgeschrieben.txt"
  echo "weg" >"$BAUM/geloescht.txt"
  STEMPEL="wegwerf-$(date +%s)-$versuch"
  mkdir -p "$BAUM/$STEMPEL"
  (
    for n in $(seq 1 1000); do
      head -c 2048 /dev/urandom >"$BAUM/$STEMPEL/neu$n.bin"
      [ "$n" = 200 ] && echo "Regel, geaendert" >>"$BAUM/umgeschrieben.txt"
      [ "$n" = 400 ] && rm -f "$BAUM/geloescht.txt"
    done
  ) &
  SCHREIBER=$!
  lauf firmenordner "$BAUM" >"$TMP/lauf.log" 2>&1
  RC=$?
  wait "$SCHREIBER" 2>/dev/null
  SCHREIBER=""
  LAUF="$(cat "$TMP/lauf.log")"
  if [[ "$LAUF" == *"tar 1)"* || "$LAUF" == *ERROR* ]]; then
    HERGESTELLT=1
    break
  fi
done

if [ "$HERGESTELLT" = 1 ]; then
  ok "der Fall ist hergestellt: tar sah waehrend des Lesens Dateien sich bewegen (Versuch ${versuch})"
else
  fehlt "der Fall ist hergestellt (fuenfmal las tar schneller, als geschrieben wurde)"
fi
if [ "$RC" = 0 ] && [ "$(cat "$TMP/firmenordner.status")" = true ] && [ "$(cat "$TMP/firmenordner.ok")" = true ]; then
  ok "Sicherung gelingt, obwohl waehrenddessen geschrieben wird"
else
  fehlt "Sicherung gelingt, obwohl waehrenddessen geschrieben wird (rc ${RC}, $(cat "$TMP/firmenordner.status" 2>/dev/null))"
  sed 's/^/      /' "$TMP/lauf.log"
fi

ARCHIV=""
for kandidat in "$TMP"/backups/firmenordner/firmenordner_*.tar.gz; do
  [ -L "$kandidat" ] || [ ! -f "$kandidat" ] || ARCHIV="$kandidat"
done
if [ -n "$ARCHIV" ]; then
  mkdir -p "$TMP/zurueck"
  tar -xzf "$ARCHIV" -C "$TMP/zurueck"
  if (cd "$TMP/zurueck" && sha256sum --quiet -c "$TMP/vorher.sha") >/dev/null 2>&1; then
    ok "jede Datei von vorher kommt Byte fuer Byte zurueck ($(wc -l <"$TMP/vorher.sha"))"
  else
    fehlt "jede Datei von vorher kommt Byte fuer Byte zurueck"
    (cd "$TMP/zurueck" && sha256sum --quiet -c "$TMP/vorher.sha" 2>&1 | head -5 | sed 's/^/      /')
  fi
else
  fehlt "ein Archiv liegt da"
fi

GEAENDERT="$(cat "$TMP/firmenordner.geaendert")"
# Was waehrend tar las geschrieben wurde, muss in der Liste stehen. Wie viel
# davon es ist, haengt am Takt; dass es nicht null ist, beweist, dass dieser
# Lauf den Fall wirklich hergestellt hat -- sonst misst er nichts und muss das
# sagen, statt gruen zu werden.
AUS_DEM_STEMPEL=$(grep -c "^./$STEMPEL/neu" <<<"$GEAENDERT")
if [ "$AUS_DEM_STEMPEL" -gt 0 ]; then
  ok "der Bericht nennt, was waehrend des Laufs kam (${AUS_DEM_STEMPEL} von 1000 aus dem Stempelbereich)"
else
  fehlt "der Bericht nennt, was waehrend des Laufs kam (keine Datei des Schreibers in der Liste -- lief er waehrend tar las?)"
fi
if grep -q '^./vorher/' <<<"$GEAENDERT"; then
  fehlt "unberuehrte Dateien stehen nicht in der Liste"
else
  ok "unberuehrte Dateien stehen nicht in der Liste"
fi

# Ein echter Fehlschlag bleibt einer: eine Quelle, die tar nicht lesen kann,
# ist tar 2 und kein "hat sich bewegt". Als root liest tar alles -- dann ist
# dieser Fall hier nicht herstellbar und wird uebersprungen.
if [ "$(id -u)" != 0 ]; then
  KAPUTT="$TMP/kaputt"
  mkdir -p "$KAPUTT/gesperrt"
  echo x >"$KAPUTT/gesperrt/datei"
  chmod 000 "$KAPUTT/gesperrt"
  lauf kaputt "$KAPUTT" >"$TMP/kaputt.log" 2>&1
  if [ "$(cat "$TMP/kaputt.status")" = false ] && [ "$(cat "$TMP/kaputt.ok")" = false ] &&
    grep -q '(tar 2)' "$TMP/kaputt.log"; then
    ok "eine unlesbare Quelle bleibt ein Fehlschlag (tar 2)"
  else
    fehlt "eine unlesbare Quelle bleibt ein Fehlschlag (tar 2)"
    sed 's/^/      /' "$TMP/kaputt.log"
  fi
  chmod 755 "$KAPUTT/gesperrt"
else
  echo "   --    unlesbare Quelle: als root nicht herstellbar"
fi

[ "$FEHLER" = 0 ] && echo "gruen" || echo "ROT"
exit "$FEHLER"
