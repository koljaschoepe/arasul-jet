# System Architecture

Complete architecture overview of the Arasul Platform.

## System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     APPLICATION INTERFACE                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │    Frontend     │  │     Backend     │  │     n8n         │  │
│  │   (React SPA)   │  │  (Express API)  │  │  (Workflows)    │  │
│  │   Port: 3000    │  │   Port: 3001    │  │   Port: 5678    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                         AI SERVICES                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   LLM Service   │  │   Embedding     │  │    Qdrant       │  │
│  │   (Ollama)      │  │   Service       │  │  (Vector DB)    │  │
│  │   Port: 11434   │  │   Port: 11435   │  │  Port: 6333     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐                                            │
│  │    Document     │                                            │
│  │    Indexer      │                                            │
│  │   Port: 8080    │                                            │
│  └─────────────────┘                                            │
├─────────────────────────────────────────────────────────────────┤
│                       SYSTEM SERVICES                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   PostgreSQL    │  │     MinIO       │  │    Metrics      │  │
│  │   (Database)    │  │  (Object Store) │  │   Collector     │  │
│  │   Port: 5432    │  │  Port: 9000/01  │  │   Port: 9100    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │  Reverse Proxy  │  │  Self-Healing   │                       │
│  │   (Traefik)     │  │     Agent       │                       │
│  │  Port: 80/443   │  │   Port: 9200    │                       │
│  └─────────────────┘  └─────────────────┘                       │
├─────────────────────────────────────────────────────────────────┤
│                        CORE RUNTIME                              │
│     Docker Engine  │  Docker Compose  │  NVIDIA Container RT    │
├─────────────────────────────────────────────────────────────────┤
│                       HARDWARE LAYER                             │
│     NVIDIA Jetson AGX Orin  │  JetPack 6+  │  NVMe Storage      │
└─────────────────────────────────────────────────────────────────┘
```

## Network Topology

```
                         ┌─────────────────┐
                         │    Internet     │
                         └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │  Reverse Proxy  │
                         │    (Traefik)    │
                         │   Port 80/443   │
                         └────────┬────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        │           arasul-net (172.30.0.0/24)              │
        │                         │                         │
   ┌────▼────┐              ┌─────▼─────┐            ┌──────▼─────┐
   │Frontend │              │  Backend  │            │    n8n     │
   │ :3000   │─────────────▶│  :3001    │            │  :5678     │
   └─────────┘   REST/WS    └─────┬─────┘            └────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
    ┌─────▼─────┐          ┌──────▼──────┐        ┌───────▼──────┐
    │ PostgreSQL│          │ LLM Service │        │   MinIO      │
    │  :5432    │          │  :11434     │        │  :9000/9001  │
    └───────────┘          └─────────────┘        └──────────────┘
          │                       │
    ┌─────▼─────┐          ┌──────▼──────┐        ┌──────────────┐
    │ Metrics   │          │  Embedding  │        │   Qdrant     │
    │ :9100     │          │  :11435     │        │  :6333/6334  │
    └───────────┘          └─────────────┘        └──────────────┘
          │
    ┌─────▼─────┐          ┌─────────────┐
    │Self-Heal  │          │   Document  │
    │ :9200     │          │   Indexer   │
    └───────────┘          │   :8080     │
                           └─────────────┘
```

## Port Mapping

| Service | Internal Port | External Port | Protocol |
|---------|---------------|---------------|----------|
| reverse-proxy | 80, 443 | 80, 443 | HTTP/HTTPS |
| dashboard-frontend | 3000 | 8080 (via proxy) | HTTP |
| dashboard-backend | 3001 | 8080/api (via proxy) | HTTP/WS |
| postgres-db | 5432 | - | TCP |
| minio | 9000, 9001 | 9001 | HTTP |
| qdrant | 6333, 6334 | 6333, 6334 | HTTP/gRPC |
| llm-service | 11434, 11436 | - | HTTP |
| embedding-service | 11435 | - | HTTP |
| document-indexer | 8080 | - | HTTP |
| metrics-collector | 9100 | - | HTTP |
| self-healing-agent | 9200 | - | HTTP |
| n8n | 5678 | 5678 | HTTP |

## Startup Order

Critical dependency chain (enforced via Docker Compose `depends_on`):

```
Tier 1: postgres-db, minio
         │
         ▼
Tier 2: qdrant
         │
         ▼
Tier 3: metrics-collector
         │
         ▼
Tier 4: llm-service, embedding-service
         │
         ▼
Tier 5: document-indexer
         │
         ▼
Tier 6: reverse-proxy
         │
         ▼
Tier 7: dashboard-backend, dashboard-frontend, n8n
         │
         ▼
Tier 8: self-healing-agent (starts last, monitors all)
```

## Data Flow

### Chat Request Flow

```
User → Frontend → Backend → LLM Service → Backend → Frontend → User
          │                      │
          │                      └── PostgreSQL (store message)
          │
          └── WebSocket (metrics stream)
```

### RAG Query Flow

```
User Query
     │
     ▼
┌─────────┐    embed    ┌───────────┐   search   ┌────────┐
│ Backend │ ──────────▶ │ Embedding │ ─────────▶ │ Qdrant │
└────┬────┘             │  Service  │            └────┬───┘
     │                  └───────────┘                 │
     │                                                │
     │◀────────────── relevant chunks ────────────────┘
     │
     │  context + query
     ▼
┌─────────┐
│   LLM   │ ──────────▶ Response with sources
│ Service │
└─────────┘
```

### Document Indexing Flow

```
Upload Document
      │
      ▼
┌─────────┐    store    ┌────────┐
│ Backend │ ──────────▶ │ MinIO  │
└─────────┘             └────┬───┘
                             │
                             │ scan (30s)
                             ▼
                     ┌───────────────┐
                     │   Document    │
                     │   Indexer     │
                     └───────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
         Parse Doc      Chunk Text     Embed Chunks
              │              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                     ┌───────────────┐
                     │    Qdrant     │ (store vectors)
                     └───────────────┘
```

## Resource Allocation

### CPU Limits (cgroups)

| Service | Max CPU |
|---------|---------|
| LLM Service | 50% |
| Embedding Service | 30% |
| Dashboard Backend | 5% |
| Others | Default |

### Memory Allocation

| Service | RAM |
|---------|-----|
| LLM Service | 32 GB (fixed) |
| Embedding Service | 8 GB (fixed) |
| PostgreSQL | 8 GB (max) |
| n8n | 2 GB (max) |
| Others | Default |

### GPU Requirements

| Service | GPU | Memory |
|---------|-----|--------|
| LLM Service | Required | ~40 GB max |
| Embedding Service | Required | ~2 GB |
| Others | None | - |

## Health Check Summary

| Service | Method | Interval | Timeout | Start Period |
|---------|--------|----------|---------|--------------|
| postgres-db | pg_isready | 10s | 2s | - |
| minio | curl health | 10s | 1s | - |
| qdrant | file check | 10s | 3s | 10s |
| metrics-collector | HTTP /health | 10s | 1s | - |
| llm-service | bash script | 30s | 5s | 300s |
| embedding-service | bash script | 15s | 3s | 300s |
| dashboard-backend | HTTP /api/health | 10s | 3s | 10s |
| dashboard-frontend | file check | 10s | 1s | - |
| n8n | wget spider | 15s | 2s | - |
| reverse-proxy | traefik ping | 10s | 3s | - |
| self-healing-agent | python heartbeat | 30s | 3s | 10s |

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      External Network                        │
│                                                             │
│  Exposed Ports: 80, 443, 5678, 9001, 6333, 6334            │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Reverse Proxy  │
                    │   (Traefik)     │
                    │                 │
                    │  - TLS termination
                    │  - Rate limiting │
                    │  - CORS policy  │
                    └────────┬────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│                    Internal Network                          │
│                  (172.30.0.0/24)                            │
│                                                             │
│  - JWT authentication (24h expiry)                          │
│  - Account lockout (5 attempts, 15 min)                     │
│  - Password requirements (8+ chars, complexity)             │
│  - Rate limiting per user                                   │
│  - All services isolated                                    │
└─────────────────────────────────────────────────────────────┘
```

## Related Documentation

- [DOCKER_DEPENDENCIES.md](DOCKER_DEPENDENCIES.md) - Startup order details
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Database structure
- [API_REFERENCE.md](API_REFERENCE.md) - API endpoints
- [CLAUDE.md](../CLAUDE.md) - Full system specification
