# Documentation Index

Quick navigation to all Arasul Platform documentation.

---

## Getting Started

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview & quick start |
| [INSTALLATION.md](../INSTALLATION.md) | Hardware requirements & setup |
| [CLAUDE.md](../CLAUDE.md) | Claude Code instructions (comprehensive) |

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

### External Services
| Service | README | Description |
|---------|--------|-------------|
| n8n | [BUILD_CUSTOM_NODES.md](../services/n8n/BUILD_CUSTOM_NODES.md) | Workflow automation |
| MinIO | [MINIO_BUCKETS.md](MINIO_BUCKETS.md) | Object storage |
| Qdrant | - | Vector database |

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
| [TODO.md](TODO.md) | Implementation roadmap |
| [BUGS_AND_FIXES.md](../BUGS_AND_FIXES.md) | Bug tracking & resolutions |

---

## Quick Links

### Common Tasks

- **Add new API endpoint**: [Dashboard Backend README](../services/dashboard-backend/README.md)
- **Modify frontend UI**: [Dashboard Frontend README](../services/dashboard-frontend/README.md)
- **Change database schema**: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- **Configure environment**: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)
- **Troubleshoot services**: [CLAUDE.md - Troubleshooting](../CLAUDE.md#troubleshooting-common-issues)

### Key Files

```
CLAUDE.md                           # Claude Code comprehensive instructions
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
| CLAUDE.md | Complete | 2024-12 |
| API_REFERENCE.md | Complete | 2024-12 |
| API_GUIDE.md | Complete | 2024-11 |
| ARCHITECTURE.md | New | 2024-12 |
| DATABASE_SCHEMA.md | New | 2024-12 |
| Service READMEs | In Progress | 2024-12 |
