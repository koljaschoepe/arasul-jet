# Dashboard Backend

REST API + WebSocket + SSE backend for the Arasul Platform dashboard.

## Overview

| Property | Value |
|----------|-------|
| Port | 3001 (internal), 80/api (via Traefik) |
| Framework | Express.js 4.18 |
| Runtime | Node.js >= 18.0.0 |
| Database | PostgreSQL 16 (pg 8.11) |
| Auth | JWT (24h expiry) + API Keys |

## Directory Structure

```
src/
├── index.js              # Main entry point, Express app setup
├── server.js             # Server configuration
├── database.js           # PostgreSQL connection pool with monitoring
├── config/
│   └── services.js       # Service discovery & URLs
├── routes/               # API route handlers (28 files)
│   ├── auth.js           # JWT login, logout, token validation
│   ├── chats.js          # Multi-conversation chat management
│   ├── llm.js            # LLM chat with queue support & SSE streaming
│   ├── rag.js            # RAG queries with vector search
│   ├── documents.js      # Document upload/management/deletion
│   ├── settings.js       # Password management (Dashboard/MinIO/n8n)
│   ├── metrics.js        # Live & historical metrics
│   ├── services.js       # Container status & health
│   ├── system.js         # System info & network status
│   ├── selfhealing.js    # Self-healing event history
│   ├── update.js         # System update management
│   ├── workflows.js      # n8n workflow statistics
│   ├── embeddings.js     # Text embedding service proxy
│   ├── logs.js           # Log file retrieval & streaming
│   ├── database.js       # Database health & pool metrics
│   ├── docs.js           # OpenAPI/Swagger documentation
│   ├── models.js         # LLM model management (catalog, download, activate)
│   ├── spaces.js         # Knowledge spaces (RAG 2.0)
│   ├── appstore.js       # App marketplace CRUD
│   ├── workspaces.js     # Claude workspaces CRUD
│   ├── alerts.js         # Alert configuration & thresholds
│   ├── audit.js          # Audit log history & statistics
│   ├── events.js         # Event management & webhooks
│   ├── telegram.js       # Telegram bot configuration
│   ├── telegramApp.js    # Telegram app (15 endpoints, Zero-Config)
│   ├── telegramBots.js   # Bot CRUD, Webhook, Commands (23 endpoints)
│   ├── claudeTerminal.js # Claude Code terminal integration
│   ├── externalApi.js    # External API for n8n/automations
│   └── index.js          # Route registration
├── middleware/           # 5 middleware components
│   ├── auth.js           # JWT authentication + token blacklist
│   ├── apiKeyAuth.js     # API key authentication
│   ├── rateLimit.js      # Per-user rate limiting
│   ├── audit.js          # Request/response audit logging
│   └── errorHandler.js   # Centralized error handling
├── services/             # 17 business logic services
│   ├── llmJobService.js  # LLM job persistence
│   ├── llmQueueService.js# Sequential queue with priority & burst
│   ├── modelService.js   # Model download, sync, activation
│   ├── alertEngine.js    # Threshold monitoring & webhooks
│   ├── appService.js     # App marketplace operations
│   ├── updateService.js  # Update package handling
│   ├── metricsStream.js  # WebSocket metrics streaming
│   ├── eventListenerService.js  # Event notification system
│   ├── telegramNotificationService.js # Telegram messages
│   ├── telegramOrchestratorService.js # Telegram commands
│   ├── telegramWebSocketService.js    # NEW: WebSocket for Zero-Config
│   ├── telegramWebhookService.js      # NEW: Bot webhook handling
│   ├── contextInjectionService.js     # LLM context injection
│   ├── n8nLogger.js      # Workflow logging
│   ├── docker.js         # Docker container API
│   ├── ollamaReadiness.js# Ollama health checks
│   └── cryptoService.js  # Encryption utilities
└── utils/
    ├── logger.js         # Winston logger
    ├── fileLogger.js     # File-based logging
    ├── jwt.js            # JWT token utilities
    ├── password.js       # Password hashing (bcrypt)
    ├── errors.js         # Error class definitions
    ├── retry.js          # Database retry logic
    └── envManager.js     # Environment variable management
```

## API Routes

### Authentication (No Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with username/password |
| POST | `/api/auth/logout` | Logout (blacklists token) |
| GET | `/api/auth/me` | Get current user info |
| GET | `/api/health` | Health check |

### System & Metrics (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/system/status` | System health (OK/WARNING/CRITICAL) |
| GET | `/api/system/info` | Version, build hash, uptime |
| GET | `/api/system/network` | IP addresses, mDNS, connectivity |
| GET | `/api/system/thresholds` | Resource thresholds |
| GET | `/api/metrics/live` | Current CPU, RAM, GPU, temp, disk |
| GET | `/api/metrics/history` | Historical metrics (?range=24h) |
| WS | `/api/metrics/live-stream` | WebSocket stream (5s interval) |

### AI & Chat (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/llm/chat` | LLM inference (SSE streaming) |
| GET | `/api/llm/queue` | Queue status |
| GET | `/api/llm/jobs` | Job history |
| GET | `/api/llm/models` | List available models |
| GET | `/api/llm/models/default` | Get default model |
| POST | `/api/embeddings` | Generate text embeddings |
| GET | `/api/chats` | List all conversations |
| POST | `/api/chats` | Create new conversation |
| GET | `/api/chats/:id` | Get conversation details |
| GET | `/api/chats/:id/messages` | Get messages for chat |
| POST | `/api/chats/:id/messages` | Add message to chat |
| PATCH | `/api/chats/:id` | Update chat title |
| DELETE | `/api/chats/:id` | Soft delete chat |
| POST | `/api/rag/query` | RAG query (SSE streaming) |
| GET | `/api/rag/status` | Qdrant collection info |

### Models (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/models/catalog` | Curated model catalog |
| GET | `/api/models/installed` | Installed models list |
| GET | `/api/models/status` | Current status (loaded, queue) |
| GET | `/api/models/loaded` | Currently loaded model |
| POST | `/api/models/download` | Download model (SSE progress) |
| DELETE | `/api/models/:modelId` | Delete a model |
| POST | `/api/models/:modelId/activate` | Load model into VRAM |
| POST | `/api/models/:modelId/deactivate` | Unload from VRAM |
| POST | `/api/models/default` | Set default model |
| GET | `/api/models/default` | Get default model |
| POST | `/api/models/sync` | Sync with Ollama |

### Knowledge Spaces (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/spaces` | List all spaces with stats |
| POST | `/api/spaces` | Create new space |
| GET | `/api/spaces/:id` | Get space details |
| PUT | `/api/spaces/:id` | Update space |
| DELETE | `/api/spaces/:id` | Delete space |
| POST | `/api/spaces/:id/route` | Route query to space |
| GET | `/api/spaces/:id/documents` | Documents in space |

### Documents (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/documents` | List all documents |
| POST | `/api/documents/upload` | Upload document (multipart) |
| DELETE | `/api/documents/:id` | Delete document |
| GET | `/api/documents/:id/status` | Indexing status |
| POST | `/api/documents/:id/reindex` | Force reindex |

### Alerts (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/alerts/settings` | Global alert settings |
| PUT | `/api/alerts/settings` | Update settings |
| GET | `/api/alerts/thresholds` | All threshold configs |
| PUT | `/api/alerts/thresholds/:type` | Update threshold (cpu/ram/disk/temp) |
| GET | `/api/alerts/quiet-hours` | Quiet hours config |
| PUT | `/api/alerts/quiet-hours` | Update quiet hours |
| GET | `/api/alerts/history` | Alert history |
| GET | `/api/alerts/webhooks` | Webhook configurations |
| POST | `/api/alerts/webhooks` | Add webhook |
| DELETE | `/api/alerts/webhooks/:id` | Remove webhook |

### Telegram (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/telegram/config` | Get Telegram config |
| PUT | `/api/telegram/config` | Update config |
| POST | `/api/telegram/test` | Send test message |
| GET | `/api/telegram/audit-logs` | Bot audit logs |

### Telegram App (Auth Required, 15 Endpoints)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/telegram-app/zero-config/init` | Start setup session |
| POST | `/api/telegram-app/zero-config/token` | Validate bot token |
| POST | `/api/telegram-app/zero-config/detect` | Detect chat ID |
| POST | `/api/telegram-app/zero-config/complete` | Complete setup |
| GET | `/api/telegram-app/rules` | Notification rules |
| POST | `/api/telegram-app/rules` | Create rule |
| PUT | `/api/telegram-app/rules/:id` | Update rule |
| DELETE | `/api/telegram-app/rules/:id` | Delete rule |
| GET | `/api/telegram-app/commands` | Available commands |
| POST | `/api/telegram-app/commands/:cmd` | Execute command |
| GET | `/api/telegram-app/orchestrator/thinking` | AI thinking log |
| POST | `/api/telegram-app/orchestrator/config` | Update orchestrator |
| GET | `/api/telegram-app/stats` | Usage statistics |
| POST | `/api/telegram-app/send` | Send message |
| GET | `/api/telegram-app/status` | Bot status |

### App Store (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/apps` | List all apps |
| GET | `/api/apps/categories` | App categories |
| GET | `/api/apps/:id` | App details |
| POST | `/api/apps/:id/install` | Install app |
| POST | `/api/apps/:id/uninstall` | Uninstall app |
| POST | `/api/apps/:id/start` | Start app |
| POST | `/api/apps/:id/stop` | Stop app |
| GET | `/api/apps/:id/config` | App configuration |
| PUT | `/api/apps/:id/config` | Update app config |

### Audit (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/audit/logs` | Audit log history |
| GET | `/api/audit/stats/daily` | Daily statistics |
| GET | `/api/audit/stats/users` | Per-user statistics |
| GET | `/api/audit/stats/endpoints` | Per-endpoint statistics |

### Events (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | List events |
| POST | `/api/events/webhook/:type` | Trigger webhook |
| GET | `/api/events/subscriptions` | Event subscriptions |
| POST | `/api/events/subscriptions` | Subscribe to events |

### Claude Terminal (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/terminal/query` | Execute query |
| GET | `/api/terminal/history` | Query history |
| DELETE | `/api/terminal/history` | Clear history |

### Workspaces (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces` | List workspaces |
| POST | `/api/workspaces` | Create workspace |
| GET | `/api/workspaces/:id` | Get workspace |
| PUT | `/api/workspaces/:id` | Update workspace |
| DELETE | `/api/workspaces/:id` | Delete workspace |

### External API (API Key Auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/external/llm/chat` | LLM chat (for n8n) |
| POST | `/api/external/embeddings` | Generate embeddings |
| GET | `/api/external/models` | Available models |
| GET | `/api/api-keys` | List API keys |
| POST | `/api/api-keys` | Create API key |
| DELETE | `/api/api-keys/:id` | Revoke API key |

### Services & Operations (Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/services` | Status of all containers |
| GET | `/api/services/ai` | AI services with GPU load |
| POST | `/api/services/:name/restart` | Restart container |
| GET | `/api/workflows/activity` | n8n workflow stats |
| GET | `/api/workflows/stats` | Detailed statistics |
| GET | `/api/selfhealing/events` | Self-healing history |
| GET | `/api/selfhealing/status` | Current status |
| POST | `/api/update/upload` | Upload .araupdate file |
| GET | `/api/update/history` | Update history |
| GET | `/api/logs/list` | Available log files |
| GET | `/api/logs/:service` | Stream service logs |
| GET | `/api/database/health` | Database health |
| GET | `/api/database/pool` | Pool statistics |

### Settings (Auth Required, Rate Limited)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/settings/password/dashboard` | Change Dashboard password |
| POST | `/api/settings/password/minio` | Change MinIO password |
| POST | `/api/settings/password/n8n` | Change n8n password |
| GET | `/api/settings/password-requirements` | Password rules |

### Documentation

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/docs` | Swagger UI |
| GET | `/api/docs/openapi.json` | OpenAPI JSON spec |
| GET | `/api/docs/openapi.yaml` | OpenAPI YAML spec |

## Key Features

### WebSocket Metrics Streaming

- Path: `ws://host:3001/api/metrics/live-stream`
- Interval: 5 seconds
- Auto-reconnection handled by frontend
- Fallback to HTTP polling on failure

### SSE Streaming (LLM & RAG)

- LLM responses stream via Server-Sent Events
- Supports thinking blocks (`<think>` tags)
- Queue system prevents concurrent LLM calls
- Progress updates for model downloads

### LLM Queue System

```javascript
// Queue Features:
- FIFO processing with priority support
- Burst handling (max 5 concurrent)
- Model batching (groups requests by model)
- Dependency Injection for testing
- Automatic retry on transient failures
```

### Alert Engine

```javascript
// Threshold Configuration:
{
  cpu:    { warning: 80, critical: 90 },
  ram:    { warning: 80, critical: 90 },
  disk:   { warning: 80, critical: 95 },
  temp:   { warning: 75, critical: 83 }
}

// Features:
- Webhook notifications
- Quiet hours support
- Per-metric thresholds
- Event history
```

### Rate Limiting

| Endpoint Category | Limit |
|-------------------|-------|
| Password changes | 3 per 15 minutes |
| LLM API | 10 requests/second |
| Metrics API | 20 requests/second |
| Auth API | 30 per minute |
| General API | 100 requests/second |

### Database Connection Pool

```javascript
{
  min: 2,
  max: 20,
  idleTimeoutMs: 30000,
  connectionTimeoutMs: 10000,
  retryAttempts: 5,
  retryDelay: 5000
}
```

## Security Features

### Authentication

- **JWT Tokens**: 24-hour expiry, blacklist on logout
- **API Keys**: For external integrations (n8n, automations)
- **Session Tracking**: IP address, user-agent logged
- **Account Lockout**: After consecutive failed attempts

### Authorization

- `requireAuth` middleware for protected routes
- `apiKeyAuth` middleware for external APIs
- Role-based access (admin/user) - future-ready

### Data Protection

- bcrypt password hashing (salt rounds: 10)
- Path traversal protection on file uploads
- Sensitive field masking in audit logs
- Input validation on all endpoints

### CORS Configuration

```javascript
// Automatically allowed:
- localhost, 127.0.0.1
- RFC 1918 addresses (192.168.x, 10.x, 172.16-31.x)
- .local mDNS domains
- Configurable via ALLOWED_ORIGINS env
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Server port |
| POSTGRES_HOST | postgres-db | Database host |
| POSTGRES_PORT | 5432 | Database port |
| POSTGRES_USER | arasul | Database user |
| POSTGRES_PASSWORD | (required) | Database password |
| POSTGRES_DB | arasul_db | Database name |
| JWT_SECRET | (required) | JWT signing key (32+ chars) |
| JWT_EXPIRY | 24h | Token expiration |
| LLM_HOST | llm-service | LLM service host |
| LLM_PORT | 11434 | LLM service port |
| LLM_MANAGEMENT_PORT | 11436 | LLM management API port |
| EMBEDDING_SERVICE_HOST | embedding-service | Embedding host |
| EMBEDDING_SERVICE_PORT | 11435 | Embedding port |
| QDRANT_HOST | qdrant | Vector DB host |
| QDRANT_PORT | 6333 | Vector DB port |
| MINIO_HOST | minio | Object storage host |
| MINIO_PORT | 9000 | Object storage port |
| MINIO_ROOT_USER | (required) | MinIO access key |
| MINIO_ROOT_PASSWORD | (required) | MinIO secret key |
| ALLOWED_ORIGINS | (empty) | CORS allowed origins |
| LOG_LEVEL | info | Winston log level |

## Development

```bash
# Install dependencies
npm install

# Development mode (with nodemon)
npm run dev

# Production mode
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

## Testing

- **Framework**: Jest 29.7
- **Coverage threshold**: 15% (branches, functions, statements)
- **Test files**: `__tests__/unit/`, `__tests__/integration/`
- **Total test files**: 22+

### Test Categories

| Category | Files | Focus |
|----------|-------|-------|
| Unit | 14 | Individual functions |
| Integration | 4 | API endpoints |
| Security | 1 | Auth, rate limiting |

### Telegram Tests

| File | Tests | Coverage |
|------|-------|----------|
| `unit/telegramWebSocket.test.js` | 28 | WebSocket service methods |
| `integration/telegramZeroConfig.test.js` | 14 | Zero-Config API flow |

## Error Handling

All routes use `asyncHandler` for consistent error handling:

```javascript
const { ValidationError, NotFoundError, ForbiddenError } = require('../utils/errors');

// Error Response Format:
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-24T..."
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid input data |
| UNAUTHORIZED | 401 | Missing/invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource conflict |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

## Dependencies

### Production (22)

- express (4.18.2) - Web framework
- pg (8.11.3) - PostgreSQL client
- ws (8.16.0) - WebSocket server
- jsonwebtoken (9.0.2) - JWT handling
- bcrypt (5.1.1) - Password hashing
- dockerode (4.0.2) - Docker API client
- axios (1.6.2) - HTTP client
- multer (1.4.5) - File uploads
- minio (7.1.3) - MinIO S3 client
- winston (3.11.0) - Logging
- express-rate-limit (7.1.5) - Rate limiting
- uuid (9.0.1) - UUID generation
- cors (2.8.5) - CORS middleware
- cookie-parser (1.4.6) - Cookie parsing
- dotenv (16.3.1) - Environment variables
- swagger-ui-express (5.0.0) - API docs UI
- yamljs (0.3.0) - YAML parsing

### Development (3)

- jest (29.7.0) - Testing framework
- supertest (6.3.3) - HTTP testing
- nodemon (3.0.2) - Auto-restart

## Health Check

```bash
# Docker health check
curl http://localhost:3001/api/health

# Response:
{
  "status": "healthy",
  "timestamp": "2024-01-24T...",
  "uptime": 12345,
  "database": "connected",
  "services": {
    "llm": "available",
    "embedding": "available",
    "qdrant": "available"
  }
}
```

## Related Documentation

- [API Guide](../../docs/API_GUIDE.md) - Detailed API usage examples
- [API Errors](../../docs/API_ERRORS.md) - Error codes and handling
- [API Reference](../../docs/API_REFERENCE.md) - Complete endpoint list
- [Database Schema](../../docs/DATABASE_SCHEMA.md) - Table definitions
- [Environment Variables](../../docs/ENVIRONMENT_VARIABLES.md) - Full ENV reference
