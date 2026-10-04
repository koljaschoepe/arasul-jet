#!/bin/bash
# =============================================================================
# sicherung-zurueckholen.sh — einen Stand zurueckholen, ohne Geraet (M5)
# =============================================================================
# Prueft mit echtem restic und echtem rsync an Wegwerfordnern, was das
# Zurueckholen einer App oder eines Bereichs im Sicherungs-Container braucht
# (Auftrag sicherung-zurueckholen, 04.10.2026). Was am Orin gemessen wird,
# steht in scripts/test/sicherung-zurueckholen-abnahme.sh.
#
#   1. Je Stand steht fest, was darin ist: Apps, App-Datenbanken, Bereiche des
#      Firmenordners (`stand_inhalt`), ohne die Verwaltung des Dateidienstes.
#      `stand_liste_mit_inhalt` uebernimmt, was es schon weiss.
#   2. Ein Stand vor dem Zurueckholen traegt `vorher` und `fuer:…` und
#      ueberlebt die Aufbewahrung, auch wenn am selben Tag ein spaeterer
#      Stand entsteht (ohne den Tag fiele er: Gegenprobe).
#   3. `wiederherstellen.sh --firmenordner-bereich` holt GENAU EINEN Bereich
#      auf Stand A: geaenderte Datei (gleiche Groesse, alte mtime) bekommt den
#      alten Inhalt an Ort und Stelle (gleiche Knotennummer), was seitdem
#      dazukam, geht, was fehlt, kommt wieder. `.oc-nodes`, `.oc-tmp` und
#      `.Trash` des laufenden Dienstes bleiben, ein anderer Bereich bleibt.
#   4. Mit Stand B (dem Stand davor) wird dasselbe Zurueckholen rueckgaengig.
#   5. Abgewiesen: eine Kennung, die ein Pfad ist; ein Bereich, der nicht im
#      Stand steht; ein Bereich, den es am Geraet nicht gibt. `--probe`
#      fasst nichts an.
#
# Braucht restic (>= 0.16), rsync (GNU, nicht openrsync), jq, GNU find/stat.
# Am Mac: brew install restic rsync jq findutils coreutils
#
# Aufruf: bash scripts/test/sicherung-zurueckholen.sh   (BEHALTEN=1 laesst TMP stehen)
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIENST="$WURZEL/services/backup-service"

for gnu in findutils coreutils gnu-tar; do
  [ -d "/opt/homebrew/opt/$gnu/libexec/gnubin" ] && PATH="/opt/homebrew/opt/$gnu/libexec/gnubin:$PATH"
done
[ -x /opt/homebrew/bin/rsync ] && PATH="/opt/homebrew/bin:$PATH"
for werkzeug in restic rsync jq sha256sum; do
  if ! command -v "$werkzeug" >/dev/null 2>&1; then
    echo "FEHLT: $werkzeug"
    exit 1
  fi
done
if grep -qi openrsync <<<"$(rsync --version 2>&1)"; then
  echo "FEHLT: GNU rsync (openrsync kennt --inplace/--itemize-changes nicht; am Mac: brew install rsync)"
  # Am Arbeitsrechner ein Hinweis, in der CI ein Fehlschlag.
  [ -n "${CI:-}" ] && exit 1
  exit 0
fi

TMP="$(mktemp -d)"
aufraeumen() { chmod -R u+rwx "$TMP" 2>/dev/null; rm -rf "$TMP"; }
trap aufraeumen EXIT
[ -n "${BEHALTEN:-}" ] && trap - EXIT && echo "TMP=$TMP"

gruen=0
rot=0
pruefe() {
  if [ "$2" = ja ]; then
    gruen=$((gruen + 1))
    printf 'gruen  %s%s\n' "$1" "${3:+  ($3)}"
  else
    rot=$((rot + 1))
    printf 'ROT    %s%s\n' "$1" "${3:+  ($3)}"
  fi
}
ja() { if "$@"; then echo ja; else echo nein; fi; }

# Die Wege, die im Container /arasul/... heissen, liegen hier unter TMP.
export TZ=UTC
export BACKUP_DIR="$TMP/backups"
export BACKUP_STAND_CACHE="$TMP/cache"
export BACKUP_ENCRYPT_KEY_FILE="$TMP/schluessel"
export APPS_BACKUP_DIR="$TMP/arasul/apps"
export FIRMENORDNER_BACKUP_DIR="$TMP/arasul/firmenordner"
export FLOWS_BACKUP_DIR="$TMP/arasul/flows"
export BACKUP_STAND_DB_QUELLE="$TMP/arasul/datenbank"
export STAENDE_SKRIPT="$DIENST/staende.sh"
mkdir -p "$BACKUP_DIR"
head -c 20 /dev/urandom | base32 | tr -d '=\n' >"$BACKUP_ENCRYPT_KEY_FILE"
# shellcheck source=../../services/backup-service/staende.sh
source "$DIENST/staende.sh"
S="$BACKUP_ENCRYPT_KEY_FILE"
REPO="$(stand_repo "$BACKUP_DIR" "$S")"

echo "Zurueckholen aus einem Stand (restic $(restic version | awk '{print $2}'), $(rsync --version | head -n1))"

# --- Die Quelle, wie sie am Geraet aussieht -------------------------------------
P="$FIRMENORDNER_BACKUP_DIR/posix/projects"
mkdir -p "$APPS_BACKUP_DIR/demo/1.0.0" "$APPS_BACKUP_DIR/.eingang" "$BACKUP_STAND_DB_QUELLE/apps" \
  "$P/probe/sub" "$P/probe/.oc-nodes" "$P/probe/.oc-tmp" "$P/probe/.Trash/files" "$P/fremd" "$FLOWS_BACKUP_DIR"
echo '{"id":"demo"}' >"$APPS_BACKUP_DIR/demo/app.json"
echo 'select 1;' >"$BACKUP_STAND_DB_QUELLE/arasul_db.sql"
echo 'select 2;' >"$BACKUP_STAND_DB_QUELLE/apps/arasul_app_demo_test.sql"
echo 'Stand A: Angebot an Mueller' >"$P/probe/angebot.txt"
echo 'Stand A: Notiz' >"$P/probe/sub/notiz.txt"
echo 'Knoten A' >"$P/probe/.oc-nodes/knoten"
echo 'Fremder Bereich, A' >"$P/fremd/liste.txt"
QUELLEN=("$BACKUP_STAND_DB_QUELLE" "$APPS_BACKUP_DIR" "$FLOWS_BACKUP_DIR" "$FIRMENORDNER_BACKUP_DIR")

# Die Nacht davor, damit die Aufbewahrung unten einen aelteren Tag hat (seit
# restic 0.17 bleibt der aelteste Stand ohnehin stehen).
STAND_ZEIT="2026-09-30 02:00:00"
stand_sichern "$REPO" "$S" "${QUELLEN[@]}"
ID_0="$STAND_ID"
STAND_ZEIT="2026-10-01 01:00:00"
stand_sichern "$REPO" "$S" "${QUELLEN[@]}"
ID_A="$STAND_ID"
pruefe "Stand A steht" "$(ja [ -n "$ID_A" ])" "${STAND_FEHLER:-${ID_A:0:8}}"

# --- 1. Was im Stand steht ----------------------------------------------------------
INHALT="$(stand_inhalt "$REPO" "$S" "$ID_A")"
pruefe "Inhalt: die App (ohne .eingang)" "$(ja [ "$(jq -c '.apps' <<<"$INHALT")" = '["demo"]' ])" "$(jq -c '.apps' <<<"$INHALT")"
pruefe "Inhalt: ihre Datenbank" "$(ja [ "$(jq -c '.app_datenbanken' <<<"$INHALT")" = '["arasul_app_demo_test"]' ])" "$(jq -c '.app_datenbanken' <<<"$INHALT")"
pruefe "Inhalt: die Bereiche, ohne die Verwaltung des Dienstes" "$(ja [ "$(jq -c '.bereiche' <<<"$INHALT")" = '["fremd","probe"]' ])" "$(jq -c '.bereiche' <<<"$INHALT")"

# --- 2. Der Stand davor, und die Aufbewahrung ----------------------------------------
# Was nach A geschah: eine Datei gleich gross mit alter mtime geaendert, eine
# neue, eine weg; der Dienst schreibt in seine Verwaltung; ein anderer Bereich
# aendert sich auch.
INODE_VORHER=$(stat -c %i "$P/probe/angebot.txt")
MTIME_VORHER=$(stat -c %Y "$P/probe/angebot.txt")
echo 'Stand B: Angebot an Meier!' >"$P/probe/angebot.txt"
touch -d "@$MTIME_VORHER" "$P/probe/angebot.txt"
INODE_B=$(stat -c %i "$P/probe/angebot.txt")
echo 'erst nach A' >"$P/probe/neu.txt"
rm -f "$P/probe/sub/notiz.txt"
echo 'Knoten B' >"$P/probe/.oc-nodes/knoten"
echo 'halber Upload' >"$P/probe/.oc-tmp/upload"
echo 'weggeworfen' >"$P/probe/.Trash/files/alt.txt"
echo 'Fremder Bereich, B' >"$P/fremd/liste.txt"
baum() { (cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum); }
baum "$P/probe" >"$TMP/b.sha"

STAND_ZEIT="2026-10-01 13:00:00"
STAND_EXTRA_TAGS=(vorher "fuer:bereich:probe")
stand_sichern "$REPO" "$S" "${QUELLEN[@]}"
ID_B="$STAND_ID"
STAND_EXTRA_TAGS=()
STAND_ZEIT="2026-10-01 20:00:00"
stand_sichern "$REPO" "$S" "${QUELLEN[@]}"
ID_C="$STAND_ID"
# Fuenf Naechte danach: die fuenf neuesten bleiben ohnehin (--keep-last 5),
# davor gilt nur noch 7/12/60.
NAECHTE=""
for t in 02 03 04 05 06; do
  STAND_ZEIT="2026-10-$t 02:00:00"
  stand_sichern "$REPO" "$S" "${QUELLEN[@]}"
  NAECHTE+=" $STAND_ID"
done
LISTE="$(stand_liste "$REPO" "$S")"
pruefe "der Stand davor traegt vorher und wofuer" \
  "$(ja [ "$(jq -c --arg id "$ID_B" '.[] | select(.id == $id) | [.vorher, .fuer]' <<<"$LISTE")" = '[true,"bereich:probe"]' ])" \
  "$(jq -c '[.[] | [.kurz, .vorher, .fuer]]' <<<"$LISTE")"
stand_aufbewahren "$REPO" "$S"
NACH="$(stand_liste "$REPO" "$S" | jq -r '[.[].id] | join(" ")')"
pruefe "Aufbewahrung: drei Staende eines alten Tages -- der davor bleibt, der neueste bleibt" \
  "$(ja [ "$NACH" = "$ID_0 $ID_B $ID_C$NAECHTE" ])" "$(stand_liste "$REPO" "$S" | jq -c '[.[].kurz]')"
GEGEN="$TMP/gegen"
stand_anlegen "$GEGEN" "$S"
for z in "2026-09-30 02:00:00" "2026-10-01 01:00:00" "2026-10-01 13:00:00" "2026-10-01 20:00:00" \
         "2026-10-02 02:00:00" "2026-10-03 02:00:00" "2026-10-04 02:00:00" "2026-10-05 02:00:00" "2026-10-06 02:00:00"; do
  STAND_ZEIT="$z"; stand_sichern "$GEGEN" "$S" "$FLOWS_BACKUP_DIR" >/dev/null
done
stand_aufbewahren "$GEGEN" "$S"
pruefe "Gegenprobe: ohne den Tag bliebe von dem Tag nur einer" \
  "$(ja [ "$(stand_liste "$GEGEN" "$S" | jq 'length')" = 7 ])" "$(stand_liste "$GEGEN" "$S" | jq -c '[.[].zeit[0:16]]')"
# Von Hand an einem Tag zweimal gesichert (A, aendern, B): beide bleiben, als
# zwei der fuenf neuesten -- am Orin fiel A sonst sofort.
FRISCH="$TMP/frisch"
stand_anlegen "$FRISCH" "$S"
for z in "2026-10-04 02:00:00" "2026-10-04 10:00:00" "2026-10-04 11:00:00"; do
  STAND_ZEIT="$z"; stand_sichern "$FRISCH" "$S" "$FLOWS_BACKUP_DIR" >/dev/null
done
stand_aufbewahren "$FRISCH" "$S"
pruefe "zwei Staende von Hand an einem Tag: beide bleiben (die fuenf neuesten immer)" \
  "$(ja [ "$(stand_liste "$FRISCH" "$S" | jq 'length')" = 3 ])" "$(stand_liste "$FRISCH" "$S" | jq -c '[.[].zeit[11:16]]')"
# Sechs Staende davor an einem Tag (sechsmal live geschaltet, M5): sie
# verdraengen weder die Nacht dieses Tages noch die fuenf neuesten Naechte.
# Mit `--group-by ''` fiel die Nacht vom 04.10. (nicht unter den fuenf
# neuesten, nicht der neueste Stand ihres Tages).
VIELE="$TMP/viele"
stand_anlegen "$VIELE" "$S"
for z in "2026-09-29 02:00:00" "2026-09-30 02:00:00" "2026-10-01 02:00:00" "2026-10-02 02:00:00" \
         "2026-10-03 02:00:00" "2026-10-04 02:00:00"; do
  STAND_ZEIT="$z"; stand_sichern "$VIELE" "$S" "$FLOWS_BACKUP_DIR" >/dev/null
done
NAECHTE_VIELE="$(stand_liste "$VIELE" "$S" | jq -r '[.[].id] | join(" ")')"
STAND_EXTRA_TAGS=(vorher "fuer:live:probe")
for h in 10 11 12 13 14 15; do
  STAND_ZEIT="2026-10-04 $h:00:00"; stand_sichern "$VIELE" "$S" "$FLOWS_BACKUP_DIR" >/dev/null
done
STAND_EXTRA_TAGS=()
stand_aufbewahren "$VIELE" "$S"
NACH_VIELE="$(stand_liste "$VIELE" "$S" | jq -r '[.[] | select(.vorher | not) | .id] | join(" ")')"
pruefe "sechs Staende vor dem Live-Schalten an einem Tag: keine Nacht faellt" \
  "$(ja [ "$NACH_VIELE" = "$NAECHTE_VIELE" ] && [ "$(stand_liste "$VIELE" "$S" | jq '[.[] | select(.vorher)] | length')" = 6 ])" \
  "$(stand_liste "$VIELE" "$S" | jq -c '[.[] | [.zeit[5:13], .vorher]]')"
unset STAND_ZEIT

# Die Liste mit Inhalt: was sie schon weiss, fragt sie nicht noch einmal.
MIT="$(stand_liste_mit_inhalt "$REPO" "$S")"
pruefe "jeder Stand mit Inhalt" "$(ja [ "$(jq '[.[] | select(.inhalt.bereiche != ["fremd","probe"])] | length' <<<"$MIT")" = 0 ] && [ "$(jq length <<<"$MIT")" = 8 ])"
ALT="$(jq -c --arg id "$ID_B" 'map(if .id == $id then .inhalt = {apps:["gemerkt"],app_datenbanken:[],bereiche:[]} else . end)' <<<"$MIT")"
pruefe "was die vorige Liste wusste, wird uebernommen" \
  "$(ja [ "$(stand_liste_mit_inhalt "$REPO" "$S" "$ALT" | jq -r --arg id "$ID_B" '.[] | select(.id == $id) | .inhalt.apps[0]')" = gemerkt ])"

# --- 3. Einen Bereich auf Stand A ------------------------------------------------------
# Stand A gibt es nach der Aufbewahrung nicht mehr; neu angelegt aus seinem Abdruck
# (dieselben Dateien) -- so steht das Zurueckholen auf einem Stand, der lebt.
cp -a "$P/probe/.oc-nodes/knoten" "$TMP/knoten-b"
B_INHALT="$(cat "$P/probe/angebot.txt")"
echo 'Stand A: Angebot an Mueller' >"$P/probe/angebot.txt"; touch -d "@$MTIME_VORHER" "$P/probe/angebot.txt"
echo 'Stand A: Notiz' >"$P/probe/sub/notiz.txt" && mv "$P/probe/neu.txt" "$TMP/neu.txt"
echo 'Fremder Bereich, A' >"$P/fremd/liste.txt"
STAND_ZEIT="2026-10-05 01:00:00"
stand_sichern "$REPO" "$S" "${QUELLEN[@]}"
ID_A2="$STAND_ID"
unset STAND_ZEIT
# Zurueck auf den Zustand B, als waere seitdem nichts geschehen.
printf '%s\n' "$B_INHALT" >"$P/probe/angebot.txt"; touch -d "@$MTIME_VORHER" "$P/probe/angebot.txt"
mv "$TMP/neu.txt" "$P/probe/neu.txt"; rm -f "$P/probe/sub/notiz.txt"
echo 'Fremder Bereich, B' >"$P/fremd/liste.txt"
pruefe "Ausgangslage B hergestellt" "$(ja diff -q <(baum "$P/probe") "$TMP/b.sha")"
INODE_B=$(stat -c %i "$P/probe/angebot.txt")
FREMD_VORHER="$(sha256sum <"$P/fremd/liste.txt")"

bash "$DIENST/wiederherstellen.sh" --firmenordner-bereich probe --stand "${ID_A2:0:8}" --probe >"$TMP/probe.log" 2>&1
RC=$?
pruefe "--probe liest den Bereich und fasst nichts an" \
  "$(ja [ "$RC" = 0 ] && diff -q <(baum "$P/probe") "$TMP/b.sha" >/dev/null)" "$(tail -n1 "$TMP/probe.log" | sed 's/^\[[^]]*\] //')"

bash "$DIENST/wiederherstellen.sh" --firmenordner-bereich probe --stand "${ID_A2:0:8}" >"$TMP/a.log" 2>&1
RC=$?
pruefe "Bereich auf Stand A zurueckgeholt" "$(ja [ "$RC" = 0 ])" "$(grep '^ERGEBNIS' "$TMP/a.log")"
[ "$RC" = 0 ] || tail -n 8 "$TMP/a.log" | sed 's/^/      /'
pruefe "... die geaenderte Datei hat den Inhalt von A (gleiche Groesse, alte mtime)" \
  "$(ja [ "$(cat "$P/probe/angebot.txt")" = 'Stand A: Angebot an Mueller' ])"
pruefe "... an Ort und Stelle (dieselbe Knotennummer, die Kennung im Dienst bleibt)" \
  "$(ja [ "$(stat -c %i "$P/probe/angebot.txt")" = "$INODE_B" ])"
pruefe "... was nach A dazukam, ist weg" "$(ja [ ! -e "$P/probe/neu.txt" ])"
pruefe "... was nach A fehlte, ist wieder da" "$(ja [ "$(cat "$P/probe/sub/notiz.txt" 2>/dev/null)" = 'Stand A: Notiz' ])"
pruefe "... die Verwaltung des Dienstes bleibt (.oc-nodes, .oc-tmp, .Trash)" \
  "$(ja cmp -s "$P/probe/.oc-nodes/knoten" "$TMP/knoten-b" && [ -f "$P/probe/.oc-tmp/upload" ] && [ -f "$P/probe/.Trash/files/alt.txt" ])"
pruefe "... und ein anderer Bereich bleibt, wie er ist" "$(ja [ "$(sha256sum <"$P/fremd/liste.txt")" = "$FREMD_VORHER" ])"
pruefe "die Zahlen in der Ausgabe: 2 Dateien zurueckgeschrieben (geaendert, fehlend), 1 entfernt" \
  "$(ja grep -q '^ERGEBNIS bereich=probe geschrieben=2 entfernt=1 ' "$TMP/a.log")" "$(grep '^ERGEBNIS' "$TMP/a.log")"
pruefe "kein Bereitstellungsordner bleibt liegen" "$(ja [ -z "$(find "$BACKUP_DIR" -maxdepth 1 -name '.zurueck.*')" ])"

# --- 4. Rueckgaengig: Stand B (der Stand davor) -----------------------------------------
bash "$DIENST/wiederherstellen.sh" --firmenordner-bereich probe --stand "$ID_B" >"$TMP/b.log" 2>&1
RC=$?
pruefe "rueckgaengig mit dem Stand davor: der Bereich ist wieder B" \
  "$(ja [ "$RC" = 0 ] && diff -q <(baum "$P/probe" | grep -v -e '/\.oc-' -e '/\.Trash/') <(grep -v -e '/\.oc-' -e '/\.Trash/' "$TMP/b.sha") >/dev/null)" "$(grep '^ERGEBNIS' "$TMP/b.log")"

# --- 5. Abgewiesen -----------------------------------------------------------------------
bash "$DIENST/wiederherstellen.sh" --firmenordner-bereich '../apps' --stand "$ID_B" >/dev/null 2>&1
pruefe "eine Kennung, die ein Pfad ist: abgewiesen (2)" "$(ja [ "$?" = 2 ])"
bash "$DIENST/wiederherstellen.sh" --firmenordner-bereich gibtsnicht --stand "$ID_B" >"$TMP/x.log" 2>&1
pruefe "ein Bereich, der nicht im Stand steht: abgewiesen" "$(ja [ "$?" = 1 ] && grep -q 'nicht in diesem Stand' "$TMP/x.log")"
mv "$P/fremd" "$TMP/fremd-weg"
bash "$DIENST/wiederherstellen.sh" --firmenordner-bereich fremd --stand "$ID_B" >"$TMP/y.log" 2>&1
pruefe "ein Bereich, den es am Geraet nicht gibt: abgewiesen, nichts angelegt" \
  "$(ja [ "$?" = 1 ] && [ ! -e "$P/fremd" ] && grep -q 'erst anlegen' "$TMP/y.log")"
mv "$TMP/fremd-weg" "$P/fremd"

# --- 6. Das Image bringt rsync mit ---------------------------------------------------------
pruefe "das Image installiert rsync" "$(ja grep -qE '^\s+rsync\s*$' "$DIENST/Dockerfile")"

echo
echo "gruen ${gruen}, rot ${rot}"
[ "$rot" = 0 ]
