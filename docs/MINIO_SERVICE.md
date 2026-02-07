# MinIO S3-Compatible Storage

S3-compatible object storage for documents, backups, and application data.

## Overview

| Property | Value |
|----------|-------|
| Image | minio/minio:latest |
| S3 API Port | 9000 |
| Console Port | 9001 |
| Container | minio |
| Hostname | minio |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      TRAEFIK                            │
│  /minio → Console (9001)  │  /minio-api → S3 API (9000) │
└─────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │     MinIO     │
                    │   Container   │
                    └───────┬───────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
        ┌─────┴─────┐               ┌─────┴─────┐
        │ documents │               │  backups  │
        │  bucket   │               │   bucket  │
        └───────────┘               └───────────┘
```

## Buckets

| Bucket | Purpose | Access |
|--------|---------|--------|
| `documents` | RAG document storage | Backend, Document-Indexer |
| `backups` | Automated backups | Backup Service |
| `apps` | App Store packages | Backend |

### Bucket Initialization

Buckets are created automatically on first startup via `scripts/init_minio_buckets.sh`:

```bash
# Initialize buckets
mc alias set local http://minio:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
mc mb local/documents --ignore-existing
mc mb local/backups --ignore-existing
mc mb local/apps --ignore-existing
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| MINIO_ROOT_USER | (required) | Admin access key |
| MINIO_ROOT_PASSWORD | (required) | Admin secret key |
| MINIO_BROWSER | on | Enable web console |

## Docker Compose Configuration

```yaml
minio:
  image: minio/minio:latest
  container_name: minio
  hostname: minio
  command: server /data --console-address ":9001"
  ports:
    - "9000:9000"
    - "9001:9001"
  environment:
    MINIO_ROOT_USER: ${MINIO_ROOT_USER}
    MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    MINIO_BROWSER: ${MINIO_BROWSER:-on}
  volumes:
    - arasul-minio:/data
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 10s
    timeout: 1s
    retries: 3
  deploy:
    resources:
      limits:
        memory: 4G
```

## Traefik Routing

| Route | Path | Service | Auth |
|-------|------|---------|------|
| minio-console | `/minio` | minio:9001 | None |
| minio-api | `/minio-api` | minio:9000 | CORS + Security |

### CORS Configuration

```yaml
# For minio-api route
cors:
  allowedOrigins:
    - "http://localhost"
    - "https://localhost"
    - "http://192.168.*.*"
  allowedMethods:
    - GET
    - POST
    - PUT
    - DELETE
  allowedHeaders:
    - Content-Type
    - Authorization
```

## Health Check

```bash
# Check MinIO health
curl -f http://localhost:9000/minio/health/live

# Response on success: (empty 200 OK)
```

## Console Access

Access the MinIO Console at: `http://host/minio`

**Features:**
- Bucket management
- Object browser
- User management
- Policy configuration
- Metrics dashboard

## S3 API Access

### Using mc (MinIO Client)

```bash
# Configure alias
mc alias set arasul http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD

# List buckets
mc ls arasul

# Upload file
mc cp document.pdf arasul/documents/

# Download file
mc cp arasul/documents/document.pdf ./

# List objects
mc ls arasul/documents/

# Mirror bucket (backup)
mc mirror arasul/documents/ /backup/documents/
```

### Using AWS SDK

```javascript
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  endpoint: 'http://minio:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD
  },
  forcePathStyle: true
});

// Upload
await s3.send(new PutObjectCommand({
  Bucket: 'documents',
  Key: 'file.pdf',
  Body: fileBuffer
}));
```

## Backend Integration

The dashboard-backend uses MinIO for document storage:

```javascript
// services/dashboard-backend/src/routes/documents.js
const Minio = require('minio');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_HOST || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD
});
```

## Document-Indexer Integration

The document-indexer scans MinIO for new documents:

```python
# services/document-indexer/indexer.py
from minio import Minio

client = Minio(
    "minio:9000",
    access_key=os.environ.get("MINIO_ROOT_USER"),
    secret_key=os.environ.get("MINIO_ROOT_PASSWORD"),
    secure=False
)

# Scan for new documents
for obj in client.list_objects("documents"):
    process_document(obj)
```

## Backup Integration

MinIO is backed up by the backup service:

```bash
# Backup documents bucket
mc mirror minio/documents /backups/minio/documents_$(date +%Y%m%d)/

# Compress backup
tar -czf /backups/minio/documents_$(date +%Y%m%d).tar.gz \
  /backups/minio/documents_$(date +%Y%m%d)/

# Create latest symlink
ln -sf documents_$(date +%Y%m%d).tar.gz /backups/minio/documents_latest.tar.gz
```

## Storage Management

### Check Storage Usage

```bash
# Via mc
mc du arasul/documents/

# Via Console
# Navigate to Buckets → documents → Metrics
```

### Cleanup Old Objects

```bash
# Delete objects older than 30 days
mc rm --older-than 30d arasul/documents/temp/

# Delete specific object
mc rm arasul/documents/file.pdf
```

## Performance Tuning

### Memory Limits

MinIO is configured with 4GB memory limit:

```yaml
deploy:
  resources:
    limits:
      memory: 4G
```

### Concurrent Uploads

For large file uploads, increase connection limits:

```bash
export MINIO_API_REQUESTS_MAX=1000
export MINIO_API_REQUESTS_DEADLINE=10m
```

## Security Best Practices

1. **Strong Credentials** - Use complex passwords for MINIO_ROOT_USER/PASSWORD
2. **Bucket Policies** - Restrict access per bucket
3. **TLS** - Enable TLS for production (via Traefik)
4. **Access Logging** - Enable audit logging
5. **Regular Backups** - Automated daily backups

### Bucket Policy Example

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"AWS": ["arn:aws:iam::*:user/backend"]},
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": ["arn:aws:s3:::documents/*"]
    }
  ]
}
```

## Troubleshooting

### Cannot Access Console

1. Check Traefik routing: `curl http://localhost/minio`
2. Verify container is running: `docker compose ps minio`
3. Check credentials

### Upload Fails

1. Check bucket exists: `mc ls arasul/`
2. Verify permissions
3. Check disk space: `df -h`
4. Check memory limits

### Slow Performance

1. Check disk I/O: `iostat -x 1`
2. Verify network: `ping minio`
3. Check memory usage: `docker stats minio`

## Metrics

MinIO exposes Prometheus metrics at `/minio/v2/metrics/cluster`:

```bash
curl http://localhost:9000/minio/v2/metrics/cluster
```

Key metrics:
- `minio_bucket_usage_total_bytes` - Storage used per bucket
- `minio_s3_requests_total` - API request count
- `minio_s3_requests_errors_total` - Error count

## Related Documentation

- [MinIO Official Docs](https://min.io/docs/minio/linux/index.html)
- [Documents API](API_REFERENCE.md#documents)
- [Backup Service](BACKUP_SYSTEM.md)
- [Traefik Configuration](../config/traefik/README.md)
