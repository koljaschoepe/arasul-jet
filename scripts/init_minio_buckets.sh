#!/bin/bash
###############################################################################
# ARASUL PLATFORM - MinIO Bucket Initialization
# Creates default buckets for the platform
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "[INFO] $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# MinIO credentials from environment or defaults
MINIO_HOST="${MINIO_HOST:-minio}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"

log_info "Initializing MinIO buckets..."

# Wait for MinIO to be ready
log_info "Waiting for MinIO to be ready..."
MAX_WAIT=30
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
    if curl -f http://${MINIO_HOST}:${MINIO_PORT}/minio/health/live &> /dev/null; then
        log_success "MinIO is ready"
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    log_error "MinIO did not become ready in time"
    exit 1
fi

# Configure MinIO client alias
log_info "Configuring MinIO client..."
mc alias set local http://${MINIO_HOST}:${MINIO_PORT} ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD}

# List of buckets to create
# Format: "bucket_name:policy:description:versioning:lifecycle_days"
BUCKETS=(
    "documents:private:Document storage for user uploads:enabled:0"
    "workflow-data:private:n8n workflow execution data:enabled:30"
    "llm-cache:private:LLM model caching:disabled:7"
    "embeddings-cache:private:Embedding model caching:disabled:7"
    "backups:private:System backups:enabled:90"
    "updates:private:System update packages:enabled:0"
)

# Create buckets
for bucket_spec in "${BUCKETS[@]}"; do
    IFS=':' read -r bucket_name policy description versioning lifecycle_days <<< "$bucket_spec"

    log_info "Creating bucket: $bucket_name"

    # Check if bucket exists
    if mc ls local/${bucket_name} &> /dev/null; then
        log_warning "Bucket '$bucket_name' already exists, updating configuration"
        BUCKET_EXISTS=true
    else
        BUCKET_EXISTS=false
    fi

    # Create bucket if it doesn't exist
    if [ "$BUCKET_EXISTS" = false ]; then
        if mc mb local/${bucket_name}; then
            log_success "Bucket '$bucket_name' created"
        else
            log_error "Failed to create bucket '$bucket_name'"
            continue
        fi
    fi

    # Set access policy
    if [ "$policy" = "public" ]; then
        log_info "Setting public read policy for bucket: $bucket_name"
        if mc anonymous set download local/${bucket_name}; then
            log_success "Public read policy set for '$bucket_name'"
        else
            log_warning "Failed to set public policy for '$bucket_name'"
        fi
    else
        log_info "Bucket '$bucket_name' is private (default)"
        # Ensure bucket is private
        mc anonymous set none local/${bucket_name} &> /dev/null || true
    fi

    # Set versioning
    if [ "$versioning" = "enabled" ]; then
        log_info "Enabling versioning for bucket: $bucket_name"
        if mc version enable local/${bucket_name}; then
            log_success "Versioning enabled for '$bucket_name'"
        else
            log_warning "Failed to enable versioning for '$bucket_name'"
        fi
    else
        log_info "Versioning disabled for '$bucket_name'"
        mc version suspend local/${bucket_name} &> /dev/null || true
    fi

    # Set lifecycle policy if specified
    if [ "$lifecycle_days" -gt 0 ] 2>/dev/null; then
        log_info "Setting lifecycle policy for bucket: $bucket_name (${lifecycle_days} days retention)"

        # Create lifecycle policy JSON
        LIFECYCLE_JSON=$(cat <<EOF
{
    "Rules": [
        {
            "ID": "ExpireOldObjects",
            "Status": "Enabled",
            "Expiration": {
                "Days": ${lifecycle_days}
            }
        }
    ]
}
EOF
)

        # Save to temporary file
        LIFECYCLE_FILE="/tmp/lifecycle_${bucket_name}.json"
        echo "$LIFECYCLE_JSON" > "$LIFECYCLE_FILE"

        # Apply lifecycle policy
        if mc ilm import local/${bucket_name} < "$LIFECYCLE_FILE"; then
            log_success "Lifecycle policy set for '$bucket_name' (${lifecycle_days} days)"
        else
            log_warning "Failed to set lifecycle policy for '$bucket_name'"
        fi

        # Clean up
        rm -f "$LIFECYCLE_FILE"
    fi

    # Add tags for metadata
    log_info "Setting metadata tags for bucket: $bucket_name"
    mc tag set local/${bucket_name} "description=$description" &> /dev/null || true
    mc tag set local/${bucket_name} "policy=$policy" &> /dev/null || true
    mc tag set local/${bucket_name} "versioning=$versioning" &> /dev/null || true
    if [ "$lifecycle_days" -gt 0 ] 2>/dev/null; then
        mc tag set local/${bucket_name} "lifecycle_days=$lifecycle_days" &> /dev/null || true
    fi

    log_success "Bucket '$bucket_name' configured successfully"
done

# Verify buckets
log_info "Verifying created buckets..."
BUCKET_COUNT=$(mc ls local | wc -l)
log_success "Total buckets: $BUCKET_COUNT"

echo ""
log_info "Bucket Summary:"
echo "─────────────────────────────────────────────────────────────────"

for bucket_spec in "${BUCKETS[@]}"; do
    IFS=':' read -r bucket_name policy description versioning lifecycle_days <<< "$bucket_spec"

    # Check if bucket exists
    if mc ls local/${bucket_name} &> /dev/null; then
        # Get bucket size
        SIZE=$(mc du local/${bucket_name} 2>/dev/null | awk '{print $1, $2}' || echo "0 B")

        # Get object count
        OBJECTS=$(mc ls local/${bucket_name} --recursive 2>/dev/null | wc -l || echo "0")

        # Get versioning status
        VERSION_STATUS=$(mc version info local/${bucket_name} 2>/dev/null | grep -o "Enabled\|Suspended" || echo "Disabled")

        echo "Bucket: $bucket_name"
        echo "  Description: $description"
        echo "  Policy: $policy"
        echo "  Versioning: $VERSION_STATUS"
        if [ "$lifecycle_days" -gt 0 ] 2>/dev/null; then
            echo "  Lifecycle: ${lifecycle_days} days retention"
        fi
        echo "  Size: $SIZE"
        echo "  Objects: $OBJECTS"
        echo ""
    else
        log_warning "Bucket '$bucket_name' not found (creation may have failed)"
    fi
done

echo "─────────────────────────────────────────────────────────────────"

# Display MinIO client configuration
log_info "MinIO Client Configuration:"
mc alias list local 2>/dev/null || true

log_success "MinIO bucket initialization complete!"
log_info "Buckets are accessible at: http://${MINIO_HOST}:${MINIO_PORT}"
