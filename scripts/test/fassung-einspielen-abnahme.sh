#!/bin/bash
# =============================================================================
# Das Geraet spielt eine neue Fassung ein und geht zurueck (J39, 02.10.2026)
# =============================================================================
# Der Beleg fuer `scripts/deploy/fassung-einspielen.sh`, ohne Jetson und ohne
# Bootstrap: `install.sh --nur-vorbereiten` haelt vor dem Bau an, der Umzug des
# Zustands passiert davor -- und genau der ist es, der beim Einspielen und beim
# Rueckweg gemessen werden muss.
#
#   1. Drei Artefakte (9.9.7, 9.9.8, 9.9.9) aus HEAD bauen, 9.9.7 installieren,
#      den Zustand eines benutzten Geraets anlegen.
#   2. Einspielen 9.9.7 -> 9.9.8 mit dem Skript der LAUFENDEN Fassung: der Zustand
#      steht danach unveraendert im neuen Ordner, der Status sagt `fertig`.
#   3. Einspielen 9.9.8 -> 9.9.9: der Ordner 9.9.7 ist aufgeraeumt, 9.9.8 bleibt
#      als Rueckweg, das alte Paket in der Ablage ist weg.
#   4. Zurueck auf 9.9.8: das Geraet steht wieder dort, mit demselben Zustand.
#   5. Ein Paket, dessen install.sh VOR dem Umzug scheitert, und eines, das
#      NACH dem Umzug scheitert: beide enden `zurueckgerollt`, das Geraet liegt
#      danach wieder an seinem Platz, mit allen Geheimnissen.
#   6. Ein Paket mit falscher Fassung wird abgewiesen, ohne etwas anzufassen.
#
# Auf Linux (Stat-Schalter, sed -i). Aufruf:
#   bash scripts/test/fassung-einspielen-abnahme.sh [--behalten]
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

wert() { grep "^${2}=" "$1" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
# Ein Feld aus status.json (flaches JSON, ein Feld je Zeile).
feld() { sed -n "s/^  \"$2\": \"\\(.*\\)\",\\{0,1\\}\$/\\1/p" "$1" 2>/dev/null | sed -n '1p'; }

TMP="$(mktemp -d -t arasul-fassung.XXXXXX)"
export ARASUL_ZEIGER="${TMP}/zeiger"
export ARASUL_PROJEKT="arasul-fassung-$$"
export FASSUNG_NUR_VORBEREITEN=1
export FASSUNG_OHNE_GESUNDHEIT=1

aufraeumen() {
  if [ "$BEHALTEN" = true ]; then
    echo "   Ordner bleibt stehen: $TMP"
  else
    rm -rf "$TMP"
  fi
}
trap aufraeumen EXIT

echo ""
echo -e "${BLAU}-> Fassung einspielen und zurueck${AUS}"
echo "   Arbeitsordner: $TMP"

# -----------------------------------------------------------------------------
# 1. Artefakte und ein benutztes Geraet
# -----------------------------------------------------------------------------
for fassung in 9.9.7 9.9.8 9.9.9; do
  if ! bash "${WURZEL}/scripts/deploy/artefakt-bauen.sh" \
        --ausgabe "${TMP}/dist" --fassung "$fassung" >"${TMP}/bau-${fassung}.log" 2>&1; then
    echo -e "   ${ROT}Artefakt ${fassung} liess sich nicht bauen:${AUS}"
    sed 's/^/     /' "${TMP}/bau-${fassung}.log"
    exit 1
  fi
done
mkdir -p "${TMP}/geraet"
tar xzf "${TMP}/dist/arasul-9.9.7.tar.gz" -C "${TMP}/geraet"
A="${TMP}/geraet/arasul-9.9.7"
B="${TMP}/geraet/arasul-9.9.8"
C="${TMP}/geraet/arasul-9.9.9"

if ! (cd "$A" && ./install.sh --nur-vorbereiten --passwort 'AbnahmeCi2026x') >"${TMP}/install-a.log" 2>&1; then
  echo -e "   ${ROT}install.sh in 9.9.7 ist nicht durchgelaufen:${AUS}"
  sed 's/^/     /' "${TMP}/install-a.log"
  exit 1
fi

mkdir -p "${A}/config/traefik/certs" "${A}/data/apps/urlaubsantrag/live" \
         "${A}/data/flows" "${A}/data/backups" "${A}/data/updates/fassungen" "${A}/logs"
echo 'GERAETE-CA DIESES GERAETS'  > "${A}/config/traefik/certs/arasul-ca.crt"
echo '<h1>Urlaubsantrag</h1>'     > "${A}/data/apps/urlaubsantrag/live/index.html"
echo '# Urlaub beantragen'        > "${A}/data/flows/urlaub.md"
echo 'verschluesselte Sicherung'  > "${A}/data/backups/2026-10-02.tar.gz.enc"
cp "${A}/config/secrets/postgres_password" "${TMP}/postgres_password-vorher"
cp "${A}/config/secrets/jwt_secret" "${TMP}/jwt_secret-vorher"
cp "${A}/.env" "${TMP}/env-vorher"
# Wie das Backend sie ablegt: das Paket in der Ablage des Geraets.
cp "${TMP}/dist/arasul-9.9.8.tar.gz" "${TMP}/dist/arasul-9.9.8.tar.gz.sha256" "${A}/data/updates/fassungen/"

zustand_ok() {
  # zustand_ok <ordner>: alles, was ein Update nicht verlieren darf.
  local o="$1"
  probe "  Geheimnisse unveraendert (Datenbank, JWT)" bash -c \
    "cmp -s '${TMP}/postgres_password-vorher' '${o}/config/secrets/postgres_password' && cmp -s '${TMP}/jwt_secret-vorher' '${o}/config/secrets/jwt_secret'"
  probe "  Geraete-CA da" test -s "${o}/config/traefik/certs/arasul-ca.crt"
  probe "  App-Dateien da" test -s "${o}/data/apps/urlaubsantrag/live/index.html"
  probe "  Flows da" test -s "${o}/data/flows/urlaub.md"
  probe "  Sicherungen da" test -s "${o}/data/backups/2026-10-02.tar.gz.enc"
  probe "  POSTGRES_PASSWORD gleich" test "$(wert "${TMP}/env-vorher" POSTGRES_PASSWORD)" = "$(wert "${o}/.env" POSTGRES_PASSWORD)"
}

# -----------------------------------------------------------------------------
# 2. Einspielen 9.9.7 -> 9.9.8, mit dem Skript der laufenden Fassung
# -----------------------------------------------------------------------------
echo "   2. einspielen 9.9.7 -> 9.9.8"
bash "${A}/scripts/deploy/fassung-einspielen.sh" einspielen \
  "${A}/data/updates/fassungen/arasul-9.9.8.tar.gz" 9.9.8 lauf-eins >"${TMP}/lauf-1.out" 2>&1
probe "das Skript endet mit 0" test $? -eq 0
S="${B}/data/updates/fassung/status.json"
probe "der Status steht im NEUEN Ordner" test -s "$S"
probe "Status: fertig" test "$(feld "$S" status)" = fertig
probe "Status: von 9.9.7 nach 9.9.8" bash -c "[ \"\$(sed -n 's/^  \"von\": \"\\(.*\\)\",\$/\\1/p' '$S')\" = 9.9.7 ] && [ \"\$(sed -n 's/^  \"nach\": \"\\(.*\\)\",\$/\\1/p' '$S')\" = 9.9.8 ]"
probe "Status nennt die vorige Fassung" test "$(feld "$S" vorigeFassung)" = 9.9.7
probe "das Protokoll liegt daneben" test -s "${B}/data/updates/fassung/lauf.log"
probe "SYSTEM_VERSION ist 9.9.8" test "$(wert "${B}/.env" SYSTEM_VERSION)" = 9.9.8
zustand_ok "$B"
probe "9.9.7 hat seinen Zustand abgegeben" test -f "${A}/ABGEGEBEN.txt" -a ! -e "${A}/.env"
probe "9.9.7 hat einen Rueckweg-Vermerk mit der Fassung" test -f "${A}/arasul-release.json"

# -----------------------------------------------------------------------------
# 3. Einspielen 9.9.8 -> 9.9.9: aufgeraeumt bis auf den letzten Vorgaenger
# -----------------------------------------------------------------------------
echo "   3. einspielen 9.9.8 -> 9.9.9"
cp "${TMP}/dist/arasul-9.9.9.tar.gz" "${TMP}/dist/arasul-9.9.9.tar.gz.sha256" "${B}/data/updates/fassungen/"
bash "${B}/scripts/deploy/fassung-einspielen.sh" einspielen \
  "${B}/data/updates/fassungen/arasul-9.9.9.tar.gz" 9.9.9 lauf-zwei >"${TMP}/lauf-2.out" 2>&1
probe "das Skript endet mit 0" test $? -eq 0
S="${C}/data/updates/fassung/status.json"
probe "Status: fertig" test "$(feld "$S" status)" = fertig
zustand_ok "$C"
probe "9.9.7 ist aufgeraeumt" test ! -e "$A"
probe "9.9.8 bleibt als Rueckweg" test -f "${B}/install.sh"
probe "das Paket 9.9.8 in der Ablage ist weg" test ! -e "${C}/data/updates/fassungen/arasul-9.9.8.tar.gz"
probe "das Paket 9.9.9 in der Ablage bleibt" test -e "${C}/data/updates/fassungen/arasul-9.9.9.tar.gz"

# -----------------------------------------------------------------------------
# 4. Zurueck auf 9.9.8
# -----------------------------------------------------------------------------
echo "   4. zurueck 9.9.9 -> 9.9.8"
bash "${C}/scripts/deploy/fassung-einspielen.sh" zurueck lauf-drei >"${TMP}/lauf-3.out" 2>&1
probe "das Skript endet mit 0" test $? -eq 0
S="${B}/data/updates/fassung/status.json"
probe "Status: fertig, art zurueck" bash -c "[ \"\$(sed -n 's/^  \"status\": \"\\(.*\\)\",\$/\\1/p' '$S')\" = fertig ] && [ \"\$(sed -n 's/^  \"art\": \"\\(.*\\)\",\$/\\1/p' '$S')\" = zurueck ]"
probe "SYSTEM_VERSION ist wieder 9.9.8" test "$(wert "${B}/.env" SYSTEM_VERSION)" = 9.9.8
zustand_ok "$B"
probe "9.9.9 hat abgegeben" test -f "${C}/ABGEGEBEN.txt" -a ! -e "${C}/.env"
probe "der Zeiger nennt 9.9.8" grep -qx "$B" "$ARASUL_ZEIGER"

# -----------------------------------------------------------------------------
# 5. Ein Paket, das scheitert
# -----------------------------------------------------------------------------
# Zwei Faelle, weil sie verschieden enden: scheitert `install.sh` VOR dem Umzug,
# liegt der Zustand noch im alten Ordner und es ist nichts zurueckzuholen;
# scheitert es DANACH, muss der Rueckweg ihn zurueckziehen.
paket_mit() {
  # paket_mit <fassung> <vorname> <install-zeilen>: ein 9.9.x, dessen install.sh anders ist.
  local fassung="$1" name="$2" kopf="$3"
  local w="${TMP}/${name}"
  rm -rf "$w"; mkdir -p "$w"
  tar xzf "${TMP}/dist/arasul-9.9.9.tar.gz" -C "$w"
  mv "${w}/arasul-9.9.9" "${w}/arasul-${fassung}"
  sed -i "s/9\\.9\\.9/${fassung}/g" "${w}/arasul-${fassung}/arasul-release.json"
  cp "${w}/arasul-${fassung}/install.sh" "${w}/arasul-${fassung}/install.echt.sh"
  printf '#!/bin/bash\n%s\n' "$kopf" > "${w}/arasul-${fassung}/install.sh"
  chmod +x "${w}/arasul-${fassung}/install.sh"
  tar czf "${TMP}/dist/arasul-${fassung}.tar.gz" -C "$w" "arasul-${fassung}"
}

paket_mit 9.9.10 vorher 'echo "kaputt vor dem Umzug"; exit 1'
echo "   5a. install.sh scheitert vor dem Umzug"
bash "${B}/scripts/deploy/fassung-einspielen.sh" einspielen \
  "${TMP}/dist/arasul-9.9.10.tar.gz" 9.9.10 lauf-vier >"${TMP}/lauf-4.out" 2>&1
probe "das Skript endet mit Fehler" test $? -ne 0
S="${B}/data/updates/fassung/status.json"
probe "Status: zurueckgerollt" test "$(feld "$S" status)" = zurueckgerollt
probe "9.9.8 hat sein Geraet noch" test -f "${B}/.env" -a ! -f "${B}/ABGEGEBEN.txt"
probe "der halbe neue Ordner ist weg" test ! -e "${TMP}/geraet/arasul-9.9.10"
zustand_ok "$B"

paket_mit 9.9.11 nachher 'bash "$(dirname "$0")/install.echt.sh" "$@"; echo "kaputt NACH dem Umzug"; exit 1'
echo "   5b. install.sh scheitert nach dem Umzug"
bash "${B}/scripts/deploy/fassung-einspielen.sh" einspielen \
  "${TMP}/dist/arasul-9.9.11.tar.gz" 9.9.11 lauf-fuenf >"${TMP}/lauf-5.out" 2>&1
probe "das Skript endet mit Fehler" test $? -ne 0
S="${B}/data/updates/fassung/status.json"
probe "Status: zurueckgerollt" test "$(feld "$S" status)" = zurueckgerollt
probe "9.9.8 hat sein Geraet wieder" test -f "${B}/.env" -a ! -f "${B}/ABGEGEBEN.txt"
probe "SYSTEM_VERSION ist 9.9.8" test "$(wert "${B}/.env" SYSTEM_VERSION)" = 9.9.8
probe "der halbe neue Ordner ist weg" test ! -e "${TMP}/geraet/arasul-9.9.11"
probe "das Protokoll nennt den Rueckweg" grep -q 'Rueckweg' "${B}/data/updates/fassung/lauf.log"
zustand_ok "$B"

# -----------------------------------------------------------------------------
# 6. Falsche Fassung
# -----------------------------------------------------------------------------
echo "   6. Paket nennt eine andere Fassung"
cp "${TMP}/dist/arasul-9.9.9.tar.gz" "${TMP}/dist/arasul-9.9.12.tar.gz"
bash "${B}/scripts/deploy/fassung-einspielen.sh" einspielen \
  "${TMP}/dist/arasul-9.9.12.tar.gz" 9.9.12 lauf-sechs >"${TMP}/lauf-6.out" 2>&1
probe "das Skript endet mit Fehler" test $? -ne 0
probe "nichts liegt als 9.9.12 herum" test ! -e "${TMP}/geraet/arasul-9.9.12"
probe "das Geraet ist unberuehrt" test -f "${B}/.env"
zustand_ok "$B"

echo ""
if [ "$FEHLER" = "0" ]; then
  echo -e "   ${GRUEN}Fassung einspielen: ${PROBEN} von ${PROBEN} Proben stehen${AUS}"
else
  echo -e "   ${ROT}Fassung einspielen: FEHLGESCHLAGEN${AUS}"
  echo "   Protokolle: ${TMP}/lauf-*.out"
  BEHALTEN=true
fi
echo ""
exit "$FEHLER"
