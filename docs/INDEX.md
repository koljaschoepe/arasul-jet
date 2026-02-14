# Documentation Index

Quick navigation to all Arasul Platform documentation.

---

## Getting Started

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview & quick start |
| [INSTALLATION.md](../INSTALLATION.md) | Hardware requirements & setup |
| [CLAUDE.md](../CLAUDE.md) | Claude Code quick start (compact) |
| [CLAUDE_ARCHITECTURE.md](CLAUDE_ARCHITECTURE.md) | Services, ports, startup order |
| [CLAUDE_DEVELOPMENT.md](CLAUDE_DEVELOPMENT.md) | Workflows, API reference, debugging |

---

## Architecture

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture & diagrams |
| [DOCKER_DEPENDENCIES.md](DOCKER_DEPENDENCIES.md) | Container startup order |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | Database tables & relationships |
| [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) | All configuration variables |

---

## API Documentation

| Document | Description |
|----------|-------------|
| [API_REFERENCE.md](API_REFERENCE.md) | Quick endpoint reference |
| [API_GUIDE.md](API_GUIDE.md) | Detailed usage examples |
| [API_ERRORS.md](API_ERRORS.md) | Error codes & handling |

---

## Services

### Application Services
| Service | README | Description |
|---------|--------|-------------|
| Dashboard Backend | [README](../services/dashboard-backend/README.md) | REST API + WebSocket + SSE |
| Dashboard Frontend | [README](../services/dashboard-frontend/README.md) | React SPA |

### AI Services
| Service | README | Description |
|---------|--------|-------------|
| LLM Service | [README](../services/llm-service/README.md) | Ollama-based chat LLM |
| Embedding Service | [README](../services/embedding-service/README.md) | Text vectorization |
| Document Indexer | [README](../services/document-indexer/README.md) | RAG document processing |

### System Services
| Service | README | Description |
|---------|--------|-------------|
| PostgreSQL | [README](../services/postgres/README.md) | Database |
| Metrics Collector | [README](../services/metrics-collector/README.md) | System metrics |
| Self-Healing Agent | [README](../services/self-healing-agent/README.md) | Autonomous recovery |
| Telegram Bot | [README](../services/telegram-bot/README.md) | Notifications & commands |

### Infrastructure Services
| Service | README | Description |
|---------|--------|-------------|
| n8n | [README](../services/n8n/README.md) | Workflow automation |
| Cloudflared | [OAuth Guide](N8N_OAUTH_LAN_ACCESS_COMPLETE_GUIDE.md) | OAuth tunnel for external access |
| MinIO | [MINIO_SERVICE.md](MINIO_SERVICE.md) | S3-compatible storage |
| Qdrant | - | Vector database |
| Traefik | [README](../config/traefik/README.md) | Reverse proxy + SSL |
| Backup Service | [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md) | Automated backups |

---

## Operations

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment procedures |
| [UPDATE_SYSTEM.md](UPDATE_SYSTEM.md) | Update mechanism |
| [SELF_HEALING_IMPLEMENTATION.md](SELF_HEALING_IMPLEMENTATION.md) | Self-healing details |
| [GPU_ERROR_HANDLING.md](GPU_ERROR_HANDLING.md) | GPU troubleshooting |
| [LOGGING.md](LOGGING.md) | Logging configuration |

---

## Testing

| Document | Description |
|----------|-------------|
| [TESTING.md](TESTING.md) | Test framework & procedures |
| [tests/README.md](../tests/README.md) | Test directory overview |

---

## Configuration

| Document | Description |
|----------|-------------|
| [config/README.md](../config/README.md) | Configuration directory |
| [config/secrets/README.md](../config/secrets/README.md) | Secrets management |
| [config/traefik/README.md](../config/traefik/README.md) | Reverse proxy config |

---

## Development

| Document | Description |
|----------|-------------|
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | **Frontend Design Guidelines (MANDATORY)** |
| [TODO.md](TODO.md) | Implementation roadmap |
| [BUGS_AND_FIXES.md](../BUGS_AND_FIXES.md) | Bug tracking & resolutions |

---

## Quick Links

### Common Tasks

- **Add new API endpoint**: [Context Template](../.claude/context/api-endpoint.md) | [Backend README](../services/dashboard-backend/README.md)
- **Add React component**: [Context Template](../.claude/context/component.md) | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
- **Add database migration**: [Context Template](../.claude/context/migration.md) | [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- **Configure environment**: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)
- **Troubleshoot services**: [Debug Context](../.claude/context/debug.md) | [CLAUDE_DEVELOPMENT.md](CLAUDE_DEVELOPMENT.md#debugging-cheatsheet)
- **Enable n8n OAuth from LAN devices**: [N8N_OAUTH_LAN_ACCESS_COMPLETE_GUIDE.md](N8N_OAUTH_LAN_ACCESS_COMPLETE_GUIDE.md)

### Key Files

```
CLAUDE.md                           # Claude Code quick start
docs/CLAUDE_ARCHITECTURE.md         # Services & file locations
docs/CLAUDE_DEVELOPMENT.md          # Workflows & debugging
.claude/context/                    # Task-specific context templates
docker-compose.yml                  # All service definitions
.env                               # Environment configuration
services/dashboard-backend/src/     # Backend source code
services/dashboard-frontend/src/    # Frontend source code
services/postgres/init/             # Database migrations
```

---

## Document Status

| Document | Status | Last Updated |
|----------|--------|--------------|
| CLAUDE.md | **Refactored** - Compact quick start (~160 lines) | 2026-01-25 |
| CLAUDE_ARCHITECTURE.md | **New** - Services, ports, file locations | 2026-01-25 |
| CLAUDE_DEVELOPMENT.md | **New** - Workflows, debugging, autonomous mode | 2026-01-25 |
| DESIGN_SYSTEM.md | Complete | 2026-01 |
| API_REFERENCE.md | ~75% coverage (149/203 endpoints) | 2026-01-22 |
| API_GUIDE.md | Complete | 2024-11 |
| ARCHITECTURE.md | Complete | 2024-12 |
| DATABASE_SCHEMA.md | Complete (30 migrations) | 2026-01-24 |
| Dashboard Backend README | **Updated** - 28 Routes, 15 Services | 2026-01-24 |
| Dashboard Frontend README | **Updated** - 23 Components, Contexts | 2026-01-24 |
| n8n README | **New** - Custom Nodes, Security | 2026-01-24 |
| MinIO Service | **New** - Buckets, Backup Integration | 2026-01-24 |
| Backup System | **New** - Full Backup Documentation | 2026-01-24 |
| LLM Service README | **Updated** - Jetson Platform | 2026-01-24 |
| Service READMEs | 15 services | 2026-02-14 |
