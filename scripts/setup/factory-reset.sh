#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Factory Reset
# Resets a device for a new customer.
#
# Keeps:    Docker images, Ollama models, Embedding models
# Deletes:  Database, documents, chats, configs, secrets
#
# Usage:    ./scripts/setup/factory-reset.sh
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

echo -e "${RED}${BOLD}"
echo "============================================"
echo "  ARASUL FACTORY RESET"
echo "============================================"
echo -e "${NC}"
echo "  Dies loescht ALLE Kundendaten:"
echo "    - Datenbank (Chats, Projekte, Einstellungen)"
echo "    - Dokumente und Uploads"
echo "    - Konfiguration (.env, Zertifikate, SSH-Keys)"
echo "    - Logs und Cache"
echo ""
echo "  Folgendes bleibt erhalten:"
echo "    - Docker Images"
echo "    - Ollama KI-Modelle"
echo "    - Embedding-Modelle"
echo ""
echo -e "  ${YELLOW}Diese Aktion kann NICHT rueckgaengig gemacht werden!${NC}"
echo ""
read -rp "  Zum Fortfahren 'ja' eingeben: " CONFIRM
if [ "$CONFIRM" != "ja" ]; then
  echo "Abgebrochen."
  exit 1
fi

echo ""

# Determine volume prefix (from COMPOSE_PROJECT_NAME or directory name)
VOLUME_PREFIX="arasul-platform"

# Step 1: Backup AI model volumes before destroying everything
echo -e "${BOLD}[1/5]${NC} Sichere KI-Modelle..."
BACKUP_DIR=$(mktemp -d)
MODELS_SAVED=false

for volume in "${VOLUME_PREFIX}_arasul-llm-models" "${VOLUME_PREFIX}_arasul-embeddings-models"; do
  if docker volume inspect "$volume" &>/dev/null; then
    echo "  Sichere $volume..."
    docker run --rm \
      -v "$volume":/data \
      -v "$BACKUP_DIR":/backup \
      alpine tar cf "/backup/$(basename "$volume").tar" -C /data . 2>/dev/null && \
      MODELS_SAVED=true || \
      echo -e "  ${YELLOW}Warnung: $volume konnte nicht gesichert werden${NC}"
  fi
done

if [ "$MODELS_SAVED" = true ]; then
  # Verify backup files exist and have non-zero size
  BACKUP_VALID=true
  for tarfile in "$BACKUP_DIR"/*.tar; do
    [ -f "$tarfile" ] || continue
    if [ ! -s "$tarfile" ]; then
      echo -e "  ${RED}FEHLER: Backup-Datei ist leer: $tarfile${NC}"
      BACKUP_VALID=false
    fi
  done

  if [ "$BACKUP_VALID" = true ]; then
    echo -e "  ${GREEN}Modelle gesichert und verifiziert in $BACKUP_DIR${NC}"
  else
    echo -e "  ${RED}FEHLER: Modell-Backup unvollstaendig. Abbruch zum Schutz der Daten.${NC}"
    rm -rf "$BACKUP_DIR"
    exit 1
  fi
else
  echo -e "  ${YELLOW}Keine Modell-Volumes gefunden (kein Backup noetig)${NC}"
fi

# Step 2: Stop and remove everything
echo -e "\n${BOLD}[2/5]${NC} Stoppe alle Services und loesche Volumes..."
docker compose down -v --remove-orphans 2>/dev/null || true

# Step 3: Restore AI model volumes
echo -e "\n${BOLD}[3/5]${NC} Stelle KI-Modelle wieder her..."
for tarfile in "$BACKUP_DIR"/*.tar; do
  [ -f "$tarfile" ] || continue
  volume_name="${VOLUME_PREFIX}_$(basename "$tarfile" .tar)"
  echo "  Stelle $volume_name wieder her..."
  docker volume create "$volume_name" >/dev/null 2>&1
  docker run --rm \
    -v "$volume_name":/data \
    -v "$BACKUP_DIR":/backup \
    alpine tar xf "/backup/$(basename "$tarfile")" -C /data 2>/dev/null && \
    echo -e "  ${GREEN}$volume_name wiederhergestellt${NC}" || \
    echo -e "  ${YELLOW}Warnung: $volume_name Wiederherstellung fehlgeschlagen${NC}"
done
rm -rf "$BACKUP_DIR"

# Step 4: Delete customer data and configs
echo -e "\n${BOLD}[4/5]${NC} Loesche Kundendaten und Konfiguration..."
rm -f .env
rm -rf config/device/ config/certs/ config/ssh/
rm -rf data/ logs/ cache/ updates/
echo -e "  ${GREEN}Kundendaten geloescht${NC}"

# Step 5: Re-initialize
echo -e "\n${BOLD}[5/5]${NC} Initialisiere neu..."
"$SCRIPT_DIR/preconfigure.sh"

echo ""
echo -e "${GREEN}${BOLD}============================================${NC}"
echo -e "${GREEN}${BOLD}  Factory Reset abgeschlossen!${NC}"
echo -e "${GREEN}${BOLD}============================================${NC}"
echo ""
echo -e "  ${YELLOW}${BOLD}Wichtig: Admin-Passwort oben notieren!${NC}"
echo ""
