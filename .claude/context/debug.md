# Context: Debugging & Troubleshooting

## Quick Diagnostics

```bash
# Check all services
docker compose ps

# Check resource usage
docker stats --no-stream

# View recent logs
docker compose logs --tail=50

# Check disk space
df -h
```

---

## Service-Specific Debugging

### Dashboard Backend (3001)

```bash
# Logs
docker compose logs -f dashboard-backend

# Health check
curl http://localhost:3001/api/health

# Test auth
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'

# Check database connection
docker exec dashboard-backend node -e "
  const db = require('./src/database');
  db.query('SELECT 1').then(() => console.log('DB OK')).catch(console.error);
"
```

### Dashboard Frontend (3000)

```bash
# Logs
docker compose logs -f dashboard-frontend

# Check if serving
curl -I http://localhost:3000

# Rebuild
docker compose up -d --build dashboard-frontend
```

### PostgreSQL (5432)

```bash
# Check if running
docker exec postgres-db pg_isready -U arasul

# Connect to shell
docker exec -it postgres-db psql -U arasul -d arasul_db

# Check connections
docker exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT count(*) FROM pg_stat_activity;"

# Check table sizes
docker exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"

# Vacuum
docker exec postgres-db psql -U arasul -d arasul_db -c "VACUUM ANALYZE;"
```

### LLM Service (11434)

```bash
# Logs
docker compose logs -f llm-service

# Check Ollama
docker exec llm-service curl http://localhost:11434/api/tags

# Test generation
docker exec llm-service curl -X POST http://localhost:11434/api/generate \
  -d '{"model":"qwen3:14b-q8","prompt":"Hello","stream":false}'

# Check GPU
docker exec llm-service nvidia-smi
```

### Embedding Service (11435)

```bash
# Logs
docker compose logs -f embedding-service

# Health check
curl http://localhost:11435/health

# Test embedding
curl -X POST http://localhost:11435/embed \
  -H "Content-Type: application/json" \
  -d '{"text":"test"}'
```

### Qdrant (6333)

```bash
# Check collections
curl http://localhost:6333/collections

# Check documents collection
curl http://localhost:6333/collections/documents

# Count vectors
curl http://localhost:6333/collections/documents/points/count
```

### Traefik (80/443)

```bash
# Logs
docker compose logs -f reverse-proxy

# Check routes
curl http://localhost/api/health

# Dashboard (if enabled)
curl http://localhost:8080/api/http/routers
```

---

## Common Issues & Solutions

### HIGH-010: Health Check Timeouts

**Symptom:** Service marked unhealthy despite working
**Solution:** Increase health check timeout in docker-compose.yml
```yaml
healthcheck:
  timeout: 10s
  start_period: 60s
```

### HIGH-014: Startup Order

**Symptom:** Services fail due to missing dependencies
**Solution:** Use `depends_on` with `condition: service_healthy`
```yaml
depends_on:
  postgres-db:
    condition: service_healthy
```

### HIGH-015: Connection Pool Exhaustion

**Symptom:** "too many clients" database errors
**Solution:** Check for connection leaks, increase pool size
```javascript
// database.js
const pool = new Pool({
  max: 20,  // Increase if needed
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

### HIGH-016: Traefik Routing

**Symptom:** 404 or routing issues
**Solution:** Check `config/traefik/dynamic/routes.yml`
```yaml
# Ensure correct router priority
http:
  routers:
    api:
      rule: "PathPrefix(`/api`)"
      priority: 100
```

---

## GPU Debugging

```bash
# Check GPU status
nvidia-smi

# Check GPU in container
docker exec llm-service nvidia-smi

# Check CUDA
docker exec llm-service python3 -c "import torch; print(torch.cuda.is_available())"

# GPU memory
docker exec llm-service nvidia-smi --query-gpu=memory.used,memory.total --format=csv
```

---

## Network Debugging

```bash
# Check container networking
docker network ls
docker network inspect arasul-jet_default

# Test internal connectivity
docker exec dashboard-backend curl http://llm-service:11434/api/tags
docker exec dashboard-backend curl http://postgres-db:5432

# Check ports
netstat -tlnp | grep -E '3000|3001|5432|11434'
```

---

## Log Analysis

```bash
# Search for errors
docker compose logs 2>&1 | grep -i error

# Last 100 lines with timestamps
docker compose logs --tail=100 --timestamps

# Follow specific service
docker compose logs -f --tail=50 dashboard-backend

# Save logs to file
docker compose logs > debug_logs.txt 2>&1
```

---

## Performance Debugging

```bash
# Real-time stats
docker stats

# Check slow queries
docker exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT query, calls, mean_time, total_time
   FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check API response times
time curl http://localhost:3001/api/health
```

---

## Reset & Recovery

```bash
# Restart single service
docker compose restart dashboard-backend

# Rebuild and restart
docker compose up -d --build dashboard-backend

# Full restart
docker compose down && docker compose up -d

# Nuclear option (removes volumes!)
docker compose down -v && docker compose up -d
```

---

## Checklist for Debugging

1. [ ] Check service status: `docker compose ps`
2. [ ] View logs: `docker compose logs <service>`
3. [ ] Check resources: `docker stats`
4. [ ] Test health endpoints
5. [ ] Check database connectivity
6. [ ] Verify network connectivity
7. [ ] Check for recent changes
8. [ ] Consult BUGS_AND_FIXES.md
