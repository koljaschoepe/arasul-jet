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

| Method | Endpoint          | Description                                     |
| ------ | ----------------- | ----------------------------------------------- |
| GET    | `/api/health`     | Health check                                    |
| GET    | `/api/_meta`      | API surface (route groups, version, errorCodes) |
| POST   | `/api/auth/login` | Login                                           |

**GET /api/\_meta:**

Returns a description of the live API surface — used by the frontend and
external clients to discover available route groups and the canonical
list of error codes. No auth required.

```json
{
  "name": "arasul-dashboard-backend",
  "version": "1.0.0",
  "node": "v22.x.x",
  "uptimeSeconds": 12345,
  "routes": { "core": ["..."], "telegram": ["..."], "system": ["..."], "...": [] },
  "errorCodes": ["VALIDATION_ERROR", "UNAUTHORIZED", "..."],
  "timestamp": "2026-..."
}
```

### Authentication

| Method | Endpoint                    | Description                                    | Rate Limit |
| ------ | --------------------------- | ---------------------------------------------- | ---------- |
| POST   | `/api/auth/login`           | Login with username/password (sets cookie)     | 10/15min   |
| POST   | `/api/auth/logout`          | Logout (blacklists token, clears cookie)       | 30/15min   |
| POST   | `/api/auth/logout-all`      | Invalidate all sessions for current user       | 30/15min   |
| POST   | `/api/auth/change-password` | Change own password (invalidates all sessions) | 3/15min    |
| POST   | `/api/auth/refresh-cookie`  | Re-sync session cookie from Bearer token       | 30/15min   |
| GET    | `/api/auth/verify`          | Verify token (for Traefik forward-auth)        | -          |
| GET    | `/api/auth/me`              | Get current user info                          | -          |
| GET    | `/api/auth/csrf`            | Re-mint the CSRF token cookie for this session | -          |
| GET    | `/api/auth/sessions`        | List active sessions for current user          | -          |

**POST /api/auth/logout-all:**

Invalidates every active session for the current user by blacklisting all their tokens. Use this when a device is lost or a security incident is suspected. Auth required.

```json
// Response
{
  "success": true,
  "message": "Logged out from all sessions successfully",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/auth/change-password:**

Changes the current user's own password. All existing sessions are invalidated afterward — the user must log in again with the new password.

```json
// Request
{
  "currentPassword": "current-password",
  "newPassword": "new-password"
}

// Response
{
  "success": true,
  "message": "Password changed successfully. Please log in again with your new password.",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/auth/refresh-cookie:**

Re-syncs the `arasul_session` HttpOnly cookie from the current Bearer token. The frontend calls this right before navigating to a Traefik forward-auth-gated app (n8n, MinIO, Claude Code) when the user may have logged in under a different hostname and the cookie is missing for the current origin.

```json
// Response
{
  "success": true,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/auth/csrf:**

Mints a fresh CSRF token, sets it as the non-HttpOnly `arasul_csrf` cookie (4 h, matching the session), and returns it in the body. The CSRF cookie is otherwise only created at login and rotated on state-changing requests; if it expires or is cleared while the session/Bearer auth is still valid, mutations fail with `403 CSRF_INVALID`. `useApi` calls this automatically to re-mint the token and retry the failed request exactly once — no re-login needed. Auth required.

```json
// Response
{
  "csrfToken": "…64-char hex…",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/auth/verify:**

Used by Traefik forward-auth middleware to protect routes like n8n and Claude Code terminal.
Returns user info headers on success:

- `X-User-Id`: User ID
- `X-User-Name`: Username
- `X-User-Email`: Email (if set)

### System

| Method | Endpoint                 | Description                         |
| ------ | ------------------------ | ----------------------------------- |
| GET    | `/api/system/status`     | System health (OK/WARNING/CRITICAL) |
| GET    | `/api/system/info`       | Version, build hash, uptime         |
| GET    | `/api/system/network`    | IP addresses, mDNS, connectivity    |
| GET    | `/api/system/thresholds` | Device-specific metric thresholds   |

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

### System Setup

| Method | Endpoint                     | Auth     | Description                            |
| ------ | ---------------------------- | -------- | -------------------------------------- |
| GET    | `/api/system/setup-status`   | None     | Check if initial setup is complete     |
| POST   | `/api/system/setup-complete` | Required | Mark setup as complete with settings   |
| PUT    | `/api/system/setup-step`     | Required | Update current setup step and settings |
| POST   | `/api/system/setup-skip`     | Required | Mark setup as skipped                  |

**GET /api/system/setup-status:**

No authentication required. Used by the frontend to determine whether to show the Setup Wizard on first boot.

```json
{
  "setupComplete": false,
  "setupStep": 1,
  "companyName": null
}
```

**POST /api/system/setup-complete:**

Marks the setup wizard as completed and persists the provided settings.

```json
{
  "companyName": "Muster GmbH",
  "hostname": "arasul-device",
  "selectedModel": "gemma4:26b-q4"
}
```

**PUT /api/system/setup-step:**

Saves progress at a specific step without completing the wizard. Allows resuming the wizard at the last saved step.

```json
{
  "step": 3,
  "companyName": "Muster GmbH",
  "hostname": "arasul-device",
  "selectedModel": "qwen3:7b-q8"
}
```

**POST /api/system/setup-skip:**

Marks the setup wizard as skipped. The wizard will not be shown again, but settings can still be configured later via the Settings page.

```json
{}
```

### Metrics

| Method | Endpoint                   | Description                       | Rate Limit |
| ------ | -------------------------- | --------------------------------- | ---------- |
| GET    | `/api/metrics/live`        | Current CPU, RAM, GPU, temp, disk | 20/s       |
| GET    | `/api/metrics/history`     | Historical metrics                | 20/s       |
| WS     | `/api/metrics/live-stream` | WebSocket stream (5s interval)    | -          |

**Query Parameters (history):**

- `range`: Time range (default: `24h`, options: `1h`, `6h`, `24h`, `7d`)

### Services

| Method | Endpoint           | Description               |
| ------ | ------------------ | ------------------------- |
| GET    | `/api/services`    | Status of all services    |
| GET    | `/api/services/ai` | AI services with GPU load |

### AI Chat (LLM)

| Method | Endpoint          | Description                   | Rate Limit |
| ------ | ----------------- | ----------------------------- | ---------- |
| POST   | `/api/llm/chat`   | LLM inference (SSE streaming) | 10/s       |
| GET    | `/api/llm/models` | List available models         | -          |
| GET    | `/api/llm/status` | LLM service status            | -          |

**POST /api/llm/chat:**

```json
{
  "message": "Your question here",
  "conversation_id": "uuid", // optional
  "model": "gemma4:26b-q4", // optional
  "system_prompt": "..." // optional
}
```

Response: Server-Sent Events (SSE) stream

**SSE frame catalogue** (selected — full list in `services/llm/llmJobProcessor.js`):

| `type`                                            | `code`                         | Meaning                                                                                                   |
| ------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `job_started`                                     | —                              | Job entered the queue with an id.                                                                         |
| `status`                                          | `VISION_PROCESSING`            | (P6) Image is being captioned by a vision model before primary stream starts. Payload: `vision_via`.      |
| `warning`                                         | `THINKING_NOT_SUPPORTED`       | Requested think-mode but model lacks support; disabled silently.                                          |
| `warning`                                         | `VISION_FALLBACK_ACTIVE`       | (P6) Image was captioned by a vision model; primary streams with caption injected. Payload: `vision_via`. |
| `warning`                                         | `VISION_FALLBACK_SKIPPED`      | (P6) Vision fallback returned no caption; primary streams without image context.                          |
| `warning`                                         | `NO_VISION_FALLBACK_AVAILABLE` | (P6) Primary is text-only and no vision model is installed; images dropped.                               |
| `context_info`                                    | —                              | Token-budget breakdown for the request.                                                                   |
| `compaction`                                      | —                              | Older messages were summarized to fit context budget.                                                     |
| `thinking` / `thinking_end` / `response` / `done` | —                              | Streaming content frames.                                                                                 |

### Chat Conversations

| Method | Endpoint                  | Description                 |
| ------ | ------------------------- | --------------------------- |
| GET    | `/api/chats`              | List all conversations      |
| POST   | `/api/chats`              | Create new conversation     |
| GET    | `/api/chats/:id`          | Get conversation details    |
| PATCH  | `/api/chats/:id`          | Update title or project     |
| DELETE | `/api/chats/:id`          | Soft delete conversation    |
| GET    | `/api/chats/:id/messages` | Get messages                |
| POST   | `/api/chats/:id/messages` | Add message                 |
| GET    | `/api/chats/:id/export`   | Export chat (JSON/Markdown) |

**POST /api/chats:**

```json
{
  "title": "Optional title",
  "project_id": "uuid" // optional, assign to project
}
```

**PATCH /api/chats/:id:**

```json
{
  "title": "New title", // optional
  "project_id": "uuid|null" // optional, move to/from project
}
```

**GET /api/chats** Query Parameters:

- `ungrouped=true`: Only return conversations not assigned to any project

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

### Projects

Projects group conversations with a shared system prompt and optional Knowledge Space for RAG focus.

| Method | Endpoint            | Description                                     |
| ------ | ------------------- | ----------------------------------------------- |
| GET    | `/api/projects`     | List all projects with conversation count       |
| POST   | `/api/projects`     | Create new project                              |
| GET    | `/api/projects/:id` | Get project details with conversations          |
| PUT    | `/api/projects/:id` | Update project                                  |
| DELETE | `/api/projects/:id` | Delete project (conversations become ungrouped) |

**GET /api/projects:**

Query Parameters:

- `include=conversations`: Include full conversation list per project

```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "Mein Projekt",
      "description": "Projektbeschreibung",
      "system_prompt": "Du bist ein Experte für...",
      "icon": "folder",
      "color": "#45ADFF",
      "knowledge_space_id": "uuid|null",
      "space_name": "Space Name|null",
      "sort_order": 0,
      "conversation_count": "3",
      "conversations": [...]  // only with include=conversations
    }
  ]
}
```

**POST /api/projects:**

```json
{
  "name": "Projekt Name", // required, max 100 chars
  "description": "Optional", // optional
  "system_prompt": "Du bist...", // optional
  "icon": "folder", // optional, default: "folder"
  "color": "#45ADFF", // optional, default: "#45ADFF"
  "knowledge_space_id": "uuid" // optional, must exist
}
```

**PUT /api/projects/:id:**

Same body as POST. All fields optional (COALESCE update). Set `knowledge_space_id` to `null` to unlink a space.

**DELETE /api/projects/:id:**

Conversations belonging to the deleted project are ungrouped (`project_id` set to `NULL`), not deleted.

### RAG (Document Q&A)

| Method | Endpoint            | Description                      |
| ------ | ------------------- | -------------------------------- |
| POST   | `/api/rag/query`    | RAG query (SSE streaming)        |
| GET    | `/api/rag/status`   | Qdrant collection status         |
| GET    | `/api/rag/settings` | Current RAG/LLM tunables (admin) |
| PATCH  | `/api/rag/settings` | Update RAG/LLM tunables (admin)  |

**POST /api/rag/query:**

```json
{
  "query": "Your question about documents",
  "conversation_id": "uuid", // optional
  "top_k": 5 // optional, default: 5
}
```

**GET /api/rag/settings** (admin only) — returns the raw `system_settings`
values for every RAG/LLM tunable as `{ "data": { ... } }`. A `null` value means
"use the built-in/env default". Backs the Settings → "RAG & LLM" admin tab.

**PATCH /api/rag/settings** (admin only) — updates any subset of the tunables and
`systemSettings.reload()`s the in-memory cache so the change takes effect
immediately (no restart). Body validated by `UpdateRagSettingsBody` (`.strict()`;
unknown keys → `400 VALIDATION_ERROR`). Sending `""` for `llm_base_system_prompt`
resets it to `NULL` (built-in default). Bounds:

| Field                          | Type   | Range / notes                          |
| ------------------------------ | ------ | -------------------------------------- |
| `rag_top_k`                    | int    | 1–50                                   |
| `rag_final_k`                  | int    | 1–20                                   |
| `rag_score_threshold`          | float  | 0–1                                    |
| `rag_relevance_threshold`      | float  | 0–1                                    |
| `rag_rerank_enabled`           | bool   |                                        |
| `rag_timeout_rerank_ms`        | int    | 1000–120000                            |
| `llm_num_ctx_default`          | int    | 512–131072, nullable                   |
| `llm_keep_alive_seconds`       | int    | 0–86400                                |
| `llm_num_predict_default`      | int    | 64–16384                               |
| `rag_temperature`              | float  | 0–2                                    |
| `rag_num_predict`              | int    | 64–16384                               |
| `rag_mmr_lambda`               | float  | 0–1                                    |
| `rag_dedup_max_per_doc`        | int    | 1–10                                   |
| `rag_hybrid_search`            | bool   | master switch for Qdrant hybrid search |
| `rag_space_routing_threshold`  | float  | 0–1                                    |
| `rag_space_routing_max_spaces` | int    | 1–10                                   |
| `llm_base_system_prompt`       | string | ≤4000 chars, nullable (`""` → reset)   |

Response: the fresh full settings row as `{ "data": { ... } }`.

### Document Analysis (Chat Upload + OCR)

| Method | Endpoint                         | Description                               |
| ------ | -------------------------------- | ----------------------------------------- |
| POST   | `/api/document-analysis/analyze` | Upload + OCR extract + LLM analysis (SSE) |
| POST   | `/api/document-analysis/extract` | Pure text extraction without LLM (JSON)   |

**POST /api/document-analysis/analyze:**

Upload a document, extract text (OCR if needed), and analyze with the LLM. Returns SSE stream.

Request: `multipart/form-data`

| Field             | Type   | Required | Description                                 |
| ----------------- | ------ | -------- | ------------------------------------------- |
| `file`            | File   | Yes      | PDF, DOCX, TXT, MD, PNG, JPG, TIFF, BMP     |
| `conversation_id` | number | Yes      | Chat conversation ID                        |
| `prompt`          | string | No       | Custom analysis prompt (default: summarize) |
| `model`           | string | No       | Model to use (default: system default)      |
| `temperature`     | number | No       | Sampling temperature (default: 0.7)         |

SSE events: `job_started`, `thinking`, `response`, `done` (same format as `/api/llm/chat`).

**POST /api/document-analysis/extract:**

Pure text extraction without LLM. Used by n8n and internal tools.

Request: `multipart/form-data` with `file` field.

```json
// Response:
{
  "text": "Extracted document text...",
  "filename": "invoice.pdf",
  "metadata": {
    "char_count": 4521,
    "word_count": 812,
    "ocr_used": true,
    "language": "deu"
  }
}
```

### Documents (Data Tab)

| Method | Endpoint                     | Description                   |
| ------ | ---------------------------- | ----------------------------- |
| GET    | `/api/documents`             | List all documents            |
| POST   | `/api/documents/upload`      | Upload document (multipart)   |
| GET    | `/api/documents/:id`         | Get document details          |
| DELETE | `/api/documents/:id`         | Delete document               |
| GET    | `/api/documents/:id/content` | Get file content (text files) |
| PUT    | `/api/documents/:id/content` | Update file content           |

**POST /api/documents/upload:**

- Content-Type: `multipart/form-data`
- Field: `file` (PDF, TXT, DOCX, Markdown, or YAML)

### Embeddings

| Method | Endpoint          | Description              |
| ------ | ----------------- | ------------------------ |
| POST   | `/api/embeddings` | Generate text embeddings |

**POST /api/embeddings:**

```json
{
  "text": "Text to embed"
}
```

### Workflows (n8n)

| Method | Endpoint                  | Description         |
| ------ | ------------------------- | ------------------- |
| GET    | `/api/workflows/activity` | Workflow statistics |

### Automations (n8n auto-session)

| Method | Endpoint                   | Description                                                   |
| ------ | -------------------------- | ------------------------------------------------------------- |
| GET    | `/api/automations/session` | Logs the fixed n8n owner in and forwards n8n's session cookie |

Requires an authenticated dashboard session (`requireAuth`). The backend logs
the fixed n8n owner into n8n (`POST /rest/login`, credentials from the
`n8n_owner_email` / `n8n_owner_password` Docker secrets) and forwards n8n's
`Set-Cookie` (`n8n-auth`) verbatim, same-origin, so the `/n8n/` iframe loads
already authenticated (Plan 007). Response: `{ "data": { "authenticated": true }, "timestamp": "…" }`.
On n8n being unreachable or login failing, returns `503 SERVICE_UNAVAILABLE`.

### Self-Healing

| Method | Endpoint                   | Description    |
| ------ | -------------------------- | -------------- |
| GET    | `/api/self-healing/events` | Event history  |
| GET    | `/api/self-healing/status` | Current status |

**Query Parameters (events):**

- `limit`: Max results (default: 100)
- `severity`: Filter by severity (INFO, WARNING, CRITICAL)

### Alerts

| Method | Endpoint                              | Description                                    |
| ------ | ------------------------------------- | ---------------------------------------------- |
| GET    | `/api/alerts/settings`                | Get global alert settings                      |
| PUT    | `/api/alerts/settings`                | Update global alert settings                   |
| GET    | `/api/alerts/thresholds`              | Get all threshold configurations               |
| PUT    | `/api/alerts/thresholds/:metricType`  | Update threshold (cpu, ram, disk, temperature) |
| GET    | `/api/alerts/quiet-hours`             | Get quiet hours for all days                   |
| PUT    | `/api/alerts/quiet-hours/:dayOfWeek`  | Update quiet hours for single day (0-6)        |
| PUT    | `/api/alerts/quiet-hours`             | Bulk update quiet hours                        |
| GET    | `/api/alerts/history`                 | Get alert history                              |
| POST   | `/api/alerts/history/:id/acknowledge` | Acknowledge single alert                       |
| POST   | `/api/alerts/history/acknowledge-all` | Acknowledge all alerts                         |
| GET    | `/api/alerts/statistics`              | Get alert statistics                           |
| POST   | `/api/alerts/test-webhook`            | Test webhook configuration                     |
| POST   | `/api/alerts/trigger-check`           | Manually trigger alert check                   |
| GET    | `/api/alerts/status`                  | Get alert engine status                        |

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

| Method | Endpoint                       | Description                   | Rate Limit |
| ------ | ------------------------------ | ----------------------------- | ---------- |
| POST   | `/api/claude-terminal/query`   | Execute query (SSE streaming) | 5/min      |
| GET    | `/api/claude-terminal/status`  | Terminal service status       | -          |
| GET    | `/api/claude-terminal/history` | User's query history          | -          |
| GET    | `/api/claude-terminal/context` | Current system context        | -          |
| DELETE | `/api/claude-terminal/history` | Clear query history           | -          |

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
data: {"type": "start", "queryId": 123, "model": "gemma4:26b-q4"}
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
    "models": ["gemma4:26b-q4"],
    "error": null
  },
  "config": {
    "defaultModel": "gemma4:26b-q4",
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
      "model_used": "gemma4:26b-q4",
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

| Method | Endpoint                           | Auth   | Description                       |
| ------ | ---------------------------------- | ------ | --------------------------------- |
| GET    | `/api/events`                      | Yes    | Get recent notification events    |
| GET    | `/api/events/stats`                | Yes    | Event and notification statistics |
| GET    | `/api/events/settings`             | Yes    | User notification settings        |
| PUT    | `/api/events/settings`             | Yes    | Update notification settings      |
| POST   | `/api/events/test`                 | Yes    | Send test notification            |
| POST   | `/api/events/webhook/n8n`          | Secret | n8n workflow webhook              |
| POST   | `/api/events/webhook/self-healing` | IP     | Self-healing agent webhook        |
| POST   | `/api/events/manual`               | Yes    | Create manual notification        |
| GET    | `/api/events/service-status`       | Yes    | Service status cache              |
| GET    | `/api/events/boot-history`         | Yes    | System boot history               |
| DELETE | `/api/events/:id`                  | Yes    | Delete specific event             |
| POST   | `/api/events/cleanup`              | Yes    | Cleanup old events                |
| GET    | `/api/events/telegram/status`      | Yes    | Telegram connection status        |

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

| Method | Endpoint                       | Description                                                                                |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------ |
| GET    | `/api/spaces`                  | List all knowledge spaces                                                                  |
| GET    | `/api/spaces/tree`             | Explorer-Aggregat: alle Spaces (mit `parent_id`) + alle Dokumente                          |
| GET    | `/api/spaces/:id`              | Get space details with documents                                                           |
| POST   | `/api/spaces`                  | Create knowledge space (optional `parent_id` für Unterordner)                              |
| PUT    | `/api/spaces/:id`              | Update knowledge space (`parent_id` = Verschieben, Zyklus-Schutz)                          |
| DELETE | `/api/spaces/:id`              | Delete space (409 bei Unterordnern; moves docs to default, Kontextdatei wird soft-deleted) |
| POST   | `/api/spaces/:id/regenerate`   | Trigger context regeneration                                                               |
| POST   | `/api/spaces/route`            | Find relevant spaces for query                                                             |
| GET    | `/api/spaces/:id/context-file` | Kontextdatei des Ordners lesen (`{document, content}` oder nulls)                          |
| PUT    | `/api/spaces/:id/context-file` | Kontextdatei anlegen/aktualisieren (`{content}`, max. 50.000)                              |
| DELETE | `/api/spaces/:id/context-file` | Kontextdatei löschen (Soft-Delete)                                                         |

> **Ordnerbaum & Kontextdateien (Plan `ide-workspace-shell`):** Spaces bilden
> über `parent_id` einen verschachtelten Ordnerbaum (Workspace-Explorer).
> Die Kontextdatei eines Ordners (`documents.is_context_file = TRUE`,
> Status `context`) wird nicht indexiert und nicht in Dokumentlisten
> geführt; bei RAG-Anfragen mit explizitem `space_ids`-Scope wird sie
> sanitisiert als Prompt-Ebene »Ordner-Kontext« injiziert (max. 3 Dateien
> pro Anfrage, 5-Minuten-Cache mit Invalidierung beim Speichern).

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
- Documents are moved to default space when deleting; the folder's context
  file (`is_context_file = TRUE`) is **not** moved but soft-deleted with the
  space (it belongs to the folder, not to the documents) — `moved_documents`
  counts only regular documents
- Space statistics (`actual_document_count`, `indexed_document_count`) and the
  document list of `GET /api/spaces/:id` exclude context files
- Space descriptions are embedded for semantic routing

### Settings / Passwords

| Method | Endpoint                              | Description               | Rate Limit |
| ------ | ------------------------------------- | ------------------------- | ---------- |
| POST   | `/api/settings/password/dashboard`    | Change Dashboard password | 3/15min    |
| POST   | `/api/settings/password/minio`        | Change MinIO password     | 3/15min    |
| POST   | `/api/settings/password/n8n`          | Change n8n password       | 3/15min    |
| GET    | `/api/settings/password-requirements` | Get password rules        | -          |

**POST /api/settings/password/\*:**

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

| Method | Endpoint                         | Description                              | Rate Limit |
| ------ | -------------------------------- | ---------------------------------------- | ---------- |
| POST   | `/api/telegram/config`           | Save bot token and settings              | 100/min    |
| GET    | `/api/telegram/config`           | Get configuration (token masked)         | -          |
| GET    | `/api/telegram/updates`          | Get recent messages to discover chat IDs | 5/min      |
| GET    | `/api/telegram/thresholds`       | Get alert thresholds                     | -          |
| PUT    | `/api/telegram/thresholds`       | Update alert thresholds                  | 100/min    |
| POST   | `/api/telegram/test`             | Send test message                        | 5/min      |
| GET    | `/api/telegram/audit-logs`       | Get bot audit logs                       | -          |
| GET    | `/api/telegram/audit-logs/stats` | Get audit statistics                     | -          |

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

| Method | Endpoint                       | Description                       |
| ------ | ------------------------------ | --------------------------------- |
| POST   | `/api/update/upload`           | Upload .araupdate file            |
| GET    | `/api/update/status`           | Current update status             |
| GET    | `/api/update/history`          | Update history                    |
| GET    | `/api/update/usb-devices`      | Scan for USB devices with updates |
| POST   | `/api/update/install-from-usb` | Install update from USB device    |

**POST /api/update/upload:**

- Content-Type: `multipart/form-data`
- Field: `file` (.araupdate package)

**GET /api/update/usb-devices:**

Auth: Required

Scans `/media/` and `/mnt/` directories for `.araupdate` files with accompanying `.sig` signature files.

Response:

```json
{
  "devices": [
    {
      "path": "/media/usb/update.araupdate",
      "name": "update.araupdate",
      "size": 1073741824,
      "mountPoint": "/media/usb",
      "device": "/dev/sda1",
      "modified": "2026-01-15T10:00:00.000Z"
    }
  ],
  "count": 1,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/update/install-from-usb:**

Auth: Required

Installs an update package from a USB device. Security restriction: only paths under `/media/` or `/mnt/` are allowed. Requires corresponding `.sig` signature file alongside the `.araupdate` file.

Request Body:

```json
{
  "file_path": "/media/usb/update.araupdate"
}
```

Response (same as POST /upload):

```json
{
  "file_path": "/media/usb/update.araupdate",
  "version": "2.1.0",
  "components": [
    {
      "name": "frontend",
      "version": "2.1.0"
    },
    {
      "name": "backend",
      "version": "2.1.0"
    }
  ],
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**Notes:**

- USB device paths must be under `/media/` or `/mnt/` (security restriction)
- Each `.araupdate` file must have a matching `.sig` signature file
- Signature verification is performed before installation

### Logs

| Method | Endpoint              | Description              |
| ------ | --------------------- | ------------------------ |
| GET    | `/api/logs`           | List available log files |
| GET    | `/api/logs/:filename` | Get log file content     |

### Database

| Method | Endpoint                | Description                |
| ------ | ----------------------- | -------------------------- |
| GET    | `/api/database/status`  | Database connection status |
| GET    | `/api/database/metrics` | Database size & stats      |

### Workspace-Apps

Sichtbarkeit der kuratierten Kern-Apps (n8n, Telegram, Datenbank) in der
Workspace-Shell. Persistenz in `platform_apps`; deaktivierte Apps
verschwinden aus ActivityBar/Tab-Angebot, die Dienste laufen weiter.

| Method | Endpoint                  | Description                                        |
| ------ | ------------------------- | -------------------------------------------------- |
| GET    | `/api/workspace-apps`     | Manifest (id, name, description, tab) + `enabled`  |
| PUT    | `/api/workspace-apps/:id` | App an-/abschalten — Body `{ "enabled": boolean }` |

### Store

| Method | Endpoint                  | Description                           |
| ------ | ------------------------- | ------------------------------------- |
| GET    | `/api/apps`               | List all apps (installed + available) |
| GET    | `/api/apps/categories`    | List app categories                   |
| GET    | `/api/apps/:id`           | Get single app details                |
| GET    | `/api/apps/:id/logs`      | Get container logs                    |
| GET    | `/api/apps/:id/events`    | Get app event history                 |
| POST   | `/api/apps/:id/install`   | Install an app                        |
| POST   | `/api/apps/:id/uninstall` | Uninstall an app                      |
| POST   | `/api/apps/:id/start`     | Start an installed app                |
| POST   | `/api/apps/:id/stop`      | Stop a running app                    |
| POST   | `/api/apps/:id/restart`   | Restart an app                        |
| POST   | `/api/apps/sync`          | Sync system apps status               |

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

| Method | Endpoint                       | Description                                |
| ------ | ------------------------------ | ------------------------------------------ |
| GET    | `/api/workspaces`              | List all active workspaces                 |
| GET    | `/api/workspaces/:id`          | Get single workspace (by ID or slug)       |
| POST   | `/api/workspaces`              | Create a new workspace                     |
| PUT    | `/api/workspaces/:id`          | Update workspace name/description          |
| DELETE | `/api/workspaces/:id`          | Soft-delete a workspace                    |
| POST   | `/api/workspaces/:id/default`  | Set workspace as default                   |
| POST   | `/api/workspaces/:id/use`      | Mark workspace as used (increment counter) |
| GET    | `/api/workspaces/volumes/list` | Get volume bindings for container config   |

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

| Method | Endpoint                     | Description                        |
| ------ | ---------------------------- | ---------------------------------- |
| GET    | `/api/models/catalog`        | List curated model catalog         |
| GET    | `/api/models/installed`      | List installed models              |
| GET    | `/api/models/status`         | Current loaded model + queue stats |
| GET    | `/api/models/loaded`         | Get currently loaded model         |
| GET    | `/api/models/default`        | Get default model                  |
| POST   | `/api/models/default`        | Set default model                  |
| POST   | `/api/models/download`       | Download model (SSE progress)      |
| DELETE | `/api/models/:id`            | Delete installed model             |
| POST   | `/api/models/:id/activate`   | Load model into RAM                |
| POST   | `/api/models/:id/deactivate` | Unload model from RAM              |

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
      "context_window": 32768,
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
  "loaded_model": "gemma4:26b-q4",
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

| Method | Endpoint                     | Description                   |
| ------ | ---------------------------- | ----------------------------- |
| GET    | `/api/store/recommendations` | Get recommended models + apps |
| GET    | `/api/store/search`          | Search across models and apps |
| GET    | `/api/store/info`            | Get system info (RAM, disk)   |

**GET /api/store/recommendations:**
Returns models recommended for the system's RAM capacity and featured apps.

```json
{
  "models": [
    { "id": "gemma4:26b-q4", "name": "Qwen 3 14B", ... }
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

| Method | Endpoint                     | Description                                  |
| ------ | ---------------------------- | -------------------------------------------- |
| GET    | `/api/audit/logs`            | Get audit logs with pagination and filtering |
| GET    | `/api/audit/stats/daily`     | Get daily aggregated statistics              |
| GET    | `/api/audit/stats/endpoints` | Get endpoint usage statistics                |

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
      "request_payload": { "title": "New Chat" },
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
      "avg_duration_ms": 35.5,
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

### Tailscale

| Method | Endpoint                    | Auth     | Description                                               |
| ------ | --------------------------- | -------- | --------------------------------------------------------- |
| GET    | `/api/tailscale/status`     | Required | Get current Tailscale connection status                   |
| GET    | `/api/tailscale/peers`      | Required | List connected Tailscale peers                            |
| POST   | `/api/tailscale/install`    | Required | Install Tailscale on the host system                      |
| POST   | `/api/tailscale/connect`    | Required | Connect with auth key (auto-enables `serve`)              |
| POST   | `/api/tailscale/disconnect` | Required | Disconnect from Tailscale                                 |
| GET    | `/api/tailscale/serve`      | Required | Report `tailscale serve` state + HTTPS-cert readiness     |
| POST   | `/api/tailscale/serve`      | Required | Enable browser-trusted remote HTTPS (serve → Traefik:443) |
| DELETE | `/api/tailscale/serve`      | Required | Disable serve (remote falls back to raw Tailscale IP)     |

All endpoints require authentication. The route group uses a dedicated `tailscaleLimiter`.

**GET /api/tailscale/serve Response:**

```json
{
  "installed": true,
  "enabled": true,
  "httpsAvailable": true,
  "dnsName": "arasul.tail1234.ts.net"
}
```

`httpsAvailable` is `false` until MagicDNS + HTTPS certs are enabled once in the
Tailscale admin console; until then remote access uses the raw Tailscale IP.

**GET /api/tailscale/status Response:**

```json
{
  "installed": true,
  "running": true,
  "connected": true,
  "ip": "100.x.x.x",
  "hostname": "arasul-device",
  "dnsName": "arasul-device.tailnet.ts.net",
  "tailnet": "tailnet.ts.net",
  "version": "1.x.x",
  "peers": [],
  "certDomains": []
}
```

> **`detectionError`:** If the backend cannot run the host probe (helper image
> `alpine:latest` not pullable, docker-proxy unreachable, exec error/timeout),
> the response is `{ ...empty, installed: false, detectionError: true }`. This is
> a transient/retryable condition and must **not** be treated as "Tailscale not
> installed" — clients keep the last-known status and offer a retry.

**GET /api/tailscale/peers Response:**

```json
{
  "peers": [
    {
      "id": "nodekey:abc123",
      "hostname": "laptop",
      "ip": "100.x.x.y",
      "online": true
    }
  ]
}
```

**POST /api/tailscale/connect:**

```json
{
  "authKey": "tskey-auth-...",
  "hostname": "arasul-device" // optional
}
```

---

### License

All endpoints require admin authentication (`requireAuth` + `requireAdmin`).

| Method | Endpoint                      | Description                                 |
| ------ | ----------------------------- | ------------------------------------------- |
| GET    | `/api/license/info`           | Get current license status + HW fingerprint |
| GET    | `/api/license/fingerprint`    | Get device hardware fingerprint             |
| POST   | `/api/license/activate`       | Activate a license key                      |
| GET    | `/api/license/check/:feature` | Check if a feature gate is allowed          |

**GET /api/license/info Response:**

```json
{
  "valid": true,
  "tier": "professional",
  "customer": "Muster GmbH",
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "features": ["rag", "telegram", "backup"],
  "hardwareFingerprint": "sha256:abc...",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/license/fingerprint Response:**

```json
{
  "hardwareFingerprint": "sha256:abc123...",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/license/activate:**

```json
// Request
{
  "licenseKey": "ARAS-XXXX-XXXX-XXXX"
}

// Response
{
  "success": true,
  "license": {
    "tier": "professional",
    "customer": "Muster GmbH",
    "expiresAt": "2027-01-01T00:00:00.000Z"
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/license/check/:feature Response:**

```json
{
  "feature": "telegram",
  "allowed": true,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

---

### GDPR / Data Privacy

All endpoints require authentication. `export` and `categories` additionally require admin role.

| Method | Endpoint               | Auth     | Description                                     |
| ------ | ---------------------- | -------- | ----------------------------------------------- |
| GET    | `/api/gdpr/export`     | Admin    | Full GDPR data export (Art. 20) as JSON file    |
| GET    | `/api/gdpr/categories` | Admin    | List data categories with record counts         |
| DELETE | `/api/gdpr/me`         | Required | Delete own account (Art. 17 — right to erasure) |

**GET /api/gdpr/export:**

Returns a JSON file download (`Content-Disposition: attachment`) containing all personal data: profile, conversations, messages, attachments (metadata), documents (metadata), AI memories, login history, active sessions, activity log, security events, knowledge spaces, and projects. Limited to the 10,000 most recent messages and 1,000 most recent audit entries.

```json
{
  "_meta": {
    "exportDate": "2026-01-15T10:00:00.000Z",
    "exportVersion": "1.0",
    "system": "Arasul Platform",
    "userId": 1,
    "username": "admin"
  },
  "profile": { "id": 1, "username": "admin", "email": "...", "created_at": "..." },
  "conversations": { "count": 42, "data": [...] },
  "messages": { "count": 1500, "data": [...] },
  "attachments": { "count": 5, "note": "File contents stored in MinIO...", "data": [...] },
  "documents": { "count": 10, "data": [...] },
  "aiMemories": { "count": 25, "data": [...] },
  "loginHistory": { "count": 100, "data": [...] },
  "activeSessions": { "count": 2, "data": [...] },
  "activityLog": { "count": 1000, "data": [...] },
  "securityEvents": { "count": 15, "data": [...] },
  "knowledgeSpaces": { "count": 3, "data": [...] },
  "projects": { "count": 4, "data": [...] }
}
```

**GET /api/gdpr/categories:**

```json
{
  "categories": [
    { "name": "Profil", "description": "Benutzername, E-Mail, Erstelldatum", "count": 1 },
    { "name": "Chat-Konversationen", "description": "Alle Gespräche mit der KI", "count": 42 },
    { "name": "Dokumente", "description": "Hochgeladene Dateien (Metadaten)", "count": 10 },
    {
      "name": "KI-Erinnerungen",
      "description": "Vom KI-Assistenten gespeicherte Informationen",
      "count": 25
    },
    { "name": "Aktivitätsprotokoll", "description": "API-Zugriffe und Aktionen", "count": 1000 },
    { "name": "Anmeldehistorie", "description": "Login-Versuche und Sessions" },
    {
      "name": "Sicherheitsereignisse",
      "description": "Passwortänderungen, Konfigurationsänderungen"
    }
  ],
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**DELETE /api/gdpr/me:**

DSGVO Art. 17 right to erasure. Deletes conversations, messages, documents, memories, and the account itself. Compliance trails (audit logs, login history) are anonymised (user_id set to NULL) rather than deleted, as permitted under Art. 17(3)(b). The last remaining admin cannot delete themselves.

```json
// Request — confirmation token is mandatory
{
  "confirm": "LOESCHEN-BESTAETIGT"
}

// Response
{
  "ok": true,
  "message": "Account und alle persönlichen Daten wurden gelöscht.",
  "summary": {
    "chat_attachments": 5,
    "chat_messages": 1500,
    "chat_conversations": 42,
    "documents": 10,
    "active_sessions": 2,
    "anon_audit_logs": 100,
    "anon_api_audit_logs": 900,
    "anon_login_attempts": 50,
    "admin_users": 1
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**Notes:**

- Session cookie (`arasul_session`) is cleared on successful account deletion
- The confirmation token must be the exact string `LOESCHEN-BESTAETIGT`
- MinIO file contents are not deleted immediately; object storage cleanup is a follow-up step

---

### Backup (External SSD)

All endpoints require admin authentication (`requireAuth` + `requireAdmin`).

The backup path defaults to `/mnt/external-ssd` and can be overridden with `EXTERNAL_BACKUP_PATH`.

| Method | Endpoint              | Description                             |
| ------ | --------------------- | --------------------------------------- |
| GET    | `/api/backup/status`  | Check if external SSD is detected       |
| POST   | `/api/backup/trigger` | Trigger a manual backup to external SSD |
| GET    | `/api/backup/history` | List previous backup directories on SSD |

**GET /api/backup/status Response:**

```json
{
  "ssd": {
    "mounted": true,
    "path": "/mnt/external-ssd",
    "totalBytes": 1000000000000,
    "usedBytes": 200000000000,
    "availableBytes": 800000000000
  },
  "backupEnabled": true,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

When no SSD is connected:

```json
{
  "ssd": { "mounted": false, "reason": "No device mounted at mount point" },
  "backupEnabled": false,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/backup/trigger:**

On-demand backup is not implemented — scheduled backups run inside the separate
`backup-service` container (`BACKUP_USB_ENABLED` / `BACKUP_USB_MOUNT`), not on
request from this backend. Returns `400 VALIDATION_ERROR` if no external SSD is
mounted, otherwise `501 NOT_IMPLEMENTED`.

```json
// 501 Response
{
  "error": {
    "code": "NOT_IMPLEMENTED",
    "message": "Manuelles Backup ist noch nicht verfügbar. Backups laufen automatisch geplant über den Backup-Service.",
    "details": { "scheduled": true, "targetPath": "/mnt/external-ssd" }
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/backup/history Response:**

```json
{
  "backups": [{ "name": "2026-01-15T08-00-00" }, { "name": "2026-01-14T08-00-00" }],
  "ssd": { "mounted": true, "path": "/mnt/external-ssd", "...": "..." },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

Returns an empty `backups` array if the SSD is not mounted or no backups exist yet.

---

### Ops Overview

Single consolidated endpoint that aggregates backup status, restore-drill status, service health, active alerts, undelivered notifications, current metrics, and retention counts for the System-Gesundheit dashboard widget.

| Method | Endpoint            | Auth  | Description                         |
| ------ | ------------------- | ----- | ----------------------------------- |
| GET    | `/api/ops/overview` | Admin | Aggregated platform health snapshot |

**GET /api/ops/overview Response:**

```json
{
  "status": "OK",
  "warnings": [],
  "criticals": [],
  "backup": {
    "status": "ok",
    "timestamp": "2026-01-15T08:00:00.000Z",
    "ageHours": 2,
    "stale": false,
    "postgresBackups": 3,
    "minioBackups": 2,
    "walSegments": 12,
    "totalSize": "4.2 GB"
  },
  "restore_drill": {
    "status": "ok",
    "timestamp": "2026-01-10T12:00:00.000Z",
    "ageDays": 5,
    "stale": false,
    "verifiedTables": 42,
    "duration": 120
  },
  "services": {
    "total": 12,
    "healthy": 12,
    "degraded": 0,
    "down": 0,
    "down_services": []
  },
  "alerts": {
    "active": 0,
    "items": []
  },
  "notifications": {
    "unsent_24h": 0,
    "unsent_critical_24h": 0
  },
  "metrics": {
    "cpu_percent": 15,
    "ram_percent": 42,
    "gpu_percent": 5,
    "temperature_c": 45,
    "disk_percent": 35
  },
  "retention_counts": {
    "app_events": 1250,
    "chat_messages": 8500,
    "self_healing_events": 120
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

`status` is `OK`, `WARNING`, or `CRITICAL`. `warnings` and `criticals` are human-readable string arrays. The backup section returns `{ "status": "missing" }` if the backup report file cannot be read.

---

### Memory (AI)

Manages the AI assistant's persistent memory profile and individual memory entries. All routes require authentication.

| Method | Endpoint                    | Description                                 |
| ------ | --------------------------- | ------------------------------------------- |
| GET    | `/api/memory/profile`       | Get AI profile YAML                         |
| PUT    | `/api/memory/profile`       | Update AI profile YAML                      |
| POST   | `/api/memory/profile`       | Create profile from wizard data             |
| GET    | `/api/memory/list`          | List all memories (paginated)               |
| GET    | `/api/memory/search`        | Semantic memory search                      |
| GET    | `/api/memory/stats`         | Memory statistics                           |
| GET    | `/api/memory/context-stats` | Context compaction and token usage stats    |
| POST   | `/api/memory/reindex`       | Reindex all memories into Qdrant            |
| POST   | `/api/memory/export`        | Export all memories as JSON                 |
| DELETE | `/api/memory/all`           | Delete all memories (confirmation required) |
| GET    | `/api/memory/:id`           | — (via list/search)                         |
| PUT    | `/api/memory/:id`           | Update a memory's content                   |
| DELETE | `/api/memory/:id`           | Delete a single memory                      |

**GET /api/memory/profile Response:**

```json
{
  "profile": "firma: Muster GmbH\nbranche: Software\n..."
}
```

**PUT /api/memory/profile:**

```json
{
  "profile": "firma: Neue GmbH\nbranche: Handel\n..."
}
```

**POST /api/memory/profile (wizard):**

```json
// Request
{
  "companyName": "Muster GmbH",
  "industry": "Software",
  "teamSize": "10-50",
  "products": ["Produkt A", "Produkt B"],
  "preferences": { "language": "de" }
}

// Response
{
  "success": true,
  "profile": "firma: Muster GmbH\n..."
}
```

**GET /api/memory/list Query Parameters:**

- `type`: Filter by memory type (optional)
- `limit`: Max results (default: 50, max: 100)
- `offset`: Pagination offset

```json
// Response
{
  "memories": [
    {
      "id": "uuid",
      "key": "company_name",
      "content": "Muster GmbH",
      "memory_type": "fact",
      "created_at": "2026-01-15T10:00:00.000Z",
      "access_count": 5
    }
  ],
  "total": 25,
  "limit": 50,
  "offset": 0
}
```

**GET /api/memory/search Query Parameters:**

- `q`: Search query (required)
- `limit`: Max results (default: 10, max: 20)

**GET /api/memory/context-stats Query Parameters:**

- `days`: Number of days to include (default: 30, max: 90)

```json
// Response
{
  "period": "30d",
  "compaction": {
    "total": 12,
    "avgCompression": 65,
    "totalMemoriesExtracted": 48,
    "avgTokensBefore": 8000,
    "avgTokensAfter": 2800,
    "avgDurationMs": 1500,
    "totalMessagesCompacted": 240
  },
  "tokens": {
    "totalJobs": 500,
    "avgPromptTokens": 3200,
    "avgCompletionTokens": 450,
    "avgContextWindow": 3650
  },
  "recentCompactions": [...],
  "dailyActivity": [...]
}
```

**DELETE /api/memory/all:**

```json
// Request
{
  "confirm": true
}
```

---

### Company Context (RAG)

Global company context injected into every RAG query as background context.
Both routes require **admin** privileges (`requireAuth` + `requireAdmin`).

| Method | Endpoint                        | Description                           |
| ------ | ------------------------------- | ------------------------------------- |
| GET    | `/api/settings/company-context` | Get the company context (Markdown)    |
| PUT    | `/api/settings/company-context` | Update the company context (Markdown) |

**GET /api/settings/company-context Response:**

If no context has been saved yet, a default Markdown template is returned with
`updated_at` and `updated_by` set to `null`.

```json
{
  "content": "# Unternehmensprofil\n\n**Firma:** [Firmenname]\n...",
  "updated_at": null,
  "updated_by": null,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**PUT /api/settings/company-context:**

```json
// Request — content is trimmed and must be non-empty
{
  "content": "# Unternehmensprofil\n\n**Firma:** Muster GmbH\n..."
}

// Response
{
  "content": "# Unternehmensprofil\n\n**Firma:** Muster GmbH\n...",
  "updated_at": "2026-01-15T10:00:00.000Z",
  "message": "Unternehmenskontext erfolgreich gespeichert",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

The content embedding is computed asynchronously (fire-and-forget) after the
response is sent, so saves are not delayed by an embedding round-trip.

---

### Knowledge Graph

Graph-based entity and relation queries backed by the `kg_entities` / `kg_relations` tables. Populated by the document-indexer service during indexing. All routes require authentication.

| Method | Endpoint                             | Description                                  |
| ------ | ------------------------------------ | -------------------------------------------- |
| GET    | `/api/knowledge-graph/entities`      | Search or list entities                      |
| GET    | `/api/knowledge-graph/related/:name` | Traverse graph from a named entity           |
| GET    | `/api/knowledge-graph/document/:id`  | Get entities and relations for a document    |
| GET    | `/api/knowledge-graph/connections`   | Find shortest path between two entities      |
| GET    | `/api/knowledge-graph/stats`         | Graph statistics overview                    |
| POST   | `/api/knowledge-graph/query`         | Free-text → graph-enriched context (for n8n) |
| POST   | `/api/knowledge-graph/refine`        | Trigger LLM-based entity/relation refinement |
| GET    | `/api/knowledge-graph/refine/status` | Get refinement status                        |

**GET /api/knowledge-graph/entities Query Parameters:**

- `search`: Name pattern (ILIKE, max 200 chars)
- `type`: Entity type filter — one of `Person`, `Organisation`, `Produkt`, `Technologie`, `Prozess`, `Konzept`, `Ort`, `Dokument`
- `limit`: Max results (default: 50, max: 200)

```json
// Response
{
  "entities": [
    {
      "id": "uuid",
      "name": "Muster GmbH",
      "type": "Organisation",
      "mention_count": 15,
      "created_at": "2026-01-10T08:00:00.000Z"
    }
  ],
  "total": 1
}
```

**GET /api/knowledge-graph/related/:entityName Query Parameters:**

- `depth`: Traversal depth (default: 2, max: 4)
- `limit`: Max results (default: 20, max: 100)

```json
// Response
{
  "entity": "Muster GmbH",
  "related": [
    {
      "name": "Max Mustermann",
      "type": "Person",
      "distance": 1,
      "relation": "MITARBEITER_VON"
    }
  ],
  "total": 5
}
```

**GET /api/knowledge-graph/document/:documentId Response:**

```json
{
  "document": { "id": "uuid", "filename": "bericht.pdf", "title": "Jahresbericht" },
  "entities": [{ "id": "uuid", "name": "Muster GmbH", "type": "Organisation", "mention_count": 8 }],
  "relations": [
    {
      "source_name": "Muster GmbH",
      "source_type": "Organisation",
      "relation_type": "ENTWICKELT",
      "target_name": "Produkt A",
      "target_type": "Produkt",
      "context": "Muster GmbH hat Produkt A entwickelt..."
    }
  ]
}
```

**GET /api/knowledge-graph/connections Query Parameters:**

- `entity1`: First entity name (required)
- `entity2`: Second entity name (required)
- `maxDepth`: Max search depth (default: 4, max: 4)

```json
// Response
{
  "from": "Muster GmbH",
  "to": "Produkt A",
  "paths": [
    {
      "nodes": ["Muster GmbH", "Max Mustermann", "Produkt A"],
      "relations": ["MITARBEITER_VON", "ENTWICKELT"]
    }
  ],
  "found": true
}
```

**GET /api/knowledge-graph/stats Response:**

```json
{
  "entities": 1250,
  "relations": 3400,
  "documents": 85,
  "entity_types": {
    "Person": 320,
    "Organisation": 180,
    "Produkt": 95
  },
  "relation_types": {
    "MITARBEITER_VON": 280,
    "ENTWICKELT": 95
  },
  "top_entities": [{ "name": "Muster GmbH", "type": "Organisation", "mention_count": 145 }]
}
```

**POST /api/knowledge-graph/query:**

Free-text question → graph-enriched context for n8n workflows. Extracts entities from the question via the document-indexer service, traverses the graph, and optionally returns linked documents.

```json
// Request
{
  "question": "Wer arbeitet bei Muster GmbH an Produkt A?",
  "include_documents": true,   // optional, default: true
  "max_depth": 2,              // optional, default: 2, max: 4
  "max_entities": 5            // optional, default: 5, max: 10
}

// Response
{
  "question": "Wer arbeitet bei Muster GmbH an Produkt A?",
  "entities": [
    { "name": "Muster GmbH", "type": "Organisation" }
  ],
  "graph_relations": [
    {
      "source": "Muster GmbH",
      "source_type": "Organisation",
      "target": "Max Mustermann",
      "target_type": "Person",
      "relation": "MITARBEITER_VON",
      "distance": 1
    }
  ],
  "graph_context": "Wissensverknüpfungen:\n- Muster GmbH → mitarbeiter von → Max Mustermann (Person)\n",
  "linked_documents": [
    { "id": "uuid", "filename": "team.pdf", "title": "Teamübersicht", "entity_name": "muster gmbh" }
  ]
}
```

**POST /api/knowledge-graph/refine:**

Triggers LLM-based entity resolution and relation refinement in the document-indexer service (background task). Returns `409` if refinement is already running.

```json
// Response
{
  "started": true,
  "message": "Refinement started"
}
```

---

### Sandbox

Isolated project environments with Docker containers and terminal WebSocket access. All routes require authentication.

| Method | Endpoint                             | Description                                |
| ------ | ------------------------------------ | ------------------------------------------ |
| GET    | `/api/sandbox/projects`              | List all sandbox projects for current user |
| POST   | `/api/sandbox/projects`              | Create a new sandbox project               |
| GET    | `/api/sandbox/projects/:id`          | Get project details                        |
| PUT    | `/api/sandbox/projects/:id`          | Update project name/description            |
| DELETE | `/api/sandbox/projects/:id`          | Archive a project                          |
| POST   | `/api/sandbox/projects/:id/start`    | Start the project container                |
| POST   | `/api/sandbox/projects/:id/stop`     | Stop the project container                 |
| POST   | `/api/sandbox/projects/:id/commit`   | Commit container state as a new image      |
| GET    | `/api/sandbox/projects/:id/status`   | Get live container status                  |
| GET    | `/api/sandbox/projects/:id/sessions` | List terminal sessions for a project       |
| GET    | `/api/sandbox/stats`                 | Overall sandbox statistics                 |

**GET /api/sandbox/projects Query Parameters:**

- `status`: Filter by project status
- `search`: Search in project name

**POST /api/sandbox/projects:**

```json
{
  "name": "Mein Projekt",
  "description": "Optionale Beschreibung",
  "baseImage": "ubuntu:22.04", // optional
  "network_mode": "isolated" // optional: isolated | internal | infrastructure
}
```

**`network_mode` values** (also accepted on PUT `/api/sandbox/projects/:id`):

| Value            | Network                       | Extra mounts                                         | Who                                        |
| ---------------- | ----------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `isolated`       | Docker bridge (Internet only) | —                                                    | every user (default)                       |
| `internal`       | Backend network (LLM, DB, …)  | —                                                    | every user                                 |
| `infrastructure` | Backend network               | Platform repo rw (`/workspace/repo`) + docker socket | **admin role only** (else `403 FORBIDDEN`) |

Creating or switching a project to `infrastructure` is audit-logged on the backend (warn level). Container hardening (CapDrop ALL, no-new-privileges) applies to all modes; docker socket access works via the docker group GID (`GroupAdd`), not via extra capabilities.

```json
// Response (201)
{
  "project": {
    "id": "uuid",
    "name": "Mein Projekt",
    "description": "...",
    "status": "stopped",
    "created_at": "2026-01-15T10:00:00.000Z"
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/sandbox/projects/:id/status Response:**

```json
{
  "status": {
    "containerId": "abc123",
    "state": "running",
    "startedAt": "2026-01-15T10:00:00.000Z",
    "ports": {}
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/sandbox/projects/:id/sessions Query Parameters:**

- `all`: Include completed sessions (`true`/`false`, default: `false`)

**Terminal WebSocket:**

The terminal WebSocket upgrade is handled by the main `index.js` server. Clients connect to `ws://<host>/api/sandbox/terminal/ws?projectId=<id>` and receive a full PTY session inside the running container. Auth is read from the `arasul_session` cookie or a `Bearer` header (never the query string — it would leak into access logs).

**Query parameters:**

- `projectId` (required): target sandbox project
- `type`: session type — `shell` (default), `custom`, `claude-code`, `codex`
- `command`: command for `type=custom` (allowlist `[A-Za-z0-9_.-/ ]`, max 200)
- `cols`, `rows`: initial terminal size
- `terminal`: tmux session name inside the container (`[A-Za-z0-9_-]`, max 40; default `main`). Distinct names allow **several independent terminal sessions in the same project** — reusing a name reattaches to that persistent shell; different names give separate shells rather than mirroring one screen.

**Notes:**

- Each user can only access their own projects
- Container start/stop/commit operations call the Docker API via `sandboxService`
- Deleted projects are soft-archived, not hard-deleted

---

## External API (for n8n, Workflows, Automations)

**Base Path:** `/api/v1/external`

Uses API key authentication instead of JWT. Create API keys via the web UI or POST to `/api/v1/external/api-keys`.

### LLM Chat

| Method | Endpoint                          | Auth    | Description                 |
| ------ | --------------------------------- | ------- | --------------------------- |
| POST   | `/api/v1/external/llm/chat`       | API Key | LLM chat with queue support |
| GET    | `/api/v1/external/llm/job/:jobId` | API Key | Get job status              |
| GET    | `/api/v1/external/llm/queue`      | API Key | Get queue status            |
| GET    | `/api/v1/external/models`         | API Key | Get available models        |

**POST /api/v1/external/llm/chat:**

```json
{
  "prompt": "Your question here",
  "model": "gemma4:26b-q4", // Optional
  "temperature": 0.7, // Optional
  "max_tokens": 2048, // Optional
  "thinking": false, // Optional
  "wait_for_result": true, // Optional (default: true)
  "timeout_seconds": 300 // Optional (default: 300)
}
```

**Response (wait_for_result=true):**

```json
{
  "success": true,
  "response": "AI generated text...",
  "model": "gemma4:26b-q4",
  "job_id": "uuid",
  "processing_time_ms": 1234
}
```

### Document Processing

| Method | Endpoint                                       | Auth    | Permission         | Description                          |
| ------ | ---------------------------------------------- | ------- | ------------------ | ------------------------------------ |
| POST   | `/api/v1/external/document/extract`            | API Key | `document:extract` | Pure text extraction (OCR if needed) |
| POST   | `/api/v1/external/document/analyze`            | API Key | `document:analyze` | Extract text + LLM analysis          |
| POST   | `/api/v1/external/document/extract-structured` | API Key | `document:extract` | Extract + structured JSON output     |

All endpoints accept `multipart/form-data` with a `file` field.

Supported file types: PDF, DOCX, TXT, MD, YAML, PNG, JPG, TIFF, BMP (max 50 MB).

**POST /api/v1/external/document/extract:**

Request: `multipart/form-data` with `file` field only.

```json
// Response:
{
  "success": true,
  "text": "Extracted document text...",
  "filename": "invoice.pdf",
  "char_count": 4521,
  "metadata": { "ocr_used": true, "language": "deu" },
  "processing_time_ms": 1234
}
```

**POST /api/v1/external/document/analyze:**

| Field             | Type   | Required | Description                            |
| ----------------- | ------ | -------- | -------------------------------------- |
| `file`            | File   | Yes      | Document to analyze                    |
| `prompt`          | string | No       | Analysis prompt (default: summarize)   |
| `model`           | string | No       | Model to use (default: system default) |
| `temperature`     | string | No       | Sampling temperature (default: "0.7")  |
| `max_tokens`      | string | No       | Max tokens (default: "4096")           |
| `timeout_seconds` | string | No       | Max wait time (default: "300")         |

```json
// Response:
{
  "success": true,
  "response": "AI analysis of the document...",
  "extracted_text": "Raw extracted text...",
  "filename": "invoice.pdf",
  "model": "gemma4:26b-q4",
  "processing_time_ms": 5678
}
```

**POST /api/v1/external/document/extract-structured:**

| Field             | Type   | Required | Description                           |
| ----------------- | ------ | -------- | ------------------------------------- |
| `file`            | File   | Yes      | Document to extract from              |
| `schema`          | string | Yes      | JSON schema describing desired output |
| `instructions`    | string | No       | Additional extraction instructions    |
| `model`           | string | No       | Model to use                          |
| `timeout_seconds` | string | No       | Max wait time (default: "300")        |

```json
// Response:
{
  "success": true,
  "data": {
    "invoice_number": "RE-2026-0412",
    "date": "2026-04-01",
    "vendor": "Muster GmbH",
    "total_gross": 1190.0
  },
  "raw_response": "{ ... LLM raw text ... }",
  "extracted_text": "Raw extracted text...",
  "filename": "invoice.pdf",
  "model": "gemma4:26b-q4",
  "processing_time_ms": 8901
}
```

### API Key Management

| Method | Endpoint                           | Auth | Description        |
| ------ | ---------------------------------- | ---- | ------------------ |
| POST   | `/api/v1/external/api-keys`        | JWT  | Create new API key |
| GET    | `/api/v1/external/api-keys`        | JWT  | List API keys      |
| DELETE | `/api/v1/external/api-keys/:keyId` | JWT  | Revoke API key     |

**POST /api/v1/external/api-keys:**

```json
{
  "name": "n8n-integration",
  "description": "API key for n8n workflows",
  "rate_limit_per_minute": 60,
  "allowed_endpoints": ["llm:chat", "llm:status", "document:extract", "document:analyze"],
  "expires_at": "2025-12-31T23:59:59Z"
}
```

**Response:**

```json
{
  "success": true,
  "api_key": "aras_xxxx...", // Only shown once!
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

| Method | Endpoint                     | Description                             |
| ------ | ---------------------------- | --------------------------------------- |
| POST   | `/zero-config/init`          | Start setup session, returns setupToken |
| POST   | `/zero-config/token`         | Validate bot token, returns deep link   |
| GET    | `/zero-config/status/:token` | Poll setup status                       |
| POST   | `/zero-config/complete`      | Finalize setup, send test message       |
| WS     | `/ws`                        | WebSocket for real-time chat detection  |

**POST /zero-config/init:**

Startet eine neue Setup-Session (10 Min gültig).

```json
// Response
{
  "success": true,
  "setupToken": "a1b2c3d4e5f6...", // 32-char hex
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

### Status Endpoints

| Method | Endpoint                           | Description                                   |
| ------ | ---------------------------------- | --------------------------------------------- |
| GET    | `/api/telegram-app/status`         | Get current app status for authenticated user |
| GET    | `/api/telegram-app/dashboard-data` | Get data for dashboard icon display           |
| PUT    | `/api/telegram-app/settings`       | Update app settings                           |
| GET    | `/api/telegram-app/global-stats`   | Get global statistics                         |

**PUT /api/telegram-app/settings:**

```json
{
  "settings": {
    "key": "value"
  }
}
```

### Bot Configuration

| Method | Endpoint                    | Description                   |
| ------ | --------------------------- | ----------------------------- |
| GET    | `/api/telegram-app/config`  | Get current bot configuration |
| PUT    | `/api/telegram-app/config`  | Update bot configuration      |
| GET    | `/api/telegram-app/history` | Get notification history      |

**GET /api/telegram-app/config Response:**

```json
{
  "configured": true,
  "config": {
    "chat_id": 987654321,
    "bot_username": "my_bot",
    "bot_first_name": "My Bot",
    "notifications_enabled": true,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "07:00",
    "min_severity": "warning",
    "claude_notifications": true,
    "system_notifications": true,
    "n8n_notifications": true,
    "is_active": true,
    "last_message_at": "2026-01-15T10:00:00.000Z",
    "created_at": "2026-01-10T08:00:00.000Z"
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**PUT /api/telegram-app/config:**

```json
{
  "notificationsEnabled": true,
  "quietHoursStart": "22:00",
  "quietHoursEnd": "07:00",
  "minSeverity": "warning",
  "claudeNotifications": true,
  "systemNotifications": true,
  "n8nNotifications": false
}
```

**GET /api/telegram-app/history Query Parameters:**

- `limit`: Max results (default: 50)
- `offset`: Pagination offset

**GET /api/telegram-app/history Response:**

```json
{
  "history": [
    {
      "id": 1,
      "rule_name": "High CPU Alert",
      "created_at": "2026-01-15T10:00:00.000Z"
    }
  ],
  "total": 25,
  "limit": 50,
  "offset": 0,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

### Notification Rules

| Method | Endpoint                | Description                       |
| ------ | ----------------------- | --------------------------------- |
| GET    | `/rules`                | List notification rules           |
| POST   | `/rules`                | Create notification rule          |
| PUT    | `/rules/:ruleId`        | Update rule                       |
| DELETE | `/rules/:ruleId`        | Delete rule                       |
| PATCH  | `/rules/:ruleId/toggle` | Enable/disable rule               |
| POST   | `/rules/:id/test`       | Send test notification for a rule |

**POST /api/telegram-app/rules:**

```json
{
  "name": "High CPU Alert",
  "description": "Benachrichtigung bei hoher CPU-Auslastung",
  "eventSource": "system",
  "eventType": "cpu_critical",
  "triggerCondition": {},
  "severity": "critical",
  "messageTemplate": "CPU bei {{event.value}}%! Zeitstempel: {{timestamp}}",
  "cooldownSeconds": 60,
  "isEnabled": true
}
```

**POST /api/telegram-app/rules/:id/test:**

Sendet eine Test-Benachrichtigung für eine Regel an den konfigurierten Telegram-Chat. Erfordert einen aktiv konfigurierten Bot.

Response:

```json
{
  "success": true,
  "message": "Test-Nachricht gesendet",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

### Orchestrator

| Method | Endpoint                                             | Description                          |
| ------ | ---------------------------------------------------- | ------------------------------------ |
| POST   | `/orchestrator/process`                              | Process event through rules          |
| GET    | `/orchestrator/stats`                                | Get processing statistics            |
| GET    | `/api/telegram-app/orchestrator/status`              | Get orchestrator and agent status    |
| GET    | `/api/telegram-app/orchestrator/thinking/:agentType` | Get thinking logs for specific agent |

**GET /api/telegram-app/orchestrator/status Response:**

```json
{
  "agents": [
    {
      "agent_type": "setup",
      "state": "idle",
      "last_action": "2026-01-15T10:00:00.000Z",
      "actions_count": 5,
      "thinking_entries": 12
    }
  ],
  "orchestratorMode": "master",
  "thinkingMode": false,
  "skipPermissions": false,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/telegram-app/orchestrator/thinking/:agentType Query Parameters:**

- `limit`: Max log entries to return (default: 50)

**GET /api/telegram-app/orchestrator/thinking/:agentType Response:**

```json
{
  "agentType": "setup",
  "thinkingLog": [
    {
      "timestamp": "2026-01-15T10:00:00.000Z",
      "message": "Setup session initialized",
      "context": { "userId": 1, "action": "create_session" }
    }
  ],
  "totalEntries": 12,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

### Zero-Config (Additional Endpoints)

| Method | Endpoint                                      | Description                                   |
| ------ | --------------------------------------------- | --------------------------------------------- |
| POST   | `/api/telegram-app/zero-config/chat-detected` | Called by bot when user sends /start (intern) |
| POST   | `/api/telegram-app/zero-config/cancel`        | Cancel setup session and stop polling         |

**POST /api/telegram-app/zero-config/chat-detected:**

Interner Endpoint – wird vom Polling-Service aufgerufen, wenn der Bot ein `/start`-Kommando erkennt. Kein Auth-Token erforderlich.

```json
// Request
{
  "setupToken": "a1b2c3d4e5f6...",
  "chatId": 987654321,
  "username": "user123",
  "firstName": "Max"
}

// Response
{
  "success": true,
  "message": "Setup erfolgreich abgeschlossen",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/telegram-app/zero-config/cancel:**

Bricht eine aktive Setup-Session ab und stoppt den Telegram-Polling-Service.

```json
// Request
{
  "setupToken": "a1b2c3d4e5f6..."
}

// Response
{
  "success": true,
  "message": "Setup abgebrochen",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

---

## Telegram Bots API

**Base Path:** `/api/telegram-bots`

CRUD-Operationen für Telegram-Bot-Verwaltung mit LLM-Integration.

### Bot Management

| Method | Endpoint          | Description                 |
| ------ | ----------------- | --------------------------- |
| GET    | `/`               | List all bots               |
| POST   | `/`               | Create new bot              |
| GET    | `/:id`            | Get bot details             |
| PUT    | `/:id`            | Update bot config           |
| DELETE | `/:id`            | Delete bot                  |
| POST   | `/:id/activate`   | Activate bot (set webhook)  |
| POST   | `/:id/deactivate` | Deactivate bot              |
| POST   | `/validate-token` | Validate Telegram bot token |

**POST / (Create Bot):**

```json
{
  "name": "Mein Assistent",
  "botToken": "123456789:ABCdefGHI...",
  "llmProvider": "ollama", // "ollama" | "claude"
  "llmModel": "llama3.2",
  "systemPrompt": "Du bist ein hilfreicher Assistent...",
  "maxTokens": 2048,
  "temperature": 0.7,
  "ragEnabled": false, // optional, default false
  "ragSpaceIds": ["uuid1", "uuid2"], // optional, array of RAG space UUIDs or null
  "ragShowSources": false // optional, default false - include source references in responses
}
```

**PUT /:id (Update Bot):**

Accepts the same body fields as `POST /`. All fields are optional; only provided fields are updated.

```json
{
  "name": "Neuer Name",
  "ragEnabled": true,
  "ragSpaceIds": ["uuid1"],
  "ragShowSources": true
}
```

**GET / and GET /:id Response (RAG fields):**

Bot objects returned by list and detail endpoints include the following RAG-related fields:

```json
{
  "id": "uuid",
  "name": "Mein Assistent",
  "...": "...",
  "rag_enabled": false,
  "rag_space_ids": ["uuid1", "uuid2"],
  "rag_show_sources": false
}
```

> **Database Migration:** `047_telegram_rag.sql` adds the columns `rag_enabled` (boolean, default false), `rag_space_ids` (jsonb, nullable), and `rag_show_sources` (boolean, default false) to the `telegram_bots` table.

### Bot Commands

| Method | Endpoint               | Description          |
| ------ | ---------------------- | -------------------- |
| GET    | `/:id/commands`        | List custom commands |
| POST   | `/:id/commands`        | Add custom command   |
| PUT    | `/:id/commands/:cmdId` | Update command       |
| DELETE | `/:id/commands/:cmdId` | Delete command       |

### Chat Management

| Method | Endpoint                | Description           |
| ------ | ----------------------- | --------------------- |
| GET    | `/:id/chats`            | List authorized chats |
| DELETE | `/:id/chats/:chatRowId` | Remove chat access    |
| GET    | `/:id/session/:chatId`  | Get chat session      |
| DELETE | `/:id/session/:chatId`  | Clear chat session    |

### Webhook Management

| Method | Endpoint                  | Description                 |
| ------ | ------------------------- | --------------------------- |
| GET    | `/:id/webhook`            | Get webhook status          |
| POST   | `/:id/webhook`            | Set webhook                 |
| DELETE | `/:id/webhook`            | Remove webhook              |
| POST   | `/webhook/:botId/:secret` | Webhook receiver (Telegram) |

### Testing & Models

| Method | Endpoint            | Description        |
| ------ | ------------------- | ------------------ |
| POST   | `/:id/test-message` | Send test message  |
| GET    | `/models/ollama`    | List Ollama models |
| GET    | `/models/claude`    | List Claude models |

---

## Documentation API

**Base Path:** `/api/docs`

| Method | Endpoint                 | Description              |
| ------ | ------------------------ | ------------------------ |
| GET    | `/api/docs/`             | OpenAPI documentation UI |
| GET    | `/api/docs/openapi.json` | OpenAPI spec (JSON)      |
| GET    | `/api/docs/openapi.yaml` | OpenAPI spec (YAML)      |

---

## Datentabellen API (Dynamic Database)

**Base Path:** `/api/v1/datentabellen`

Dynamic database builder for creating custom tables and automated quote generation.

### Tables

| Method | Endpoint                          | Description                |
| ------ | --------------------------------- | -------------------------- |
| GET    | `/tables`                         | List all tables with stats |
| POST   | `/tables`                         | Create new table           |
| GET    | `/tables/:slug`                   | Get table with fields      |
| PATCH  | `/tables/:slug`                   | Update table metadata      |
| DELETE | `/tables/:slug`                   | Delete table and data      |
| POST   | `/tables/:slug/fields`            | Add field to table         |
| PATCH  | `/tables/:slug/fields/:fieldSlug` | Update field               |
| DELETE | `/tables/:slug/fields/:fieldSlug` | Remove field               |

**Supported Field Types:**

- `text`, `textarea`, `number`, `currency`, `date`, `datetime`
- `select`, `multiselect`, `checkbox`, `relation`
- `file`, `image`, `email`, `url`, `phone`, `formula`

**POST /tables/:slug/fields** Body:

- `name` (required): Display name
- `field_type` (required): One of the supported types
- `unit` (optional): Measurement unit (e.g. "kg", "€", "m")
- `is_required` (optional): Boolean, default false
- `is_unique` (optional): Boolean, default false

**PATCH /tables/:slug/fields/:fieldSlug** Body (all optional):

- `name`: New display name
- `field_type`: Change field type (with automatic column type conversion)
- `unit`: Change or remove measurement unit (null to remove)

### Rows (Data)

| Method | Endpoint                    | Description            |
| ------ | --------------------------- | ---------------------- |
| GET    | `/tables/:slug/rows`        | List rows (paginated)  |
| POST   | `/tables/:slug/rows`        | Create row             |
| GET    | `/tables/:slug/rows/:rowId` | Get single row         |
| PATCH  | `/tables/:slug/rows/:rowId` | Update row             |
| DELETE | `/tables/:slug/rows/:rowId` | Delete row             |
| POST   | `/tables/:slug/rows/bulk`   | Bulk import (max 1000) |
| DELETE | `/tables/:slug/rows/bulk`   | Bulk delete            |

**Query Parameters (GET /rows):**

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 10000)
- `sort`: Field to sort by (default: `_created_at`)
- `order`: `asc` or `desc` (default: `desc`)
- `filters`: JSON array of filter objects
- `search`: Search in primary display field

**Filter Format:**

```json
[
  { "field": "name", "operator": "like", "value": "Widget" },
  { "field": "price", "operator": "gte", "value": 100 }
]
```

**Operators:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `is_null`, `is_not_null`

### Bulk Operations

| Method | Endpoint                                       | Description                       |
| ------ | ---------------------------------------------- | --------------------------------- |
| POST   | `/api/v1/datentabellen/tables/:slug/rows/bulk` | Bulk-Import von Zeilen (max 1000) |
| DELETE | `/api/v1/datentabellen/tables/:slug/rows/bulk` | Bulk-Löschen von Zeilen           |

**POST /api/v1/datentabellen/tables/:slug/rows/bulk:**

Importiert bis zu 1000 Zeilen in einem Vorgang. Einzelne fehlerhafte Zeilen werden übersprungen; der Rest wird trotzdem importiert.

```json
// Request
{
  "rows": [
    { "name": "Artikel 1", "price": 9.99 },
    { "name": "Artikel 2", "price": 19.99 }
  ]
}

// Response
{
  "success": true,
  "data": {
    "inserted": 2,
    "errors": 0
  },
  "message": "2 Datensätze importiert",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**DELETE /api/v1/datentabellen/tables/:slug/rows/bulk:**

Löscht bis zu 100 Zeilen gleichzeitig anhand ihrer UUIDs.

```json
// Request
{
  "ids": [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001"
  ]
}

// Response
{
  "success": true,
  "data": { "deleted": 2 },
  "message": "2 Datensätze gelöscht",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

### RAG / Indexierung

| Method | Endpoint                                          | Description                                   |
| ------ | ------------------------------------------------- | --------------------------------------------- |
| POST   | `/api/v1/datentabellen/tables/:slug/index`        | Tabellendaten für RAG/LLM-Abfragen indexieren |
| DELETE | `/api/v1/datentabellen/tables/:slug/index`        | Tabellendaten aus dem RAG-Index entfernen     |
| GET    | `/api/v1/datentabellen/tables/:slug/index/status` | Indexierungsstatus abfragen                   |

**POST /api/v1/datentabellen/tables/:slug/index:**

Erstellt Embeddings für jede Zeile der Tabelle und speichert sie in Qdrant. Bestehende Vektoren der Tabelle werden zuerst gelöscht.

Response:

```json
{
  "success": true,
  "message": "42 Datensätze indexiert",
  "indexed": 42,
  "table": "Produkte",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**DELETE /api/v1/datentabellen/tables/:slug/index:**

Entfernt alle Vektoren der Tabelle aus dem Qdrant-Index.

Response:

```json
{
  "success": true,
  "message": "Index erfolgreich entfernt",
  "table": "Produkte",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/v1/datentabellen/tables/:slug/index/status:**

Response:

```json
{
  "success": true,
  "data": {
    "table": "Produkte",
    "indexed_rows": 42,
    "total_rows": 42,
    "is_indexed": true,
    "is_complete": true
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

### Natural Language Query

| Method | Endpoint                                  | Description                                   |
| ------ | ----------------------------------------- | --------------------------------------------- |
| POST   | `/api/v1/datentabellen/query/natural`     | KI-gestützte Abfrage in natürlicher Sprache   |
| POST   | `/api/v1/datentabellen/query/sql`         | Validierte SQL-Abfrage ausführen (nur SELECT) |
| GET    | `/api/v1/datentabellen/schema/:tableSlug` | Tabellenschema für KI/SQL-Zwecke abrufen      |
| GET    | `/api/v1/datentabellen/schemas`           | Alle Tabellenschemata abrufen                 |

**POST /api/v1/datentabellen/query/natural:**

Übersetzt eine natürlichsprachliche Anfrage mit Hilfe des LLM in SQL und führt diese aus. Die Abfrage muss mindestens 5 Zeichen lang sein.

```json
// Request
{
  "query": "Zeige mir alle Produkte über 100 Euro",
  "tableSlug": "produkte"  // optional, auto-detect wenn weggelassen
}

// Response
{
  "success": true,
  "data": {
    "sql": "SELECT * FROM data_produkte WHERE preis > 100",
    "results": [...],
    "explanation": "Alle Produkte mit einem Preis über 100 Euro",
    "rowCount": 15,
    "table": "Produkte"
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**POST /api/v1/datentabellen/query/sql:**

Führt einen validierten SQL-SELECT-Befehl direkt aus. Nur SELECT-Statements sind erlaubt.

```json
// Request
{
  "sql": "SELECT name, preis FROM data_produkte WHERE preis > 100 ORDER BY preis DESC"
}

// Response
{
  "success": true,
  "data": {
    "results": [...],
    "rowCount": 15
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/v1/datentabellen/schema/:tableSlug:**

Gibt das Datenbankschema einer Tabelle zurück – für die KI-SQL-Generierung genutzt.

Response:

```json
{
  "success": true,
  "data": {
    "slug": "produkte",
    "name": "Produkte",
    "fields": [
      { "slug": "name", "name": "Name", "field_type": "text", "is_required": true },
      { "slug": "preis", "name": "Preis", "field_type": "currency", "is_required": false }
    ]
  },
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

**GET /api/v1/datentabellen/schemas:**

Gibt die Schemata aller vorhandenen Tabellen zurück.

Response:

```json
{
  "success": true,
  "data": [...],
  "count": 5,
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

### Quotes

| Method | Endpoint                        | Description              |
| ------ | ------------------------------- | ------------------------ |
| GET    | `/quotes`                       | List quotes (paginated)  |
| POST   | `/quotes`                       | Create quote             |
| GET    | `/quotes/:quoteId`              | Get quote with positions |
| PATCH  | `/quotes/:quoteId`              | Update draft quote       |
| POST   | `/quotes/:quoteId/status`       | Change quote status      |
| GET    | `/quotes/:quoteId/pdf`          | Download quote as PDF    |
| GET    | `/quotes/templates`             | List quote templates     |
| POST   | `/quotes/templates`             | Create template          |
| PATCH  | `/quotes/templates/:templateId` | Update template          |

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

| Method | Endpoint  | Description                |
| ------ | --------- | -------------------------- |
| GET    | `/health` | Data database health check |
| GET    | `/stats`  | Overview statistics        |

---

## Response Format

All responses include:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z"
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

| Status | Description                             |
| ------ | --------------------------------------- |
| 400    | Bad Request - Invalid input             |
| 401    | Unauthorized - Invalid/expired token    |
| 403    | Forbidden - Insufficient permissions    |
| 404    | Not Found - Resource doesn't exist      |
| 429    | Too Many Requests - Rate limit exceeded |
| 500    | Internal Server Error                   |
| 503    | Service Unavailable                     |

## Rate Limits

| Category         | Limit   | Window |
| ---------------- | ------- | ------ |
| General API      | 100 req | 1 min  |
| LLM API          | 10 req  | 1 sec  |
| Metrics API      | 20 req  | 1 sec  |
| Password Changes | 3 req   | 15 min |
| n8n Webhooks     | 100 req | 1 min  |
| Telegram Test    | 5 req   | 1 min  |

---

## Related Documentation

- [Development Guide](../development/DEVELOPMENT.md) - API usage examples & patterns
- [API Errors](API_ERRORS.md) - Complete error code reference
- [Dashboard Backend](../../apps/dashboard-backend/README.md) - Backend implementation details
