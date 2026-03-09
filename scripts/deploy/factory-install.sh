#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Factory-Installation
# Eingebettet in arasul-factory-*.tar.gz
#
# Installiert die Arasul Platform offline auf einem neuen Jetson-Geraet.
# Laedt vorgebaute Docker-Images, fuehrt das interaktive Setup aus und
# startet alle Services.
#
# Aufruf:
#   ./factory-install.sh                    # Interaktiv
#   ADMIN_PASSWORD=... ./factory-install.sh --non-interactive
#
# Dauer: ~5-10 Minuten (kein Internet noetig)
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

NON_INTERACTIVE=""
if [ "$1" = "--non-interactive" ] || [ "$1" = "-n" ]; then
    NON_INTERACTIVE="--non-interactive"
fi

trap 'echo ""; echo -e "${RED}Installation abgebrochen.${NC}"; exit 1' INT

# =============================================================================
# Voraussetzungen pruefen
# =============================================================================

check_prerequisites() {
    local errors=0

    if ! command -v docker &>/dev/null; then
        echo -e "${RED}Docker ist nicht installiert.${NC}"
        echo "  Installation: https://docs.nvidia.com/jetson/jetpack/install-setup/index.html"
        errors=1
    fi

    if ! docker compose version &>/dev/null 2>&1; then
        echo -e "${RED}Docker Compose V2 ist nicht installiert.${NC}"
        errors=1
    fi

    if [ "$errors" -eq 1 ]; then
        exit 1
    fi
}

# =============================================================================
# Hauptprogramm
# =============================================================================

echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  ARASUL PLATFORM - Factory-Installation${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo ""

# Manifest anzeigen
if [ -f MANIFEST.yml ]; then
    local_version=$(grep "^version:" MANIFEST.yml 2>/dev/null | cut -d'"' -f2)
    local_created=$(grep "^created:" MANIFEST.yml 2>/dev/null | cut -d'"' -f2)
    echo -e "  Version:  ${GREEN}${local_version:-unbekannt}${NC}"
    echo -e "  Erstellt: ${local_created:-unbekannt}"
    echo ""
fi

check_prerequisites

# =========================================================================
# Schritt 1: Docker-Images laden (offline)
# =========================================================================

echo -e "${BOLD}[1/5]${NC} Lade Docker-Images (offline)..."

images_loaded=false
if [ -f images.tar.gz ]; then
    echo -e "  ${DIM}Lade images.tar.gz (kann einige Minuten dauern)...${NC}"
    docker load < images.tar.gz
    images_loaded=true
    echo -e "  ${GREEN}✓${NC} Docker-Images geladen"
elif [ -d docker-images/ ]; then
    img_count=$(ls docker-images/*.tar.gz 2>/dev/null | wc -l)
    echo -e "  ${DIM}Lade ${img_count} Image-Archive...${NC}"
    for img in docker-images/*.tar.gz; do
        echo -e "    ${DIM}$(basename "$img")${NC}"
        docker load < "$img"
    done
    images_loaded=true
    echo -e "  ${GREEN}✓${NC} ${img_count} Docker-Images geladen"
else
    echo -e "  ${YELLOW}!${NC} Keine vorgebauten Images gefunden"
    echo -e "  ${DIM}Images werden beim Bootstrap heruntergeladen (Internet erforderlich)${NC}"
fi

# =========================================================================
# Schritt 2: KI-Modelle wiederherstellen
# =========================================================================

echo -e "${BOLD}[2/5]${NC} Stelle KI-Modelle wieder her..."

if [ -d ollama-models/ ] && [ "$(ls -A ollama-models/ 2>/dev/null)" ]; then
    # Docker-Volume erstellen und Modelle kopieren
    docker volume create arasul-llm-models 2>/dev/null || true
    docker run --rm \
        -v arasul-llm-models:/dest \
        -v "$(pwd)/ollama-models:/src" \
        alpine sh -c "cp -a /src/. /dest/"
    echo -e "  ${GREEN}✓${NC} KI-Modelle wiederhergestellt"
else
    echo -e "  ${DIM}Keine vorinstallierten Modelle (wird beim ersten Start heruntergeladen)${NC}"
fi

# =========================================================================
# Schritt 3: Projekt einrichten
# =========================================================================

echo -e "${BOLD}[3/5]${NC} Richte Projekt ein..."

if [ ! -d project/ ]; then
    echo -e "  ${RED}Fehler: project/ Verzeichnis nicht gefunden${NC}"
    echo -e "  ${DIM}Das Factory-Image scheint beschaedigt zu sein.${NC}"
    exit 1
fi

cd project/

# Ausfuehrbare Rechte setzen
chmod +x arasul 2>/dev/null || true
chmod +x scripts/**/*.sh 2>/dev/null || true

echo -e "  ${GREEN}✓${NC} Projektverzeichnis bereit"

# =========================================================================
# Schritt 4: Interaktives Setup
# =========================================================================

echo -e "${BOLD}[4/5]${NC} Konfiguration..."
echo ""

if [ -n "$NON_INTERACTIVE" ]; then
    ./scripts/interactive_setup.sh --non-interactive
else
    ./scripts/interactive_setup.sh
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}Setup fehlgeschlagen${NC}"
    exit 1
fi

# =========================================================================
# Schritt 5: Bootstrap (ohne Pull/Build)
# =========================================================================

echo ""
echo -e "${BOLD}[5/5]${NC} Starte Services..."
echo ""

# Skip pull/build wenn Images bereits geladen
BOOTSTRAP_FLAGS=""
if [ "$images_loaded" = true ]; then
    BOOTSTRAP_FLAGS="--skip-pull --skip-build"
fi

./arasul bootstrap $BOOTSTRAP_FLAGS

echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Factory-Installation abgeschlossen!${NC}"
echo ""

local_hostname=$(grep "^MDNS_NAME=" .env 2>/dev/null | cut -d'=' -f2)
echo -e "  Dashboard: ${BLUE}https://${local_hostname:-arasul}.local${NC}"
echo ""
echo -e "  Dieses Verzeichnis ist die Arasul-Installation."
echo -e "  Verwende ${BOLD}./arasul${NC} zur Verwaltung."
echo -e "${BOLD}══════════════════════════════════════════════════════${NC}"
echo ""
