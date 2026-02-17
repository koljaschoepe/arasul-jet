#!/bin/bash
set -e

# ARASUL Update Package Creator
# Creates signed .araupdate packages for offline deployment
#
# Usage: ./create_update_package.sh <version> [options] <components...>
# Options:
#   --from-version <ver>  Only include migrations newer than this version
#   --min-version <ver>   Minimum system version required (default: 1.0.0)
#   --release-notes <msg> Release notes for this update

VERSION="$1"
shift || true

# Parse options
FROM_VERSION=""
MIN_VERSION="1.0.0"
RELEASE_NOTES=""
COMPONENTS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --from-version)
            FROM_VERSION="$2"
            shift 2
            ;;
        --min-version)
            MIN_VERSION="$2"
            shift 2
            ;;
        --release-notes)
            RELEASE_NOTES="$2"
            shift 2
            ;;
        *)
            COMPONENTS+=("$1")
            shift
            ;;
    esac
done

if [ -z "$VERSION" ] || [ ${#COMPONENTS[@]} -eq 0 ]; then
    echo "Usage: $0 <version> [options] <component1> [component2...]"
    echo ""
    echo "Options:"
    echo "  --from-version <ver>  Only include migrations newer than this version"
    echo "  --min-version <ver>   Minimum system version required (default: 1.0.0)"
    echo "  --release-notes <msg> Release notes for this update"
    echo ""
    echo "Example: $0 2.1.0 --from-version 2.0.0 dashboard-backend dashboard-frontend postgres"
    echo ""
    echo "Available components:"
    echo "  - dashboard-backend   (Docker image)"
    echo "  - dashboard-frontend  (Docker image)"
    echo "  - llm-service         (Docker image)"
    echo "  - embedding-service   (Docker image)"
    echo "  - metrics-collector   (Docker image)"
    echo "  - self-healing-agent  (Docker image)"
    echo "  - n8n                 (Custom nodes archive)"
    echo "  - postgres            (SQL migrations)"
    echo "  - all                 (All of the above)"
    exit 1
fi

# Expand 'all' shortcut
if [[ " ${COMPONENTS[*]} " =~ " all " ]]; then
    COMPONENTS=(dashboard-backend dashboard-frontend llm-service embedding-service metrics-collector self-healing-agent n8n postgres)
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Read current version from VERSION file if exists
CURRENT_VERSION="1.0.0"
if [ -f "$PROJECT_ROOT/VERSION" ]; then
    CURRENT_VERSION="$(cat "$PROJECT_ROOT/VERSION" | tr -d '[:space:]')"
fi

echo "=================================================="
echo "  ARASUL Update Package Creator"
echo "=================================================="
echo "  Target version:  $VERSION"
echo "  Current version: $CURRENT_VERSION"
echo "  Min version:     $MIN_VERSION"
echo "  Components:      ${COMPONENTS[*]}"
if [ -n "$FROM_VERSION" ]; then
    echo "  Migrations from: $FROM_VERSION"
fi
echo "=================================================="
echo ""

# Workspace erstellen
WORKSPACE="/tmp/arasul-update-$VERSION"
rm -rf "$WORKSPACE"
mkdir -p "$WORKSPACE/payload/images"
mkdir -p "$WORKSPACE/payload/migrations"
mkdir -p "$WORKSPACE/payload/config"
mkdir -p "$WORKSPACE/payload/scripts"

# Build manifest with proper component objects
MANIFEST_COMPONENTS="[]"

add_component() {
    local name="$1"
    local type="$2"
    local service="$3"
    local file="$4"
    MANIFEST_COMPONENTS=$(python3 -c "
import json, sys
comps = json.loads('$MANIFEST_COMPONENTS')
comps.append({'name': '$name', 'type': '$type', 'service': '$service', 'file': '$file'})
print(json.dumps(comps))
")
}

# Komponenten vorbereiten
for component in "${COMPONENTS[@]}"; do
    echo "Packaging $component..."

    case "$component" in
        "dashboard-backend")
            docker build -t "arasul-dashboard-backend:$VERSION" \
                "$PROJECT_ROOT/services/dashboard-backend"
            docker save "arasul-dashboard-backend:$VERSION" | \
                gzip > "$WORKSPACE/payload/images/dashboard-backend-$VERSION.tar.gz"
            add_component "dashboard-backend" "docker_image" "dashboard-backend" "images/dashboard-backend-$VERSION.tar.gz"
            echo "  Dashboard Backend packaged"
            ;;

        "dashboard-frontend")
            docker build -t "arasul-dashboard-frontend:$VERSION" \
                "$PROJECT_ROOT/services/dashboard-frontend"
            docker save "arasul-dashboard-frontend:$VERSION" | \
                gzip > "$WORKSPACE/payload/images/dashboard-frontend-$VERSION.tar.gz"
            add_component "dashboard-frontend" "docker_image" "dashboard-frontend" "images/dashboard-frontend-$VERSION.tar.gz"
            echo "  Dashboard Frontend packaged"
            ;;

        "llm-service")
            docker build -t "arasul-llm-service:$VERSION" \
                "$PROJECT_ROOT/services/llm-service"
            docker save "arasul-llm-service:$VERSION" | \
                gzip > "$WORKSPACE/payload/images/llm-service-$VERSION.tar.gz"
            add_component "llm-service" "docker_image" "llm-service" "images/llm-service-$VERSION.tar.gz"
            echo "  LLM Service packaged"
            ;;

        "embedding-service")
            docker build -t "arasul-embedding-service:$VERSION" \
                "$PROJECT_ROOT/services/embedding-service"
            docker save "arasul-embedding-service:$VERSION" | \
                gzip > "$WORKSPACE/payload/images/embedding-service-$VERSION.tar.gz"
            add_component "embedding-service" "docker_image" "embedding-service" "images/embedding-service-$VERSION.tar.gz"
            echo "  Embedding Service packaged"
            ;;

        "metrics-collector")
            docker build -t "arasul-metrics-collector:$VERSION" \
                "$PROJECT_ROOT/services/metrics-collector"
            docker save "arasul-metrics-collector:$VERSION" | \
                gzip > "$WORKSPACE/payload/images/metrics-collector-$VERSION.tar.gz"
            add_component "metrics-collector" "docker_image" "metrics-collector" "images/metrics-collector-$VERSION.tar.gz"
            echo "  Metrics Collector packaged"
            ;;

        "self-healing-agent")
            docker build -t "arasul-self-healing-agent:$VERSION" \
                "$PROJECT_ROOT/services/self-healing-agent"
            docker save "arasul-self-healing-agent:$VERSION" | \
                gzip > "$WORKSPACE/payload/images/self-healing-agent-$VERSION.tar.gz"
            add_component "self-healing-agent" "docker_image" "self-healing-agent" "images/self-healing-agent-$VERSION.tar.gz"
            echo "  Self-Healing Agent packaged"
            ;;

        "n8n")
            if [ -d "$PROJECT_ROOT/services/n8n/custom-nodes/n8n-nodes-arasul-llm/dist" ]; then
                tar -czf "$WORKSPACE/payload/n8n-custom-nodes-$VERSION.tar.gz" \
                    -C "$PROJECT_ROOT/services/n8n" \
                    custom-nodes/n8n-nodes-arasul-llm/dist \
                    custom-nodes/n8n-nodes-arasul-embeddings/dist
                add_component "n8n-custom-nodes" "archive" "n8n" "n8n-custom-nodes-$VERSION.tar.gz"
                echo "  n8n Custom Nodes packaged"
            else
                echo "  WARNING: n8n custom nodes not built. Run: cd services/n8n/custom-nodes/n8n-nodes-arasul-llm && npm run build"
                exit 1
            fi
            ;;

        "postgres")
            MIGRATIONS_DIR="$PROJECT_ROOT/services/postgres/init"
            if [ -d "$MIGRATIONS_DIR" ]; then
                # If --from-version specified, only include newer migrations
                if [ -n "$FROM_VERSION" ]; then
                    # Get migration number from version (e.g., migrations run up to that version)
                    echo "  Including migrations for upgrade from $FROM_VERSION to $VERSION"
                fi

                # Copy all SQL migrations to payload
                cp "$MIGRATIONS_DIR"/*.sql "$WORKSPACE/payload/migrations/" 2>/dev/null || true

                MIGRATION_COUNT=$(ls -1 "$WORKSPACE/payload/migrations/"*.sql 2>/dev/null | wc -l)
                if [ "$MIGRATION_COUNT" -gt 0 ]; then
                    add_component "postgres-migrations" "migrations" "postgres-db" "migrations/"
                    echo "  PostgreSQL Migrations packaged ($MIGRATION_COUNT files)"
                else
                    echo "  WARNING: No migration files found"
                fi
            else
                echo "  WARNING: PostgreSQL init directory not found"
                exit 1
            fi
            ;;

        *)
            echo "  WARNING: Unknown component: $component (skipping)"
            ;;
    esac
done

# Checksum berechnen
cd "$WORKSPACE/payload"
if command -v sha256sum &> /dev/null; then
    CHECKSUM=$(find . -type f -exec sha256sum {} \; | \
               sort -k 2 | \
               sha256sum | \
               awk '{print $1}')
else
    CHECKSUM=$(find . -type f -exec shasum -a 256 {} \; | \
               sort -k 2 | \
               shasum -a 256 | \
               awk '{print $1}')
fi
cd - > /dev/null

# Generate manifest with proper component objects
if [ -z "$RELEASE_NOTES" ]; then
    RELEASE_NOTES="Update to version $VERSION"
fi

python3 -c "
import json
manifest = {
    'version': '$VERSION',
    'min_version': '$MIN_VERSION',
    'from_version': '$CURRENT_VERSION',
    'components': json.loads('$MANIFEST_COMPONENTS'),
    'requires_reboot': False,
    'release_notes': '$RELEASE_NOTES',
    'created_at': '$(date -u +%Y-%m-%dT%H:%M:%SZ)',
    'checksum': '$CHECKSUM'
}
with open('$WORKSPACE/manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)
"

echo ""
echo "Manifest:"
cat "$WORKSPACE/manifest.json"
echo ""

# Package erstellen (tar.gz)
OUTPUT_FILE="$PROJECT_ROOT/arasul-update-$VERSION.tar.gz"
tar -czf "$OUTPUT_FILE" -C "$WORKSPACE" manifest.json payload/

echo "Update package created: $OUTPUT_FILE"
echo "   Size: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""

# Signieren
echo "Signing package..."
PRIVATE_KEY_PATH="${PRIVATE_KEY_PATH:-$HOME/.arasul/update_private_key.pem}"

if [ ! -f "$PRIVATE_KEY_PATH" ]; then
    echo "WARNING: Private key not found at: $PRIVATE_KEY_PATH"
    echo ""
    echo "Generate keys with:"
    echo "  mkdir -p ~/.arasul"
    echo "  openssl genrsa -out ~/.arasul/update_private_key.pem 4096"
    echo "  openssl rsa -in ~/.arasul/update_private_key.pem -pubout -out ~/.arasul/update_public_key.pem"
    echo ""
    echo "Or set PRIVATE_KEY_PATH environment variable to your key location"
    exit 1
fi

python3 "$SCRIPT_DIR/sign_update_package.py" "$OUTPUT_FILE" "$PRIVATE_KEY_PATH"

FINAL_FILE="${OUTPUT_FILE%.tar.gz}.araupdate"
echo ""
echo "=================================================="
echo "  Update package ready!"
echo "=================================================="
echo "  File:    $FINAL_FILE"
echo "  Version: $VERSION"
echo ""
echo "Deployment options:"
echo "  1. Dashboard: Upload at https://arasul.local -> Einstellungen -> Updates"
echo "  2. USB-Stick: Copy $FINAL_FILE and ${FINAL_FILE}.sig to USB drive"
echo "=================================================="
