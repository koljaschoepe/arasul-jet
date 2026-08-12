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
  "routes": { "core": ["..."], "sandbox": ["..."], "system": ["..."], "...": [] },
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
  "system_prompt": "...", // optional
  "agent": true, // optional: Agent-Modus (Werkzeugschleife) — Standard im Workspace-Chat
  "datei_modus": false, // optional: Antwort ausdrücklich als Ablage-Datei erzeugen
  "ablage_ziel": "kunden/mueller" // optional: relativer Ziel-Ordner in der Projektablage
}
```

Response: Server-Sent Events (SSE) stream

**Agent-Modus / Orchestrator (2026-07-28, erweitert 2026-07-29):** Mit
`agent: true` läuft die Nachricht als Werkzeug-Lauf (Ollama function calling):
das Modell kann `rag_suche`, `dateien_lesen|schreiben|suchen` (Projektordner
des aktiven Projekts), `web_suche`, `web_lesen`, `terminal` (projektbeschränkt
im Flow-Sandbox-Container, lazy bereitgestellt) und `subagent` mit den Rollen
`rechercheur`, `autor` (schreibt Dateien), `pruefer` (kontrolliert),
`entwickler` (schreibt UND testet Code per Terminal) selbst aufrufen.

Der Runner erzwingt ein **Orchestrator-Protokoll**: die Ordnerstruktur des
Projekts steht IMMER im Systemkontext; bei erkennbar komplexen Aufträgen
(Datei-Modus, Erstell-/Recherche-Verben, lange Nachricht) läuft zuerst ein
stiller **Plan-Schritt** (`agent_step` mit `kind: 'plan'`), und bevor eine
Antwort mit erstellten Dateien als fertig gilt, prüft die `pruefer`-Rolle das
Ergebnis — bei Mängeln bekommt das Modell genau eine Korrektur-Schleife.

Es gibt **kein praktisches Zeitlimit** (Notbremsen: 64 Runden / 24 h) — der
Lauf wird über `DELETE /api/llm/jobs/:jobId` abgebrochen (Stop-Knopf im Chat);
der Abbruch reißt den laufenden Modell-Stream und alle Subagenten sofort mit
ab, Teiltext und Schritte bleiben an der Nachricht erhalten (`done`-Frame
trägt dann `cancelled: true`).

Antwort-Token streamen wie bisher (`response`); zusätzlich kommen
`agent_step`-Frames (`{phase: 'start'|'end', step}`) und `agent_datei`-Frames
für geschriebene Dateien. Schritte und Datei-Verweise werden an der
Nachricht persistiert (`chat_messages.schritte` / `.datei`, Migrationen 127/128).
Bild-Nachrichten und Modelle ohne Tool-Unterstützung fallen automatisch auf den
klassischen Stream zurück (`warning`-Code `AGENT_TOOLS_UNSUPPORTED`).

**SSE frame catalogue** (selected — full list in `services/llm/llmJobProcessor.js`):

| `type`                                            | `code`                         | Meaning                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `job_started`                                     | —                              | Job entered the queue with an id.                                                                                                                                                                                             |
| `status`                                          | `VISION_PROCESSING`            | (P6) Image is being captioned by a vision model before primary stream starts. Payload: `vision_via`.                                                                                                                          |
| `warning`                                         | `THINKING_NOT_SUPPORTED`       | Requested think-mode but model lacks support; disabled silently.                                                                                                                                                              |
| `warning`                                         | `AGENT_TOOLS_UNSUPPORTED`      | Agent-Modus angefragt, Modell kann kein Tool-Calling — Antwort ohne Werkzeuge.                                                                                                                                                |
| `warning`                                         | `VISION_FALLBACK_ACTIVE`       | (P6) Image was captioned by a vision model; primary streams with caption injected. Payload: `vision_via`.                                                                                                                     |
| `warning`                                         | `VISION_FALLBACK_SKIPPED`      | (P6) Vision fallback returned no caption; primary streams without image context.                                                                                                                                              |
| `warning`                                         | `NO_VISION_FALLBACK_AVAILABLE` | (P6) Primary is text-only and no vision model is installed; images dropped.                                                                                                                                                   |
| `context_info`                                    | —                              | Token-budget breakdown for the request.                                                                                                                                                                                       |
| `compaction`                                      | —                              | Older messages were summarized to fit context budget.                                                                                                                                                                         |
| `agent_step`                                      | —                              | Agent-Werkzeugschritt: `{phase: 'start'\|'end', step: {id, kind, name, input, output, status, parent_step_id}}` — `parent_step_id` hängt Helfer-Kinder als Baum unter ihren Subagent-Schritt (Agent-UX 2026-08-02).           |
| `agent_datei`                                     | —                              | Vom Agenten geänderte Ablage-Datei: `{datei: {art, project_id, pfad, name, aenderung?}}` — `aenderung: 'neu'\|'geaendert'\|'geloescht'` aus dem Platten-Snapshot-Diff (gelöschte Dateien werden seit 2026-08-02 mitgemeldet). |
| `thinking` / `thinking_end` / `response` / `done` | —                              | Streaming content frames.                                                                                                                                                                                                     |

### Chat Conversations

| Method | Endpoint                                   | Description                       |
| ------ | ------------------------------------------ | --------------------------------- |
| GET    | `/api/chats`                               | List all conversations            |
| POST   | `/api/chats`                               | Create new conversation           |
| GET    | `/api/chats/:id`                           | Get conversation details          |
| PATCH  | `/api/chats/:id`                           | Update title                      |
| DELETE | `/api/chats/:id`                           | Soft delete conversation          |
| GET    | `/api/chats/:id/messages`                  | Get messages                      |
| POST   | `/api/chats/:id/messages`                  | Add message                       |
| PUT    | `/api/chats/:id/messages/:messageId/datei` | Datei-Verweis an Nachricht hängen |
| GET    | `/api/chats/:id/export`                    | Export chat (JSON/Markdown)       |

**POST /api/chats:**

```json
{
  "title": "Optional title"
}
```

**PATCH /api/chats/:id:**

```json
{
  "title": "New title" // optional
}
```

**POST /api/chats/:id/messages:**

```json
{
  "role": "user|assistant",
  "content": "Message content",
  "thinking": "Optional thinking content",
  "datei": {
    "art": "projektdatei",
    "project_id": "<uuid>",
    "pfad": "test/notiz.txt",
    "name": "notiz.txt"
  }
}
```

`datei` (optional, Form wie beim PUT unten): Chat-Anhänge landen im
Ein-Ordner-Modell zuerst per `POST /api/projects/:id/dateien/upload` im
Projektordner; die Nutzer-Nachricht trägt den Verweis dann direkt beim
Anlegen als klickbare Projektdatei-Karte.

**PUT /api/chats/:id/messages/:messageId/datei:**

Hängt den Verweis auf eine in der Projektablage gespeicherte Datei an eine
Nachricht (Karte „gespeicherte Datei" im Chat; Spalte `chat_messages.datei`,
Migration 127). Die Datei selbst wird vorher über
`PUT /api/projects/:id/dateien/inhalt` geschrieben.

```json
{
  "art": "projektdatei",
  "project_id": "<uuid>",
  "pfad": "kunden/newsletter-juli.md",
  "name": "newsletter-juli.md"
}
```

`GET /api/chats/:id/messages` liefert das Feld als `datei` pro Nachricht zurück
(bei Nutzer-Nachrichten mit Anhang: `{ "art": "anhang", "name": "bericht.pdf" }`).

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

Editierbare Endungen (GET/PUT `/content`): Text/Markup (`.md`, `.markdown`,
`.txt`, `.yaml`, `.yml`, `.html`, `.htm`) **plus Quelltext** (Plan 013, B10:
`.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.json`, `.css`, `.sh`, `.sql`, `.go`,
`.rs`, `.rb`, `.php`, `.java`, `.c`/`.h`/`.cpp`, `.toml`, `.ini`, `.xml`, … —
siehe `CODE_EXTENSIONS` in `routes/documents.js`). HTML öffnet als gerenderte
Vorschau mit Code-Umschalter (Plan 012 Batch 3); Quelltext öffnet farbig im
CodeMirror-6-Editor (Syntaxfarben, editierbar); andere Typen liefern `400`.

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

**GET /api/events Query Parameters:**

- `limit`: Max results (default: 50)
- `event_type`: Filter by event type
- `severity`: Filter by severity

**PUT /api/events/settings:**

```json
{
  "channel": "webhook",
  "enabled": true,
  "event_types": ["service_status", "alert"],
  "min_severity": "warning",
  "rate_limit_per_minute": 10,
  "quiet_hours_start": "22:00",
  "quiet_hours_end": "07:00"
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

### Projects (Batch 2)

Die oberste Ebene über den Ordnern: ein Projekt bündelt mehrere
`knowledge_spaces`. Das **aktive Projekt** (`system_settings.active_project_id`,
app-weit/Einzel-Admin) scopt Explorer, Suche und Flows/Agenten.

| Method | Endpoint                            | Description                                                                                                                                                                                                                                                    |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/projects`                     | Alle Projekte mit Ordner-Zähler (`{data:[…]}`, inkl. `vorlage_id/-version`)                                                                                                                                                                                    |
| GET    | `/api/projects/active`              | Aktives Projekt + seine `space_ids` (`{data:{project, space_ids}}`)                                                                                                                                                                                            |
| PUT    | `/api/projects/active`              | Aktives Projekt setzen (`{project_id}`)                                                                                                                                                                                                                        |
| GET    | `/api/projects/vorlagen`            | Vorlagen-Galerie (Plan 014): `{data:[{id, name, beschreibung, icon, color, version}]}`                                                                                                                                                                         |
| GET    | `/api/projects/:id/kunden`          | Kundenübersicht des CRM-Pakets (Plan 014 Phase 3): je `Kunden/<Ordner>`-Unterordner ein Eintrag mit Steckbrief-Feldern (`firma, status, letzter_kontakt, ansprechpartner, email, telefon, webseite, branche, steckbrief_pfad`) — direkt von der Platte gelesen |
| GET    | `/api/projects/:id/vorlagen-update` | Vorlagen-Update-Stand (Plan 014 Phase 6): `{update, vorlage_id, projekt_version, neue_version, neuerungen:[{pfad}]}` — Neuerungen = Vorlagen-Dateien, die im Projekt fehlen                                                                                    |
| POST   | `/api/projects/:id/vorlagen-update` | Ausgewählte Neuerungen übernehmen (`{pfade:[…]}`) — ADDITIV (wx, überschreibt nie); Version steigt nur bei Voll-Übernahme                                                                                                                                      |
| POST   | `/api/projects`                     | Projekt anlegen (`{name, description?, icon?, color?, vorlage?}`)                                                                                                                                                                                              |
| PUT    | `/api/projects/:id`                 | Projekt aktualisieren                                                                                                                                                                                                                                          |
| DELETE | `/api/projects/:id`                 | Projekt löschen (403 beim Standard-Projekt, 409 solange es Ordner enthält)                                                                                                                                                                                     |

> Neue Top-Level-Ordner landen im aktiven Projekt; Unterordner erben das Projekt
> ihres Elternordners. `PUT /api/spaces/:id` mit `project_id` verschiebt einen
> Ordner samt Unterbaum in ein anderes Projekt.

> **Vorlagen-Galerie (Plan 014, Phase 1):** `POST /api/projects` mit
> `vorlage: <id>` (z. B. `kunden-auftraege`) kopiert Ordnerstruktur,
> Wissens-Dateien und projektgebundene Flows der Vorlage in den frischen
> Projektordner (`wx` — vorhandene Dateien werden nie überschrieben) und setzt
> `projects.vorlage_id/-version`. Eine unbekannte Vorlage → 404, bevor ein
> Projekt entsteht. Die Vorlagen liegen versioniert im Backend-Image unter
> `apps/dashboard-backend/src/services/projects/vorlagen/`.

#### Projektablage (Datei-API)

Jedes Projekt besitzt einen echten Geräte-Ordner `data/projects/<uuid>`
(Container: `/arasul/projects/<uuid>`, Compose-Mount in
`compose/compose.app.yaml`) — derselbe Ordner, in dem auch der
Git-Sync-Checkout (`PROJECT_GIT_DIR`) liegt. Er ist seit dem
**Ein-Ordner-Modell (2026-07-29)** die EINZIGE Wahrheit: Explorer, Flows
(`ordner`-Wert `projekt://aktiv`), Chat-Agent und Sandboxes (Mount
`/workspace/projekt`) arbeiten im selben Baum. Jeder Zugriff läuft
symlink-sicher innerhalb des Projektordners (`resolveRealWithinRoots`);
`.git`, `node_modules` u. Ä. werden beim Auflisten ausgeblendet.

| Method | Endpoint                                    | Description                                                                                                                     |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/projects/:id/dateien`                 | Der EINE Baum (rekursiv, Budget-gedeckelt; `{eintraege, gekuerzt}`, s. u.)                                                      |
| GET    | `/api/projects/:id/dateien/suche?q=…`       | Rekursive Namenssuche über die KOMPLETTE Ablage (min. 2 Zeichen; flache Trefferliste `{eintraege, gekuerzt}`, max. 200 Treffer) |
| GET    | `/api/projects/:id/dateien/inhalt?pfad=…`   | Datei-Inhalt für den Editor (Text, max. 1 MB; Binär/zu groß → Kennzeichen statt Inhalt)                                         |
| PUT    | `/api/projects/:id/dateien/inhalt`          | Textdatei schreiben (`{pfad, inhalt}`; legt Zwischenordner an)                                                                  |
| POST   | `/api/projects/:id/dateien/ordner`          | Ordner anlegen (`{pfad}`, verschachtelt erlaubt)                                                                                |
| DELETE | `/api/projects/:id/dateien?pfad=…`          | Datei oder Ordner (rekursiv) löschen — nie die Wurzel oder `.git`                                                               |
| POST   | `/api/projects/:id/dateien/verschieben`     | Umbenennen/Verschieben innerhalb des Projektordners (`{von, nach}`)                                                             |
| POST   | `/api/projects/:id/dateien/upload`          | Multipart-Upload (`file` + optional `ordner`, max. 50 MB)                                                                       |
| GET    | `/api/projects/:id/dateien/download?pfad=…` | Einzeldatei als Download; ohne `pfad` (oder für einen Ordner) ein `.tar.gz` (ohne `.git`)                                       |

> **Ein-Ordner-Modell — Auto-Indexierung statt manueller Übernahme:** Die
> frühere Route `POST …/dateien/uebernehmen` ist ENTFERNT. Ein Sync-Dienst
> (`services/projects/ordnerSyncService.js`, Takt `ORDNER_SYNC_INTERVAL_MS`,
> Standard 20 s, plus Sofort-Trigger nach jeder Datei-Operation) spiegelt den
> Projektordner automatisch: jeder Unterordner wird eine
> `knowledge_spaces`-Zeile, jede indexierbare Datei (`.pdf .docx .txt .md
.markdown .csv .json .html .htm .xml .yaml .yml .log`, ≤ 50 MB) eine
> `documents`-Zeile (`status='pending'` → Document-Indexer → Qdrant).
> Umbenennen/Verschieben wird per Inhalts-Hash erkannt und kostet keine
> Neu-Indexierung; gelöschte Dateien räumen Dokument, MinIO-Objekt und
> Vektoren ab. Altbestand (nur in MinIO) wird beim Boot auf die Platte
> **materialisiert**. Die Baum-Einträge tragen deshalb zusätzlich:
> Dateien `dokument: {id, status}` (wenn im Wissen gespiegelt), Ordner
> `space_id` (ihr Wissensraum-Spiegel, z. B. für „Mit Ordner chatten").
> Inhaltsgleiche Dateien an zwei Pfaden: nur die erste bekommt einen
> Index-Eintrag (content_hash-Schutz). **Lösch-Sicherung:** Dokumente/Räume
> werden nur entfernt, wenn der Baum vollständig gelesen wurde und die
> Marker-Datei `.arasul` im Projektordner liegt (sie entsteht erst, wenn
> Platte und DB übereinstimmen) — ein leerer/fremder Ordner (nicht
> gemountetes Volume) löst nie Massen-Löschungen aus.
> **Git-gekoppelte Projekte sind vom Auto-Index AUSGENOMMEN** (2026-07-30):
> ihr Ordner trägt einen kompletten Repo-Checkout — hunderte Repo-Dateien
> würden Stunden GPU-Zeit für KI-Analysen verbrennen und den RAG-Index
> vergiften. Der Coding-Agent arbeitet auf Repos über Datei-Werkzeuge und
> Terminal, nicht über RAG; der Explorer zeigt den Baum weiterhin direkt
> von der Platte.

### Git-Sync (Plan 013, B9)

Koppelt ein Projekt an EIN GitHub-Repo und gleicht den container-lokalen
Projekt-Checkout zwei-wegig ab (commit → fetch → merge → push). Der Personal
Access Token wird AES-256-GCM-verschlüsselt gespeichert (`project_git`,
`utils/tokenCrypto`) und nie zurückgegeben — nur die letzten vier Zeichen
(`pat_last4`) erscheinen zur Anzeige.

| Method | Endpoint                      | Description                                                                      |
| ------ | ----------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/api/git/:projectId`         | Kopplungs-/Sync-Status (`{data: link\|null}`)                                    |
| POST   | `/api/git/:projectId/connect` | Repo koppeln (`{repo_url, branch?, pat?}`); prüft Erreichbarkeit per `ls-remote` |
| POST   | `/api/git/:projectId/sync`    | Zwei-Wege-Sync; **409 CONFLICT** mit `details.conflicts:[…]` bei Merge-Konflikt  |
| DELETE | `/api/git/:projectId`         | Kopplung lösen (verschlüsselter PAT + lokaler Checkout werden entfernt)          |

> Nur HTTPS-Remotes auf `github.com`. Ein leerer `pat` beim erneuten Connect lässt
> einen bereits gespeicherten Token unverändert (Repo/Branch ändern ohne Neueingabe).
> `last_status`: `neu` · `verbunden` · `synchronisiert` · `konflikt` · `fehler`.

### Knowledge Spaces

| Method | Endpoint                       | Description                                                                                |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------ |
| GET    | `/api/spaces`                  | List knowledge spaces des aktiven Projekts                                                 |
| GET    | `/api/spaces/tree`             | Explorer-Aggregat des **aktiven Projekts**: Ordner (mit `parent_id`) + Dokumente           |
| GET    | `/api/spaces/:id`              | Get space details with documents                                                           |
| POST   | `/api/spaces`                  | Create knowledge space (optional `parent_id` für Unterordner)                              |
| PUT    | `/api/spaces/:id`              | Update knowledge space (`parent_id` = Verschieben, Zyklus-Schutz)                          |
| DELETE | `/api/spaces/:id`              | Delete space (409 bei Unterordnern; moves docs to default, Kontextdatei wird soft-deleted) |
| POST   | `/api/spaces/:id/regenerate`   | Trigger context regeneration                                                               |
| POST   | `/api/spaces/route`            | Find relevant spaces for query                                                             |
| GET    | `/api/spaces/:id/context-file` | Kontextdatei des Ordners lesen (`{document, content}` oder nulls)                          |
| PUT    | `/api/spaces/:id/context-file` | Kontextdatei anlegen/aktualisieren (`{content}`, max. 50.000)                              |
| DELETE | `/api/spaces/:id/context-file` | Kontextdatei löschen (Soft-Delete)                                                         |
| GET    | `/api/spaces/active-workspace` | Aktiver Top-Level-Ordner + Teilbaum-IDs (`{active_workspace, subtree_ids}`)                |
| PUT    | `/api/spaces/active-workspace` | Aktiven Ordner setzen (`{space_id}`; `null` hebt die Bindung auf)                          |
| GET    | `/api/spaces/pins`             | Angeheftete Dokumente/Unterordner (`{pins}`)                                               |
| POST   | `/api/spaces/pins`             | Dokument ODER Unterordner anheften (`{document_id}` **oder** `{space_id}`, idempotent)     |
| DELETE | `/api/spaces/pins/:pinId`      | Anheftung entfernen                                                                        |

> **Aktives Projekt = Suchgrenze (Batch 2):** Der RAG-Scope von `POST
/api/rag/query` ist das aktive Projekt — alle seine Ordner-`space_ids`. Ein
> optionaler `space_ids`-Fokus (»Mit Ordner chatten«) grenzt INNERHALB des
> Projekts ein; angeheftete Dokumente/Unterordner (`pinned_documents`) sind
> zusätzlich immer im Kontext. Kein projektübergreifendes Auto-Routing mehr; der
> Client muss den Scope nicht mitsenden. Der frühere „aktive Ordner"
> (`active_workspace_space_id`, Plan 012) ist damit abgelöst.

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

Sichtbarkeit der kuratierten Kern-Apps (aktuell nur n8n) in der
Workspace-Shell. Persistenz in `platform_apps`; deaktivierte Apps
verschwinden aus ActivityBar/Tab-Angebot, die Dienste laufen weiter.

| Method | Endpoint                  | Description                                                             |
| ------ | ------------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/workspace-apps`     | Manifest (id, name, description, tab, `type`, `accessTier`) + `enabled` |
| PUT    | `/api/workspace-apps/:id` | App an-/abschalten — Body `{ "enabled": boolean }`                      |

Seit Plan 012 Phase E tragen die kuratierten Kern-Apps dieselbe Taxonomie wie
selbst gebaute Erweiterungen: `type` (`app` | `flow` | `tool`) und `accessTier`
(`internet` | `internal` | `full`). Der Erweiterungen-Reiter filtert beide
Quellen über dieselben Facetten.

### Extensions (Erweiterungs-Baukasten)

Eine Erweiterung ist ein **Ordner-Paket**: `manifest.json` (Pflichtfelder `id`,
`name`, `type`, `accessTier`, `version`, `entry`, `arasulExtensionVersion: 1`)
plus Assets. Pakete liegen unter `EXTENSIONS_DIR` (Default `/arasul/extensions`),
das Register ist die Tabelle `extensions`. Der Ablauf: in einer
Erweiterungs-Werkstatt bauen → paketieren → herunterladen → anderswo
importieren → forken. Alle Routen erfordern Authentifizierung.

| Method | Endpoint                       | Description                                             |
| ------ | ------------------------------ | ------------------------------------------------------- |
| GET    | `/api/extensions`              | Installierte Erweiterungen                              |
| POST   | `/api/extensions/bauen`        | Ordner einer Sandbox paketieren + registrieren          |
| POST   | `/api/extensions/import`       | Paket-Archiv (`.tar.gz`) hochladen und installieren     |
| GET    | `/api/extensions/:id/download` | Paket als `.tar.gz` herunterladen                       |
| GET    | `/api/extensions/:id/app`      | Oberfläche einer `app`-Erweiterung (Startdatei)         |
| GET    | `/api/extensions/:id/app/*`    | Einzelne Datei aus dem Paket (Assets)                   |
| POST   | `/api/extensions/:id/fork`     | Kopie als neue Werkstatt-Sandbox anlegen                |
| PUT    | `/api/extensions/:id`          | Aktivieren/deaktivieren — Body `{ "enabled": boolean }` |
| DELETE | `/api/extensions/:id`          | Deinstallieren (Register-Eintrag + Paket-Ordner)        |

`GET /api/extensions/:id/app` (und `/app/*`) liefert die Oberfläche einer
`app`-Erweiterung, damit sie „in der Mitte" (wie n8n) in einem Sandbox-iframe
läuft. Nur für `type = 'app'`; jeder Pfad ist symlink-sicher im Paket-Ordner
eingesperrt. Auth kommt über das `arasul_session`-Cookie (ein iframe-`src` kann
keinen Bearer-Header setzen). Die Antwort trägt `Content-Security-Policy:
sandbox …` — das ausgelieferte Nutzer-HTML bekommt einen eigenen, opaken Origin
und kommt nicht an Dashboard-Cookies oder die API.

`POST /api/extensions/bauen` — Body:

```json
{ "slug": "meine-werkstatt", "subfolder": "meine-app", "overwrite": false }
```

`subfolder` ist relativ zum Sandbox-Ordner (`.` = die Sandbox selbst) und darf
nicht aus ihr ausbrechen. Antwort (201):

```json
{
  "data": {
    "id": "meine-app",
    "name": "Meine App",
    "description": "…",
    "type": "app",
    "accessTier": "internet",
    "version": "0.1.0",
    "source": "built",
    "enabled": false,
    "manifest": { "entry": "index.html" },
    "installedAt": "2026-07-23T22:00:00.000Z"
  },
  "timestamp": "2026-07-23T22:00:00.000Z"
}
```

`POST /api/extensions/import` ist ein multipart-Upload (Feld `file`, optional
`overwrite`). Einem Archiv wird nichts geglaubt: Symlinks, Hardlinks, absolute
Pfade und `..`-Ausbrüche führen zur Abweisung; Obergrenzen sind 2000 Einträge
und 64 MB entpackt.

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
  "features": ["rag", "backup"],
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
  "feature": "rag",
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

### Flows

Flows are Markdown files with YAML front matter under `data/flows/` (container path `FLOWS_DIR`, default `/arasul/flows`) — **there is no database table**. The file is the source of truth; these routes are a thin layer over the on-disk registry. Every write is validated against the schema _before_ it is persisted (serialize → re-parse → atomic rename), so a broken flow can never reach the disk. All routes require authentication.

| Method | Endpoint                            | Description                                                                                                                             |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/flows`                        | List all flows — global **plus** project-bound (each entry carries `projekt: null \| {id, name}`); broken files reported separately     |
| GET    | `/api/flows/werkzeuge`              | Tool names a flow may declare, each with `verfuegbar`                                                                                   |
| GET    | `/api/flows/sammlungen`             | Selectable knowledge spaces (for `typ: wissensbasis`)                                                                                   |
| GET    | `/api/flows/:name`                  | Get a single flow (`?projekt=<uuid>` = project-bound flow)                                                                              |
| GET    | `/api/flows/:name/datei`            | Get the raw Markdown file (`text/markdown`; `?projekt=` wie oben)                                                                       |
| GET    | `/api/flows/vorlagen`               | List uploaded style templates (`{ name, groesse, hochgeladen }`)                                                                        |
| POST   | `/api/flows/vorlagen`               | Upload a style template (multipart field `datei`; .docx/.pdf/.md/.txt/.html, 20 MB)                                                     |
| DELETE | `/api/flows/vorlagen/:name`         | Delete a style template                                                                                                                 |
| POST   | `/api/flows`                        | Create a **global** flow (409 if the name exists)                                                                                       |
| PUT    | `/api/flows/:name`                  | Update an existing flow (404 if it does not exist; `?projekt=` wie oben)                                                                |
| DELETE | `/api/flows/:name`                  | Delete a flow (`?projekt=` wie oben)                                                                                                    |
| GET    | `/api/flows/laeufe`                 | List the caller's runs (`?limit`, `?conversation_id`, `?status`, `?flow` = Flow-Name-Filter); rows include the run's `arguments` (JSON) |
| POST   | `/api/flows/laeufe`                 | Start a run detached; returns `202 { runId }` immediately                                                                               |
| GET    | `/api/flows/laeufe/:id`             | One run with its steps (`?raw=1` includes raw step data)                                                                                |
| GET    | `/api/flows/laeufe/:id/stream`      | SSE event stream: replay stored history, then live steps                                                                                |
| POST   | `/api/flows/laeufe/:id/abbrechen`   | Cancel a running run (404 if not running/owned)                                                                                         |
| POST   | `/api/flows/laeufe/:id/wiederholen` | Retry a **failed** run of a flow with a declared step chain (body `{}`); `202 { runId, uebernommeneSchritte }`                          |

**Starting flows.** A flow runs from the chat (slash command `/name`) or via the
external HTTP trigger `POST /api/v1/external/flows/:name/run` (API key, scope
`flow:run` — see the External API section). The former cron/event scheduling
(`flow_schedules`, `/flows/zeitplaene`, external `events/:name`) was removed on
2026-07-28; there is no schedule mechanism anymore.

**ZUGFeRD-Rechnungen (Plan 014, Phase 5).** Das Flow-Werkzeug
`rechnung_erstellen` stellt echte E-Rechnungen aus: Das Modell liefert NUR
strukturierte Positionen (JSON-Array mit Netto-Einzelpreisen); Netto/USt/Brutto
rechnet Code in ganzen Cent (`services/flows/rechnung/summen.js`). Der
Verkäufer kommt aus dem `Firmenprofil.md` des Projekts. Nach der eingebauten
Validierung (Pflichtangaben §14 UStG, Summen-Querprüfung, Probe-XML) wird die
nächste Nummer des lückenlosen Kreises (`RE-<jahr>-<lfd>`, Migration 132:
`rechnungsnummern` + `rechnungsnummern_zaehler`) **transaktional** gezogen —
scheitert die Erzeugung, rollt alles zurück (keine Lücke). Ausgabe: PDF/A-3b
mit eingebettetem EN-16931-XML (Factur-X BASIC, pure Node: pdfkit +
node-zugferd; extern per Mustang validiert). Ausgestellte Rechnungen sind
schreibgeschützt (Datei 0444 + `ablageService.pruefeRechnungsschutz` blockt
Ändern/Verschieben/Löschen, auch über Eltern-Ordner). Die Vorlage „Interne
Finanzen" bringt den passenden `/rechnung`-Flow mit.

**Projektgebundene Flows (Plan 014, Phase 1).** Neben dem globalen Verzeichnis
(`data/flows/`) hat jedes Projekt eine zweite Flow-Heimat:
`<projektordner>/flows/*.md`. Diese Flows kommen als normale Dateien mit einer
Projekt-Vorlage mit, erscheinen im Chat **nur im aktiven Projekt** und in der
Flow-Übersicht gruppiert nach Global/Projekt. Der `flows/`-Ordner auf der
obersten Projektebene ist vom Ordner-Sync/Wissens-Index ausgenommen (nur dort —
tiefere Ordner namens `flows` bleiben normales Wissen). Ein Lauf eines
Projekt-Flows merkt sich sein Projekt (`flow_runs.projekt_id`); `projekt://aktiv`
und der RAG-Scope zeigen bei einem Projekt-Flow auf **sein** Projekt, egal
welches gerade aktiv ist.

**Prüfschritt & Annahmen-Protokoll (Plan 014, Phase 2).** Bei Dokument-Flows
(`ausgabe.format ≠ keins`) steht zwischen Entwurf und Ausgabe ein fester
Prüfschritt: deterministische Checks (Platzhalter-Reste, offene `[Stellen]`,
Gliederung, Ziel-Länge), eine LLM-Prüfrunde gegen Auftrag und Vorgaben,
höchstens **eine** Korrekturrunde. Das Laufprotokoll zeigt die Einzelprüfungen
als Schritt `pruefung` (plus ggf. `korrektur`). Statt Rückfragen gilt das
Annahmen-Protokoll: getroffene Annahmen landen als `flow_runs.annahmen`
(JSON-Array) am Lauf, kommen im SSE-Strom als Frame `{type:'annahmen'}` und in
den Lauf-Antworten der externen API (`annahmen`-Feld) mit. Der Prüfschritt
wirft nie — scheitert die Prüfrunde selbst, läuft der Entwurf unverändert
weiter und das Protokoll benennt das.

**Runs stream live and survive the tab (Plan 011, Schritt 12).** `POST /laeufe`
(`{ flow, args, conversation_id?, ordner_ziel?, projekt? }` — `projekt` = UUID
für einen projektgebundenen Flow) starts the run **server-side**
and returns its `runId` at once — the run keeps going regardless of the client.
`ordner_ziel` (optional, auch am externen Trigger) lenkt das Arbeitsverzeichnis
des Laufs auf einen Projektablage-Ordner: `projekt://aktiv[/unter/ordner]` oder
`projekt://<projekt-uuid>[/unter/ordner]` — nur diese Formen, nie rohe
Gerätepfade. Der Ordner wird angelegt, die im Flow deklarierten `ordner` bleiben
zusätzlich erlaubt. The client
then opens `GET /laeufe/:id/stream` (SSE, consumed via `fetch`+`getReader`, not
`EventSource`, so the Bearer token is sent). The stream sends a `verlauf` frame
with the stored run+steps first (so a **reconnecting** client sees everything up
to now), then live frames (`step_start`/`step_end`/`text`/`done`/`error`/`aenderungen`/`annahmen`),
and closes on `ende`. `step_start` fires when a step is **created** (for a
subagent: before it executes), `step_end` when it finishes; both carry the full
step row (including `parent_step_id` and `modell`) but never `raw_output` — the
view loads raw data on demand via `?raw=1`. The former `tool_start`/`tool_result`
frames are replaced by these step frames. Disconnecting does **not** stop the run. `abbrechen` sets
the run's abort signal, so a running flow actually stops rather than only being
marked cancelled in the DB. A backend restart marks any still-`laeuft` run as
`fehler` (a detached run cannot survive the process).

**Retry from failure (2026-07-29).** `POST /laeufe/:id/wiederholen` retries a
run with `status: 'fehler'` of a flow that declares a `schritte` chain (the
deterministic step editor is the default way to build flows). It starts a **new**
run of the same flow with the same arguments; the outputs of the old run's
successful top-level steps are reused (`vorabErgebnisse` in the step executor) —
they appear in the new run's log as steps with input
`(übernommen aus Lauf <id>)` and status `fertig` — and execution resumes at the
first failed step. `400` if the run is not failed or the flow has no step chain;
`404` if the run is unknown/foreign. Response: `202 { runId, uebernommeneSchritte }`.

> The `/laeufe` routes are registered before `/:name`, so `laeufe` (like
> `werkzeuge`, `sammlungen`, `vorlagen`) is a reserved segment: a flow named
> exactly `laeufe` could not be fetched via `GET /:name`.
>
> The former preview endpoints `POST /api/flows/vorschau` and
> `POST /api/flows/vorschau-laufzeit` were removed with the 2026-08-02 flows
> rework (the editor no longer shows a file/runtime preview).

**Runs (Plan 011, Schritt 9).** A run persists in the database (`flow_runs` +
`flow_run_steps`) so it survives closing the browser tab; the live stream
(Schritt 12) reloads the stored history on reconnect. Runs are scoped by owner:
a run belonging to another user returns `404`, never `403` — its existence is
not revealed. Each step stores a condensed `output` (what reaches the
orchestrator) separately from `raw_output` (page/file content, log-only, loaded
only with `?raw=1`). Statuses: `laeuft | fertig | fehler | abgebrochen`.

**Agenten-Baum (Migration 124).** Steps form a real tree: a subagent step is
created **before** the role executes, and the role's inner tool calls become
child steps via `flow_run_steps.parent_step_id`; `modell` records which model
drove a subagent/model step. The run view (chat run card and the Flow-Zentrale
run detail) renders each agent as a collapsible tree — live from the
`step_start`/`step_end` frames, afterwards from the stored steps.

**File changes overview (Plan 011, Schritt 16).** A flow writes and deletes
files without confirmation, so every run that _can_ change files (declares
`dateien_schreiben` or `terminal`, or a document-producing `ausgabe`) is
snapshotted before and after; the diff is
stored on `flow_runs.changes` and returned inside the run object
(`[{ pfad, art: neu|geaendert|geloescht, vorher, nachher, gekuerzt, hinweis, projekt? }]`).
`projekt` (`{ projectId, pfad }`) is present when the file lives in a project's
Ablage — the run UI uses it to open the artifact directly in the editor
(ablage-relative path, device paths are never exposed).
A finishing run also emits it live as an `aenderungen` frame so the open run card
shows it without a refetch; on reconnect it arrives inside the `verlauf` run.
Bounded in count and per-file preview length; `null` (column) means not tracked
(a read-only run). Never fails a run — a failed snapshot just omits the overview.

`:name` and the `name` field are restricted to lowercase letters, digits and hyphens (1–50 chars), and must start and end with a letter or digit — the name becomes both the filename and the `/name` slash command in chat.

**File format** (`data/flows/recherche.md`) — the YAML head declares what the flow needs and may do, the Markdown body is the prompt and carries `{{argument}}` placeholders. Every placeholder must have a matching entry in `argumente`, otherwise the file is rejected.

```yaml
---
name: recherche
beschreibung: Recherchiert ein Thema im Web und fasst es zusammen.
modell: gemma4:26b-q4 # optional, sonst das Standardmodell
argumente:
  - name: thema
    typ: freitext # freitext | datei | auswahl | wissensbasis | ordner
    beschreibung: Das zu recherchierende Thema
    pflicht: true
    # optionen: [...]   # nur bei typ=auswahl (pflicht dort)
    # standard: "..."   # schließt pflicht=true aus
ordner: [/arasul/sandbox/projects/demo] # der ERSTE ist das Arbeitsverzeichnis
werkzeuge: [web_suche, web_lesen, subagent] # + rechnung_erstellen (Plan 014 Phase 5)
rollen:
  - name: leser
    beschreibung: Liest eine Seite und extrahiert Fakten
    werkzeuge: [web_lesen] # nie mehr als der Flow selbst darf
    ergebnis: { felder: [fakten], max_zeichen: 2000 }
    prompt: Lies die Seite und gib nur die belegten Fakten zurück.
schritte: # optional (B7): deterministische, fest geordnete Kette
  - name: lesen # Schrittname = {{platzhalter}} für spätere Schritte
    typ: subagent # subagent (Rolle) | werkzeug (direkter Werkzeug-Aufruf)
    rolle: leser
    auftrag: Lies die gefundenen Seiten. # Vorlage: {{argument}}, {{schritt}}, {{vorher}}
    iterationen: 1 # Schritt bis zu N-mal wiederholen (1–10, default 1)
    # wiederhole_ueber: gliederung  # optional: Schleife über eine LISTE (s. u.)
    # modell: qwen3:32b            # optional: Modell nur für diesen Schritt
grenzen:
  max_aufrufe: 20 # Subagent-Aufrufe über ALLE Ebenen
  zeitlimit_s: 900
  werkzeug_runden: 10
  max_tiefe: 2 # nesting depth of subagent roles (1–5, default 2)
ausgabe: # optional (Flows-Umbau 2026-08-02): was am Ende herauskommt
  format: pdf # keins | markdown | pdf | docx (default: keins = nur Text-Antwort)
  dateiname: 'angebot-{{kunde}}-{{datum}}' # Muster ohne Endung; default <flowname>-<datum>
  vorlage: angebot-muster.docx # Stilvorlage aus data/flows/vorlagen/
  laenge: { stufe: mittel, wortzahl: 900 } # kurz|mittel|ausfuehrlich; wortzahl überstimmt
  sprache: Deutsch
  tonalitaet: formell # formell | neutral | locker
  gliederung: [Zusammenfassung, Details, Nächste Schritte]
---
Recherchiere gründlich zum Thema {{thema}}.
```

**Output (`ausgabe`, 2026-08-02).** Declares what a run produces. Before the run, the runner appends plain-language writing instructions to the system prompt (language, tonality, length band — `kurz` ≈ 300–600 words, `mittel` ≈ 800–2000, `ausfuehrlich` ≥ 2500, a concrete `wortzahl` wins —, the `gliederung` section list, and the extracted text of the `vorlage` as a style/structure reference). With a document format (`markdown|pdf|docx`) the model is additionally required to return the **complete document content as Markdown** as its final answer; after a successful run the runner renders that Markdown (pdfkit for PDF, the pure-JS `docx` package for Word) and writes it collision-free into the working directory (`fix.pdf`, `fix-2.pdf`, …). The write is recorded as a `dokument_ausgabe` step and shows up in the run's file-changes overview; a failed document render marks the run `fehler`. Filename pattern placeholders: `{{argument}}` and `{{datum}}` (YYYY-MM-DD).

**`ordner` argument — the customer-folder case (2026-08-02).** An argument of `typ: ordner` is picked via a folder picker in chat; its value must be a `projekt://…` form (validated at run start, device paths are rejected). The **first** `ordner` argument value becomes the run's working directory — exactly like `ordner_ziel` on the external trigger (an explicit `ordner_ziel` wins). A flow with an `ordner` argument satisfies the "file tools need a folder" rule without declaring static `ordner` entries.

**Style templates (`/api/flows/vorlagen`).** Uploaded files live in `FLOWS_DIR/vorlagen/` (same volume as the flows, included in backups). For `.pdf`/`.docx` the text is extracted **at upload time** via the Document Indexer and stored as a `<name>.extrahiert.txt` sidecar — a template whose text cannot be read is rejected with `400`, and runs never depend on the indexer. At run time the template text (capped at 8 000 chars) is injected into the prompt as a clearly delimited style/structure block; a missing template is silently skipped (the run must not fail because a template was deleted).

Valid `werkzeuge`: `dateien_lesen`, `dateien_schreiben`, `dateien_bearbeiten`, `dateien_anhaengen`, `dateien_suchen`, `rag_suche`, `web_suche`, `web_lesen`, `terminal`, `subagent`. Declaring `rollen` requires `subagent` and vice versa; `dateien_*` / `terminal` require at least one entry in `ordner` **or an argument of `typ: ordner`**. `dateien_suchen` finds files by glob (`muster`) and/or content (`text`, a case-insensitive substring — not a regex — reported with line numbers). `dateien_bearbeiten` (Harness v2, 2026-07-30) replaces one exact text block via search/replace (whitespace-tolerant fallback, `alle: true` for all occurrences); `dateien_anhaengen` appends a section to the end of a file (creates it if missing, file cap 16 MB) — the building block for generating long documents section by section instead of one giant write.

The optional `schritte` array (B7) makes orchestration deterministic: each step is either `typ: subagent` (delegates to a declared `rolle` with an `auftrag` template) or `typ: werkzeug` (calls one tool directly with `parameter`). Steps run in fixed order; a step's output is threaded into later steps as `{{stepname}}` (and `{{vorher}}` across `iterationen`), then the body prompt synthesizes the final answer. A `subagent` step requires the `subagent` tool and a matching role; a `werkzeug` step may only use a tool the flow itself declares. Empty `schritte` → the flow stays model-driven.

**Map over a list (`wiederhole_ueber`, Harness v2 2026-07-30).** A step may declare `wiederhole_ueber: <name>` referencing a flow argument or an EARLIER step. Its value is parsed as a list (JSON array — also when embedded in prose/code fences — else one entry per line, bullets/numbering stripped) and the step runs once per element (max 50) with `{{element}}`, `{{index}}`, `{{anzahl}}` and `{{vorher}}` in scope; the step's output is the concatenation of all element outputs. Mutually exclusive with `iterationen > 1`; the reference is schema-validated. "Ab Fehler wiederholen" adopts completed steps only UP TO the first `wiederhole_ueber` step (its entry count is dynamic). A step-level `modell` overrides the flow model for that step's delegation (a role's own `modell` still wins). Typical long-document pipeline: step 1 (`gliederung`) produces the outline as a JSON array, step 2 loops over it (`wiederhole_ueber: gliederung`) and appends each section via `dateien_anhaengen`.

`GET /api/flows/werkzeuge` returns each tool with a `verfuegbar` flag:

```json
{
  "data": [
    { "name": "dateien_lesen", "verfuegbar": true },
    { "name": "terminal", "verfuegbar": true }
  ],
  "timestamp": "2026-07-21T10:00:00.000Z"
}
```

A flow may declare a tool that is not built yet — the definition stays valid and saveable, and the tool reports why it did nothing when the flow runs. As of Plan 011 Step 18 **all seven tools are built**, so every entry currently reports `verfuegbar: true`.

**`datei` argument — content injection.** An argument of `typ: datei` yields the picked document's **filename**. Because document originals live in MinIO and are not reachable as files, the runner loads that document's indexed text (reassembled from `document_chunks`, or the stored `summary` if not yet chunked) and appends it to the model's user input inside `--- Inhalt der Datei "…" ---` markers, capped at 16 000 characters. A flow like `dokument-zusammenfassen` therefore needs no file tools — the argument delivers the content. If the document is unknown or not indexed, the runner appends an honest note instead so the model does not invent content.

**Folders and paths.** A flow may declare several folders in `ordner`; the **first one is the working directory**. Relative paths in the file tools resolve against it, deliberately not against whichever folder happens to contain a matching file — otherwise the same path would write to different places depending on what exists. Another declared folder is addressed by its full path. Every access is symlink-checked, so a symlink pointing out of the allowed folders is rejected even though the link itself sits inside one.

**GET /api/flows Response** — a single unparsable file must not break the slash menu, so it is skipped and reported in `fehlerhaft` instead of failing the request. In the API the Markdown body is called `prompt`.

```json
{
  "data": [
    {
      "name": "recherche",
      "beschreibung": "Recherchiert ein Thema im Web und fasst es zusammen.",
      "argumente": [{ "name": "thema", "typ": "freitext", "beschreibung": "", "pflicht": true }],
      "ordner": [],
      "werkzeuge": ["web_suche", "web_lesen", "subagent"],
      "rollen": [
        {
          "name": "leser",
          "beschreibung": "",
          "werkzeuge": ["web_lesen"],
          "ergebnis": { "felder": ["fakten"], "max_zeichen": 2000 },
          "prompt": "Lies die Seite und gib nur die belegten Fakten zurück."
        }
      ],
      "grenzen": { "max_aufrufe": 20, "zeitlimit_s": 900, "werkzeug_runden": 10, "max_tiefe": 2 },
      "prompt": "Recherchiere gründlich zum Thema {{thema}}."
    }
  ],
  "fehlerhaft": [{ "name": "kaputt", "fehler": "Flow ist ungültig (werkzeuge.0): ..." }],
  "timestamp": "2026-07-21T10:00:00.000Z"
}
```

**POST /api/flows** — body is the API shape above with `prompt` instead of the Markdown body; everything except `name` and `prompt` is optional. Returns `201` with the normalized, saved definition in `data`.

```json
{
  "name": "recherche",
  "beschreibung": "Recherchiert ein Thema im Web und fasst es zusammen.",
  "argumente": [{ "name": "thema", "typ": "freitext", "pflicht": true }],
  "werkzeuge": ["web_suche", "web_lesen"],
  "prompt": "Recherchiere gründlich zum Thema {{thema}}."
}
```

`PUT /api/flows/:name` takes the same body without `name` (it comes from the URL) and **merges**: fields omitted from the body keep their stored value. This is deliberate — sending only `{ "prompt": "…" }` to fix a typo must not silently wipe `werkzeuge`, `rollen`, `argumente`, `ordner` or `grenzen`. To actually clear a field, send it explicitly as an empty list.

`DELETE /api/flows/:name` responds with `{ "deleted": true, "timestamp": "..." }`.

**Errors:** `VALIDATION_ERROR` (400) for an invalid name, an unknown placeholder or any schema violation (with a `details.issues` list of `{ pfad, meldung }`), `NOT_FOUND` (404) for an unknown flow, `CONFLICT` (409) when creating a flow that already exists.

---

### Sandbox

Isolated project environments with Docker containers and terminal WebSocket access. All routes require authentication.

| Method | Endpoint                                                | Description                                                                                 |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/api/sandbox/projects`                                 | List all sandbox projects for current user                                                  |
| POST   | `/api/sandbox/projects`                                 | Create a new sandbox project                                                                |
| GET    | `/api/sandbox/projects/:id`                             | Get project details                                                                         |
| PUT    | `/api/sandbox/projects/:id`                             | Update project name/description                                                             |
| DELETE | `/api/sandbox/projects/:id`                             | Archive a project                                                                           |
| POST   | `/api/sandbox/projects/:id/start`                       | Start the project container                                                                 |
| POST   | `/api/sandbox/projects/:id/stop`                        | Stop the project container                                                                  |
| POST   | `/api/sandbox/projects/:id/commit`                      | Commit container state as a new image                                                       |
| GET    | `/api/sandbox/projects/:id/status`                      | Get live container status                                                                   |
| GET    | `/api/sandbox/projects/:id/sessions`                    | List terminal sessions for a project                                                        |
| POST   | `/api/sandbox/terminal/ticket`                          | Issue a short-lived single-use ticket for the terminal WS                                   |
| POST   | `/api/sandbox/projects/:workspace/claude-login/capture` | Capture the container's Claude Code login, store encrypted                                  |
| GET    | `/api/sandbox/projects/:workspace/claude-login/status`  | Whether an encrypted Claude login is stored for the user                                    |
| DELETE | `/api/sandbox/projects/:workspace/claude-login`         | Delete the stored Claude login for the user                                                 |
| GET    | `/api/sandbox/claude-auth`                              | Central KI access status (mode, no secret)                                                  |
| PUT    | `/api/sandbox/claude-auth`                              | Set central token/API-key, apply to all sandboxes                                           |
| DELETE | `/api/sandbox/claude-auth`                              | Remove central KI access                                                                    |
| POST   | `/api/sandbox/claude-auth/oauth/start`                  | Begin the backend OAuth-PKCE handshake → authorize URL                                      |
| POST   | `/api/sandbox/claude-auth/oauth/complete`               | Exchange the pasted code for tokens, inject into sandboxes                                  |
| POST   | `/api/sandbox/claude-auth/oauth/refresh`                | Refresh the access token via the stored refresh token                                       |
| POST   | `/api/sandbox/claude-auth/test`                         | Live-check the stored access against the Anthropic API → `{ valid, status, mode, message }` |
| GET    | `/api/sandbox/stats`                                    | Overall sandbox statistics                                                                  |

#### Terminal-WebSocket-Auth (2026-07-31)

Die Browser-`WebSocket`-API kann keinen `Authorization`-Header setzen. Statt die
Terminal-WS allein am httpOnly-Cookie `arasul_session` hängen zu lassen (das bei
LAN-IP/SameSite fehlen oder vor dem Bearer-Token ablaufen kann), holt der Client
über `POST /api/sandbox/terminal/ticket` (Bearer-authentifiziert wie jeder andere
Aufruf) ein **kurzlebiges Einmal-Ticket** und hängt es als `?ticket=…` an die
WS-URL. Der Upgrade-Handler verbraucht das Ticket (30 s gültig, genau einmal,
an einen Nutzer gebunden → anders als ein JWT unbedenklich in der URL) und fällt
sonst auf Cookie/Bearer zurück. Details: `services/sandbox/wsTicketService.js`.

#### Claude-Login persistence (Plan 008, Schritt 14)

A one-time Claude Code login in a sandbox terminal is made to survive a
`docker compose up -d --build` (container rebuild). The login files the CLI
stores in the container (`~/.claude/.credentials.json`, and `~/.claude.json` if
present) are captured, **encrypted per user** (AES-256-GCM via
`utils/tokenCrypto.js`, key from `JWT_SECRET`) into `user_external_credentials`,
and automatically restored into the container on its next start (best-effort —
a restore failure never blocks the terminal). All three routes are
cookie/session auth (`requireAuth`), owner-or-admin scoped by `:workspace`.

**POST /api/sandbox/projects/:workspace/claude-login/capture** — reads the
container's current Claude login and stores it encrypted for the calling user.
Returns `{ captured: boolean, files?: string[] }`. `captured:false` (still 200)
means no login was present yet — call it after logging in inside the terminal.

**GET /api/sandbox/projects/:workspace/claude-login/status** — `{ stored: boolean }`
for the calling user (credentials are per-user, the workspace is auth context).

**DELETE /api/sandbox/projects/:workspace/claude-login** — `{ deleted: boolean }`.

> **Device-verify:** the actual capture/restore into `arasul-sandbox:latest`
> depends on the device-local sandbox image and can only be confirmed on the
> Jetson (login → rebuild → still logged in). The encrypt/decrypt round-trip and
> the docker-exec plumbing are unit-tested.

#### Zentraler KI-Zugang & OAuth-Login (Plan 013 / 015)

One central Claude access is stored **encrypted per user** (same
`user_external_credentials` vault, provider `claude-central`) and injected into
**every** sandbox as an env var — no per-terminal login. `GET/PUT/DELETE
/api/sandbox/claude-auth` manage a manually-pasted `token` (→
`CLAUDE_CODE_OAUTH_TOKEN`) or `apikey` (→ `ANTHROPIC_API_KEY`); the secret is
never returned, only `{ configured, mode, expiresAt? }`.

The **OAuth-PKCE handshake** (Plan 015, Phase 3) replaces the broken interactive
`claude /login` link. The backend builds the OAuth 2.0 + PKCE flow itself
(`services/sandbox/claudeOauthService.js`) so it controls `client_id`,
`redirect_uri`, `scope` and `code_challenge` (S256) — dodging the CLI's
malformed-URL bugs (#29983/#43996/#45340):

- **POST `/oauth/start`** → `{ authorizeUrl, state }`. The `code_verifier` stays
  server-side (in-memory, 15-min TTL); the URL carries the self-generated
  `code_challenge`. Shown in the dashboard as a copyable field.
- **POST `/oauth/complete`** `{ code, state? }` — accepts the pasted `code#state`
  (or plain code + state), verifies state (CSRF), exchanges the code for
  access+refresh tokens **exactly once** per attempt (browser-like headers,
  console→platform host + JSON→form fallbacks, aborts immediately on 429 to
  avoid burning a single-use code), stores the `oauth` bundle, and injects the
  access token into all running sandboxes. Returns `{ configured, mode:'oauth',
expiresAt, applied_to }`.
- **POST `/oauth/refresh`** — renews the access token via the stored refresh
  token (keeps the old refresh token if Anthropic returns none) and re-injects.

`ANTHROPIC_API_KEY` must **not** be set in the sandbox env when an OAuth/abo
token is used (it silently outranks the token and routes to metered API
billing). See `docs/features/WORKSPACE.md`.

**GET /api/sandbox/projects Query Parameters:**

- `status`: Filter by project status
- `search`: Search in project name

**POST /api/sandbox/projects:**

```json
{
  "name": "Mein Projekt",
  "description": "Optionale Beschreibung",
  "baseImage": "ubuntu:22.04", // optional
  "network_mode": "isolated", // optional: isolated | internal | infrastructure
  "workspaceType": "standard", // optional: standard | erweiterungs-werkstatt
  "project_id": "uuid" // optional: Projektablage anschließen (null = trennen)
}
```

**`network_mode` values** — die drei Zugriffs-Stufen aus Plan 012 Phase E
Schritt 14 (also accepted on PUT `/api/sandbox/projects/:id`):

| Value            | UI-Bezeichnung               | Network                       | Extra mounts                                         | Who                                        |
| ---------------- | ---------------------------- | ----------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `isolated`       | Nur Internet                 | Docker bridge (Internet only) | —                                                    | every user (default)                       |
| `internal`       | Interne Dienste              | Backend network (LLM, DB, …)  | —                                                    | every user                                 |
| `infrastructure` | Voller Systemzugriff (Admin) | Backend network               | Platform repo rw (`/workspace/repo`) + docker socket | **admin role only** (else `403 FORBIDDEN`) |

**`workspaceType`** (Plan 012 Phase E Schritt 13): `standard` legt einen leeren
Workspace-Ordner an; `erweiterungs-werkstatt` bestückt ihn beim Anlegen mit den
Vorlagen aus `services/sandbox/dev-templates/` (`ANLEITUNG.md`, `beispiel-app`,
`beispiel-flow`, `beispiel-tool`) — die Bau-Flows `/erweiterung` und `/execute`
arbeiten darin.

**`project_id`** (Migration 125, also accepted on PUT
`/api/sandbox/projects/:id`): schließt die Sandbox an ein Wissensraum-Projekt
an — dessen **Projektablage** (`data/projects/<uuid>`) wird beim
Container-Start rw als `/workspace/projekt` gemountet, was der Agent dort baut
liegt sofort im Explorer. `null` trennt den Anschluss; ein gelöschtes Projekt
kappt nur die Verbindung (`ON DELETE SET NULL`), die Sandbox bleibt.

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

### Flows (Plan 013, B8)

Trigger flows from n8n or your own automations with an API key. The endpoint
scope is `flow:run` (included in the default endpoint set for new keys).

| Method | Endpoint                           | Auth    | Description                                                                                           |
| ------ | ---------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/external/flows`           | API Key | List available flows — global **and** project-bound; each entry carries `projekt: null \| {id, name}` |
| POST   | `/api/v1/external/flows/:name/run` | API Key | Run a flow; waits for the result by default                                                           |
| GET    | `/api/v1/external/flows/runs/:id`  | API Key | Poll a run's status/result (incl. `annahmen`)                                                         |

**POST /api/v1/external/flows/:name/run** — body `{ "args"?: {…}, "wait_for_result"?: true, "timeout_seconds"?: 300, "ordner_ziel"?: "projekt://aktiv/kunden/mueller", "projekt"?: "<uuid>" }`.
`ordner_ziel` lenkt das Arbeitsverzeichnis des Laufs (Enddateien) auf einen
Projektablage-Ordner — nur `projekt://…`-Formen sind zulässig.
`projekt` (Plan 014, Phase 4) startet einen PROJEKTGEBUNDENEN Flow aus dem
`flows/`-Ordner dieses Projekts — so ruft der n8n-Mail-Workflow den
`/antwort`-Flow des Kundenservice-Projekts auf (Beispiel:
[docs/integrations/N8N.md §6b](../integrations/N8N.md)); `projekt://aktiv` und
der RAG-Scope zeigen dann auf DIESES Projekt.
With `wait_for_result: true` (default) it blocks until the run reaches a terminal
state and returns `{ success, run_id, status, result, error, steps_used, annahmen }`; with
`false` it returns `202 { success, run_id, status: "laeuft" }` immediately. Runs
are owned by the API key's creator (or the primary admin for orphaned keys). This
is the per-flow HTTP trigger the UI surfaces (Flow-Zentrale). The former named-event
endpoint (`events/:name`) was removed with flow scheduling on 2026-07-28.

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

## Documentation API

**Base Path:** `/api/docs`

| Method | Endpoint                 | Description              |
| ------ | ------------------------ | ------------------------ |
| GET    | `/api/docs/`             | OpenAPI documentation UI |
| GET    | `/api/docs/openapi.json` | OpenAPI spec (JSON)      |
| GET    | `/api/docs/openapi.yaml` | OpenAPI spec (YAML)      |

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

---

## Related Documentation

- [Development Guide](../development/DEVELOPMENT.md) - API usage examples & patterns
- [API Errors](API_ERRORS.md) - Complete error code reference
- [Dashboard Backend](../../apps/dashboard-backend/README.md) - Backend implementation details
