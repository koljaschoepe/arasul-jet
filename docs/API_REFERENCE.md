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

### Documents (Data Tab)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List all documents |
| POST | `/api/documents/upload` | Upload document (multipart) |
| GET | `/api/documents/:id` | Get document details |
| DELETE | `/api/documents/:id` | Delete document |
| GET | `/api/documents/:id/status` | Indexing status |
| GET | `/api/documents/:id/content` | Get file content (text files) |
| PUT | `/api/documents/:id/content` | Update file content |

**POST /api/documents/upload:**
- Content-Type: `multipart/form-data`
- Field: `file` (PDF, TXT, DOCX, Markdown, or YAML)

### YAML Tables

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/yaml-tables/create` | Create new YAML table |
| GET | `/api/yaml-tables/:docId` | Get parsed YAML data |
| PUT | `/api/yaml-tables/:docId` | Update YAML content |
| POST | `/api/yaml-tables/:docId/rows` | Add row to table |
| DELETE | `/api/yaml-tables/:docId/rows/:rowId` | Delete row |
| POST | `/api/yaml-tables/:docId/import` | Import from CSV |
| GET | `/api/yaml-tables/:docId/export` | Export as CSV |

**POST /api/yaml-tables/create:**
```json
{
  "name": "My Table",
  "description": "Optional description",
  "columns": [
    { "slug": "name", "name": "Name", "type": "text", "required": false }
  ],
  "space_id": "optional-space-uuid"
}
```

**PUT /api/yaml-tables/:docId:**
```json
{
  "data": {
    "_meta": { "name": "Table Name" },
    "columns": [...],
    "rows": [...]
  }
}
```

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

### Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts/settings` | Get global alert settings |
| PUT | `/api/alerts/settings` | Update global alert settings |
| GET | `/api/alerts/thresholds` | Get all threshold configurations |
| PUT | `/api/alerts/thresholds/:metricType` | Update threshold (cpu, ram, disk, temperature) |
| GET | `/api/alerts/quiet-hours` | Get quiet hours for all days |
| PUT | `/api/alerts/quiet-hours/:dayOfWeek` | Update quiet hours for single day (0-6) |
| PUT | `/api/alerts/quiet-hours` | Bulk update quiet hours |
| GET | `/api/alerts/history` | Get alert history |
| POST | `/api/alerts/history/:id/acknowledge` | Acknowledge single alert |
| POST | `/api/alerts/history/acknowledge-all` | Acknowledge all alerts |
| GET | `/api/alerts/statistics` | Get alert statistics |
| POST | `/api/alerts/test-webhook` | Test webhook configuration |
| POST | `/api/alerts/trigger-check` | Manually trigger alert check |
| GET | `/api/alerts/status` | Get alert engine status |

**PUT /api/alerts/settings:**
```json
{
  "alerts_enabled": true,
  "webhook_enabled": false,
  "webhook_url": "https://...",
  "in_app_notifications": true
}
```

**PUT /api/alerts/thresholds/:metricType:**
```json
{
  "warning_threshold": 75,
  "critical_threshold": 90,
  "enabled": true
}
```

**PUT /api/alerts/quiet-hours/:dayOfWeek:**
```json
{
  "enabled": true,
  "start_time": "22:00",
  "end_time": "07:00"
}
```

**GET /api/alerts/history Query Parameters:**
- `limit`: Max results (default: 100, max: 500)
- `offset`: Pagination offset
- `metric_type`: Filter by type (cpu, ram, disk, temperature)
- `severity`: Filter by severity (warning, critical)
- `unacknowledged`: Boolean, show only unacknowledged

**GET /api/alerts/status Response:**
```json
{
  "enabled": true,
  "in_quiet_hours": false,
  "webhook_enabled": false,
  "in_app_notifications": true,
  "statistics": {
    "total_24h": 5,
    "unacknowledged": 2
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

### Claude Terminal

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/api/claude-terminal/query` | Execute query (SSE streaming) | 5/min |
| GET | `/api/claude-terminal/status` | Terminal service status | - |
| GET | `/api/claude-terminal/history` | User's query history | - |
| GET | `/api/claude-terminal/context` | Current system context | - |
| DELETE | `/api/claude-terminal/history` | Clear query history | - |

**POST /api/claude-terminal/query:**
```json
{
  "query": "What is the current system status?",
  "includeContext": true,
  "timeout": 60000
}
```

Response: SSE stream with events:
```
data: {"type": "start", "queryId": 123, "model": "qwen3:14b-q8"}
data: {"type": "content", "content": "The system is..."}
data: {"type": "complete", "totalTokens": 150, "responseTimeMs": 2500}
data: {"done": true, "status": "completed"}
```

**GET /api/claude-terminal/status:**
```json
{
  "service": "claude-terminal",
  "available": true,
  "llm": {
    "available": true,
    "models": ["qwen3:14b-q8"],
    "error": null
  },
  "config": {
    "defaultModel": "qwen3:14b-q8",
    "defaultTimeout": 60000,
    "maxQueryLength": 5000,
    "rateLimit": "5 requests per minute"
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/claude-terminal/history:**
```json
{
  "queries": [
    {
      "id": 1,
      "query": "What is the system status?",
      "response": "The system is running...",
      "model_used": "qwen3:14b-q8",
      "tokens_used": 150,
      "response_time_ms": 2500,
      "status": "completed",
      "error_message": null,
      "created_at": "2026-01-15T10:00:00.000Z"
    }
  ],
  "total": 10,
  "limit": 20,
  "offset": 0,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**Notes:**
- Context includes system metrics, service status, and recent logs
- Sessions expire after 30 minutes of inactivity
- Max query length: 5000 characters
- Timeout: 60 seconds (max 120 seconds)

### Events (Notifications)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/events` | Yes | Get recent notification events |
| GET | `/api/events/stats` | Yes | Event and notification statistics |
| GET | `/api/events/settings` | Yes | User notification settings |
| PUT | `/api/events/settings` | Yes | Update notification settings |
| POST | `/api/events/test` | Yes | Send test notification |
| POST | `/api/events/webhook/n8n` | Secret | n8n workflow webhook |
| POST | `/api/events/webhook/self-healing` | IP | Self-healing agent webhook |
| POST | `/api/events/manual` | Yes | Create manual notification |
| GET | `/api/events/service-status` | Yes | Service status cache |
| GET | `/api/events/boot-history` | Yes | System boot history |
| DELETE | `/api/events/:id` | Yes | Delete specific event |
| POST | `/api/events/cleanup` | Yes | Cleanup old events |
| GET | `/api/events/telegram/status` | Yes | Telegram connection status |

**GET /api/events Query Parameters:**
- `limit`: Max results (default: 50)
- `event_type`: Filter by event type
- `severity`: Filter by severity

**PUT /api/events/settings:**
```json
{
  "channel": "telegram",
  "enabled": true,
  "event_types": ["service_status", "alert"],
  "min_severity": "warning",
  "rate_limit_per_minute": 10,
  "quiet_hours_start": "22:00",
  "quiet_hours_end": "07:00",
  "telegram_chat_id": "-1001234567890"
}
```

**POST /api/events/webhook/n8n:**

Requires `X-Webhook-Secret` header or `secret` query param if `N8N_WEBHOOK_SECRET` is configured.

```json
{
  "workflow_id": "workflow-123",
  "workflow_name": "Backup Workflow",
  "execution_id": "exec-456",
  "status": "success",
  "error": null,
  "duration_ms": 5000
}
```

**POST /api/events/webhook/self-healing:**

Only accepts requests from localhost or Docker network IPs.

```json
{
  "action_type": "container_restart",
  "service_name": "llm-service",
  "reason": "Memory threshold exceeded",
  "success": true,
  "duration_ms": 3000,
  "error_message": null
}
```

**GET /api/events/telegram/status:**
```json
{
  "connected": true,
  "botInfo": {
    "id": 123456789,
    "username": "MyArasulBot"
  },
  "error": null,
  "stats": {
    "sent_24h": 15,
    "failed_24h": 0
  },
  "configured": {
    "botToken": true,
    "chatId": true
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

### Knowledge Spaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/spaces` | List all knowledge spaces |
| GET | `/api/spaces/:id` | Get space details with documents |
| POST | `/api/spaces` | Create knowledge space |
| PUT | `/api/spaces/:id` | Update knowledge space |
| DELETE | `/api/spaces/:id` | Delete space (moves docs to default) |
| POST | `/api/spaces/:id/regenerate` | Trigger context regeneration |
| POST | `/api/spaces/route` | Find relevant spaces for query |

**GET /api/spaces:**
```json
{
  "spaces": [
    {
      "id": 1,
      "name": "Allgemein",
      "slug": "allgemein",
      "description": "Allgemeine Dokumente",
      "icon": "folder",
      "color": "#6366f1",
      "is_default": true,
      "is_system": true,
      "sort_order": 0,
      "actual_document_count": 5,
      "indexed_document_count": 5
    }
  ],
  "total": 1,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/spaces:**
```json
{
  "name": "Technische Dokumentation",
  "description": "API-Dokumentation, Architektur-Diagramme",
  "icon": "book",
  "color": "#22c55e"
}
```

**PUT /api/spaces/:id:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "icon": "star",
  "color": "#f59e0b",
  "sort_order": 5
}
```

**POST /api/spaces/route:**

Find relevant spaces for a RAG query using embedding similarity.

```json
{
  "query": "How do I configure the API?",
  "top_k": 3,
  "threshold": 0.5
}
```

Response:
```json
{
  "query": "How do I configure the API?",
  "spaces": [
    {
      "id": 2,
      "name": "Technische Dokumentation",
      "slug": "tech-docs",
      "description": "API-Dokumentation...",
      "score": 0.85
    }
  ],
  "method": "embedding_similarity",
  "threshold": 0.5,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**Notes:**
- System spaces cannot be deleted
- Documents are moved to default space when deleting
- Space descriptions are embedded for semantic routing

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

### Telegram Bot

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/api/telegram/config` | Save bot token and settings | 100/min |
| GET | `/api/telegram/config` | Get configuration (token masked) | - |
| GET | `/api/telegram/updates` | Get recent messages to discover chat IDs | 5/min |
| GET | `/api/telegram/thresholds` | Get alert thresholds | - |
| PUT | `/api/telegram/thresholds` | Update alert thresholds | 100/min |
| POST | `/api/telegram/test` | Send test message | 5/min |
| GET | `/api/telegram/audit-logs` | Get bot audit logs | - |
| GET | `/api/telegram/audit-logs/stats` | Get audit statistics | - |

**POST /api/telegram/config:**

Full configuration (with token):
```json
{
  "bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
  "chat_id": "-1001234567890",
  "enabled": true
}
```

Partial update (without token):
```json
{
  "chat_id": "-1001234567890",
  "enabled": true
}
```

Response:
```json
{
  "success": true,
  "has_token": true,
  "message": "Telegram configuration saved successfully",
  "token_masked": "12345...xyz",
  "chat_id": "-1001234567890",
  "enabled": true,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/telegram/config:**
```json
{
  "configured": true,
  "token_masked": "12345...xyz",
  "chat_id": "-1001234567890",
  "enabled": true,
  "created_at": "2026-01-15T10:00:00.000Z",
  "updated_at": "2026-01-15T10:00:00.000Z",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/telegram/updates:**

Fetches recent messages sent to the bot to discover chat IDs. Useful when the user doesn't know their chat ID.

Response:
```json
{
  "success": true,
  "chats": [
    {
      "chat_id": "-1001234567890",
      "type": "supergroup",
      "title": "My Group",
      "username": null,
      "first_name": null,
      "last_message": "Hello bot!",
      "date": "2026-01-15T10:00:00.000Z"
    },
    {
      "chat_id": "123456789",
      "type": "private",
      "title": null,
      "username": "johndoe",
      "first_name": "John",
      "last_message": "/start",
      "date": "2026-01-15T09:55:00.000Z"
    }
  ],
  "total_updates": 5,
  "hint": "Select a chat ID from the list above.",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/telegram/thresholds:**
```json
{
  "thresholds": {
    "cpu_warning": 80,
    "cpu_critical": 95,
    "ram_warning": 80,
    "ram_critical": 95,
    "disk_warning": 80,
    "disk_critical": 95,
    "gpu_warning": 85,
    "gpu_critical": 95,
    "temperature_warning": 75,
    "temperature_critical": 85,
    "notify_on_warning": false,
    "notify_on_critical": true,
    "notify_on_service_down": true,
    "notify_on_self_healing": true,
    "cooldown_minutes": 15
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**PUT /api/telegram/thresholds:**
```json
{
  "thresholds": {
    "cpu_warning": 75,
    "cpu_critical": 90,
    "notify_on_warning": true
  }
}
```

Response:
```json
{
  "success": true,
  "message": "Alert thresholds updated successfully",
  "thresholds": { ... },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/telegram/test:**
```json
{
  "chat_id": "-1001234567890"
}
```

Response:
```json
{
  "success": true,
  "message": "Test message sent successfully",
  "chat_id": "-1001234567890",
  "message_id": 12345,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/telegram/audit-logs:**

Query Parameters:
- `limit`: Number of records (default: 50, max: 200)
- `offset`: Pagination offset
- `userId`: Filter by Telegram user ID
- `chatId`: Filter by chat ID
- `command`: Filter by command
- `success`: Filter by success ('true' or 'false')
- `startDate`: Filter from date (ISO string)
- `endDate`: Filter to date (ISO string)

Response:
```json
{
  "logs": [
    {
      "id": 1,
      "timestamp": "2026-01-15T10:00:00.000Z",
      "user_id": 123456789,
      "username": "johndoe",
      "chat_id": -1001234567890,
      "command": "/status",
      "message_text": "/status",
      "response_text": "System running normally",
      "response_time_ms": 150,
      "success": true,
      "interaction_type": "command"
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**Notes:**
- Bot token is encrypted using AES-256-GCM before storage
- Token is never returned in plaintext, only masked (first 5, last 3 chars)
- Chat ID can be a user ID, group ID, or channel ID
- Use `/updates` endpoint to discover chat IDs by sending a message to your bot
- Alert thresholds control when Telegram notifications are sent for system metrics
- Cooldown prevents notification spam (default: 15 minutes between same alerts)

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

**Model Types:**
- `llm` - Language models (chat, reasoning, code)
- `ocr` - Text recognition (Tesseract, PaddleOCR)
- `vision` - Image analysis
- `audio` - Speech processing

### Store (Unified)

The Store API provides a unified interface for browsing models and apps.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/store/recommendations` | Get recommended models + apps |
| GET | `/api/store/search` | Search across models and apps |
| GET | `/api/store/info` | Get system info (RAM, disk) |

**GET /api/store/recommendations:**
Returns models recommended for the system's RAM capacity and featured apps.
```json
{
  "models": [
    { "id": "qwen3:14b-q8", "name": "Qwen 3 14B", ... }
  ],
  "apps": [
    { "id": "n8n", "name": "n8n", "featured": true, ... }
  ],
  "systemInfo": { "availableRamGB": 64 }
}
```

**GET /api/store/search?q=query:**
```json
{
  "models": [...],
  "apps": [...],
  "query": "qwen"
}
```

**GET /api/store/info:**
```json
{
  "availableRamGB": 64,
  "availableDiskGB": 120,
  "totalDiskGB": 500
}
```

### Audit Logging

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit/logs` | Get audit logs with pagination and filtering |
| GET | `/api/audit/stats/daily` | Get daily aggregated statistics |
| GET | `/api/audit/stats/endpoints` | Get endpoint usage statistics |

**GET /api/audit/logs:**

Query Parameters:
- `limit`: Number of records (default: 50, max: 500)
- `offset`: Number of records to skip (default: 0)
- `date_from`: Start date (ISO 8601)
- `date_to`: End date (ISO 8601)
- `action_type`: HTTP method filter (GET, POST, PUT, DELETE, PATCH)
- `user_id`: Filter by user ID
- `endpoint`: Filter by endpoint (partial match)
- `status_min`: Minimum response status code
- `status_max`: Maximum response status code

Response:
```json
{
  "logs": [
    {
      "id": 1,
      "timestamp": "2026-01-15T10:30:00.000Z",
      "user_id": 1,
      "username": "admin",
      "action_type": "POST",
      "target_endpoint": "/api/chats",
      "request_method": "POST",
      "request_payload": {"title": "New Chat"},
      "response_status": 201,
      "duration_ms": 45,
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "error_message": null
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "has_more": true
  },
  "filters": {
    "date_from": null,
    "date_to": null,
    "action_type": null,
    "user_id": null,
    "endpoint": null,
    "status_min": null,
    "status_max": null
  },
  "timestamp": "2026-01-15T10:35:00.000Z"
}
```

**GET /api/audit/stats/daily:**

Query Parameters:
- `days`: Number of days to include (default: 30, max: 90)

Response:
```json
{
  "stats": [
    {
      "date": "2026-01-15",
      "total_requests": 1250,
      "unique_users": 5,
      "success_count": 1180,
      "client_error_count": 50,
      "server_error_count": 20,
      "avg_duration_ms": 45.23,
      "max_duration_ms": 2500
    }
  ],
  "days_included": 30,
  "timestamp": "2026-01-15T10:35:00.000Z"
}
```

**GET /api/audit/stats/endpoints:**

Query Parameters:
- `days`: Number of days to include (default: 7, max: 30)
- `limit`: Number of endpoints to return (default: 20, max: 100)

Response:
```json
{
  "endpoints": [
    {
      "target_endpoint": "/api/chats",
      "action_type": "GET",
      "request_count": 500,
      "unique_users": 3,
      "error_count": 5,
      "avg_duration_ms": 35.50,
      "last_called": "2026-01-15T10:30:00.000Z"
    }
  ],
  "days_included": 7,
  "timestamp": "2026-01-15T10:35:00.000Z"
}
```

**Notes:**
- All `/api/*` requests are automatically logged (except `/api/health` and `/api/metrics/*`)
- Sensitive data (passwords, tokens, API keys) is automatically masked as `***REDACTED***`
- Audit logs are stored for 90 days by default
- Only authenticated users can access audit logs

---

## External API (for n8n, Workflows, Automations)

**Base Path:** `/api/v1/external`

Uses API key authentication instead of JWT. Create API keys via the web UI or POST to `/api/v1/external/api-keys`.

### LLM Chat

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/external/llm/chat` | API Key | LLM chat with queue support |
| GET | `/api/v1/external/llm/job/:jobId` | API Key | Get job status |
| GET | `/api/v1/external/llm/queue` | API Key | Get queue status |
| GET | `/api/v1/external/models` | API Key | Get available models |

**POST /api/v1/external/llm/chat:**

```json
{
  "prompt": "Your question here",
  "model": "qwen3:14b-q8",     // Optional
  "temperature": 0.7,          // Optional
  "max_tokens": 2048,          // Optional
  "thinking": false,           // Optional
  "wait_for_result": true,     // Optional (default: true)
  "timeout_seconds": 300       // Optional (default: 300)
}
```

**Response (wait_for_result=true):**

```json
{
  "success": true,
  "response": "AI generated text...",
  "model": "qwen3:14b-q8",
  "job_id": "uuid",
  "processing_time_ms": 1234
}
```

### API Key Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/external/api-keys` | JWT | Create new API key |
| GET | `/api/v1/external/api-keys` | JWT | List API keys |
| DELETE | `/api/v1/external/api-keys/:keyId` | JWT | Revoke API key |

**POST /api/v1/external/api-keys:**

```json
{
  "name": "n8n-integration",
  "description": "API key for n8n workflows",
  "rate_limit_per_minute": 60,
  "allowed_endpoints": ["llm:chat", "llm:status"],
  "expires_at": "2025-12-31T23:59:59Z"
}
```

**Response:**

```json
{
  "success": true,
  "api_key": "aras_xxxx...",  // Only shown once!
  "key_prefix": "aras_xxx",
  "key_id": 1,
  "message": "Store this API key securely - it will not be shown again!"
}
```

---

## Telegram App API

**Base Path:** `/api/telegram-app`

Advanced Telegram bot configuration with zero-config setup.

### Zero-Config Setup

Bot-Wizard mit automatischer Chat-Erkennung via WebSocket.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/zero-config/init` | Start setup session, returns setupToken |
| POST | `/zero-config/token` | Validate bot token, returns deep link |
| GET | `/zero-config/status/:token` | Poll setup status |
| POST | `/zero-config/complete` | Finalize setup, send test message |
| WS | `/ws` | WebSocket for real-time chat detection |

**POST /zero-config/init:**

Startet eine neue Setup-Session (10 Min gültig).

```json
// Response
{
  "success": true,
  "setupToken": "a1b2c3d4e5f6...",  // 32-char hex
  "expiresIn": 600
}
```

**POST /zero-config/token:**

Validiert Bot-Token bei Telegram API und generiert Deep-Link.

```json
// Request
{
  "setupToken": "a1b2c3d4e5f6...",
  "botToken": "123456789:ABCdefGHI..."
}

// Response
{
  "success": true,
  "botInfo": {
    "id": 123456789,
    "first_name": "My Bot",
    "username": "my_bot"
  },
  "deepLink": "https://t.me/my_bot?start=setup_a1b2c3d4"
}
```

**GET /zero-config/status/:token:**

Polling-Endpoint für Setup-Status (Fallback wenn WebSocket nicht verfügbar).

```json
// Response (waiting)
{
  "status": "waiting_start",
  "chatId": null,
  "botUsername": "my_bot"
}

// Response (completed)
{
  "status": "completed",
  "chatId": 987654321,
  "chatUsername": "user123",
  "chatFirstName": "Max"
}
```

**WebSocket /ws:**

Real-time Updates für Chat-Erkennung.

```javascript
// Client → Server: Subscribe
{ "type": "subscribe", "setupToken": "a1b2c3d4..." }

// Server → Client: Subscribed
{ "type": "subscribed", "timestamp": "..." }

// Server → Client: Chat detected
{
  "type": "setup_complete",
  "status": "completed",
  "chatId": 987654321,
  "chatUsername": "user123",
  "chatFirstName": "Max",
  "chatType": "private"
}

// Server → Client: Error
{ "type": "error", "error": "Session expired" }
```

### Notification Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rules` | List notification rules |
| POST | `/rules` | Create notification rule |
| PUT | `/rules/:ruleId` | Update rule |
| DELETE | `/rules/:ruleId` | Delete rule |
| PATCH | `/rules/:ruleId/toggle` | Enable/disable rule |

**POST /api/telegram-app/rules:**

```json
{
  "name": "High CPU Alert",
  "eventSource": "system",
  "eventType": "cpu_critical",
  "severityFilter": ["critical"],
  "messageTemplate": "⚠️ CPU at {{value}}%!",
  "enabled": true
}
```

### Orchestrator

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orchestrator/process` | Process event through rules |
| GET | `/orchestrator/stats` | Get processing statistics |

---

## Telegram Bots API

**Base Path:** `/api/telegram-bots`

CRUD-Operationen für Telegram-Bot-Verwaltung mit LLM-Integration.

### Bot Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all bots |
| POST | `/` | Create new bot |
| GET | `/:id` | Get bot details |
| PUT | `/:id` | Update bot config |
| DELETE | `/:id` | Delete bot |
| POST | `/:id/activate` | Activate bot (set webhook) |
| POST | `/:id/deactivate` | Deactivate bot |
| POST | `/validate-token` | Validate Telegram bot token |

**POST / (Create Bot):**

```json
{
  "name": "Mein Assistent",
  "botToken": "123456789:ABCdefGHI...",
  "llmProvider": "ollama",           // "ollama" | "claude"
  "llmModel": "llama3.2",
  "systemPrompt": "Du bist ein hilfreicher Assistent...",
  "maxTokens": 2048,
  "temperature": 0.7
}
```

### Bot Commands

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:id/commands` | List custom commands |
| POST | `/:id/commands` | Add custom command |
| PUT | `/:id/commands/:cmdId` | Update command |
| DELETE | `/:id/commands/:cmdId` | Delete command |

### Chat Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:id/chats` | List authorized chats |
| DELETE | `/:id/chats/:chatRowId` | Remove chat access |
| GET | `/:id/session/:chatId` | Get chat session |
| DELETE | `/:id/session/:chatId` | Clear chat session |

### Webhook Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:id/webhook` | Get webhook status |
| POST | `/:id/webhook` | Set webhook |
| DELETE | `/:id/webhook` | Remove webhook |
| POST | `/webhook/:botId/:secret` | Webhook receiver (Telegram) |

### Testing & Models

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/:id/test-message` | Send test message |
| GET | `/models/ollama` | List Ollama models |
| GET | `/models/claude` | List Claude models |

---

## Documentation API

**Base Path:** `/api/docs`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/docs/` | OpenAPI documentation UI |
| GET | `/api/docs/openapi.json` | OpenAPI spec (JSON) |
| GET | `/api/docs/openapi.yaml` | OpenAPI spec (YAML) |

---

## Datentabellen API (Dynamic Database)

**Base Path:** `/api/v1/datentabellen`

Dynamic database builder for creating custom tables and automated quote generation.

### Tables

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tables` | List all tables with stats |
| POST | `/tables` | Create new table |
| GET | `/tables/:slug` | Get table with fields |
| PATCH | `/tables/:slug` | Update table metadata |
| DELETE | `/tables/:slug` | Delete table and data |
| POST | `/tables/:slug/fields` | Add field to table |
| PATCH | `/tables/:slug/fields/:fieldSlug` | Update field |
| DELETE | `/tables/:slug/fields/:fieldSlug` | Remove field |

**Supported Field Types:**
- `text`, `textarea`, `number`, `currency`, `date`, `datetime`
- `select`, `multiselect`, `checkbox`, `relation`
- `file`, `image`, `email`, `url`, `phone`, `formula`

### Rows (Data)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tables/:slug/rows` | List rows (paginated) |
| POST | `/tables/:slug/rows` | Create row |
| GET | `/tables/:slug/rows/:rowId` | Get single row |
| PATCH | `/tables/:slug/rows/:rowId` | Update row |
| DELETE | `/tables/:slug/rows/:rowId` | Delete row |
| POST | `/tables/:slug/rows/bulk` | Bulk import (max 1000) |
| DELETE | `/tables/:slug/rows/bulk` | Bulk delete |

**Query Parameters (GET /rows):**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)
- `sort`: Field to sort by (default: `_created_at`)
- `order`: `asc` or `desc` (default: `desc`)
- `filters`: JSON array of filter objects
- `search`: Search in primary display field

**Filter Format:**
```json
[
  {"field": "name", "operator": "like", "value": "Widget"},
  {"field": "price", "operator": "gte", "value": 100}
]
```

**Operators:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `is_null`, `is_not_null`

### Quotes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/quotes` | List quotes (paginated) |
| POST | `/quotes` | Create quote |
| GET | `/quotes/:quoteId` | Get quote with positions |
| PATCH | `/quotes/:quoteId` | Update draft quote |
| POST | `/quotes/:quoteId/status` | Change quote status |
| GET | `/quotes/:quoteId/pdf` | Download quote as PDF |
| GET | `/quotes/templates` | List quote templates |
| POST | `/quotes/templates` | Create template |
| PATCH | `/quotes/templates/:templateId` | Update template |

**Quote Statuses:** `draft`, `sent`, `viewed`, `accepted`, `rejected`, `expired`, `cancelled`

**Create Quote Example:**
```json
{
  "customer_email": "kunde@example.com",
  "customer_name": "Max Mustermann",
  "customer_company": "Muster GmbH",
  "positions": [
    {
      "name": "Product A",
      "quantity": 2,
      "unit": "Stück",
      "unit_price": 99.99
    }
  ],
  "valid_days": 30
}
```

### Stats & Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Data database health check |
| GET | `/stats` | Overview statistics |

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
| Telegram Test | 5 req | 1 min |

---

## Related Documentation

- [API Guide](API_GUIDE.md) - Detailed usage examples
- [API Errors](API_ERRORS.md) - Complete error code reference
- [Dashboard Backend](../services/dashboard-backend/README.md) - Backend implementation details
