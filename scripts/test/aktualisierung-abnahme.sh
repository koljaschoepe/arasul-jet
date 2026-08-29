#!/bin/bash
# =============================================================================
# Ein Geraet mit Daten nimmt ein neueres Artefakt an (29.08.2026)
# =============================================================================
# Der Beleg der Karte `artefakt-aktualisiert-nicht`. Gemessen wird der Weg des
# Kunden, und zwar von Anfang bis Ende:
#
#   1. Artefakt A bauen, auspacken, `install.sh` darin -> ein Geraet.
#   2. Zustand anlegen, wie ihn ein benutztes Geraet hat: Geheimnisse,
#      Geraete-CA, eine App, ein Flow, eine Sicherung, Protokolle.
#   3. Artefakt B daneben auspacken, `install.sh` darin -- OHNE ihm zu sagen,
#      wo A steht.
#   4. Nachsehen, ob B dasselbe Geraet ist: dieselben Geheimnisse, dieselbe
#      CA, dieselben Apps, dieselben Sicherungen, neue Fassung.
#
# WARUM NICHT AM ORIN: der Bootstrap baut zwoelf Images fuer ARM64 mit CUDA,
# und die A7-Uhr laeuft (Dauerlauf ueber sieben Tage). Der Lauf am Geraet folgt,
# wenn A7 durch ist. Alles, was ohne Jetson-Hardware messbar ist -- und das ist
# der ganze Uebernahmeweg --, laeuft hier: `install.sh --nur-vorbereiten` haelt
# vor dem Bootstrap an, der Umzug des Zustands passiert davor.
#
# WAS GEMESSEN WIRD, IST HEAD. Das Artefakt kommt aus `git archive`, nicht aus
# dem Arbeitsverzeichnis (scripts/deploy/artefakt-bauen.sh). Wer lokal misst,
# misst seinen letzten Commit.
#
# Aufruf:
#   bash scripts/test/aktualisierung-abnahme.sh
#   bash scripts/test/aktualisierung-abnahme.sh --behalten   (Ordner stehen lassen)
#
# Rueckgabe: 0 wenn jede Probe steht, 1 sonst.
# =============================================================================
set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BEHALTEN=false
[ "${1:-}" = "--behalten" ] && BEHALTEN=true

GRUEN='\033[0;32m'; ROT='\033[0;31m'; BLAU='\033[0;34m'; AUS='\033[0m'
FEHLER=0
PROBEN=0

probe() {
  local was="$1"; shift
  PROBEN=$((PROBEN + 1))
  if "$@" >/dev/null 2>&1; then
    echo -e "   ${GRUEN}ok${AUS}    $was"
  else
    echo -e "   ${ROT}FEHLT${AUS} $was"
    FEHLER=1
  fi
}

gleich() {
  local was="$1" a="$2" b="$3"
  PROBEN=$((PROBEN + 1))
  if [ -e "$a" ] && [ -e "$b" ] && cmp -s "$a" "$b"; then
    echo -e "   ${GRUEN}ok${AUS}    $was"
  else
    echo -e "   ${ROT}FEHLT${AUS} $was"
    FEHLER=1
  fi
}

# Eine Zeile aus einer .env, so wie `env_wert` sie liest.
wert() { grep "^${2}=" "$1" 2>/dev/null | tail -1 | cut -d= -f2- || true; }

TMP="$(mktemp -d -t arasul-aktualisierung.XXXXXX)"
# Der Zeiger auf "wo steht dieses Geraet" gehoert in den Wegwerfordner. Ein
# Lauf dieser Abnahme darf den Zeiger des Rechners, auf dem er laeuft, nicht
# anfassen -- am Orin waere das genau die Datei, an der der naechste Deploy
# haengt.
export ARASUL_ZEIGER="${TMP}/zeiger"
# Und der Projektname ebenso: `zustand_vorhanden` fragt nach Volumes dieses
# Projekts. Liefe die Abnahme unter `arasul-platform`, saehe sie die Volumes
# des Geraets, auf dem sie laeuft, und braeche mit "Zustand ohne Zuhause" ab.
export ARASUL_PROJEKT="arasul-abnahme-$$"

aufraeumen() {
  docker volume rm "${ARASUL_PROJEKT}_probe" >/dev/null 2>&1 || true
  if [ "$BEHALTEN" = true ]; then
    echo ""
    echo "   Ordner bleibt stehen: $TMP"
  else
    rm -rf "$TMP"
  fi
}
trap aufraeumen EXIT

echo ""
echo -e "${BLAU}-> Aktualisierung: Artefakt ueber ein benutztes Geraet${AUS}"
echo "   Arbeitsordner: $TMP"

# -----------------------------------------------------------------------------
# 1. Zwei Artefakte bauen
# -----------------------------------------------------------------------------
# Zwei Fassungen aus demselben Commit. Der Inhalt ist gleich, und das ist
# richtig so: gemessen wird die UEBERNAHME, nicht ein Versionssprung im Code.
ALT_FASSUNG='9.9.8'
NEU_FASSUNG='9.9.9'
for fassung in "$ALT_FASSUNG" "$NEU_FASSUNG"; do
  if ! bash "${WURZEL}/scripts/deploy/artefakt-bauen.sh" \
        --ausgabe "${TMP}/dist" --fassung "$fassung" >"${TMP}/bau-${fassung}.log" 2>&1; then
    echo -e "   ${ROT}Artefakt ${fassung} liess sich nicht bauen:${AUS}"
    sed 's/^/     /' "${TMP}/bau-${fassung}.log"
    exit 1
  fi
done
mkdir -p "${TMP}/geraet"
tar xzf "${TMP}/dist/arasul-${ALT_FASSUNG}.tar.gz" -C "${TMP}/geraet"
tar xzf "${TMP}/dist/arasul-${NEU_FASSUNG}.tar.gz" -C "${TMP}/geraet"
A="${TMP}/geraet/arasul-${ALT_FASSUNG}"
B="${TMP}/geraet/arasul-${NEU_FASSUNG}"
echo "   A = $A"
echo "   B = $B"

# -----------------------------------------------------------------------------
# 2. Installation aus Artefakt A
# -----------------------------------------------------------------------------
if ! (cd "$A" && ./install.sh --nur-vorbereiten --passwort 'AbnahmeCi2026x') \
      >"${TMP}/install-a.log" 2>&1; then
  echo -e "   ${ROT}install.sh in A ist nicht durchgelaufen:${AUS}"
  sed 's/^/     /' "${TMP}/install-a.log"
  exit 1
fi
probe "A ist installiert (.env geschrieben)" test -f "${A}/.env"
probe "A steht im Zeiger" grep -qx "$A" "$ARASUL_ZEIGER"

# -----------------------------------------------------------------------------
# 3. Der Zustand eines benutzten Geraets
# -----------------------------------------------------------------------------
# Je ein Stellvertreter fuer das, was in der Liste des Werksresets steht --
# und damit fuer das, was ein Update verlieren kann. Der Inhalt ist beliebig,
# die ORTE sind es nicht: es sind die Bind-Quellen der laufenden Container.
mkdir -p "${A}/config/traefik/certs" "${A}/data/apps/urlaubsantrag/live" \
         "${A}/data/flows" "${A}/data/backups" "${A}/logs" "${A}/config/device"
echo 'GERAETE-CA DIESES GERAETS'            > "${A}/config/traefik/certs/arasul-ca.crt"
echo 'privater Schluessel der CA'           > "${A}/config/traefik/certs/arasul-ca.key"
echo '<h1>Urlaubsantrag</h1>'               > "${A}/data/apps/urlaubsantrag/live/index.html"
echo '# Urlaub beantragen'                  > "${A}/data/flows/urlaub.md"
echo 'verschluesselte Sicherung'            > "${A}/data/backups/2026-08-29.tar.gz.enc"
echo 'bootstrap lief am 28.08.'             > "${A}/logs/bootstrap.log"
echo 'a1b2c3d4'                             > "${A}/config/device/device-id"
echo 'bcrypt-abdruck des Administrators'    > "${A}/config/secrets/admin.hash"

ALT_POSTGRES="$(wert "${A}/.env" POSTGRES_PASSWORD)"
ALT_JWT="$(wert "${A}/.env" JWT_SECRET)"
cp "${A}/.env" "${TMP}/env-vorher"
cp "${A}/config/secrets/postgres_password" "${TMP}/postgres_password-vorher"
cp "${A}/config/secrets/jwt_secret" "${TMP}/jwt_secret-vorher"
probe "A hat ein Datenbankpasswort" test -n "$ALT_POSTGRES"
probe "A hat ein JWT-Geheimnis" test -n "$ALT_JWT"

# -----------------------------------------------------------------------------
# 4. Artefakt B darueber -- ohne Hinweis, wo A steht
# -----------------------------------------------------------------------------
if ! (cd "$B" && ./install.sh --nur-vorbereiten) >"${TMP}/install-b.log" 2>&1; then
  echo -e "   ${ROT}install.sh in B ist nicht durchgelaufen:${AUS}"
  sed 's/^/     /' "${TMP}/install-b.log"
  exit 1
fi
probe "B hat A von selbst gefunden" grep -q "Dieses Geraet gibt es schon" "${TMP}/install-b.log"
probe "B hat KEINE neue .env geschrieben" bash -c "! grep -q 'Schreibe .env' '${TMP}/install-b.log'"

# --- Die Geheimnisse sind dieselben -----------------------------------------
# Das ist die Probe auf den Fund vom 28.08.2026: ohne `.env` erzeugte
# `interactive_setup.sh` bedingungslos neue Geheimnisse, waehrend der feste
# Projektname dieselben Volumes uebernahm. Alte Datenbank, neues Passwort.
NEU_POSTGRES="$(wert "${B}/.env" POSTGRES_PASSWORD)"
NEU_JWT="$(wert "${B}/.env" JWT_SECRET)"
probe "POSTGRES_PASSWORD ist unveraendert" test "$ALT_POSTGRES" = "$NEU_POSTGRES"
probe "JWT_SECRET ist unveraendert" test "$ALT_JWT" = "$NEU_JWT"
gleich "config/secrets/postgres_password ist dieselbe Datei" \
  "${TMP}/postgres_password-vorher" "${B}/config/secrets/postgres_password"
gleich "config/secrets/jwt_secret ist dieselbe Datei" \
  "${TMP}/jwt_secret-vorher" "${B}/config/secrets/jwt_secret"

# --- Die Fassung ist die neue -----------------------------------------------
probe "SYSTEM_VERSION ist ${NEU_FASSUNG}" \
  test "$(wert "${B}/.env" SYSTEM_VERSION)" = "$NEU_FASSUNG"

# --- Der Zustand ist mitgekommen --------------------------------------------
probe "die Geraete-CA ist da" test -s "${B}/config/traefik/certs/arasul-ca.crt"
probe "der private Schluessel der CA ist da" test -s "${B}/config/traefik/certs/arasul-ca.key"
probe "die App-Dateien sind da" test -s "${B}/data/apps/urlaubsantrag/live/index.html"
probe "die Flows sind da" test -s "${B}/data/flows/urlaub.md"
probe "die Sicherungen sind da" test -s "${B}/data/backups/2026-08-29.tar.gz.enc"
probe "die Protokolle sind da" test -s "${B}/logs/bootstrap.log"
probe "die Geraetekennung ist da" test -s "${B}/config/device/device-id"
probe "der Abdruck des Administrators ist da" test -s "${B}/config/secrets/admin.hash"

# --- Die Rechte stimmen noch ------------------------------------------------
rechte() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
probe ".env hat weiterhin 600" test "$(rechte "${B}/.env")" = "600"
# Der Ordner, den das Artefakt selbst mitbringt (README.md, .example/), kam mit
# 755 aus dem Tar -- und traegt nach dem Umzug die Geheimnisse des Geraets.
probe "config/secrets hat weiterhin 700" test "$(rechte "${B}/config/secrets")" = "700"

# --- Und es gibt das Geraet genau einmal ------------------------------------
# Zwei Kopien desselben Geraets waeren die Zweideutigkeit, gegen die der ganze
# Weg gebaut ist: danach koennte niemand mehr sagen, welche die echte ist.
probe "A hat keine .env mehr" test ! -e "${A}/.env"
# `config/secrets/` selbst bleibt stehen -- das Artefakt bringt darin
# `.example/` mit. Was weg sein muss, sind die Geheimnisse darin.
probe "A hat keine Geheimnisse mehr" test ! -e "${A}/config/secrets/postgres_password"
probe "A hat auch den Abdruck des Administrators nicht mehr" \
  test ! -e "${A}/config/secrets/admin.hash"
probe "A hat keine Geraete-CA mehr" test ! -e "${A}/config/traefik/certs/arasul-ca.key"
probe "A hat keine Daten mehr" test ! -e "${A}/data"
probe "A hat keine Protokolle mehr" test ! -e "${A}/logs/bootstrap.log"
probe "A sagt, wohin sein Geraet gezogen ist" grep -q "$B" "${A}/ABGEGEBEN.txt"
probe "der Zeiger nennt jetzt B" grep -qx "$B" "$ARASUL_ZEIGER"

# `./arasul` in A muss sich weigern. Ein `docker compose up` von dort laesst
# Docker jede fehlende Bind-Quelle LEER anlegen, waehrend die Datenbank im
# gemeinsamen Volume weiterlebt -- die halbe Migration von der anderen Seite.
probe "./arasul weigert sich in A" bash -c "! (cd '$A' && ./arasul status)"
# Derselbe Riegel auf dem Weg nach einem Stromausfall: `ordered-startup.sh` ist
# der ExecStart der systemd-Unit, und eine stehengebliebene Unit zeigt nach
# einem abgebrochenen Update noch auf das alte Verzeichnis.
# Gemessen wird die MELDUNG, nicht nur der Rueckgabewert: dieses Skript legt
# gleich darauf `/arasul/logs` an und scheiterte auf einem Laeufer ohne das
# Verzeichnis ohnehin -- der Riegel waere sonst gruen, ohne zu greifen.
probe "ordered-startup.sh weigert sich in A" bash -c \
  "grep -q 'nicht mehr das Geraet' <<<\"\$(bash '$A/scripts/system/ordered-startup.sh' --skip-pull 2>&1)\""

# --- docker compose kommt mit der uebernommenen Konfiguration zurecht -------
# Die Geheimnisse sind Dateien unter `config/secrets/`, und compose mountet sie
# ueber Pfade relativ zum Compose-Verzeichnis. Nach einem Umzug muessen sie
# dort liegen, wo die neuen Compose-Dateien sie suchen.
probe "docker compose liest B ohne Meckern" bash -c \
  "cd '$B' && [ -z \"\$(docker compose config -q 2>&1 >/dev/null)\" ]"

# -----------------------------------------------------------------------------
# 5. Die Gegenprobe: Zustand ohne Zuhause
# -----------------------------------------------------------------------------
# Es gibt Volumes dieses Projekts -- also eine Datenbank, die einem Geraet
# gehoert --, aber keine Installation, die dazu passt. Genau hier lief der
# Installer frueher weiter und erzeugte frische Geheimnisse fuer eine fremde
# Datenbank. Er muss anhalten, und zwar BEVOR er eine `.env` schreibt.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  C="${TMP}/geraet/waise"
  mkdir -p "$C"
  tar xzf "${TMP}/dist/arasul-${NEU_FASSUNG}.tar.gz" -C "$C" --strip-components=1
  rm -f "$ARASUL_ZEIGER"
  docker volume create "${ARASUL_PROJEKT}_probe" >/dev/null 2>&1

  (cd "$C" && ./install.sh --nur-vorbereiten --passwort 'AbnahmeCi2026x') \
    >"${TMP}/install-c.log" 2>&1
  ausgang=$?
  probe "eine Installation ohne auffindbares Geraet bricht ab" test "$ausgang" -ne 0
  probe "und sie schreibt dabei keine .env" test ! -e "${C}/.env"
  probe "und sie nennt den Weg (--uebernehmen)" grep -q -- '--uebernehmen' "${TMP}/install-c.log"

  # Und mit dem Hinweis von Hand laeuft derselbe Ordner durch.
  (cd "$C" && ./install.sh --nur-vorbereiten --uebernehmen "$B") \
    >"${TMP}/install-c2.log" 2>&1
  probe "--uebernehmen fuehrt denselben Ordner durch" test -f "${C}/.env"
  probe "und traegt dabei das Datenbankpasswort mit" \
    test "$(wert "${C}/.env" POSTGRES_PASSWORD)" = "$ALT_POSTGRES"
else
  echo "   --    Gegenprobe uebersprungen (kein Docker auf diesem Rechner)"
fi

echo ""
if [ "$FEHLER" = "0" ]; then
  echo -e "   ${GRUEN}Aktualisierung: ${PROBEN} von ${PROBEN} Proben stehen${AUS}"
else
  echo -e "   ${ROT}Aktualisierung: FEHLGESCHLAGEN${AUS}"
  echo "   Protokolle: ${TMP}/install-*.log"
  BEHALTEN=true
fi
echo ""
exit "$FEHLER"
