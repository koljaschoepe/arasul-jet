# Documentation Index

Quick navigation to all Arasul Platform documentation.

---

## Getting Started

| Document                                 | Description                                     |
| ---------------------------------------- | ----------------------------------------------- |
| [GETTING_STARTED.md](GETTING_STARTED.md) | Developer onboarding & first change walkthrough |
| [README.md](../README.md)                | Project overview                                |
| [CLAUDE.md](../CLAUDE.md)                | Claude Code instructions (compact)              |

---

## Core Reference

| Document                                             | Description                                                |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                   | Services, ports, startup order, data flows, file locations |
| [API_REFERENCE.md](API_REFERENCE.md)                 | Complete endpoint reference                                |
| [API_ERRORS.md](API_ERRORS.md)                       | Error codes & handling                                     |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)             | Database tables & relationships                            |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)                 | **Frontend design guidelines (MANDATORY)**                 |
| [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) | All configuration variables                                |

---

## Development

| Document                                  | Description                                       |
| ----------------------------------------- | ------------------------------------------------- |
| [DEVELOPMENT.md](DEVELOPMENT.md)          | Workflows, backend patterns, API usage, debugging |
| [TESTING.md](TESTING.md)                  | Test framework & procedures                       |
| [BUGS_AND_FIXES.md](../BUGS_AND_FIXES.md) | Bug tracking & resolutions                        |

---

## Operations

| Document                                 | Description                                      |
| ---------------------------------------- | ------------------------------------------------ |
| [DEPLOYMENT.md](DEPLOYMENT.md)           | Installation, deployment, pre-shipping checklist |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Problem resolution & support                     |
| [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md)     | Automated backup documentation                   |
| [UPDATE_SYSTEM.md](UPDATE_SYSTEM.md)     | Update mechanism                                 |
| [ADMIN_HANDBUCH.md](ADMIN_HANDBUCH.md)   | Administration handbook (12 chapters)            |
| [QUICK_START.md](QUICK_START.md)         | Customer quick start guide                       |

---

## Feature-Specific

| Document                                                         | Description                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| [MINIO_SERVICE.md](MINIO_SERVICE.md)                             | S3-compatible storage (buckets, integration, management) |
| [JETSON_COMPATIBILITY.md](JETSON_COMPATIBILITY.md)               | Multi-device support & GPU error handling                |
| [SELF_HEALING_IMPLEMENTATION.md](SELF_HEALING_IMPLEMENTATION.md) | Self-healing engine details                              |
| [LOGGING.md](LOGGING.md)                                         | Logging configuration                                    |
| [CUSTOMER_OAUTH_SETUP.md](CUSTOMER_OAUTH_SETUP.md)               | OAuth setup for customers                                |
| [REMOTE_MAINTENANCE.md](REMOTE_MAINTENANCE.md)                   | Remote access (SSH, Cloudflare, VPN)                     |

---

## Services

### Application Services

| Service            | README                                         | Description                |
| ------------------ | ---------------------------------------------- | -------------------------- |
| Dashboard Backend  | [README](../apps/dashboard-backend/README.md)  | REST API + WebSocket + SSE |
| Dashboard Frontend | [README](../apps/dashboard-frontend/README.md) | React SPA                  |

### AI Services

| Service           | README                                            | Description             |
| ----------------- | ------------------------------------------------- | ----------------------- |
| LLM Service       | [README](../services/llm-service/README.md)       | Ollama-based chat LLM   |
| Embedding Service | [README](../services/embedding-service/README.md) | Text vectorization      |
| Document Indexer  | [README](../services/document-indexer/README.md)  | RAG document processing |

### System Services

| Service            | README                                             | Description              |
| ------------------ | -------------------------------------------------- | ------------------------ |
| PostgreSQL         | [README](../services/postgres/README.md)           | Database                 |
| Metrics Collector  | [README](../services/metrics-collector/README.md)  | System metrics           |
| Self-Healing Agent | [README](../services/self-healing-agent/README.md) | Autonomous recovery      |
| Telegram Bot       | [README](../services/telegram-bot/README.md)       | Notifications & commands |

### Infrastructure

| Service        | Docs                                  | Description           |
| -------------- | ------------------------------------- | --------------------- |
| n8n            | [README](../services/n8n/README.md)   | Workflow automation   |
| MinIO          | [MINIO_SERVICE.md](MINIO_SERVICE.md)  | S3-compatible storage |
| Traefik        | [README](../config/traefik/README.md) | Reverse proxy + SSL   |
| Backup Service | [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md)  | Automated backups     |

---

## Configuration

| Document                                                | Description             |
| ------------------------------------------------------- | ----------------------- |
| [config/README.md](../config/README.md)                 | Configuration directory |
| [config/traefik/README.md](../config/traefik/README.md) | Reverse proxy config    |

---

## Archive

Deprecated and historical documents: [docs/archive/](archive/)
