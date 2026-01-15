# API Reference

Quick reference for all Dashboard Backend API endpoints.

**Base URL:** `http://host:8080/api` (via Traefik) or `http://host:3001/api` (direct)

## Authentication

All endpoints except `/api/health` and `/api/auth/login` require JWT authentication.

**Two authentication methods are supported:**

1. **Authorization Header (traditional):**
   ```
   Authorization: Bearer <token>
   ```

2. **HttpOnly Cookie (for LAN access):**
   ```
   Cookie: arasul_session=<token>
   ```

   The cookie is automatically set on login and enables session persistence when accessing via different IPs or hostnames in the same LAN.

Tokens expire after 24 hours (configurable via `JWT_EXPIRY`).

---

## Endpoints Overview

### Public (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | Login |

### Authentication

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/api/auth/login` | Login with username/password (sets cookie) | - |
| POST | `/api/auth/logout` | Logout (blacklists token, clears cookie) | - |
| GET | `/api/auth/verify` | Verify token (for Traefik forward-auth) | - |
| GET | `/api/auth/me` | Get current user info | - |
| POST | `/api/auth/refresh` | Refresh token | - |

**GET /api/auth/verify:**

Used by Traefik forward-auth middleware to protect routes like n8n and Claude Code terminal.
Returns user info headers on success:
- `X-User-Id`: User ID
- `X-User-Name`: Username
- `X-User-Email`: Email (if set)

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system/status` | System health (OK/WARNING/CRITICAL) |
| GET | `/api/system/info` | Version, build hash, uptime |
| GET | `/api/system/network` | IP addresses, mDNS, connectivity |
| GET | `/api/system/thresholds` | Device-specific metric thresholds |

**GET /api/system/thresholds:**

Returns device-specific thresholds for metrics based on auto-detected hardware.

```json
{
  "device": {
    "type": "jetson_agx_orin",
    "name": "NVIDIA Jetson AGX Orin",
    "cpu_cores": 12,
    "total_memory_gb": 64
  },
  "thresholds": {
    "cpu": { "warning": 75, "critical": 90 },
    "ram": { "warning": 75, "critical": 90 },
    "gpu": { "warning": 80, "critical": 95 },
    "storage": { "warning": 70, "critical": 85 },
    "temperature": { "warning": 65, "critical": 80 }
  },
  "source": "device_auto_detected",
  "timestamp": "2026-01-05T12:00:00.000Z"
}
```

Supported devices: Jetson AGX Orin, Orin Nano, Orin NX, Xavier, Nano, Generic Linux

### Metrics

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| GET | `/api/metrics/live` | Current CPU, RAM, GPU, temp, disk | 20/s |
| GET | `/api/metrics/history` | Historical metrics | 20/s |
| WS | `/api/metrics/live-stream` | WebSocket stream (5s interval) | - |

**Query Parameters (history):**
- `range`: Time range (default: `24h`, options: `1h`, `6h`, `24h`, `7d`)

### Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/services` | Status of all services |
| GET | `/api/services/ai` | AI services with GPU load |

### AI Chat (LLM)

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/api/llm/chat` | LLM inference (SSE streaming) | 10/s |
| GET | `/api/llm/models` | List available models | - |
| GET | `/api/llm/status` | LLM service status | - |

**POST /api/llm/chat:**
```json
{
  "message": "Your question here",
  "conversation_id": "uuid",  // optional
  "model": "qwen3:14b-q8",    // optional
  "system_prompt": "..."      // optional
}
```

Response: Server-Sent Events (SSE) stream

### Chat Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chats` | List all conversations |
| POST | `/api/chats` | Create new conversation |
| GET | `/api/chats/:id` | Get conversation details |
| PATCH | `/api/chats/:id` | Update conversation title |
| DELETE | `/api/chats/:id` | Soft delete conversation |
| GET | `/api/chats/:id/messages` | Get messages |
| POST | `/api/chats/:id/messages` | Add message |
| GET | `/api/chats/:id/export` | Export chat (JSON/Markdown) |

**POST /api/chats:**
```json
{
  "title": "Optional title"
}
```

**POST /api/chats/:id/messages:**
```json
{
  "role": "user|assistant",
  "content": "Message content",
  "thinking": "Optional thinking content"
}
```

**GET /api/chats/:id/export:**

Exports a chat conversation to JSON or Markdown format.

Query Parameters:
- `format`: Export format (`json` or `markdown`/`md`). Default: `json`

Response: File download with appropriate Content-Type and Content-Disposition headers.

JSON Export Example:
```json
{
  "chat": {
    "id": 1,
    "title": "Chat Title",
    "created_at": "2026-01-15T10:00:00.000Z",
    "updated_at": "2026-01-15T10:30:00.000Z"
  },
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "thinking": null,
      "sources": [],
      "created_at": "2026-01-15T10:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help?",
      "thinking": "Thinking about greeting...",
      "sources": [],
      "created_at": "2026-01-15T10:00:05.000Z"
    }
  ],
  "export_info": {
    "exported_at": "2026-01-15T10:35:00.000Z",
    "format": "json",
    "version": "1.0",
    "message_count": 2
  }
}
```

Markdown Export: Generates a human-readable Markdown file with collapsible thinking blocks and source citations.

### RAG (Document Q&A)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rag/query` | RAG query (SSE streaming) |
| GET | `/api/rag/status` | Qdrant collection status |

**POST /api/rag/query:**
```json
{
  "query": "Your question about documents",
  "conversation_id": "uuid",  // optional
  "top_k": 5                  // optional, default: 5
}
```

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List all documents |
| POST | `/api/documents/upload` | Upload document (multipart) |
| GET | `/api/documents/:id` | Get document details |
| DELETE | `/api/documents/:id` | Delete document |
| GET | `/api/documents/:id/status` | Indexing status |

**POST /api/documents/upload:**
- Content-Type: `multipart/form-data`
- Field: `file` (PDF, TXT, DOCX, or Markdown)

### Embeddings

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/embeddings` | Generate text embeddings |

**POST /api/embeddings:**
```json
{
  "text": "Text to embed"
}
```

### Workflows (n8n)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workflows/activity` | Workflow statistics |

### Self-Healing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/self-healing/events` | Event history |
| GET | `/api/self-healing/status` | Current status |

**Query Parameters (events):**
- `limit`: Max results (default: 100)
- `severity`: Filter by severity (INFO, WARNING, CRITICAL)

### Settings / Passwords

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/api/settings/password/dashboard` | Change Dashboard password | 3/15min |
| POST | `/api/settings/password/minio` | Change MinIO password | 3/15min |
| POST | `/api/settings/password/n8n` | Change n8n password | 3/15min |
| GET | `/api/settings/password-requirements` | Get password rules | - |

**POST /api/settings/password/*:**
```json
{
  "current_password": "current",
  "new_password": "new password"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character

### Updates

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/update/upload` | Upload .araupdate file |
| GET | `/api/update/status` | Current update status |
| GET | `/api/update/history` | Update history |

**POST /api/update/upload:**
- Content-Type: `multipart/form-data`
- Field: `file` (.araupdate package)

### Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/logs` | List available log files |
| GET | `/api/logs/:filename` | Get log file content |

### Database

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/database/status` | Database connection status |
| GET | `/api/database/metrics` | Database size & stats |

### Store

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/apps` | List all apps (installed + available) |
| GET | `/api/apps/categories` | List app categories |
| GET | `/api/apps/:id` | Get single app details |
| GET | `/api/apps/:id/logs` | Get container logs |
| GET | `/api/apps/:id/events` | Get app event history |
| POST | `/api/apps/:id/install` | Install an app |
| POST | `/api/apps/:id/uninstall` | Uninstall an app |
| POST | `/api/apps/:id/start` | Start an installed app |
| POST | `/api/apps/:id/stop` | Stop a running app |
| POST | `/api/apps/:id/restart` | Restart an app |
| POST | `/api/apps/sync` | Sync system apps status |

**GET /api/apps Query Parameters:**
- `category`: Filter by category (e.g., `development`, `productivity`)
- `status`: Filter by status (e.g., `running`, `installed`, `available`)
- `search`: Search in name and description

**Response Example:**
```json
{
  "apps": [
    {
      "id": "code-server",
      "name": "Code-Server",
      "description": "VS Code im Browser",
      "version": "4.96.4",
      "category": "development",
      "status": "available",
      "appType": "official",
      "canUninstall": true
    }
  ],
  "total": 4,
  "timestamp": "2026-01-05T12:00:00Z"
}
```

**App Status Values:**
- `available` - Not installed
- `installing` - Currently installing
- `installed` - Installed but stopped
- `running` - Currently running
- `stopping` / `starting` - Transitioning
- `error` - Error state

### Workspaces (Claude Code)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces` | List all active workspaces |
| GET | `/api/workspaces/:id` | Get single workspace (by ID or slug) |
| POST | `/api/workspaces` | Create a new workspace |
| PUT | `/api/workspaces/:id` | Update workspace name/description |
| DELETE | `/api/workspaces/:id` | Soft-delete a workspace |
| POST | `/api/workspaces/:id/default` | Set workspace as default |
| POST | `/api/workspaces/:id/use` | Mark workspace as used (increment counter) |
| GET | `/api/workspaces/volumes/list` | Get volume bindings for container config |

**POST /api/workspaces Body:**
```json
{
  "name": "Mein Projekt",
  "hostPath": "/home/arasul/mein-projekt",
  "description": "Beschreibung des Projekts"
}
```

**Response Example:**
```json
{
  "workspaces": [
    {
      "id": 1,
      "name": "Arasul Projekt",
      "slug": "arasul",
      "description": "Das Hauptprojekt dieser Plattform",
      "host_path": "/home/arasul/arasul/arasul-jet",
      "container_path": "/workspace/arasul",
      "is_default": true,
      "is_system": true,
      "usage_count": 42,
      "last_used_at": "2026-01-13T00:00:00Z"
    }
  ],
  "total": 1,
  "timestamp": "2026-01-13T00:00:00Z"
}
```

**Notes:**
- Workspaces are dynamically mounted into the Claude Code container
- New workspaces require container restart to be available
- System workspaces cannot be deleted
- Host paths must start with `/home/arasul/`, `/workspace/`, or `/tmp/`

### Model Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/models/catalog` | List curated model catalog |
| GET | `/api/models/installed` | List installed models |
| GET | `/api/models/status` | Current loaded model + queue stats |
| GET | `/api/models/loaded` | Get currently loaded model |
| GET | `/api/models/default` | Get default model |
| POST | `/api/models/default` | Set default model |
| POST | `/api/models/download` | Download model (SSE progress) |
| DELETE | `/api/models/:id` | Delete installed model |
| POST | `/api/models/:id/activate` | Load model into RAM |
| POST | `/api/models/:id/deactivate` | Unload model from RAM |

**GET /api/models/catalog:**
```json
{
  "models": [
    {
      "id": "qwen3:7b-q8",
      "name": "Qwen 3 7B",
      "description": "Schnelles Allzweck-Modell",
      "size_bytes": 8589934592,
      "ram_required_gb": 10,
      "category": "small",
      "capabilities": ["chat", "code"],
      "recommended_for": ["chat", "quick-tasks"],
      "jetson_tested": true,
      "is_installed": true,
      "is_loaded": false,
      "is_default": true
    }
  ],
  "timestamp": "2026-01-07T12:00:00Z"
}
```

**GET /api/models/status:**
```json
{
  "loaded_model": "qwen3:14b-q8",
  "ram_used_gb": 20,
  "pending_by_model": {
    "qwen3:7b-q8": 2,
    "qwen3:32b-q4": 1
  },
  "total_pending": 3,
  "timestamp": "2026-01-07T12:00:00Z"
}
```

**POST /api/models/download:**
```json
{
  "model_id": "qwen3:7b-q8"
}
```
Response: SSE stream with progress events:
```
data: {"type": "progress", "percent": 45, "downloaded_gb": 3.6, "total_gb": 8.0}
data: {"type": "done", "model_id": "qwen3:7b-q8"}
```

**POST /api/models/:id/activate:**
Loads model into RAM. Only one model can be loaded at a time.
```json
{
  "success": true,
  "model_id": "qwen3:7b-q8",
  "ram_used_gb": 10,
  "timestamp": "2026-01-07T12:00:00Z"
}
```

**POST /api/llm/chat (with model selection):**
```json
{
  "messages": [...],
  "conversation_id": 123,
  "model": "qwen3:7b-q8",          // Optional: explicit model
  "model_sequence": ["a", "b"],    // Optional: for workflows
  "priority": 1                     // Optional: 0=normal, 1=high
}
```

**Model Categories:**
- `small` - Under 10GB RAM (7B models)
- `medium` - 10-25GB RAM (14B models)
- `large` - 25-45GB RAM (32B models)
- `xlarge` - Over 45GB RAM (70B+ models)

---

## Response Format

All responses include:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  // ... endpoint-specific data
}
```

## Error Responses

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

| Status | Description |
|--------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid/expired token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

## Rate Limits

| Category | Limit | Window |
|----------|-------|--------|
| General API | 100 req | 1 min |
| LLM API | 10 req | 1 sec |
| Metrics API | 20 req | 1 sec |
| Password Changes | 3 req | 15 min |
| n8n Webhooks | 100 req | 1 min |

---

## Related Documentation

- [API Guide](API_GUIDE.md) - Detailed usage examples
- [API Errors](API_ERRORS.md) - Complete error code reference
- [Dashboard Backend](../services/dashboard-backend/README.md) - Backend implementation details
