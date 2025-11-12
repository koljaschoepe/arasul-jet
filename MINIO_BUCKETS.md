# MinIO Bucket Structure - Arasul Platform

This document describes the MinIO S3-compatible object storage bucket structure used in the Arasul Platform.

## Bucket Overview

The platform uses 6 buckets for different purposes:

| Bucket | Policy | Versioning | Lifecycle | Description |
|--------|--------|------------|-----------|-------------|
| `documents` | Private | Enabled | No expiry | User document uploads and file storage |
| `workflow-data` | Private | Enabled | 30 days | n8n workflow execution data and artifacts |
| `llm-cache` | Private | Disabled | 7 days | LLM model response caching |
| `embeddings-cache` | Private | Disabled | 7 days | Embedding model vector caching |
| `backups` | Private | Enabled | 90 days | System backups (database, config) |
| `updates` | Private | Enabled | No expiry | System update packages (.araupdate files) |

## Bucket Details

### 1. documents

**Purpose**: General document storage for user uploads

**Access**: Private (authenticated access only)

**Versioning**: Enabled - All previous versions of documents are retained

**Lifecycle**: No automatic expiry

**Typical Contents**:
- User-uploaded PDF documents
- Images
- Text files
- Any user data requiring persistent storage

**Usage Example**:
```bash
# Upload a document
mc cp mydocument.pdf local/documents/

# List documents
mc ls local/documents/

# Download a document
mc cp local/documents/mydocument.pdf ./
```

---

### 2. workflow-data

**Purpose**: n8n workflow execution data and artifacts

**Access**: Private

**Versioning**: Enabled - Track workflow data changes

**Lifecycle**: 30 days retention - Automatic cleanup of old workflow artifacts

**Typical Contents**:
- Workflow execution logs
- Intermediate processing files
- Temporary workflow data
- n8n webhook payloads

**Usage Example**:
```bash
# Store workflow output
mc cp workflow-result.json local/workflow-data/executions/

# List workflow data
mc ls local/workflow-data/ --recursive
```

---

### 3. llm-cache

**Purpose**: LLM model response caching

**Access**: Private

**Versioning**: Disabled - Only latest cache entries needed

**Lifecycle**: 7 days retention - Automatic cleanup of old cache entries

**Typical Contents**:
- Cached LLM responses
- Model inference results
- Prompt-response pairs (for frequently used prompts)

**Usage Example**:
```bash
# Check cache size
mc du local/llm-cache/

# Clear cache manually (if needed)
mc rm --recursive --force local/llm-cache/
```

**Note**: Cache entries are automatically cleaned up after 7 days to prevent disk bloat.

---

### 4. embeddings-cache

**Purpose**: Embedding model vector caching

**Access**: Private

**Versioning**: Disabled - Only latest embeddings needed

**Lifecycle**: 7 days retention - Automatic cleanup

**Typical Contents**:
- Cached embedding vectors
- Text-to-vector mappings
- Frequently used embeddings

**Usage Example**:
```bash
# Check cache size
mc du local/embeddings-cache/

# View cached embeddings
mc ls local/embeddings-cache/
```

**Note**: Embeddings are deterministic, so caching reduces computation time for repeated texts.

---

### 5. backups

**Purpose**: System backups (database, configuration)

**Access**: Private

**Versioning**: Enabled - Retain backup history

**Lifecycle**: 90 days retention - Automatic cleanup of old backups

**Typical Contents**:
- PostgreSQL database dumps
- Configuration backups
- System state snapshots
- Recovery points

**Usage Example**:
```bash
# Upload backup
mc cp postgres_backup_20250112.sql local/backups/database/

# List backups
mc ls local/backups/database/ --recursive

# Download backup for recovery
mc cp local/backups/database/postgres_backup_20250112.sql ./
```

**Backup Naming Convention**:
- Database: `postgres_backup_YYYYMMDD.sql`
- Config: `config_backup_YYYYMMDD.tar.gz`
- Full system: `system_backup_YYYYMMDD.tar.gz`

---

### 6. updates

**Purpose**: System update packages (.araupdate files)

**Access**: Private

**Versioning**: Enabled - Track update history

**Lifecycle**: No expiry - All updates retained for rollback

**Typical Contents**:
- .araupdate package files
- Update manifests
- Docker image tarballs (within packages)
- Migration scripts (within packages)

**Usage Example**:
```bash
# Upload update package
mc cp arasul-v2.0.1.araupdate local/updates/

# List available updates
mc ls local/updates/

# Download update package
mc cp local/updates/arasul-v2.0.1.araupdate ./
```

**Update Package Structure** (inside .araupdate):
```
arasul-v2.0.1.araupdate/
├── manifest.json
├── signature.sig
└── payload/
    ├── docker-images/
    ├── migrations/
    └── frontend/
```

---

## Bucket Management

### Initialization

Buckets are automatically created and configured during bootstrap:

```bash
./arasul bootstrap
```

Or manually initialize buckets:

```bash
./scripts/init_minio_buckets.sh
```

### Manual Bucket Operations

#### Create a new bucket

```bash
mc mb local/my-new-bucket
```

#### Set bucket policy

```bash
# Private (default)
mc anonymous set none local/my-bucket

# Public read
mc anonymous set download local/my-bucket

# Public read-write (NOT RECOMMENDED)
mc anonymous set upload local/my-bucket
```

#### Enable versioning

```bash
mc version enable local/my-bucket
```

#### Set lifecycle policy

```bash
# Create lifecycle policy JSON
cat > lifecycle.json <<EOF
{
    "Rules": [
        {
            "ID": "ExpireOldObjects",
            "Status": "Enabled",
            "Expiration": {
                "Days": 30
            }
        }
    ]
}
EOF

# Apply lifecycle policy
mc ilm import local/my-bucket < lifecycle.json
```

#### View bucket configuration

```bash
# List buckets
mc ls local/

# View bucket versioning
mc version info local/my-bucket

# View bucket lifecycle
mc ilm export local/my-bucket

# View bucket size
mc du local/my-bucket

# View bucket tags
mc tag list local/my-bucket
```

### Access via n8n

n8n workflows can access MinIO buckets using the S3-compatible credentials:

**Credentials Configuration**:
- Endpoint: `http://minio:9000`
- Access Key: `${MINIO_ROOT_USER}`
- Secret Key: `${MINIO_ROOT_PASSWORD}`
- Region: `us-east-1`
- Force Path Style: `true`

See `/services/n8n/credentials/minio-s3.json` for credential template.

### Access via Dashboard API

The Dashboard Backend can access MinIO through the MinIO SDK:

```javascript
const Minio = require('minio');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_HOST,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD,
});

// List objects in bucket
const objects = minioClient.listObjects('documents', '', true);
```

## Security Best Practices

1. **Never expose buckets publicly** unless absolutely necessary
2. **Use strong credentials** - Change default MINIO_ROOT_USER and MINIO_ROOT_PASSWORD
3. **Enable versioning** for critical data (backups, documents, updates)
4. **Set lifecycle policies** to prevent disk bloat (especially for caches)
5. **Regularly monitor bucket sizes** - Use `mc du` to check disk usage
6. **Backup important buckets** - Especially `documents` and `backups`
7. **Use signed URLs** for temporary access instead of changing bucket policies

## Monitoring

### Check bucket sizes

```bash
mc du --depth 1 local/
```

### Monitor lifecycle policies

```bash
for bucket in documents workflow-data llm-cache embeddings-cache backups updates; do
    echo "Bucket: $bucket"
    mc ilm export local/$bucket
    echo ""
done
```

### View bucket statistics

```bash
mc admin bucket info local documents
```

## Troubleshooting

### Bucket not accessible

```bash
# Check MinIO is running
docker-compose ps minio

# Check bucket exists
mc ls local/ | grep my-bucket

# Verify credentials
mc alias list local
```

### Lifecycle policy not working

```bash
# View lifecycle rules
mc ilm export local/my-bucket

# Re-import lifecycle policy
mc ilm import local/my-bucket < lifecycle.json
```

### Versioning issues

```bash
# Check versioning status
mc version info local/my-bucket

# List all versions of an object
mc ls --versions local/my-bucket/myfile.txt

# Restore previous version
mc cp --version-id=VERSION_ID local/my-bucket/myfile.txt ./
```

## References

- MinIO Client (mc) Documentation: https://min.io/docs/minio/linux/reference/minio-mc.html
- MinIO Server Documentation: https://min.io/docs/minio/linux/index.html
- PRD Section §22: Object Storage
- n8n MinIO Integration: `/services/n8n/templates/README.md`
