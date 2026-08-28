#!/bin/bash
# =============================================================================
# ARASUL PLATFORM - Werksreset des Geraets
# =============================================================================
# Setzt ein Geraet fuer einen neuen Kunden zurueck. Danach ist es ein leeres
# Geraet, auf dem `./install.sh` laeuft -- und sonst nichts.
#
#   sudo bash scripts/setup/factory-reset.sh
#
# ZWEI REGELN, und beide kommen aus einer Messung am Orin vom 28.08.2026:
#
#   1. EIN WERKSRESET INSTALLIERT NICHTS. Bis dahin rief dieses Skript zum
#      Schluss `preconfigure.sh`. Das schrieb eine eigene `.env` (aus
#      `.env.example`, wo `LLM_MODEL=qwen3:14b` stand -- ein Modell, das seit
#      der Kurzliste aus C8 nicht mehr vorgesehen ist) und zog dieses Modell
#      dann gegen einen `llm-service`, der gerade erst gestartet war. Der Pull
#      hing dreissig Minuten. Danach gehoerte die `.env` root, weil der Reset
#      mit sudo lief, und `./install.sh` als normaler Benutzer kam an ihr nicht
#      mehr vorbei. Ein Reset, der schon halb installiert, ist kein Reset:
#      er ist eine zweite Installation, die von der ersten abweicht.
#
#   2. EIN WERKSRESET RAEUMT ALLES EIGENE WEG, auch was `docker compose down`
#      nicht kennt: JEDEN Container, dessen Name mit `arasul-` beginnt oder der
#      ein Etikett `arasul.*` traegt -- die App-Container
#      `arasul-app-<id>-<stand>` ebenso wie die zehn `arasul-sandbox-*` aus
#      Zeiten, in denen es diese Dienste noch gab --, die am Geraet gebauten
#      App-Images (Etikett `arasul.app`), und JEDES Volume dieses Geraets, auch
#      die aus frueheren Projektnamen, die `down -v` nicht anfasst. Genau die
#      blieben am Orin stehen und trugen die Datenbank des vorigen Kunden in
#      die naechste Installation.
#
# Was bleibt: die KI-Modelle. Sie sind Gigabytes, sie enthalten keine
# Kundendaten, und sie ueber eine Mobilfunkverbindung neu zu ziehen ist die
# Sorte Wartezeit, die eine Auslieferung platzen laesst. Sie werden vor dem
# Aufraeumen gesichert und danach zurueckgelegt.
# =============================================================================

set -euo pipefail

ROT='\033[0;31m'
GRUEN='\033[0;32m'
GELB='\033[1;33m'
FETT='\033[1m'
AUS='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

# Die Volumes dieses Geraets. Bewusst NICHT ueber den Projektnamen: der stand
# frueher auf dem Verzeichnisnamen, heute auf `arasul-platform`
# (docker-compose.yml), und die Volumes aus der Zeit davor heissen deshalb
# `arasul-jet_arasul-postgres` statt `arasul-platform_arasul-postgres`.
# Gesucht wird am Namen des Volumes selbst, mit oder ohne Projekt davor.
arasul_volumes() {
  docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E '(^|_)arasul-[a-z0-9-]+$' || true
}

modell_volumes() {
  arasul_volumes | grep -E '(arasul-llm-models|arasul-embeddings-models)$' || true
}

echo -e "${ROT}${FETT}"
echo "============================================"
echo "  ARASUL WERKSRESET"
echo "============================================"
echo -e "${AUS}"
echo "  Dies loescht ALLE Kundendaten:"
echo "    - Datenbank (Flows, Laeufe, Benutzer, Einstellungen)"
echo "    - Alle Container dieses Geraets (Name arasul-*, Etikett arasul.*)"
echo "    - Apps: Dateien und die am Geraet gebauten Images"
echo "    - Konfiguration (.env, Geraete-CA und Zertifikate, SSH-Keys)"
echo "    - Logs und Cache"
echo ""
echo "  Folgendes bleibt erhalten:"
echo "    - Docker Images der Plattform"
echo "    - KI-Modelle (Ollama und Embeddings)"
echo ""
echo -e "  ${GELB}Diese Aktion kann NICHT rueckgaengig gemacht werden!${AUS}"
echo ""
read -rp "  Zum Fortfahren 'ja' eingeben: " CONFIRM
if [ "$CONFIRM" != "ja" ]; then
  echo "Abgebrochen."
  exit 1
fi

echo ""

# -----------------------------------------------------------------------------
# 1. KI-Modelle sichern
# -----------------------------------------------------------------------------
echo -e "${FETT}[1/6]${AUS} Sichere KI-Modelle..."
BACKUP_DIR=$(mktemp -d)
MODELS_SAVED=false

while read -r volume; do
  [ -n "$volume" ] || continue
  echo "  Sichere $volume..."
  if docker run --rm \
      -v "$volume":/data \
      -v "$BACKUP_DIR":/backup \
      alpine tar cf "/backup/${volume}.tar" -C /data . 2>/dev/null; then
    MODELS_SAVED=true
  else
    echo -e "  ${GELB}Warnung: $volume konnte nicht gesichert werden${AUS}"
  fi
done <<<"$(modell_volumes)"

if [ "$MODELS_SAVED" = true ]; then
  BACKUP_VALID=true
  for tarfile in "$BACKUP_DIR"/*.tar; do
    [ -f "$tarfile" ] || continue
    if [ ! -s "$tarfile" ]; then
      echo -e "  ${ROT}FEHLER: Sicherungsdatei ist leer: $tarfile${AUS}"
      BACKUP_VALID=false
    fi
  done

  if [ "$BACKUP_VALID" = true ]; then
    echo -e "  ${GRUEN}Modelle gesichert und geprueft in $BACKUP_DIR${AUS}"
  else
    echo -e "  ${ROT}FEHLER: Modell-Sicherung unvollstaendig. Abbruch zum Schutz der Daten.${AUS}"
    rm -rf "$BACKUP_DIR"
    exit 1
  fi
else
  echo -e "  ${GELB}Keine Modell-Volumes gefunden (keine Sicherung noetig)${AUS}"
fi

# -----------------------------------------------------------------------------
# 2. Die Plattform anhalten
# -----------------------------------------------------------------------------
echo -e "\n${FETT}[2/6]${AUS} Halte die Plattform an..."
docker compose down -v --remove-orphans 2>/dev/null || true

# -----------------------------------------------------------------------------
# 3. Jeder Container dieses Geraets, und die am Geraet gebauten App-Images
# -----------------------------------------------------------------------------
# `docker compose down` kennt nur, was gerade in den Compose-Dateien steht.
# Alles andere bleibt stehen, und "alles andere" war am 28.08.2026 am Orin eine
# lange Liste: zehn `arasul-sandbox-*` und ein `arasul-skills-sandbox` aus
# Zeiten, in denen es diese Dienste noch gab, dazu die `arasul-app-*` des
# vorigen Kunden -- eine App-Instanz startet das Backend einzeln ueber den
# Docker-Proxy (`appContainer.js`), sie steht in keiner Compose-Datei und
# ueberlebt jedes `down --remove-orphans`.
#
# Gemessen wird deshalb an zwei Merkmalen, die ein Container dieses Geraets
# traegt und ein fremder nicht: der NAME beginnt mit `arasul-`, oder ein
# ETIKETT beginnt mit `arasul.` (`arasul.app` vergibt `baueImage` seit C6).
# Was weder das eine noch das andere hat, bleibt stehen -- ein Werksreset
# raeumt sein eigenes Geraet auf, nicht den Rechner eines Fremden.
echo -e "\n${FETT}[3/6]${AUS} Entferne die Container dieses Geraets und die App-Images..."
eigene_container() {
  # Ein Aufruf statt eines `docker inspect` je Container: `{{.Labels}}` gibt
  # `schluessel=wert,schluessel=wert`, und ein Etikett `arasul.app` steht damit
  # entweder am Anfang oder hinter einem Komma.
  docker ps -a --format '{{.ID}}|{{.Names}}|{{.Labels}}' 2>/dev/null |
    awk -F'|' '$2 ~ /^arasul-/ || $3 ~ /(^|,)arasul\./ { print $1 }' || true
}
EIGENE=$(eigene_container)
if [ -n "$EIGENE" ]; then
  # shellcheck disable=SC2086
  docker rm -f $EIGENE >/dev/null 2>&1 || true
  echo -e "  ${GRUEN}$(wc -w <<<"$EIGENE" | tr -d ' ') Container entfernt (Name arasul-* oder Etikett arasul.*)${AUS}"
else
  echo "  Keine Container mit Name arasul-* oder Etikett arasul.* vorhanden"
fi

# Das Etikett vergibt `baueImage` seit C6 an jedes am Geraet gebaute App-Image.
# Es ist der einzige Weg, sie von den Images der Plattform zu unterscheiden.
APP_IMAGES=$(docker images -q --filter 'label=arasul.app' 2>/dev/null | sort -u || true)
if [ -n "$APP_IMAGES" ]; then
  # shellcheck disable=SC2086
  docker rmi -f $APP_IMAGES >/dev/null 2>&1 || true
  echo -e "  ${GRUEN}$(wc -w <<<"$APP_IMAGES" | tr -d ' ') App-Images entfernt${AUS}"
else
  echo "  Keine am Geraet gebauten App-Images vorhanden"
fi

# -----------------------------------------------------------------------------
# 4. Volumes
# -----------------------------------------------------------------------------
echo -e "\n${FETT}[4/6]${AUS} Entferne die Volumes des Geraets..."
ENTFERNT=0
while read -r volume; do
  [ -n "$volume" ] || continue
  if docker volume rm -f "$volume" >/dev/null 2>&1; then
    ENTFERNT=$((ENTFERNT + 1))
  else
    echo -e "  ${GELB}Warnung: $volume liess sich nicht entfernen (benutzt es noch ein Container?)${AUS}"
  fi
done <<<"$(arasul_volumes)"
echo -e "  ${GRUEN}${ENTFERNT} Volume(s) entfernt${AUS}"

# -----------------------------------------------------------------------------
# 5. KI-Modelle zurueck, Kundendaten weg
# -----------------------------------------------------------------------------
echo -e "\n${FETT}[5/6]${AUS} Lege die KI-Modelle zurueck..."
for tarfile in "$BACKUP_DIR"/*.tar; do
  [ -f "$tarfile" ] || continue
  volume_name="$(basename "$tarfile" .tar)"
  echo "  Stelle $volume_name wieder her..."
  docker volume create "$volume_name" >/dev/null 2>&1 || true
  if docker run --rm \
      -v "$volume_name":/data \
      -v "$BACKUP_DIR":/backup \
      alpine tar xf "/backup/$(basename "$tarfile")" -C /data 2>/dev/null; then
    echo -e "  ${GRUEN}$volume_name wiederhergestellt${AUS}"
  else
    echo -e "  ${GELB}Warnung: $volume_name Wiederherstellung fehlgeschlagen${AUS}"
  fi
done
rm -rf "$BACKUP_DIR"

echo ""
echo "  Loesche Kundendaten und Konfiguration..."
rm -f .env
# `config/traefik/certs/` steht seit dem 27.08.2026 mit in der Liste, und das
# war eine Luecke: die Zertifikate liegen dort, nicht in `config/certs/` (ein
# Pfad, den es nicht gibt). Ein zurueckgesetztes Geraet hat den privaten
# Schluessel der CA des VORIGEN Kunden behalten -- samt eines Zertifikats auf
# dessen Namen und dessen IP-Adressen. Der naechste Bootstrap legt beides neu
# an; der neue Kunde verteilt danach SEINE CA.
rm -rf config/device/ config/traefik/certs/ config/ssh/ config/secrets/
rm -f config/.traefik-credentials
rm -rf data/ logs/ cache/ updates/
echo -e "  ${GRUEN}Kundendaten geloescht${AUS}"

# -----------------------------------------------------------------------------
# 6. Das Verzeichnis gehoert wieder dem Menschen, der installiert
# -----------------------------------------------------------------------------
# Der Reset laeuft mit sudo (Docker, root-eigene Reste). Was danach kommt --
# `./install.sh` -- laeuft als normaler Benutzer und schreibt die `.env` in
# genau dieses Verzeichnis. Am Orin scheiterte das am 28.08.2026, weil der
# Reset root-eigene Dateien hinterlassen hatte.
echo -e "\n${FETT}[6/6]${AUS} Gebe das Verzeichnis zurueck..."
if [ -n "${SUDO_UID:-}" ] && [ -n "${SUDO_GID:-}" ]; then
  chown -R "${SUDO_UID}:${SUDO_GID}" "$PROJECT_ROOT" 2>/dev/null || true
  echo -e "  ${GRUEN}${PROJECT_ROOT} gehoert wieder ${SUDO_USER:-dem aufrufenden Benutzer}${AUS}"
else
  echo "  Kein sudo im Spiel, nichts zu tun"
fi

echo ""
echo -e "${GRUEN}${FETT}============================================${AUS}"
echo -e "${GRUEN}${FETT}  Werksreset abgeschlossen${AUS}"
echo -e "${GRUEN}${FETT}============================================${AUS}"
echo ""
echo "  Das Geraet ist leer. Der naechste Schritt ist die Installation,"
echo "  und sie ist der EINZIGE Weg zurueck in einen laufenden Zustand:"
echo ""
echo "      ./install.sh"
echo ""
echo "  Sie schreibt die .env, setzt den Netznamen und ruft den Bootstrap."
echo "  Am Ende nennt sie einmal das Startpasswort und den Kit-Schluessel."
echo "  Nachzulesen: docs/ops/AUSLIEFERUNG.md"
echo ""
