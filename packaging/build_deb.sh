#!/usr/bin/env bash
#
# Build .deb package for Arasul Platform
#
# Usage: ./build_deb.sh [version]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="${1:-1.0.0}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# Package details
PACKAGE_NAME="arasul-platform"
PACKAGE_DIR="${SCRIPT_DIR}/${PACKAGE_NAME}"
BUILD_DIR="${SCRIPT_DIR}/build"
OUTPUT_DIR="${SCRIPT_DIR}/dist"

info "Building Arasul Platform .deb package v${VERSION}..."

# Clean previous builds
if [ -d "$BUILD_DIR" ]; then
    rm -rf "$BUILD_DIR"
fi

if [ -d "$PACKAGE_DIR/opt" ]; then
    rm -rf "$PACKAGE_DIR/opt"
fi

# Create build directory structure
mkdir -p "$BUILD_DIR"
mkdir -p "$OUTPUT_DIR"

# Create package structure
mkdir -p "${PACKAGE_DIR}/opt/arasul"

# Copy application files
info "Copying application files..."

# Core files
cp "${PROJECT_ROOT}/arasul" "${PACKAGE_DIR}/opt/arasul/"
cp "${PROJECT_ROOT}/docker-compose.yml" "${PACKAGE_DIR}/opt/arasul/"
cp "${PROJECT_ROOT}/README.md" "${PACKAGE_DIR}/opt/arasul/" || true
cp "${PROJECT_ROOT}/config/.env.template" "${PACKAGE_DIR}/opt/arasul/" || true

# Scripts
mkdir -p "${PACKAGE_DIR}/opt/arasul/scripts"
cp -r "${PROJECT_ROOT}/scripts/"* "${PACKAGE_DIR}/opt/arasul/scripts/" || true

# Services
mkdir -p "${PACKAGE_DIR}/opt/arasul/services"
cp -r "${PROJECT_ROOT}/services/"* "${PACKAGE_DIR}/opt/arasul/services/" || true

# Tests
mkdir -p "${PACKAGE_DIR}/opt/arasul/tests"
cp -r "${PROJECT_ROOT}/tests/"* "${PACKAGE_DIR}/opt/arasul/tests/" || true

# Config templates
mkdir -p "${PACKAGE_DIR}/opt/arasul/config"
if [ -f "${PROJECT_ROOT}/config/.env.template" ]; then
    cp "${PROJECT_ROOT}/config/.env.template" "${PACKAGE_DIR}/opt/arasul/config/"
fi

success "Application files copied"

# Set permissions
info "Setting permissions..."
find "${PACKAGE_DIR}/opt/arasul" -type f -name "*.sh" -exec chmod 755 {} \;
find "${PACKAGE_DIR}/opt/arasul" -type f -name "*.py" -exec chmod 755 {} \;
chmod 755 "${PACKAGE_DIR}/opt/arasul/arasul"
success "Permissions set"

# Update version in control file
info "Updating package version to ${VERSION}..."
sed -i.bak "s/^Version:.*/Version: ${VERSION}/" "${PACKAGE_DIR}/DEBIAN/control"
rm -f "${PACKAGE_DIR}/DEBIAN/control.bak"
success "Version updated"

# Calculate installed size
INSTALLED_SIZE=$(du -sk "${PACKAGE_DIR}/opt" | cut -f1)
info "Calculating installed size: ${INSTALLED_SIZE} KB"
if grep -q "^Installed-Size:" "${PACKAGE_DIR}/DEBIAN/control"; then
    sed -i.bak "s/^Installed-Size:.*/Installed-Size: ${INSTALLED_SIZE}/" "${PACKAGE_DIR}/DEBIAN/control"
    rm -f "${PACKAGE_DIR}/DEBIAN/control.bak"
else
    echo "Installed-Size: ${INSTALLED_SIZE}" >> "${PACKAGE_DIR}/DEBIAN/control"
fi

# Build package
PACKAGE_FILE="${OUTPUT_DIR}/${PACKAGE_NAME}_${VERSION}_arm64.deb"

info "Building package: ${PACKAGE_FILE}..."

if command -v dpkg-deb &> /dev/null; then
    dpkg-deb --build --root-owner-group "${PACKAGE_DIR}" "${PACKAGE_FILE}"
    success "Package built successfully!"
else
    error "dpkg-deb not found. Please install dpkg."
    exit 1
fi

# Verify package
info "Verifying package..."
if dpkg-deb --info "${PACKAGE_FILE}" > /dev/null 2>&1; then
    success "Package verification passed"
else
    error "Package verification failed"
    exit 1
fi

# Display package info
echo
info "=== Package Information ==="
dpkg-deb --info "${PACKAGE_FILE}"
echo

# Calculate checksums
info "Generating checksums..."
cd "$OUTPUT_DIR"

sha256sum "$(basename "$PACKAGE_FILE")" > "${PACKAGE_NAME}_${VERSION}_arm64.deb.sha256"
md5sum "$(basename "$PACKAGE_FILE")" > "${PACKAGE_NAME}_${VERSION}_arm64.deb.md5"

success "Checksums generated"

# Summary
PACKAGE_SIZE=$(du -h "$PACKAGE_FILE" | cut -f1)

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  BUILD SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Package:     ${PACKAGE_NAME}"
echo "Version:     ${VERSION}"
echo "Architecture: arm64"
echo "File:        ${PACKAGE_FILE}"
echo "Size:        ${PACKAGE_SIZE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
success "Build completed successfully!"
echo
info "Installation instructions:"
echo "  sudo dpkg -i ${PACKAGE_FILE}"
echo "  sudo apt-get install -f  # Install dependencies"
echo
info "Or transfer to Jetson and install:"
echo "  scp ${PACKAGE_FILE} jetson@jetson.local:"
echo "  ssh jetson@jetson.local 'sudo dpkg -i $(basename $PACKAGE_FILE)'"
echo

exit 0
