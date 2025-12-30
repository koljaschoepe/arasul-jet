# API Reference

Quick reference for all Dashboard Backend API endpoints.

**Base URL:** `http://host:8080/api` (via Traefik) or `http://host:3001/api` (direct)

## Authentication

All endpoints except `/api/health` and `/api/auth/login` require JWT authentication.

```
Authorization: Bearer <token>
```

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
| POST | `/api/auth/login` | Login with username/password | - |
| POST | `/api/auth/logout` | Logout (blacklists token) | - |
| GET | `/api/auth/verify` | Verify current token | - |
| POST | `/api/auth/refresh` | Refresh token | - |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system/status` | System health (OK/WARNING/CRITICAL) |
| GET | `/api/system/info` | Version, build hash, uptime |
| GET | `/api/system/network` | IP addresses, mDNS, connectivity |

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
