# Architecture

One-page summary. For the deep dive — services, ports, startup order, data flows — read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## What it is

Arasul is a containerized edge-AI stack that runs entirely on a single NVIDIA Jetson appliance. There are no external dependencies once provisioned: LLM inference, embeddings, vector search, object storage, workflow automation, observability, and self-healing all run as local Docker services behind a single Traefik entry point.

## Topology

```
Internet (443) → Traefik → Dashboard frontend (React 19 SPA)
                         → Dashboard backend  (Express API :3001)
                              ├─ PostgreSQL 16          authoritative state
                              ├─ MinIO                  S3-compatible object storage
                              ├─ LLM service (Ollama)   GPU, ports 11434 / 11436
                              ├─ Embedding service      GPU, port 11435 (BGE-M3)
                              ├─ Qdrant                 vector DB, port 6333
                              ├─ Document indexer       RAG pipeline, port 9102
                              ├─ n8n                    workflow engine, port 5678
                              └─ Self-healing + metrics + backup services
```

All containers live on the isolated `arasul-net` Docker network. Only Traefik exposes ports to the host.

## Layers and where they live

| Layer    | Tech                                                     | Code                                                                                                                                                                                 |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend | React 19 + Vite 6 + Tailwind v4 + shadcn/ui + TypeScript | [`apps/dashboard-frontend/`](apps/dashboard-frontend/)                                                                                                                               |
| Backend  | Node.js / Express + PostgreSQL + WebSocket / SSE         | [`apps/dashboard-backend/`](apps/dashboard-backend/)                                                                                                                                 |
| AI       | Ollama (LLM) + BGE-M3 (embeddings) + Qdrant (vectors)    | [`services/llm-service/`](services/llm-service/), [`services/embedding-service/`](services/embedding-service/)                                                                       |
| RAG      | Document indexer + chunking + reranking                  | [`services/document-indexer/`](services/document-indexer/)                                                                                                                           |
| Infra    | Docker Compose V2 + NVIDIA Container Runtime + Traefik   | [`compose/`](compose/), [`config/traefik/`](config/traefik/)                                                                                                                         |
| Ops      | Self-healing agent + metrics collector + backup service  | [`services/self-healing-agent/`](services/self-healing-agent/), [`services/metrics-collector/`](services/metrics-collector/), [`services/backup-service/`](services/backup-service/) |
| DB       | PostgreSQL 16 (append-only migrations under `init/`)     | [`services/postgres/init/`](services/postgres/init/)                                                                                                                                 |
| Hardware | Jetson AGX Orin / Thor (ARM64, 32–128 GB, CUDA 8.7–10.0) | Detection: [`scripts/setup/detect-jetson.sh`](scripts/setup/detect-jetson.sh)                                                                                                        |

## Design priorities (in order)

1. **Reliability.** Self-healing, no external dependencies, multi-year unattended uptime.
2. **Data privacy.** Everything runs locally. No cloud calls during normal operation.
3. **Ergonomics.** Dashboard UX is for non-technical operators and end-users.

Concretely: no SaaS integrations baked into the platform, no silent failures, migrations always backward-compatible, no rewrites — only incremental change.

## Where to look next

- **Full architecture deep-dive:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Per-domain non-negotiables:** [`CLAUDE.md`](CLAUDE.md) and the per-area `apps/*/CLAUDE.md`, `services/*/CLAUDE.md` files
- **Service-specific design notes:** each service has its own `README.md` (and increasingly `CLAUDE.md`) under `apps/<name>/` or `services/<name>/`
- **API surface:** [`docs/api/API_REFERENCE.md`](docs/api/API_REFERENCE.md)
- **Database schema:** [`docs/api/DATABASE_SCHEMA.md`](docs/api/DATABASE_SCHEMA.md)
- **Deployment / topology in production:** [`docs/ops/DEPLOYMENT.md`](docs/ops/DEPLOYMENT.md)
- **Self-healing logic:** [`docs/features/SELF_HEALING_IMPLEMENTATION.md`](docs/features/SELF_HEALING_IMPLEMENTATION.md)
- **Multi-device support:** [`docs/features/JETSON_COMPATIBILITY.md`](docs/features/JETSON_COMPATIBILITY.md)
