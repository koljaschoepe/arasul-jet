# Dashboard Backend

REST API + SSE backend for the Arasul Platform dashboard.

## Overview

| Property  | Value                                 |
| --------- | ------------------------------------- |
| Port      | 3001 (internal), 80/api (via Traefik) |
| Framework | Express.js 4.18                       |
| Runtime   | Node.js >= 18.0.0                     |
| Database  | PostgreSQL 16 (pg 8.11)               |
| Auth      | JWT (24h expiry) + API Keys           |

## Directory Structure

```
src/
├── index.js              # Main entry point, Express app setup
├── server.js             # Server configuration
├── database.js           # PostgreSQL connection pool with monitoring
├── config/
│   └── services.js       # Service discovery & URLs
├── routes/               # API route handlers
│   ├── auth.js           # JWT login, logout, token validation
│   ├── settings.js       # Password management (Dashboard)
│   ├── services.js       # Container status & health
│   ├── system.js         # System info & network status
│   ├── selfhealing.js    # Self-healing event history
│   ├── update.js         # System update management
│   ├── docs.js           # OpenAPI/Swagger documentation
│   ├── models.js         # LLM model management (catalog, download, admin view)
│   ├── store/apps.js     # Apps am Geraet: Staende einspielen, entfernen, Logs
│   ├── externalApi.js    # External API for automations
│   └── index.js          # Route registration
├── middleware/           # middleware components
│   ├── auth.js           # JWT authentication + token blacklist
│   ├── apiKeyAuth.js     # API key authentication
│   ├── rateLimit.js      # Per-user rate limiting
│   ├── audit.js          # Request/response audit logging
│   └── errorHandler.js   # Centralized error handling
├── services/             # business logic services
│   ├── llmJobService.js  # LLM job persistence
│   ├── llmQueueService.js# Sequential queue with priority & burst
│   ├── modelService.js   # Model download, sync, activation
│   ├── alertEngine.js    # Threshold monitoring & webhooks
│   ├── eventListenerService.js  # Event notification system
│   ├── docker.js         # Docker container API
│   └── ollamaReadiness.js# Ollama health checks
└── utils/
    ├── logger.js         # Winston logger
    ├── jwt.js            # JWT token utilities
    ├── password.js       # Password hashing (bcrypt)
    ├── errors.js         # Error class definitions
    ├── retry.js          # Database retry logic
    └── envManager.js     # Environment variable management
```

## API Routes

### Authentication

| Method | Path               | Description                                        |
| ------ | ------------------ | -------------------------------------------------- |
| POST   | `/api/auth/login`  | Login with username or e-mail + password (no auth) |
| POST   | `/api/auth/logout` | Logout (blacklists token)                          |
| GET    | `/api/auth/me`     | Get current user info incl. `role`                 |
| GET    | `/api/health`      | Health check (no auth)                             |

Zwei Rollen (Phase C1): `admin` und `mitarbeiter`. Jede Route traegt
`requireRole(...)` aus `middleware/auth.js`; ohne Vermerk ist eine Route nur
fuer den Administrator. `scripts/test/rollenregeln.py` prueft das im Testlauf,
`scripts/test/rollen-abnahme.sh` gegen das Geraet.

### Benutzer (Admin)

| Method | Path                         | Description                                        |
| ------ | ---------------------------- | -------------------------------------------------- |
| GET    | `/api/benutzer`              | Alle Benutzer mit Rolle                            |
| POST   | `/api/benutzer`              | Benutzer anlegen (`rolle`)                         |
| PUT    | `/api/benutzer/:id/passwort` | Passwort setzen; beendet alle seine Sitzungen      |
| PUT    | `/api/benutzer/:id/aktiv`    | Stilllegen (`false`) oder wieder zulassen (`true`) |
| DELETE | `/api/benutzer/:id`          | Benutzer samt Daten loeschen                       |

Sein eigenes Passwort wechselt jeder ueber `POST /api/auth/change-password`;
dort wird das alte geprueft. `PUT /api/benutzer/:id/passwort` ist der Weg des
Administrators, der es nicht kennt. Beide schreiben durch
`services/auth/passwordService.js`, also mit Eintrag in `password_history`.

### Freigaben (Admin, Phase C2, Tester-Kreis aus C3)

| Method | Path                                | Description                                             |
| ------ | ----------------------------------- | ------------------------------------------------------- |
| GET    | `/api/freigaben`                    | Alle Freigaben; `?app_id=`, `?benutzer_id=`             |
| POST   | `/api/freigaben`                    | `{ app_id, benutzer_id, stand? }`; 201 neu, 200 Bestand |
| DELETE | `/api/freigaben/:appId/:benutzerId` | Freigabe zuruecknehmen; 404, wenn keine da ist          |

Tabelle `app_members` (Migration 168), Nachfolgerin von `space_members`. Seit
Migration 169 zeigt `app_id` als Fremdschluessel auf `apps.id`, und `stand`
sagt, wie weit freigegeben ist: `live` oder `test` (Tester). Gegen das Geraet
misst das `scripts/test/mitarbeiter-abnahme.sh`.

### Apps (Phase C3)

| Method | Path                       | Description                                           |
| ------ | -------------------------- | ----------------------------------------------------- |
| GET    | `/api/apps`                | Alle Apps mit beiden Staenden                         |
| GET    | `/api/apps/meine`          | Was dem Aufrufer freigegeben ist (auch Mitarbeiter)   |
| GET    | `/api/apps/:id`            | Manifest, Versionen, Modelle, Flows, Containerzustand |
| POST   | `/api/apps/:id/einspielen` | `{ version, stand? }`; ohne Angabe in den Teststand   |
| DELETE | `/api/apps/:id`            | Beide Container, beide Staende, Freigaben             |
| GET    | `/api/apps/:id/logs`       | `?stand=live                                          | test&zeilen=…` |

Dazu die Auslieferung NEBEN `/api`: `GET /apps/<id>/` liefert das statische
Frontend des Livestandes, `/apps/<id>/test/` das des Teststandes
(`routes/appAusliefern.js`). Das BACKEND einer App laeuft nicht hier, sondern in
ihrem Container; Traefik gibt ihm `/apps/<id>/api/`. Alles dazu in
[`docs/features/APPS.md`](../../docs/features/APPS.md); gegen das Geraet misst
`scripts/test/apps-abnahme.sh`.

### System (Auth Required)

| Method | Path                  | Description                         |
| ------ | --------------------- | ----------------------------------- |
| GET    | `/api/system/status`  | System health (OK/WARNING/CRITICAL) |
| GET    | `/api/system/info`    | Version, build hash, uptime         |
| GET    | `/api/system/network` | IP addresses, mDNS, connectivity    |

### AI (Auth Required)

Der Oberflächen-Chat (`/api/llm/*`, `/api/chats/*`) ist mit Phase B6
(26.08.2026) gefallen; Sprachmodell-Aufträge laufen über die externe API
(`/api/v1/external/llm/*`, API-Schlüssel) und `/v1/chat/completions`.
Einbettungen gibt es über `/v1/embeddings` (API-Schlüssel); `POST /api/embeddings`
ist am 06.10.2026 gefallen.

### Models (Auth Required)

| Method | Path                     | Description                    |
| ------ | ------------------------ | ------------------------------ |
| GET    | `/api/models/catalog`    | Curated model catalog          |
| GET    | `/api/models/installed`  | Installed models list          |
| GET    | `/api/models/status`     | Current status (loaded, queue) |
| POST   | `/api/models/download`   | Download model (SSE progress)  |
| DELETE | `/api/models/:modelId`   | Delete a model                 |
| GET    | `/api/models/verwaltung` | Rows of the admin view         |
| POST   | `/api/models/pruefen`    | Does a model fit the device?   |
| POST   | `/api/models/default`    | Set default model              |
| GET    | `/api/models/default`    | Get default model              |

### External API (API Key Auth)

| Method | Path                     | Description                |
| ------ | ------------------------ | -------------------------- |
| POST   | `/api/external/llm/chat` | LLM chat (for automations) |
| GET    | `/api/external/models`   | Available models           |
| GET    | `/api/api-keys`          | List API keys              |
| POST   | `/api/api-keys`          | Create API key             |
| DELETE | `/api/api-keys/:id`      | Revoke API key             |

### Services & Operations (Auth Required)

| Method | Path                          | Description          |
| ------ | ----------------------------- | -------------------- |
| POST   | `/api/services/restart/:name` | Restart container    |
| GET    | `/api/self-healing/events`    | Self-healing history |

### Settings (Auth Required, Rate Limited)

| Method | Path                                  | Description               |
| ------ | ------------------------------------- | ------------------------- |
| POST   | `/api/settings/password/dashboard`    | Change Dashboard password |
| GET    | `/api/settings/password-requirements` | Password rules            |

### Documentation

| Method | Path        | Description |
| ------ | ----------- | ----------- |
| GET    | `/api/docs` | Swagger UI  |

## Key Features

### SSE Streaming (LLM)

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

| Endpoint Category | Limit            |
| ----------------- | ---------------- |
| Password changes  | 3 per 15 minutes |
| Auth API          | 30 per minute    |

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
- **API Keys**: For external integrations (automations)
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

| Variable               | Default           | Description                 |
| ---------------------- | ----------------- | --------------------------- |
| PORT                   | 3001              | Server port                 |
| POSTGRES_HOST          | postgres-db       | Database host               |
| POSTGRES_PORT          | 5432              | Database port               |
| POSTGRES_USER          | arasul            | Database user               |
| POSTGRES_PASSWORD      | (required)        | Database password           |
| POSTGRES_DB            | arasul_db         | Database name               |
| JWT_SECRET             | (required)        | JWT signing key (32+ chars) |
| JWT_EXPIRY             | 24h               | Token expiration            |
| LLM_HOST               | llm-service       | LLM service host            |
| LLM_PORT               | 11434             | LLM service port            |
| LLM_MANAGEMENT_PORT    | 11436             | LLM management API port     |
| EMBEDDING_SERVICE_HOST | embedding-service | Embedding host              |
| EMBEDDING_SERVICE_PORT | 11435             | Embedding port              |
| ALLOWED_ORIGINS        | (empty)           | CORS allowed origins        |
| LOG_LEVEL              | info              | Winston log level           |

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

| Category    | Files | Focus                |
| ----------- | ----- | -------------------- |
| Unit        | 14    | Individual functions |
| Integration | 4     | API endpoints        |
| Security    | 1     | Auth, rate limiting  |

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

| Code             | HTTP Status | Description              |
| ---------------- | ----------- | ------------------------ |
| VALIDATION_ERROR | 400         | Invalid input data       |
| UNAUTHORIZED     | 401         | Missing/invalid token    |
| FORBIDDEN        | 403         | Insufficient permissions |
| NOT_FOUND        | 404         | Resource not found       |
| CONFLICT         | 409         | Resource conflict        |
| RATE_LIMITED     | 429         | Too many requests        |
| INTERNAL_ERROR   | 500         | Server error             |

## Dependencies

### Production (22)

- express (4.18.2) - Web framework
- pg (8.11.3) - PostgreSQL client
- jsonwebtoken (9.0.2) - JWT handling
- bcrypt (5.1.1) - Password hashing
- dockerode (4.0.2) - Docker API client
- axios (1.6.2) - HTTP client
- multer (1.4.5) - File uploads
- winston (3.11.0) - Logging
- express-rate-limit (7.1.5) - Rate limiting
- uuid (9.0.1) - UUID generation
- cors (2.8.5) - CORS middleware
- cookie-parser (1.4.6) - Cookie parsing
- dotenv (16.3.1) - Environment variables
- swagger-ui-express (5.0.0) - API docs UI
- js-yaml (4.1.0) - YAML parsing

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
    "embedding": "available"
  }
}
```

## Related Documentation

- [Development Guide](../../docs/development/DEVELOPMENT.md) - API usage examples & backend patterns
- [API Errors](../../docs/api/API_ERRORS.md) - Error codes and handling
- [API Reference](../../docs/api/API_REFERENCE.md) - Complete endpoint list
- [Database Schema](../../docs/api/DATABASE_SCHEMA.md) - Table definitions
- [Environment Variables](../../docs/ENVIRONMENT_VARIABLES.md) - Full ENV reference
