# Dashboard Backend

REST API + WebSocket + SSE backend for the Arasul Platform dashboard.

## Overview

| Property | Value |
|----------|-------|
| Port | 3001 (internal), 8080/api (via Traefik) |
| Framework | Express.js 4.18 |
| Runtime | Node.js >= 18.0.0 |
| Database | PostgreSQL (pg 8.11) |
| Auth | JWT (24h expiry) |

## Directory Structure

```
src/
├── index.js              # Main entry point, Express app setup
├── server.js             # Server configuration
├── database.js           # PostgreSQL connection pool with monitoring
├── routes/               # API route handlers (17 files)
│   ├── auth.js           # JWT login, logout, token validation
│   ├── chats.js          # Multi-conversation chat management
│   ├── llm.js            # LLM chat with queue support & SSE streaming
│   ├── rag.js            # RAG queries with vector search
│   ├── documents.js      # Document upload/management/deletion
│   ├── settings.js       # Password management for Dashboard/MinIO/n8n
│   ├── metrics.js        # Live & historical metrics
│   ├── services.js       # Container status & health
│   ├── system.js         # System info & network status
│   ├── selfhealing.js    # Self-healing event history
│   ├── update.js         # System update management
│   ├── workflows.js      # n8n workflow statistics
│   ├── embeddings.js     # Text embedding service proxy
│   ├── logs.js           # Log file retrieval
│   ├── database.js       # Database metrics
│   ├── docs.js           # OpenAPI documentation
│   └── index.js          # Route root
├── middleware/
│   ├── auth.js           # JWT authentication middleware
│   └── rateLimit.js      # Per-user rate limiting
├── services/
│   ├── llmJobService.js  # LLM job management & persistence
│   ├── llmQueueService.js# Sequential LLM queue processing
│   ├── metricsStream.js  # WebSocket metrics streaming
│   ├── updateService.js  # Update package handling
│   ├── n8nLogger.js      # Workflow logging
│   └── docker.js         # Docker container management
└── utils/
    ├── logger.js         # Winston logger
    ├── fileLogger.js     # File-based logging
    ├── jwt.js            # JWT token utilities
    ├── password.js       # Password hashing (bcrypt)
    ├── retry.js          # Database retry logic
    └── envManager.js     # Environment variable management
```

## API Routes

### Authentication (No Auth Required)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with username/password |
| GET | `/api/health` | Health check |

### System & Metrics (Auth Required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/system/status` | System health (OK/WARNING/CRITICAL) |
| GET | `/api/system/info` | Version, build hash, uptime |
| GET | `/api/system/network` | IP addresses, mDNS, connectivity |
| GET | `/api/metrics/live` | Current CPU, RAM, GPU, temp, disk |
| GET | `/api/metrics/history` | Historical metrics (?range=24h) |
| WS | `/api/metrics/live-stream` | WebSocket stream (5s interval) |

### AI & Chat (Auth Required)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/llm/chat` | LLM inference (SSE streaming) |
| GET | `/api/llm/models` | List available LLM models |
| POST | `/api/embeddings` | Generate text embeddings |
| GET | `/api/chats` | List all conversations |
| POST | `/api/chats` | Create new conversation |
| GET | `/api/chats/:id/messages` | Get messages for chat |
| POST | `/api/chats/:id/messages` | Add message to chat |
| PATCH | `/api/chats/:id` | Update chat title |
| DELETE | `/api/chats/:id` | Soft delete chat |
| POST | `/api/rag/query` | RAG query (SSE streaming) |
| GET | `/api/rag/status` | Qdrant collection info |

### Documents (Auth Required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/documents` | List all documents |
| POST | `/api/documents/upload` | Upload document (multipart) |
| DELETE | `/api/documents/:id` | Delete document |
| GET | `/api/documents/:id/status` | Indexing status |

### Services & Operations (Auth Required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/services` | Status of all services |
| GET | `/api/services/ai` | AI services with GPU load |
| GET | `/api/workflows/activity` | n8n workflow statistics |
| GET | `/api/self-healing/events` | Self-healing event history |
| GET | `/api/self-healing/status` | Current healing status |
| POST | `/api/update/upload` | Upload .araupdate file |

### Settings (Auth Required, Rate Limited)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/settings/password/dashboard` | Change Dashboard password |
| POST | `/api/settings/password/minio` | Change MinIO password |
| POST | `/api/settings/password/n8n` | Change n8n password |
| GET | `/api/settings/password-requirements` | Get password rules |

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

### Rate Limiting
- Password changes: 3 per 15 minutes
- LLM API: 10 requests/second
- Metrics API: 20 requests/second

### Database Connection Pool
- Min connections: 2
- Max connections: 20
- Idle timeout: 30 seconds
- Retry logic: 5 attempts, 5s delay

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Server port |
| POSTGRES_HOST | postgres-db | Database host |
| POSTGRES_PORT | 5432 | Database port |
| POSTGRES_USER | arasul | Database user |
| POSTGRES_DB | arasul_db | Database name |
| JWT_SECRET | (required) | JWT signing key |
| JWT_EXPIRY | 24h | Token expiration |
| LLM_HOST | llm-service | LLM service host |
| LLM_PORT | 11434 | LLM service port |
| EMBEDDING_SERVICE_HOST | embedding-service | Embedding host |
| EMBEDDING_SERVICE_PORT | 11435 | Embedding port |
| QDRANT_HOST | qdrant | Vector DB host |
| QDRANT_PORT | 6333 | Vector DB port |
| MINIO_HOST | minio | Object storage host |
| MINIO_PORT | 9000 | Object storage port |
| ALLOWED_ORIGINS | (empty) | CORS allowed origins |

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

- Framework: Jest 29.7
- Coverage threshold: 70% (branches, functions, lines, statements)
- Test files: `__tests__/unit/`, `__tests__/integration/`

## Dependencies

### Production
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

### Development
- jest (29.7.0) - Testing framework
- supertest (6.3.3) - HTTP testing
- nodemon (3.0.2) - Auto-restart

## Related Documentation

- [API Guide](../../docs/API_GUIDE.md) - Detailed API usage examples
- [API Errors](../../docs/API_ERRORS.md) - Error codes and handling
- [Database Schema](../../docs/DATABASE_SCHEMA.md) - Table definitions
