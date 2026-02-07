# n8n Workflow Automation Service

Workflow automation platform with custom Arasul nodes for LLM and embedding integration.

## Overview

| Property | Value |
|----------|-------|
| Version | 2.4.6 (security-pinned) |
| Port | 5678 (internal) |
| Base Path | `/n8n` (via Traefik) |
| Container | n8n |
| Hostname | n8n |

## Security Fixes

This version (2.4.6) is pinned due to critical CVEs in later versions:

| CVE | CVSS | Name | Description |
|-----|------|------|-------------|
| CVE-2026-21858 | 10.0 | Ni8mare | Unauthenticated RCE via Webhook |
| CVE-2025-68613 | 9.9 | Expression Injection | RCE via expressions |
| CVE-2025-68668 | 9.9 | N8scape | Python Code Node Sandbox Bypass |
| CVE-2026-21877 | 10.0 | File Upload | Unrestricted File Upload RCE |

**Do NOT upgrade without security review.**

## Directory Structure

```
services/n8n/
├── Dockerfile              # Multi-stage build with custom nodes
├── BUILD_CUSTOM_NODES.md   # Build documentation
├── credentials/            # Credential templates
│   └── *.json
├── templates/
│   ├── README.md           # Template documentation
│   └── *.json              # Workflow templates
└── custom-nodes/
    ├── n8n-nodes-arasul-llm/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── gulpfile.js
    │   ├── index.ts        # Node entry point
    │   ├── credentials/
    │   └── nodes/
    └── n8n-nodes-arasul-embeddings/
        ├── package.json
        ├── tsconfig.json
        ├── gulpfile.js
        ├── index.ts        # Node entry point
        ├── credentials/
        └── nodes/
```

## Custom Nodes

### Arasul LLM Node (`n8n-nodes-arasul-llm`)

Integrates with the local Ollama LLM service.

**Features:**
- Direct LLM API access (port 11434)
- Model selection from installed models
- Streaming response support
- Context injection
- System prompt configuration

**Usage in Workflows:**
```json
{
  "node": "Arasul LLM",
  "parameters": {
    "model": "qwen3:14b-q8",
    "prompt": "{{ $json.message }}",
    "systemPrompt": "You are a helpful assistant.",
    "temperature": 0.7
  }
}
```

### Arasul Embeddings Node (`n8n-nodes-arasul-embeddings`)

Integrates with the local embedding service.

**Features:**
- Text to vector conversion
- Batch embedding support
- 768-dimension vectors (nomic-embed-text)

**Usage in Workflows:**
```json
{
  "node": "Arasul Embeddings",
  "parameters": {
    "text": "{{ $json.content }}",
    "batchSize": 10
  }
}
```

## Dockerfile Structure

```dockerfile
# Stage 1: Build custom nodes
FROM node:20-alpine AS builder

# Build n8n-nodes-arasul-llm
WORKDIR /build/llm
COPY custom-nodes/n8n-nodes-arasul-llm .
RUN npm install && npm run build

# Build n8n-nodes-arasul-embeddings
WORKDIR /build/embeddings
COPY custom-nodes/n8n-nodes-arasul-embeddings .
RUN npm install && npm run build

# Stage 2: n8n with custom nodes
FROM n8nio/n8n:2.4.6

# Copy compiled nodes
COPY --from=builder /build/llm/dist /custom-nodes/n8n-nodes-arasul-llm
COPY --from=builder /build/embeddings/dist /custom-nodes/n8n-nodes-arasul-embeddings

# Set environment
ENV N8N_CUSTOM_EXTENSIONS=/custom-nodes

USER node
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| N8N_HOST | 0.0.0.0 | Listen address |
| N8N_PORT | 5678 | HTTP port |
| N8N_PROTOCOL | http | Protocol (http/https) |
| N8N_SECURE_COOKIE | false | Secure cookies (set true for HTTPS) |
| N8N_EDITOR_BASE_URL | http://host/n8n | Editor base URL |
| N8N_BASIC_AUTH_ACTIVE | false | Basic auth (use built-in user management) |
| N8N_ENCRYPTION_KEY | (required) | Encryption key for credentials (32+ chars) |
| WEBHOOK_URL | http://host:port | Webhook callback URL |
| EXECUTIONS_DATA_SAVE_ON_SUCCESS | all | Save successful executions |
| EXECUTIONS_DATA_SAVE_ON_ERROR | all | Save failed executions |
| EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS | true | Save manual test runs |
| N8N_USER_MANAGEMENT_JWT_DURATION_HOURS | 720 | JWT validity (30 days) |
| N8N_PERSONALIZATION_ENABLED | true | Enable personalization |
| N8N_PUSH_BACKEND | websocket | Push notification backend |
| GENERIC_TIMEZONE | Europe/Berlin | Default timezone |
| N8N_TRUST_PROXY | true | Trust Traefik X-Forwarded headers |
| N8N_RUNNERS_ENABLED | true | Enable secure code execution (n8n 2.x) |
| N8N_RUNNERS_MODE | internal | Runner mode |
| N8N_CUSTOM_EXTENSIONS | /custom-nodes | Custom node location |

## Traefik Routing

n8n uses 13 routes with priority-based routing:

| Priority | Path | Description |
|----------|------|-------------|
| 110 | `/n8n`, `/n8n/` | Root redirect to /signin |
| 100 | `/n8n/*` | Main workflow engine |
| 90 | `/signin` | Login page |
| 90 | `/setup` | Setup wizard |
| 90 | `/workflows` | Workflow list |
| 90 | `/credentials` | Credentials management |
| 90 | `/executions` | Execution history |
| 90 | `/personal-data` | User data |
| 85 | `/favicon.ico` | Favicon |
| 60 | `/static` | n8n static files |
| 50 | `/rest` | REST API |
| 25 | `/webhook/*` | Webhooks (rate limited: 100 req/min) |
| 60 | `/assets` | Static assets |

## Database Configuration

n8n uses the shared PostgreSQL database:

```yaml
DB_TYPE: postgresdb
DB_POSTGRESDB_HOST: postgres-db
DB_POSTGRESDB_PORT: 5432
DB_POSTGRESDB_DATABASE: ${POSTGRES_DB}
DB_POSTGRESDB_USER: ${POSTGRES_USER}
DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
DB_POSTGRESDB_SCHEMA: n8n
```

## Volumes

| Mount | Purpose |
|-------|---------|
| `arasul-n8n:/home/node/.n8n` | Persistent workflows, credentials, settings |
| `./credentials:/custom-credentials:ro` | Credential templates (read-only) |
| `./templates:/custom-templates:ro` | Workflow templates (read-only) |

## Health Check

```yaml
test: wget --spider -q http://localhost:5678/healthz
interval: 30s
timeout: 3s
retries: 3
```

## Dependencies

n8n requires these services to be healthy:

- `postgres-db` - Database storage
- `llm-service` - LLM API access (for custom node)
- `embedding-service` - Embedding API access (for custom node)
- `minio` - S3 storage (optional)

## Workflow Templates

Templates are available in `templates/`:

| Template | Description |
|----------|-------------|
| `document-indexing.json` | Auto-index uploaded documents |
| `alert-notification.json` | Send alerts via Telegram |
| `scheduled-backup.json` | Scheduled backup trigger |

See [templates/README.md](templates/README.md) for detailed documentation.

## Credential Setup

### Arasul LLM Credential

```json
{
  "name": "Arasul LLM",
  "type": "arasulLlmApi",
  "data": {
    "host": "llm-service",
    "port": 11434
  }
}
```

### Arasul Embeddings Credential

```json
{
  "name": "Arasul Embeddings",
  "type": "arasulEmbeddingsApi",
  "data": {
    "host": "embedding-service",
    "port": 11435
  }
}
```

## Development

### Building Custom Nodes

```bash
# Navigate to node directory
cd custom-nodes/n8n-nodes-arasul-llm

# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode for development
npm run dev
```

### Testing Locally

```bash
# Run n8n with custom nodes
N8N_CUSTOM_EXTENSIONS=/path/to/custom-nodes npx n8n start
```

## Backup Integration

Workflows are backed up via the backup service:

```bash
# Export all workflows
n8n export:workflow --all --output=/backups/n8n/workflows_$(date +%Y%m%d).json

# Import workflows
n8n import:workflow --input=/backups/n8n/workflows_latest.json
```

Backup location: `/data/backups/n8n/`
Retention: 30 days

## Troubleshooting

### Webhook Not Receiving

1. Check Traefik routing: `curl http://localhost/webhook/test`
2. Verify WEBHOOK_URL environment variable
3. Check rate limiting (100 req/min)

### Custom Node Not Loading

1. Verify N8N_CUSTOM_EXTENSIONS path
2. Check node compilation: `npm run build`
3. Restart n8n container

### Database Connection Failed

1. Verify PostgreSQL is healthy: `docker compose ps postgres-db`
2. Check credentials in environment
3. Verify n8n schema exists

### Execution Stuck

1. Check worker logs: `docker compose logs n8n`
2. Verify LLM/Embedding services are responsive
3. Check for resource exhaustion (RAM, CPU)

## API Access

n8n provides a REST API at `/rest`:

```bash
# List workflows (requires auth)
curl -H "Authorization: Bearer TOKEN" http://host/rest/workflows

# Execute workflow
curl -X POST -H "Authorization: Bearer TOKEN" \
  http://host/rest/workflows/{id}/execute
```

## Security Best Practices

1. **Use strong encryption key** - N8N_ENCRYPTION_KEY must be 32+ characters
2. **Enable user management** - Don't use basic auth in production
3. **Rate limit webhooks** - Already configured at 100 req/min
4. **Restrict access** - Use Traefik IP whitelist for admin routes
5. **Audit credentials** - Regularly review stored credentials
6. **Backup encryption keys** - Store encryption key securely (required for restore)

## Related Documentation

- [n8n Official Docs](https://docs.n8n.io/)
- [Workflow Templates](templates/README.md)
- [Custom Node Development](BUILD_CUSTOM_NODES.md)
- [Traefik Configuration](../../config/traefik/README.md)
- [Backup Service](../../docs/BACKUP_SYSTEM.md)
