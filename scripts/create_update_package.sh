#!/bin/bash
set -e

# ARASUL Update Package Creator
# Usage: ./create_update_package.sh <version> <components...>

VERSION="$1"
shift
COMPONENTS="$@"

if [ -z "$VERSION" ] || [ -z "$COMPONENTS" ]; then
    echo "Usage: $0 <version> <component1> [component2...]"
    echo ""
    echo "Example: $0 2.1.0 dashboard-backend dashboard-frontend"
    echo ""
    echo "Available components:"
    echo "  - dashboard-backend"
    echo "  - dashboard-frontend"
    echo "  - llm-service"
    echo "  - embedding-service"
    echo "  - metrics-collector"
    echo "  - self-healing-agent"
    echo "  - n8n (custom nodes only)"
    echo "  - postgres (migrations only)"
    exit 1
fi

echo "🏗️  Creating Arasul Update Package"
echo "Version: $VERSION"
echo "Components: $COMPONENTS"
echo ""

# Workspace erstellen
WORKSPACE="/tmp/arasul-update-$VERSION"
rm -rf "$WORKSPACE"
mkdir -p "$WORKSPACE/payload"

# Get script directory for finding sign_update_package.py
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Manifest erstellen
cat > "$WORKSPACE/manifest.json" <<EOF
{
  "version": "$VERSION",
  "min_version": "1.0.0",
  "components": [$(echo "$COMPONENTS" | sed 's/ /", "/g' | sed 's/^/"/;s/$/"/')],
  "requires_reboot": false,
  "release_notes": "Update to version $VERSION",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "checksum": ""
}
EOF

# Komponenten vorbereiten
for component in $COMPONENTS; do
    echo "📦 Packaging $component..."

    case $component in
        "dashboard-backend")
            # Build Docker Image
            docker build -t arasul-dashboard-backend:$VERSION \
                "$PROJECT_ROOT/services/dashboard-backend"

            # Export Image
            docker save arasul-dashboard-backend:$VERSION | \
                gzip > "$WORKSPACE/payload/dashboard-backend-$VERSION.tar.gz"

            echo "  ✅ Dashboard Backend packaged"
            ;;

        "dashboard-frontend")
            # Build Docker Image
            docker build -t arasul-dashboard-frontend:$VERSION \
                "$PROJECT_ROOT/services/dashboard-frontend"

            # Export Image
            docker save arasul-dashboard-frontend:$VERSION | \
                gzip > "$WORKSPACE/payload/dashboard-frontend-$VERSION.tar.gz"

            echo "  ✅ Dashboard Frontend packaged"
            ;;

        "llm-service")
            # Build Custom LLM Service
            docker build -t arasul-llm-service:$VERSION \
                "$PROJECT_ROOT/services/llm-service"

            docker save arasul-llm-service:$VERSION | \
                gzip > "$WORKSPACE/payload/llm-service-$VERSION.tar.gz"

            echo "  ✅ LLM Service packaged"
            ;;

        "embedding-service")
            docker build -t arasul-embedding-service:$VERSION \
                "$PROJECT_ROOT/services/embedding-service"

            docker save arasul-embedding-service:$VERSION | \
                gzip > "$WORKSPACE/payload/embedding-service-$VERSION.tar.gz"

            echo "  ✅ Embedding Service packaged"
            ;;

        "metrics-collector")
            docker build -t arasul-metrics-collector:$VERSION \
                "$PROJECT_ROOT/services/metrics-collector"

            docker save arasul-metrics-collector:$VERSION | \
                gzip > "$WORKSPACE/payload/metrics-collector-$VERSION.tar.gz"

            echo "  ✅ Metrics Collector packaged"
            ;;

        "self-healing-agent")
            docker build -t arasul-self-healing-agent:$VERSION \
                "$PROJECT_ROOT/services/self-healing-agent"

            docker save arasul-self-healing-agent:$VERSION | \
                gzip > "$WORKSPACE/payload/self-healing-agent-$VERSION.tar.gz"

            echo "  ✅ Self-Healing Agent packaged"
            ;;

        "n8n")
            # Nur Custom Nodes (Base n8n Image wird nicht geändert)
            if [ -d "$PROJECT_ROOT/services/n8n/custom-nodes/n8n-nodes-arasul-llm/dist" ]; then
                tar -czf "$WORKSPACE/payload/n8n-custom-nodes-$VERSION.tar.gz" \
                    -C "$PROJECT_ROOT/services/n8n" \
                    custom-nodes/n8n-nodes-arasul-llm/dist \
                    custom-nodes/n8n-nodes-arasul-embeddings/dist

                echo "  ✅ n8n Custom Nodes packaged"
            else
                echo "  ⚠️  n8n custom nodes not built. Run: cd services/n8n/custom-nodes/n8n-nodes-arasul-llm && npm run build"
                exit 1
            fi
            ;;

        "postgres")
            # Nur Migrations
            if [ -d "$PROJECT_ROOT/services/postgres/init" ]; then
                tar -czf "$WORKSPACE/payload/postgres-migrations-$VERSION.tar.gz" \
                    -C "$PROJECT_ROOT/services/postgres/init" .

                echo "  ✅ PostgreSQL Migrations packaged"
            else
                echo "  ⚠️  PostgreSQL init directory not found"
                exit 1
            fi
            ;;

        *)
            echo "  ⚠️  Unknown component: $component (skipping)"
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
    # macOS fallback
    CHECKSUM=$(find . -type f -exec shasum -a 256 {} \; | \
               sort -k 2 | \
               shasum -a 256 | \
               awk '{print $1}')
fi
cd - > /dev/null

# Checksum in Manifest eintragen
if command -v jq &> /dev/null; then
    jq ".checksum = \"$CHECKSUM\"" "$WORKSPACE/manifest.json" > "$WORKSPACE/manifest.tmp"
    mv "$WORKSPACE/manifest.tmp" "$WORKSPACE/manifest.json"
else
    # Fallback without jq
    python3 -c "import json, sys; data = json.load(open('$WORKSPACE/manifest.json')); data['checksum'] = '$CHECKSUM'; json.dump(data, open('$WORKSPACE/manifest.json', 'w'), indent=2)"
fi

echo ""
echo "📝 Manifest:"
cat "$WORKSPACE/manifest.json"
echo ""

# Package erstellen (tar.gz)
OUTPUT_FILE="$PROJECT_ROOT/arasul-update-$VERSION.tar.gz"
tar -czf "$OUTPUT_FILE" -C "$WORKSPACE" manifest.json payload/

echo "✅ Update package created: $OUTPUT_FILE"
echo "   Size: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""

# Signieren
echo "🔐 Signing package..."
PRIVATE_KEY_PATH="${PRIVATE_KEY_PATH:-$HOME/.arasul/update_private_key.pem}"

if [ ! -f "$PRIVATE_KEY_PATH" ]; then
    echo "⚠️  Private key not found at: $PRIVATE_KEY_PATH"
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

echo ""
echo "✅ Update package ready: ${OUTPUT_FILE%.tar.gz}.araupdate"
echo ""
echo "Next steps:"
echo "  1. Test package: ./arasul test-update ${OUTPUT_FILE%.tar.gz}.araupdate"
echo "  2. Deploy via Dashboard: Upload at https://arasul.local/updates"
echo "  3. Or copy to USB stick: /updates/*.araupdate"
