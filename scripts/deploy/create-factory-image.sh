#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Factory Image Creator
# Creates a complete offline deployment package for new Jetson devices.
#
# Output: arasul-factory-<version>.tar.gz containing:
#   - All Docker images (pre-built)
#   - Project source code (excluding dev files)
#   - Provisioning scripts
#   - Manifest with versions and checksums
#
# Usage:
#   ./scripts/deploy/create-factory-image.sh [--output DIR] [--version VER]
#
# On target device:
#   tar xzf arasul-factory-*.tar.gz
#   cd arasul-platform/
#   docker load < images.tar.gz
#   ./scripts/setup/preconfigure.sh --skip-pull
#   docker compose up -d
###############################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

OUTPUT_DIR="${PROJECT_ROOT}/deployment"
VERSION=$(date +%Y%m%d-%H%M)
ARCHIVE_NAME=""

for arg in "$@"; do
  case "$arg" in
    --output=*)  OUTPUT_DIR="${arg#*=}" ;;
    --version=*) VERSION="${arg#*=}" ;;
    --help|-h)
      echo "Usage: $0 [--output=DIR] [--version=VER]"
      echo "  --output=DIR   Output directory (default: ./deployment)"
      echo "  --version=VER  Version tag (default: timestamp)"
      exit 0
      ;;
  esac
done

ARCHIVE_NAME="arasul-factory-${VERSION}"

echo -e "${BLUE}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "${BLUE}${BOLD}    ARASUL - Factory Image erstellen${NC}"
echo -e "${BLUE}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "  Version: ${VERSION}"
echo -e "  Ausgabe: ${OUTPUT_DIR}/${ARCHIVE_NAME}.tar.gz"
echo ""

cd "$PROJECT_ROOT"

###############################################################################
# Step 1: Build all Docker images
###############################################################################
echo -e "${BOLD}[1/5]${NC} Docker-Images bauen..."

docker compose build --parallel 2>&1 | tail -5
echo -e "  ${GREEN}✓${NC} Images gebaut"

###############################################################################
# Step 2: Export Docker images
###############################################################################
echo -e "${BOLD}[2/5]${NC} Docker-Images exportieren..."

mkdir -p "$OUTPUT_DIR"
STAGING="${OUTPUT_DIR}/${ARCHIVE_NAME}"
rm -rf "$STAGING"
mkdir -p "$STAGING"

# Get list of all images used by compose
IMAGES=$(docker compose config --images 2>/dev/null | sort -u)
IMAGE_COUNT=$(echo "$IMAGES" | wc -l)

echo -e "  Exportiere ${IMAGE_COUNT} Images..."
docker save $IMAGES | gzip > "${STAGING}/images.tar.gz"

IMAGE_SIZE=$(du -h "${STAGING}/images.tar.gz" | cut -f1)
echo -e "  ${GREEN}✓${NC} Images exportiert (${IMAGE_SIZE})"

###############################################################################
# Step 3: Copy project files (excluding dev/data)
###############################################################################
echo -e "${BOLD}[3/5]${NC} Projektdateien kopieren..."

rsync -a --exclude-from=- "$PROJECT_ROOT/" "${STAGING}/project/" << 'EXCLUDE'
.git
node_modules
deployment
data/postgres
data/minio
data/qdrant
data/ollama
data/backups
data/uploads
data/n8n
logs
cache
updates
*.tar.gz
.env
config/certs
config/ssh
config/device
EXCLUDE

echo -e "  ${GREEN}✓${NC} Projektdateien kopiert"

###############################################################################
# Step 4: Create manifest
###############################################################################
echo -e "${BOLD}[4/5]${NC} Manifest erstellen..."

# Collect image versions
IMAGE_MANIFEST=""
while IFS= read -r img; do
  digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$img" 2>/dev/null || echo "local-build")
  IMAGE_MANIFEST="${IMAGE_MANIFEST}  ${img}: ${digest}\n"
done <<< "$IMAGES"

cat > "${STAGING}/MANIFEST.yml" << EOF
# Arasul Factory Image Manifest
version: "${VERSION}"
created: "$(date -Iseconds)"
platform: "$(uname -m)"
creator: "$(hostname)"

images:
$(echo -e "$IMAGE_MANIFEST")

checksums:
  images: "$(sha256sum "${STAGING}/images.tar.gz" | cut -d' ' -f1)"

instructions: |
  1. tar xzf ${ARCHIVE_NAME}.tar.gz
  2. cd ${ARCHIVE_NAME}/project
  3. docker load < ../images.tar.gz
  4. ./scripts/setup/preconfigure.sh --skip-pull
  5. docker compose up -d
  6. Browser: http://arasul.local
EOF

echo -e "  ${GREEN}✓${NC} Manifest erstellt"

###############################################################################
# Step 5: Create archive
###############################################################################
echo -e "${BOLD}[5/5]${NC} Archiv erstellen..."

cd "$OUTPUT_DIR"
tar czf "${ARCHIVE_NAME}.tar.gz" "${ARCHIVE_NAME}/"

TOTAL_SIZE=$(du -h "${ARCHIVE_NAME}.tar.gz" | cut -f1)

# Cleanup staging
rm -rf "${ARCHIVE_NAME}/"

echo -e "  ${GREEN}✓${NC} Archiv erstellt"

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}    Factory Image erstellt!${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Datei:  ${BOLD}${OUTPUT_DIR}/${ARCHIVE_NAME}.tar.gz${NC}"
echo -e "  Größe:  ${TOTAL_SIZE}"
echo ""
echo -e "  Auf neuem Gerät:"
echo -e "    tar xzf ${ARCHIVE_NAME}.tar.gz"
echo -e "    cd ${ARCHIVE_NAME}/project"
echo -e "    docker load < ../images.tar.gz"
echo -e "    ./scripts/setup/preconfigure.sh --skip-pull"
echo -e "    docker compose up -d"
echo ""
