# Arasul Platform - Base Context

## Project Overview
- **Name**: Arasul Platform
- **Type**: Autonomous Edge AI appliance
- **Hardware**: NVIDIA Jetson AGX Orin (12-Core ARM, 64GB DDR5)
- **Architecture**: 15 Docker microservices

## Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | React 18 SPA |
| Backend | Node.js/Express |
| Database | PostgreSQL 16 |
| LLM | Ollama (qwen3:14b-q8) |
| Embeddings | Sentence Transformers (nomic-embed-text-v1.5) |
| Vector DB | Qdrant |
| Storage | MinIO (S3-compatible) |
| Proxy | Traefik |
| Notifications | Telegram Bot |
| Workflows | n8n |

## Services (15 Total)

| Service | Port | Entry Point |
|---------|------|-------------|
| dashboard-frontend | 3000 | src/App.js |
| dashboard-backend | 3001 | src/index.js |
| postgres-db | 5432 | init/*.sql |
| llm-service | 11434 | api_server.py |
| embedding-service | 11435 | embedding_server.py |
| document-indexer | 8080 | indexer.py |
| qdrant | 6333 | - |
| minio | 9000 | - |
| metrics-collector | 9100 | collector.py |
| self-healing-agent | 9200 | healing_engine.py |
| telegram-bot | 8090 | bot.py |
| n8n | 5678 | - |
| reverse-proxy | 80/443 | routes.yml |
| loki | 3100 | - |
| promtail | 9080 | - |

## Automatic Service Restarts

When you edit files in a service directory, the service **automatically restarts**.
No manual action needed - just edit the code and the service reloads.

| Service Directory | Docker Service | Auto-Restart |
|-------------------|----------------|--------------|
| services/dashboard-backend/ | dashboard-backend | Yes |
| services/dashboard-frontend/ | dashboard-frontend | Yes |
| services/telegram-bot/ | telegram-bot | Yes |
| services/document-indexer/ | document-indexer | Yes |
| services/llm-service/ | llm-service | Yes |
| services/embedding-service/ | embedding-service | Yes |
| services/metrics-collector/ | metrics-collector | Yes |
| services/self-healing-agent/ | self-healing-agent | Yes |

**Excluded from auto-restart:**
- Test files (`__tests__`, `*.test.js`)
- Documentation (`*.md`)
- CSS files (hot reload handles them)
- Config files (`package.json`, `Dockerfile`)
- Database init scripts (need rebuild)

**Script**: `scripts/auto-restart-service.sh`

## Critical Rules

1. **Design System**: Follow `docs/DESIGN_SYSTEM.md` for ALL UI changes
   - Primary color: #45ADFF (blue only!)
   - Background: #101923 / #1A2330

2. **Testing**: Run `./scripts/run-tests.sh --backend` before commits

3. **Documentation**: Update docs when changing:
   - API endpoints → `docs/API_REFERENCE.md`
   - Database schema → `docs/DATABASE_SCHEMA.md`
   - Environment vars → `docs/ENVIRONMENT_VARIABLES.md`

4. **Migrations**: Always use `IF NOT EXISTS` for idempotency

## Key Reference Files

- **Development Guide**: `CLAUDE.md`
- **API Documentation**: `docs/API_REFERENCE.md`
- **Database Schema**: `docs/DATABASE_SCHEMA.md`
- **Design System**: `docs/DESIGN_SYSTEM.md`
- **Bug History**: `BUGS_AND_FIXES.md`
