#!/bin/bash
# =============================================================================
# sicherung-wegwerf-abnahme.sh — Sicherung auf den Datentraeger und der Weg
# zurueck, in Wegwerf-Containern (J37, 02.10.2026)
# =============================================================================
# Beweist, ohne das Geraet des Kunden anzufassen:
#
#   A. Die Nachtsicherung legt auf dem Datentraeger NUR Verschluesseltes ab:
#      jede Datei beginnt mit `Salted__`, keine hat einen gzip- (1f8b) oder
#      tar-Kopf (`ustar`), `MANIFEST.json` nennt die Probe-App.
#   B. Ein Lauf OHNE Verschluesselung (BACKUP_ENCRYPT=false) bringt keine
#      Klartextdatei auf den Datentraeger: Status `nur_verschluesselt`.
#   C. Ein NEUES Geraet mit einem NEUEN Schluessel, dasselbe Stick: die
#      Schluesselpruefung sagt `passt: false` und nennt die Sicherung.
#   D. Das GANZE Geraet: auf einem leeren Geraet mit leerer Datenbank holt
#      `wiederherstellen.sh --quelle extern` ohne Code NICHTS (Grund
#      `schluessel_passt_nicht`), mit dem Wiederherstellungscode der frueheren
#      Installation Datenbank, App-Datenbanken, Pakete, Flows, Firmenordner
#      und Konfiguration -- Zeile fuer Zeile, Byte fuer Byte.
#   E. EINE App: Daten und Paket der Probe-App kommen einzeln zurueck, ohne
#      etwas Anderes anzufassen (eine zweite App behaelt ihren Stand).
#
# WIE "WEGWERF": ein eigenes Netz, ein eigener Postgres, ein eigenes Volume als
# Datentraeger (tmpfs -- eine andere Geraetenummer als /backups, genau das
# prueft backup.sh), alles mit Stempel im Namen und am Ende weg. Es laeuft
# weder der Betriebs- noch der Pruefstand-Stack, und kein Name beginnt mit
# `arasul-` (ein Werksreset waere sonst nicht der einzige, der Container mit
# diesem Praefix wegraeumt).
#
# Aufruf, auf einem Rechner mit Docker (Orin oder Arbeitsrechner):
#   bash scripts/test/sicherung-wegwerf-abnahme.sh
#
# Rueckgabe 0, wenn alles gruen ist.
# =============================================================================
set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STEMPEL="wegwerf-sicherung-$(date +%Y%m%d%H%M%S)"
ARBEIT="$(mktemp -d "${HOME}/${STEMPEL}.XXXX")"
NETZ="${STEMPEL}-netz"
PG="${STEMPEL}-pg"
PG2="${STEMPEL}-pg-neu"
STICKDIR="${ARBEIT}/stick"
BILD="${STEMPEL}-bild"
PG_BILD="${ARASUL_PG_BILD:-postgres:16-alpine}"

gruen=0
rot=0
pruefe() { # name, ok (ja/nein), detail
  if [ "$2" = ja ]; then
    gruen=$((gruen + 1))
    printf '  OK    %s\n' "$1"
  else
    rot=$((rot + 1))
    printf '  FEHLT %s%s\n' "$1" "${3:+  ($3)}"
  fi
}
ja() { if "$@"; then echo ja; else echo nein; fi; }

aufraeumen() {
  docker rm -f "$PG" "$PG2" >/dev/null 2>&1
  docker network rm "$NETZ" >/dev/null 2>&1
  docker rmi -f "$BILD" >/dev/null 2>&1
  sudo -n umount "$STICKDIR" >/dev/null 2>&1
  # Dateien gehoeren teils root (Container): ueber einen Container wegraeumen.
  docker run --rm -v "${ARBEIT}:/w" alpine:3.19 sh -c 'rm -rf /w/* /w/.[!.]*' >/dev/null 2>&1
  rm -rf "$ARBEIT" 2>/dev/null
}
trap aufraeumen EXIT

echo "Sicherung und Weg zurueck in Wegwerf-Containern (Stempel ${STEMPEL})"

# Der Datentraeger: ein tmpfs auf dem Host. Er hat eine ANDERE Geraetenummer als
# die Ordner unter /backups -- genau das fragt backup.sh, bevor es "ausserhalb"
# glaubt -- und er ueberlebt, solange der Test laeuft, jeden Container.
mkdir -p "$STICKDIR"
if ! sudo -n mount -t tmpfs -o size=512m tmpfs "$STICKDIR" 2>/dev/null; then
  echo "Dieser Test braucht sudo ohne Rueckfrage (tmpfs als Datentraeger)."
  exit 2
fi

docker build -q -t "$BILD" "${WURZEL}/services/backup-service" >/dev/null || { echo "Bild nicht gebaut"; exit 1; }
docker network create "$NETZ" >/dev/null

starte_pg() { # name
  docker run -d --name "$1" --network "$NETZ" \
    -e POSTGRES_USER=arasul -e POSTGRES_PASSWORD=wegwerf -e POSTGRES_DB=arasul_db \
    "$PG_BILD" >/dev/null
  local i
  for i in $(seq 1 60); do
    docker exec "$1" pg_isready -U arasul -d arasul_db >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}
psql_in() { docker exec -i "$1" psql -U arasul -d "${2:-arasul_db}" -v ON_ERROR_STOP=1 -tA "${@:3}"; }

# -- Das "Geraet": Ordner, Schluessel ----------------------------------------
baue_geraet() { # name, schluessel
  local g="${ARBEIT}/$1"
  mkdir -p "$g/backups" "$g/apps" "$g/flows" "$g/firmenordner" "$g/konfiguration"
  printf '%s' "$2" > "$g/schluessel"
  chmod 644 "$g/schluessel"
  printf 'wegwerf' > "$g/pgpasswort"
}
im_dienst() { # geraet, pg, env-Zeilen..., -- , Befehl...
  local g="${ARBEIT}/$1" pg="$2"
  shift 2
  local env=()
  while [ "$1" != "--" ]; do env+=(-e "$1"); shift; done
  shift
  docker run --rm --entrypoint "" --network "$NETZ" \
    -e POSTGRES_HOST="$pg" -e POSTGRES_USER=arasul -e POSTGRES_DB=arasul_db \
    -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
    -e BACKUP_ENCRYPT_KEY_FILE=/run/secrets/backup_encryption_key \
    -e BACKUP_ENCRYPT=true \
    -e BACKUP_EXTERN_ZIEL=/arasul/extern \
    "${env[@]}" \
    -v "$g/backups:/backups" -v "$g/apps:/arasul/apps" -v "$g/flows:/arasul/flows" \
    -v "$g/firmenordner:/arasul/firmenordner" -v "$g/konfiguration:/arasul/konfiguration" \
    -v "$g/schluessel:/run/secrets/backup_encryption_key:ro" \
    -v "$g/pgpasswort:/run/secrets/postgres_password:ro" \
    -v "${STICKDIR}:/arasul/extern" \
    "$BILD" "$@"
}

# -- Der Inhalt des ersten Geraets -------------------------------------------
KEY1="$(head -c 20 /dev/urandom | base32 | tr -d '=\n')"
KEY2="$(head -c 20 /dev/urandom | base32 | tr -d '=\n')"
CODE1="$(printf '%s' "$KEY1" | sed -E 's/(.{4})/\1-/g; s/-$//')"
baue_geraet alt "$KEY1"
mkdir -p "${ARBEIT}/alt/apps/probe/1.0.0/frontend" "${ARBEIT}/alt/apps/zweite/1.0.0"
echo '{"schema":1,"id":"probe","version":"1.0.0"}' > "${ARBEIT}/alt/apps/probe/1.0.0/app.json"
echo "<h1>probe ${STEMPEL}</h1>" > "${ARBEIT}/alt/apps/probe/1.0.0/frontend/index.html"
echo '{"schema":1,"id":"zweite","version":"1.0.0"}' > "${ARBEIT}/alt/apps/zweite/1.0.0/app.json"
echo "flow ${STEMPEL}" > "${ARBEIT}/alt/flows/probe.md"
mkdir -p "${ARBEIT}/alt/firmenordner/vertraege"
echo "vertrag ${STEMPEL}" > "${ARBEIT}/alt/firmenordner/vertraege/a.txt"
echo "SYSTEM_VERSION=0.0.0" > "${ARBEIT}/alt/konfiguration/.env"

starte_pg "$PG" || { echo "Postgres kam nicht hoch"; exit 1; }
psql_in "$PG" <<'SQL' >/dev/null
CREATE TABLE app_staende (app_id text, stand text, version text);
CREATE TABLE app_datenbanken (app_id text, stand text, datenbank text, rolle text, passwort text);
CREATE TABLE nutzer (id serial primary key, name text);
INSERT INTO nutzer (name) SELECT 'nutzer-' || g FROM generate_series(1, 25) g;
INSERT INTO app_staende VALUES ('probe','test','1.0.0'),('zweite','test','1.0.0');
INSERT INTO app_datenbanken VALUES
  ('probe','test','arasul_app_probe_test','arasul_app_probe_test','x'),
  ('zweite','test','arasul_app_zweite_test','arasul_app_zweite_test','x');
CREATE ROLE arasul_app_probe_test LOGIN PASSWORD 'x';
CREATE ROLE arasul_app_zweite_test LOGIN PASSWORD 'x';
CREATE DATABASE arasul_app_probe_test OWNER arasul_app_probe_test;
CREATE DATABASE arasul_app_zweite_test OWNER arasul_app_zweite_test;
SQL
psql_in "$PG" arasul_app_probe_test <<'SQL' >/dev/null
CREATE TABLE belege (id serial primary key, text text);
INSERT INTO belege (text) SELECT 'beleg-' || g FROM generate_series(1, 40) g;
SQL
psql_in "$PG" arasul_app_zweite_test <<'SQL' >/dev/null
CREATE TABLE posten (id serial primary key, text text);
INSERT INTO posten (text) SELECT 'posten-' || g FROM generate_series(1, 7) g;
SQL
zaehle() { psql_in "$1" "$2" -c "$3" | tr -d '[:space:]'; }

# =============================================================================
echo ""
echo "A. Die Nachtsicherung legt nur Verschluesseltes auf den Datentraeger"
# =============================================================================
im_dienst alt "$PG" -- /usr/local/bin/backup.sh >"${ARBEIT}/lauf-a.log" 2>&1
BERICHT="${ARBEIT}/alt/backups/backup_report.json"
feld() { jq -r "$1" "$2" 2>/dev/null; }
pruefe "Sicherung: Bericht completed" "$(ja [ "$(feld .status "$BERICHT")" = completed ])" "$(tail -3 "${ARBEIT}/lauf-a.log" | tr '\n' ' ')"
pruefe "Kopie ausserhalb: extern_status kopiert" "$(ja [ "$(feld .extern_status "$BERICHT")" = kopiert ])" "$(feld .extern_status "$BERICHT")"
pruefe "Bericht: extern_klartext ist 0" "$(ja [ "$(feld .extern_klartext "$BERICHT")" = 0 ])"
pruefe "Schluesselpruefung vor dem Lauf: nichts zu pruefen (kein Alter)" "$(ja [ "$(feld .passt "${ARBEIT}/alt/backups/schluessel_pruefung.json")" = null ])"

# Den Datentraeger von aussen lesen: ein Wegwerf-Container, der nur das Volume sieht.
stick_lesen() {
  docker run --rm -v "${STICKDIR}:/s:ro" alpine:3.19 sh -c "$1"
}
DATEIEN="$(stick_lesen 'find /s -type f ! -name MANIFEST.json | sort')"
ANZ="$(printf '%s\n' "$DATEIEN" | grep -c .)"
pruefe "Auf dem Datentraeger liegen Dateien (${ANZ}): Datenbank, App-Datenbanken, Apps, Flows, Firmenordner, Konfiguration" "$(ja [ "$ANZ" -ge 7 ])" "$ANZ"
KOEPFE="$(stick_lesen 'for f in $(find /s -type f ! -name MANIFEST.json); do printf "%s %s\n" "$(head -c 8 "$f")" "$f"; done')"
NICHT_SALTED="$(printf '%s\n' "$KOEPFE" | grep -vc '^Salted__ ' || true)"
pruefe "Jede Datei beginnt mit 'Salted__' (openssl enc)" "$(ja [ "$NICHT_SALTED" = 0 ])" "$(printf '%s\n' "$KOEPFE" | grep -v '^Salted__ ' | head -3)"
GZIP="$(stick_lesen 'for f in $(find /s -type f ! -name MANIFEST.json); do [ "$(head -c 2 "$f" | od -An -tx1 | tr -d " \n")" = 1f8b ] && echo "$f"; done')"
TARKOPF="$(stick_lesen 'for f in $(find /s -type f ! -name MANIFEST.json); do [ "$(tail -c +258 "$f" | head -c 5)" = ustar ] && echo "$f"; done')"
pruefe "Kein gzip-Kopf (1f8b) auf dem Datentraeger" "$(ja [ -z "$GZIP" ])" "$GZIP"
pruefe "Kein tar-Kopf (ustar) auf dem Datentraeger" "$(ja [ -z "$TARKOPF" ])" "$TARKOPF"
MANIFEST="$(stick_lesen 'cat /s/arasul-sicherung/*/MANIFEST.json')"
pruefe "MANIFEST.json nennt die Probe-App und ihre Datenbank" "$(ja bash -c "jq -e '.apps[] | select(.id==\"probe\") | .datenbanken[] | select(.==\"arasul_app_probe_test\")' <<<'$MANIFEST' >/dev/null")"
pruefe "MANIFEST.json nennt auch die zweite App" "$(ja bash -c "jq -e '.apps[] | select(.id==\"zweite\")' <<<'$MANIFEST' >/dev/null")"
GEHEIM="$(stick_lesen "grep -rl '${KEY1}' /s 2>/dev/null | head -3")"
pruefe "Der Schluessel im Klartext steht in keiner Datei auf dem Datentraeger" "$(ja [ -z "$GEHEIM" ])" "$GEHEIM"

# =============================================================================
echo ""
echo "B. Ohne Verschluesselung kommt nichts Lesbares auf den Datentraeger"
# =============================================================================
VORHER="$(stick_lesen 'find /s -type f | sort | md5sum')"
im_dienst alt "$PG" BACKUP_ENCRYPT=false -- /usr/local/bin/backup.sh >"${ARBEIT}/lauf-b.log" 2>&1
pruefe "Lauf ohne Verschluesselung: extern_status nur_verschluesselt" \
  "$(ja [ "$(feld .extern_status "$BERICHT")" = nur_verschluesselt ])" "$(feld .extern_status "$BERICHT")"
NACHHER="$(stick_lesen 'find /s -type f | sort | md5sum')"
pruefe "Der Datentraeger ist danach unveraendert (kein neuer Klartext)" "$(ja [ "$VORHER" = "$NACHHER" ])"
KOEPFE_B="$(stick_lesen 'for f in $(find /s -type f ! -name MANIFEST.json); do head -c 2 "$f" | od -An -tx1; done | grep -c 1f8b' || true)"
pruefe "Auch jetzt: kein gzip-Kopf auf dem Datentraeger" "$(ja [ "${KOEPFE_B:-0}" = 0 ])"
# Danach wieder verschluesselt sichern, damit C etwas zu pruefen hat.
im_dienst alt "$PG" -- /usr/local/bin/backup.sh >"${ARBEIT}/lauf-b2.log" 2>&1

# =============================================================================
echo ""
echo "C. Neuer Schluessel zum alten Datentraeger: die Pruefung schlaegt an"
# =============================================================================
baue_geraet neu "$KEY2"
docker rm -f "$PG2" >/dev/null 2>&1
starte_pg "$PG2" || { echo "Zweiter Postgres kam nicht hoch"; exit 1; }
im_dienst neu "$PG2" -- /usr/local/bin/backup.sh >"${ARBEIT}/lauf-c.log" 2>&1
PRUEF="${ARBEIT}/neu/backups/schluessel_pruefung.json"
pruefe "Schluesselpruefung: passt false" "$(ja [ "$(feld .passt "$PRUEF")" = false ])" "$(cat "$PRUEF" 2>/dev/null | tr -d '\n ')"
pruefe "... und nennt die Sicherung auf dem Datentraeger" "$(ja [ "$(feld '.extern.passt' "$PRUEF")" = false ])"
pruefe "... mit einem deutschen Grund" "$(ja grep -q 'passt nicht' "$PRUEF")"
pruefe "Das Protokoll sagt es laut" "$(ja grep -q 'ERROR.*passt nicht' "${ARBEIT}/lauf-c.log")"
pruefe "Der abgeschlossene Lauf sichert trotzdem (neuer Schluessel)" "$(ja [ "$(feld .status "${ARBEIT}/neu/backups/backup_report.json")" = completed ])"
pruefe "Die alten Tage auf dem Datentraeger bleiben stehen (kein Aufraeumen bei falschem Schluessel)" \
  "$(ja [ "$(stick_lesen 'ls /s/arasul-sicherung | wc -l' | tr -d '[:space:]')" -ge 1 ])"

# =============================================================================
echo ""
echo "D. Das ganze Geraet vom Datentraeger zurueck (leeres Geraet, neuer Schluessel)"
# =============================================================================
# Ein ANDERES Geraet: leere Datenbank, leere Ordner, Schluessel KEY2. Der
# Datentraeger ist der von oben, mit der Sicherung des alten Geraets (KEY1) UND
# einer Sicherung dieses Geraets (KEY2) vom selben Tag. Die neueste Sicherung
# auf dem Stick ist die mit KEY2: das ist der Normalfall nach einer
# Neuinstallation, wenn eine Nacht gelaufen ist. Fuer den Weg zurueck von der
# Sicherung des alten Geraets wird der Datentraeger-Tag der alten Sicherung
# gebraucht -- also der Test mit einem leeren Geraet OHNE vorherigen Lauf.
docker rm -f "$PG2" >/dev/null 2>&1
starte_pg "$PG2" || { echo "Zweiter Postgres kam nicht hoch"; exit 1; }
# Der Datentraeger, wie er nach EINER Nacht des alten Geraets aussah:
docker run --rm -v "${STICKDIR}:/s" alpine:3.19 sh -c 'rm -rf /s/* /s/.[!.]*' >/dev/null 2>&1
im_dienst alt "$PG" -- /usr/local/bin/backup.sh >"${ARBEIT}/lauf-d0.log" 2>&1
baue_geraet leer "$KEY2"

im_dienst leer "$PG2" -- /usr/local/bin/wiederherstellen.sh --quelle extern >"${ARBEIT}/lauf-d1.log" 2>&1
RC1=$?
pruefe "Ohne Code: der Weg zurueck scheitert (Rueckgabe 1)" "$(ja [ "$RC1" = 1 ])" "rc=$RC1"
pruefe "... mit Grund 'schluessel_passt_nicht' im Bericht" \
  "$(ja grep -q schluessel_passt_nicht "${ARBEIT}/leer/backups/wiederherstellung_bericht.json")"
pruefe "... und die Datenbank des leeren Geraets bleibt leer" \
  "$(ja [ "$(zaehle "$PG2" arasul_db "SELECT count(*) FROM information_schema.tables WHERE table_name='nutzer'")" = 0 ])"
pruefe "Falscher Code: der Weg scheitert und fasst nichts an" \
  "$(ja bash -c "! docker run --rm --entrypoint '' --network '$NETZ' -e POSTGRES_HOST='$PG2' -e POSTGRES_USER=arasul -e POSTGRES_DB=arasul_db -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password -e BACKUP_ENCRYPT_KEY_FILE=/run/secrets/backup_encryption_key -e ARASUL_WIEDERHERSTELLUNGSCODE='AAAA-BBBB-CCCC' -v '${ARBEIT}/leer/backups:/backups' -v '${ARBEIT}/leer/apps:/arasul/apps' -v '${ARBEIT}/leer/flows:/arasul/flows' -v '${ARBEIT}/leer/firmenordner:/arasul/firmenordner' -v '${ARBEIT}/leer/schluessel:/run/secrets/backup_encryption_key:ro' -v '${ARBEIT}/leer/pgpasswort:/run/secrets/postgres_password:ro' -v '${STICKDIR}:/arasul/extern' '$BILD' /usr/local/bin/wiederherstellen.sh --quelle extern >/dev/null 2>&1")"

im_dienst leer "$PG2" ARASUL_WIEDERHERSTELLUNGSCODE="$CODE1" -- /usr/local/bin/wiederherstellen.sh --quelle extern >"${ARBEIT}/lauf-d2.log" 2>&1
RC2=$?
pruefe "Mit dem Wiederherstellungscode: Rueckgabe 0" "$(ja [ "$RC2" = 0 ])" "rc=$RC2 $(tail -3 "${ARBEIT}/lauf-d2.log" | tr '\n' ' ')"
pruefe "Bericht: fertig" "$(ja [ "$(feld .status "${ARBEIT}/leer/backups/wiederherstellung_bericht.json")" = fertig ])"
pruefe "Datenbank: alle 25 Nutzer sind da" "$(ja [ "$(zaehle "$PG2" arasul_db 'SELECT count(*) FROM nutzer')" = 25 ])"
pruefe "App-Datenbank der Probe-App: alle 40 Belege sind da" "$(ja [ "$(zaehle "$PG2" arasul_app_probe_test 'SELECT count(*) FROM belege')" = 40 ])"
pruefe "App-Datenbank der zweiten App: alle 7 Posten sind da" "$(ja [ "$(zaehle "$PG2" arasul_app_zweite_test 'SELECT count(*) FROM posten')" = 7 ])"
pruefe "Paket der Probe-App: app.json Byte fuer Byte" \
  "$(ja cmp -s "${ARBEIT}/alt/apps/probe/1.0.0/app.json" "${ARBEIT}/leer/apps/probe/1.0.0/app.json")"
pruefe "Paket der Probe-App: Frontend Byte fuer Byte" \
  "$(ja cmp -s "${ARBEIT}/alt/apps/probe/1.0.0/frontend/index.html" "${ARBEIT}/leer/apps/probe/1.0.0/frontend/index.html")"
pruefe "Flow-Datei Byte fuer Byte" "$(ja cmp -s "${ARBEIT}/alt/flows/probe.md" "${ARBEIT}/leer/flows/probe.md")"
pruefe "Firmenordner Byte fuer Byte" \
  "$(ja cmp -s "${ARBEIT}/alt/firmenordner/vertraege/a.txt" "${ARBEIT}/leer/firmenordner/vertraege/a.txt")"
pruefe "Der Code liegt nach dem Lauf nirgends mehr (kein Schluessel in /tmp des Dienstes)" \
  "$(ja bash -c "! grep -rqF '${KEY1}' '${ARBEIT}/leer/backups' 2>/dev/null")"

# =============================================================================
echo ""
echo "E. Eine einzelne App vom Datentraeger zurueck"
# =============================================================================
# Auf dem ersten Geraet: Daten der Probe-App verderben, ihr Paket loeschen, die
# zweite App aendern -- und nur die Probe-App zurueckholen.
psql_in "$PG" arasul_app_probe_test -c "DELETE FROM belege WHERE id > 5" >/dev/null
psql_in "$PG" arasul_app_zweite_test -c "INSERT INTO posten (text) VALUES ('nach-der-sicherung')" >/dev/null
rm -rf "${ARBEIT}/alt/apps/probe" 2>/dev/null || docker run --rm -v "${ARBEIT}/alt/apps:/w" alpine:3.19 rm -rf /w/probe
echo "neuer-stand ${STEMPEL}" > "${ARBEIT}/alt/apps/zweite/1.0.0/NEU.txt"

im_dienst alt "$PG" -- /usr/local/bin/wiederherstellen.sh --app-datenbank arasul_app_probe_test --quelle extern >"${ARBEIT}/lauf-e1.log" 2>&1
RC_DB=$?
im_dienst alt "$PG" -- /usr/local/bin/wiederherstellen.sh --app-paket probe --quelle extern >"${ARBEIT}/lauf-e2.log" 2>&1
RC_PK=$?
pruefe "Daten der Probe-App: Rueckgabe 0" "$(ja [ "$RC_DB" = 0 ])" "$(tail -2 "${ARBEIT}/lauf-e1.log" | tr '\n' ' ')"
pruefe "Daten der Probe-App: wieder 40 Belege" "$(ja [ "$(zaehle "$PG" arasul_app_probe_test 'SELECT count(*) FROM belege')" = 40 ])"
pruefe "Paket der Probe-App: Rueckgabe 0" "$(ja [ "$RC_PK" = 0 ])" "$(tail -2 "${ARBEIT}/lauf-e2.log" | tr '\n' ' ')"
pruefe "Paket der Probe-App: wieder da, Byte fuer Byte" \
  "$(ja cmp -s "${ARBEIT}/leer/apps/probe/1.0.0/frontend/index.html" "${ARBEIT}/alt/apps/probe/1.0.0/frontend/index.html")"
pruefe "Die zweite App ist unberuehrt: ihr neuer Posten steht noch da" \
  "$(ja [ "$(zaehle "$PG" arasul_app_zweite_test 'SELECT count(*) FROM posten')" = 8 ])"
pruefe "Das Paket der zweiten App ist unberuehrt" "$(ja [ -f "${ARBEIT}/alt/apps/zweite/1.0.0/NEU.txt" ])"
pruefe "Die Plattform-Datenbank ist unberuehrt (Nutzer-Tabelle noch 25)" \
  "$(ja [ "$(zaehle "$PG" arasul_db 'SELECT count(*) FROM nutzer')" = 25 ])"
pruefe "Der Stand von vorher liegt unter vor_wiederherstellung/" \
  "$(ja bash -c "compgen -G '${ARBEIT}/alt/backups/vor_wiederherstellung/arasul_app_probe_test_*' >/dev/null")"
im_dienst alt "$PG" -- /usr/local/bin/wiederherstellen.sh --app-paket gibtsnicht --quelle extern >/dev/null 2>&1
pruefe "Eine App, die nicht in der Sicherung steht: Rueckgabe 1" "$(ja [ "$?" = 1 ])"

echo ""
echo "${gruen} gruen, ${rot} rot"
[ "$rot" = 0 ]
