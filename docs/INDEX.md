# Documentation Index

Quick navigation to all Arasul Platform documentation.

---

## Reading Paths (New Developer Onboarding)

### Day 1-2: Understand the System

1. [GETTING_STARTED.md](GETTING_STARTED.md) - Setup, first change, deployment workflow
2. [ARCHITECTURE.md](ARCHITECTURE.md) - 17 services, data flows, file locations
3. [DEVELOPMENT.md](DEVELOPMENT.md) - Patterns, hooks, debugging cheatsheet

### Day 3-4: Deep Dive

4. [API_REFERENCE.md](API_REFERENCE.md) - All endpoints with request/response examples
5. [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Tables, relationships, migrations
6. [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) - **Mandatory** frontend guidelines
7. [TESTING.md](TESTING.md) - Backend (Jest) + Frontend (Vitest) + E2E (Playwright)

### Day 5: Operations

8. [DEPLOYMENT.md](DEPLOYMENT.md) - Docker Compose, rebuild workflow
9. [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) - All config variables
10. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues & solutions

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
| [GETTING_STARTED.md](GETTING_STARTED.md)  | Developer onboarding & first change walkthrough   |
| [DEVELOPMENT.md](DEVELOPMENT.md)          | Workflows, backend patterns, API usage, debugging |
| [TESTING.md](TESTING.md)                  | Test framework & procedures                       |
| [BUGS_AND_FIXES.md](../BUGS_AND_FIXES.md) | Bug tracking & resolutions                        |

---

## Operations

| Document                                       | Description                                      |
| ---------------------------------------------- | ------------------------------------------------ |
| [DEPLOYMENT.md](DEPLOYMENT.md)                 | Installation, deployment, pre-shipping checklist |
| [FRESH_DEPLOY_GUIDE.md](FRESH_DEPLOY_GUIDE.md) | Fresh Jetson deployment (3 methods, German)      |
| [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md)   | DR runbooks, backup/restore procedures           |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md)       | Problem resolution & support                     |
| [BACKUP_SYSTEM.md](BACKUP_SYSTEM.md)           | Automated backup documentation                   |
| [UPDATE_SYSTEM.md](UPDATE_SYSTEM.md)           | Update mechanism                                 |
| [ADMIN_HANDBUCH.md](ADMIN_HANDBUCH.md)         | Administration handbook (12 chapters)            |
| [QUICK_START.md](QUICK_START.md)               | Customer quick start guide                       |

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
| Dashboard Frontend | [README](../apps/dashboard-frontend/README.md) | React 19 SPA (Vite 6)      |

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

Completed plans and historical documents: [docs/archive/](archive/)
