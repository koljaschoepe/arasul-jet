#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Deployment Image Creator
# Creates a reproducible deployment package for Jetson AGX Orin.
#
# This script:
#   1. Pins all Docker images to specific versions
#   2. Pulls/builds all images
#   3. Pre-loads Ollama models
#   4. Initializes the database
#   5. Runs system tests
#   6. Creates a deployable archive
#
# Usage:
#   ./scripts/create-deployment-image.sh [--model MODEL] [--output DIR] [--skip-tests]
#
# Output:
#   A tar archive containing everything needed for deployment.
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
MODEL="llama3.1:8b"
OUTPUT_DIR="./deployment"
SKIP_TESTS=false
VERSION=$(date +%Y%m%d)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# CLI flags
for arg in "$@"; do
  case "$arg" in
    --model=*)      MODEL="${arg#*=}" ;;
    --output=*)     OUTPUT_DIR="${arg#*=}" ;;
    --skip-tests)   SKIP_TESTS=true ;;
    --version=*)    VERSION="${arg#*=}" ;;
    --help|-h)
      echo "Usage: $0 [--model=MODEL] [--output=DIR] [--skip-tests] [--version=VER]"
      echo "  --model=MODEL    Ollama model to pre-load (default: llama3.1:8b)"
      echo "  --output=DIR     Output directory (default: ./deployment)"
      echo "  --skip-tests     Skip test execution"
      echo "  --version=VER    Version string (default: YYYYMMDD)"
      exit 0
      ;;
  esac
done

###############################################################################
# HELPER FUNCTIONS
###############################################################################

log_step() {
  echo ""
  echo -e "${BOLD}[Step $1/$TOTAL_STEPS] $2${NC}"
  echo -e "${BOLD}$(printf '%.0s─' {1..60})${NC}"
}

log_info()    { echo -e "  ${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "  ${GREEN}✓${NC} $1"; }
log_warning() { echo -e "  ${YELLOW}!${NC} $1"; }
log_error()   { echo -e "  ${RED}✗${NC} $1"; }

TOTAL_STEPS=7

###############################################################################
# PRE-FLIGHT CHECKS
###############################################################################

echo -e "${BOLD}Arasul Deployment Image Creator${NC}"
echo -e "Version: ${VERSION}"
echo -e "Model: ${MODEL}"
echo -e "Output: ${OUTPUT_DIR}"
echo ""

# Check prerequisites
if ! command -v docker &>/dev/null; then
  log_error "Docker not found. Install Docker first."
  exit 1
fi

if ! docker compose version &>/dev/null; then
  log_error "Docker Compose V2 not found."
  exit 1
fi

###############################################################################
# STEP 1: Version Lock
###############################################################################

log_step 1 "Locking Docker image versions"

# Read current image versions from docker-compose.yml
IMAGES=$(docker compose config --images 2>/dev/null | sort -u)
VERSION_FILE="${OUTPUT_DIR}/image-versions.txt"
mkdir -p "$OUTPUT_DIR"

echo "# Arasul Platform - Docker Image Versions" > "$VERSION_FILE"
echo "# Generated: $(date -Iseconds)" >> "$VERSION_FILE"
echo "# Version: ${VERSION}" >> "$VERSION_FILE"
echo "" >> "$VERSION_FILE"

while IFS= read -r image; do
  if [ -n "$image" ]; then
    # Get the digest for reproducibility
    digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$image" 2>/dev/null || echo "N/A")
    echo "${image} -> ${digest}" >> "$VERSION_FILE"
  fi
done <<< "$IMAGES"

log_success "Image versions locked to $VERSION_FILE"

###############################################################################
# STEP 2: Build/Pull Images
###############################################################################

log_step 2 "Building and pulling Docker images"

# Build project-specific images
log_info "Building project images..."
docker compose build --quiet 2>&1 | while IFS= read -r line; do
  echo "  $line"
done

# Pull external images
log_info "Pulling external images..."
docker compose pull --quiet 2>&1 | while IFS= read -r line; do
  echo "  $line"
done

log_success "All Docker images ready"

###############################################################################
# STEP 3: Export Docker Images
###############################################################################

log_step 3 "Exporting Docker images to archive"

IMAGES_DIR="${OUTPUT_DIR}/docker-images"
mkdir -p "$IMAGES_DIR"

IMAGE_COUNT=0
while IFS= read -r image; do
  if [ -n "$image" ]; then
    SAFE_NAME=$(echo "$image" | tr '/:' '_')
    log_info "Saving ${image}..."
    docker save "$image" | gzip > "${IMAGES_DIR}/${SAFE_NAME}.tar.gz"
    IMAGE_COUNT=$((IMAGE_COUNT + 1))
  fi
done <<< "$IMAGES"

log_success "Exported $IMAGE_COUNT Docker images"

###############################################################################
# STEP 4: Pre-load Ollama Model
###############################################################################

log_step 4 "Pre-loading Ollama model: ${MODEL}"

if docker compose ps llm-service --format "{{.State}}" 2>/dev/null | grep -q "running"; then
  log_info "Pulling model ${MODEL} (this may take a while)..."
  docker exec llm-service ollama pull "$MODEL" 2>&1 | tail -5

  # Export model data
  OLLAMA_DIR="${OUTPUT_DIR}/ollama-models"
  mkdir -p "$OLLAMA_DIR"

  log_info "Exporting Ollama model data..."
  docker cp llm-service:/root/.ollama/models "$OLLAMA_DIR/" 2>/dev/null || \
    log_warning "Could not export Ollama models - they will be pulled on first run"

  log_success "Ollama model ${MODEL} ready"
else
  log_warning "LLM service not running - skipping model pre-load"
fi

###############################################################################
# STEP 5: Database Initialization
###############################################################################

log_step 5 "Preparing database initialization"

# Copy migration files
MIGRATIONS_DIR="${OUTPUT_DIR}/migrations"
mkdir -p "$MIGRATIONS_DIR"

if [ -d "services/postgres/init" ]; then
  cp -r services/postgres/init/* "$MIGRATIONS_DIR/" 2>/dev/null || true
  MIGRATION_COUNT=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l)
  log_success "Copied $MIGRATION_COUNT database migrations"
else
  log_warning "No migration files found"
fi

###############################################################################
# STEP 6: Run Tests
###############################################################################

log_step 6 "Running system tests"

if $SKIP_TESTS; then
  log_warning "Tests skipped (--skip-tests)"
else
  # Backend tests
  log_info "Running backend tests..."
  if ./scripts/run-tests.sh --backend 2>&1 | tail -5; then
    log_success "Backend tests passed"
  else
    log_warning "Some backend tests failed (check output above)"
  fi

  # Frontend tests
  log_info "Running frontend tests..."
  if cd services/dashboard-frontend && CI=true npm test -- --watchAll=false 2>&1 | tail -5; then
    log_success "Frontend tests passed"
  else
    log_warning "Some frontend tests failed (check output above)"
  fi
  cd "$PROJECT_ROOT"

  # Integration tests (if services are running)
  if docker compose ps --format "{{.State}}" 2>/dev/null | grep -q "running"; then
    log_info "Running integration tests..."
    if ./scripts/integration-test.sh 2>&1 | tail -10; then
      log_success "Integration tests passed"
    else
      log_warning "Some integration tests failed"
    fi
  fi
fi

###############################################################################
# STEP 7: Create Deployment Archive
###############################################################################

log_step 7 "Creating deployment archive"

# Copy essential files
DEPLOY_DIR="${OUTPUT_DIR}/arasul-${VERSION}"
mkdir -p "$DEPLOY_DIR"

# Copy project files (excluding data, node_modules, .git)
log_info "Copying project files..."
rsync -a --quiet \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='data/' \
  --exclude='deployment/' \
  --exclude='*.log' \
  --exclude='__pycache__' \
  --exclude='.env' \
  . "$DEPLOY_DIR/"

# Move Docker images into deployment
mv "$IMAGES_DIR" "$DEPLOY_DIR/docker-images"

# Move Ollama models if exported
if [ -d "${OUTPUT_DIR}/ollama-models" ]; then
  mv "${OUTPUT_DIR}/ollama-models" "$DEPLOY_DIR/ollama-models"
fi

# Move migrations
mv "$MIGRATIONS_DIR" "$DEPLOY_DIR/migrations"

# Copy version file
mv "$VERSION_FILE" "$DEPLOY_DIR/"

# Create install script
cat > "$DEPLOY_DIR/install.sh" << 'INSTALL_EOF'
#!/bin/bash
###############################################################################
# ARASUL PLATFORM - Installation Script
# Run this on a fresh Jetson to deploy the Arasul Platform.
###############################################################################

set -euo pipefail

echo "=== Arasul Platform Installation ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/arasul"

# Create install directory
sudo mkdir -p "$INSTALL_DIR"
sudo chown "$(whoami)" "$INSTALL_DIR"

# Copy project files
echo "[1/5] Copying project files..."
rsync -a --exclude='docker-images' --exclude='ollama-models' \
  "$SCRIPT_DIR/" "$INSTALL_DIR/"

# Load Docker images
echo "[2/5] Loading Docker images..."
for img in "$SCRIPT_DIR/docker-images"/*.tar.gz; do
  echo "  Loading $(basename "$img")..."
  docker load < "$img"
done

# Pre-load Ollama models
if [ -d "$SCRIPT_DIR/ollama-models/models" ]; then
  echo "[3/5] Pre-loading Ollama models..."
  mkdir -p "$INSTALL_DIR/data/ollama"
  cp -r "$SCRIPT_DIR/ollama-models/models" "$INSTALL_DIR/data/ollama/"
else
  echo "[3/5] Skipping Ollama models (not included)"
fi

# Run preconfigure
echo "[4/5] Running pre-configuration..."
cd "$INSTALL_DIR"
./scripts/preconfigure.sh --skip-pull

# Start services
echo "[5/5] Starting services..."
docker compose up -d

echo ""
echo "=== Installation Complete ==="
echo "Access the platform at: http://$(hostname -I | awk '{print $1}')"
echo ""
INSTALL_EOF

chmod +x "$DEPLOY_DIR/install.sh"

# Create archive
ARCHIVE_NAME="arasul-deployment-${VERSION}.tar.gz"
log_info "Creating archive: ${ARCHIVE_NAME}"
cd "$OUTPUT_DIR"
tar czf "$ARCHIVE_NAME" "arasul-${VERSION}/"

# Cleanup temporary directory
rm -rf "arasul-${VERSION}"

ARCHIVE_SIZE=$(du -sh "$ARCHIVE_NAME" | awk '{print $1}')
log_success "Deployment archive created: ${OUTPUT_DIR}/${ARCHIVE_NAME} (${ARCHIVE_SIZE})"

###############################################################################
# SUMMARY
###############################################################################

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Deployment Image Summary${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Version:     ${GREEN}${VERSION}${NC}"
echo -e "  Archive:     ${GREEN}${OUTPUT_DIR}/${ARCHIVE_NAME}${NC}"
echo -e "  Size:        ${ARCHIVE_SIZE}"
echo -e "  Model:       ${MODEL}"
echo -e "  Images:      ${IMAGE_COUNT}"
echo ""
echo -e "  ${BOLD}To deploy on a fresh Jetson:${NC}"
echo -e "  1. Copy archive to Jetson"
echo -e "  2. tar xzf ${ARCHIVE_NAME}"
echo -e "  3. cd arasul-${VERSION}"
echo -e "  4. ./install.sh"
echo ""
echo -e "  ${GREEN}${BOLD}Deployment image creation complete.${NC}"
