# ARASUL Platform - Docker Compose Dependency Chain

This document describes the service startup order and health check dependencies in the ARASUL platform.

## Startup Order (Sequential Tiers)

### Tier 1: Foundation Services (No Dependencies)
```
┌─────────────┐     ┌─────────┐
│ PostgreSQL  │     │  MinIO  │
│  (port 5432)│     │(9000/01)│
└─────────────┘     └─────────┘
```
- **PostgreSQL**: Primary database for telemetry, metrics, and audit logs
- **MinIO**: Object storage for models, backups, and large files
- **No dependencies**: These services must start first

### Tier 2: Metrics Layer
```
      ↓ depends_on
┌───────────────────┐
│ Metrics Collector │
│    (port 9100)    │
└───────────────────┘
```
**Dependencies**: `postgres-db` (condition: service_healthy)

### Tier 3: AI Services Layer
```
      ↓ depends_on
┌─────────────┐     ┌──────────────────┐
│ LLM Service │     │ Embedding Service│
│(port 11434) │     │  (port 11435)    │
└─────────────┘     └──────────────────┘
```
**Dependencies**: `postgres-db` (condition: service_healthy)
- Both services require GPU access (NVIDIA runtime)
- Independent of each other

### Tier 4: Application Services Layer
```
         ↓ depends_on (all from tiers 1-3)
┌──────────────────┐     ┌──────────────────┐
│Dashboard Backend │     │Dashboard Frontend│
│   (port 3001)    │     │   (port 3000)    │
└──────────────────┘     └──────────────────┘
```
**Dashboard Backend Dependencies**:
- `postgres-db` (service_healthy)
- `minio` (service_healthy)
- `metrics-collector` (service_healthy)
- `llm-service` (service_healthy)
- `embedding-service` (service_healthy)

**Dashboard Frontend Dependencies**: None (static files served by Nginx)

### Tier 5: Workflow Engine
```
         ↓ depends_on
┌──────────────────┐
│       n8n        │
│   (port 5678)    │
└──────────────────┘
```
**Dependencies**:
- `postgres-db` (service_healthy)
- `llm-service` (service_healthy)
- `embedding-service` (service_healthy)
- `minio` (service_healthy)

### Tier 6: Reverse Proxy (LAST APPLICATION SERVICE)
```
         ↓ depends_on (ALL tier 1-5)
┌──────────────────┐
│   Reverse Proxy  │
│    (Traefik)     │
│   (ports 80/443) │
└──────────────────┘
```
**Critical**: Reverse proxy starts AFTER all application services are healthy

**Dependencies**:
- `postgres-db` (service_healthy)
- `minio` (service_healthy)
- `metrics-collector` (service_healthy)
- `llm-service` (service_healthy)
- `embedding-service` (service_healthy)
- `dashboard-backend` (service_healthy)
- `dashboard-frontend` (service_healthy)
- `n8n` (service_healthy)

### Tier 7: Self-Healing Engine (FINAL SERVICE)
```
         ↓ depends_on (ALL tier 1-6)
┌──────────────────┐
│  Self-Healing    │
│     Agent        │
│   (port 9200)    │
└──────────────────┘
```
**Critical**: Self-healing starts LAST to monitor all other services

**Dependencies**:
- `postgres-db` (service_healthy)
- `metrics-collector` (service_healthy)
- `dashboard-backend` (service_healthy)
- `llm-service` (service_healthy)
- `embedding-service` (service_healthy)
- `n8n` (service_healthy)
- `minio` (service_healthy)

## Complete Dependency Graph

```
                     ┌──────────────┐
                     │  PostgreSQL  │
                     └──────┬───────┘
                            │
                ┌───────────┼──────────────────────┐
                │           │                      │
                ↓           ↓                      ↓
         ┌────────────┐  ┌─────────┐     ┌──────────────┐
         │  Metrics   │  │  MinIO  │     │  LLM Service │
         │ Collector  │  └────┬────┘     └──────┬───────┘
         └─────┬──────┘       │                 │
               │              │                 │
               │              ↓                 ↓
               │      ┌──────────────┐  ┌──────────────┐
               │      │  Embedding   │  │     n8n      │
               │      │   Service    │  └──────┬───────┘
               │      └──────┬───────┘         │
               │             │                 │
               └─────────────┼─────────────────┼──────┐
                             │                 │      │
                             ↓                 ↓      │
                      ┌────────────┐    ┌────────────┐│
                      │ Dashboard  │    │ Dashboard  ││
                      │  Backend   │    │  Frontend  ││
                      └─────┬──────┘    └─────┬──────┘│
                            │                 │       │
                            └────────┬────────┘       │
                                     │                │
                                     ↓                │
                             ┌──────────────┐         │
                             │   Reverse    │         │
                             │    Proxy     │         │
                             │  (Traefik)   │         │
                             └──────┬───────┘         │
                                    │                 │
                                    └────────┬────────┘
                                             │
                                             ↓
                                    ┌──────────────┐
                                    │Self-Healing  │
                                    │    Agent     │
                                    └──────────────┘
```

## Health Check Specifications

All services must define health checks with the following parameters:

| Service | Health Check Command | Interval | Timeout | Retries | Start Period |
|---------|---------------------|----------|---------|---------|--------------|
| postgres-db | `pg_isready -U $USER -d $DB` | 10s | 2s | 3 | - |
| minio | `curl -f http://localhost:9000/minio/health/live` | 10s | 1s | 3 | - |
| metrics-collector | `curl -f http://localhost:9100/health` | 10s | 1s | 3 | - |
| llm-service | Custom script (model test) | 30s | 5s | 3 | 60s |
| embedding-service | Custom script (vectorization test) | 15s | 3s | 3 | 30s |
| dashboard-backend | `curl -f http://localhost:3001/api/health` | 10s | 1s | 3 | - |
| dashboard-frontend | `test -f /usr/share/nginx/html/index.html` | 10s | 1s | 3 | - |
| n8n | `wget --spider -q http://localhost:5678/healthz` | 15s | 2s | 3 | - |
| reverse-proxy | `traefik healthcheck --ping` | 10s | 3s | 3 | - |
| self-healing-agent | `python3 /app/heartbeat.py --test` | 30s | 3s | 3 | 10s |

## Validation

Use the validation script to ensure all dependencies are correctly configured:

```bash
./scripts/validate_dependencies.sh
```

This script checks:
1. ✅ All services have health checks defined
2. ✅ All `depends_on` use `condition: service_healthy`
3. ✅ Critical dependency chains are correct
4. ✅ No circular dependencies
5. ✅ Restart policies are set to `always`

## Best Practices

### 1. Always Use Health Check Conditions
```yaml
depends_on:
  postgres-db:
    condition: service_healthy  # ✅ GOOD
```

**NOT** this:
```yaml
depends_on:
  - postgres-db  # ❌ BAD - no health check
```

### 2. Start Self-Healing LAST
The self-healing agent must be the last service to start so it can monitor all other services.

### 3. Start Reverse Proxy After Application Services
The reverse proxy should only start after all backend services are healthy to avoid routing errors.

### 4. Foundation Services Have No Dependencies
PostgreSQL and MinIO should never depend on other services.

## Troubleshooting

### Service Won't Start
1. Check health check status: `docker ps`
2. View logs: `docker-compose logs <service-name>`
3. Verify dependencies: `./scripts/validate_dependencies.sh`

### Long Startup Time
This is expected and by design:
- **Tier 1-2**: 10-15 seconds
- **Tier 3** (AI Services): 30-60 seconds (model loading)
- **Tier 4-5**: 10-20 seconds
- **Tier 6-7**: 5-10 seconds

**Total bootstrap time**: ~2-3 minutes for full system startup

### Dependency Loop Detected
Run validation script to identify circular dependencies:
```bash
./scripts/validate_dependencies.sh
```

## References

- PRD Section: §18 (Container Architecture)
- PRD Section: §19 (Startup Order)
- docker-compose.yml: Main configuration file
- scripts/validate_dependencies.sh: Validation script
