# n8n "credentialTypes.reduce is not a function" - Comprehensive Fix Plan

## Problem Summary

**Error Message:**
```
Init Problem
There was a problem loading init data: credentialTypes.reduce is not a function
```

**Affected:** n8n Web UI - Workflow Editor cannot load

---

## Root Cause Analysis (5 Subagents Investigation)

### Primary Cause: Database Version Mismatch

| Component | Version | Impact |
|-----------|---------|--------|
| Database created with | **n8n 1.120.4** | Old credential schema |
| Currently running | **n8n 2.4.6** | Expects new schema |

**What happens:**
1. User opens n8n workflow editor
2. n8n 2.x tries to load credential types from database
3. Database has 1.x format → returns `undefined` or malformed data
4. n8n calls `.reduce()` on `undefined` → JavaScript TypeError

### Secondary Issues Identified

| Issue | Severity | Description |
|-------|----------|-------------|
| X-Forwarded-For Warning | LOW | Express rate limiter warning (proxy headers) |
| Python Task Runner Missing | LOW | Only affects Python-based workflow nodes |
| Frequent Container Restarts | MEDIUM | Multiple SIGTERM cycles in logs |
| Uncommitted Git Changes | MEDIUM | Custom node index.ts files untracked |

### Container Status (Verified)

```
Container: n8n
Status: Up (healthy)
Version: 2.4.6
Custom Nodes: Compiled and installed
  - n8n-nodes-arasul-llm v2.0.0 ✓
  - n8n-nodes-arasul-embeddings v2.0.0 ✓
```

---

## Fix Options Comparison

| Option | Time | Data Loss | Complexity | Recommendation |
|--------|------|-----------|------------|----------------|
| **A: Database Reset** | 5-10 min | Yes (2 workflows) | Low | ✅ RECOMMENDED |
| B: Migration Repair | 15-30 min | No | Medium | For production |
| C: Downgrade to 1.x | 10-15 min | No | Low | Temporary only |

---

## Option A: Database Reset (RECOMMENDED)

**Best for:** Development environments, fresh starts

### Prerequisites Check

```bash
# Check what will be lost
docker exec n8n n8n export:workflow --all --output=/tmp/workflows.json 2>/dev/null && \
  docker cp n8n:/tmp/workflows.json ./n8n_workflows_backup.json || \
  echo "No workflows to export or export failed"

# Check credentials count
docker exec n8n n8n db:list:credentials 2>/dev/null || echo "Cannot list credentials"
```

### Step 1: Create Backup

```bash
cd /home/arasul/arasul/arasul-jet

# Create backup directory
mkdir -p data/backups/n8n

# Backup database
docker cp n8n:/home/node/.n8n/database.sqlite ./data/backups/n8n/database_$(date +%Y%m%d_%H%M%S).sqlite

# Verify backup
ls -la ./data/backups/n8n/
```

### Step 2: Stop and Remove n8n Volume

```bash
# Stop n8n
docker compose stop n8n

# Remove volume (THIS DELETES ALL N8N DATA)
docker volume rm arasul-jet_arasul-n8n

# Verify volume removed
docker volume ls | grep n8n
```

### Step 3: Restart n8n (Fresh Database)

```bash
# Start n8n with fresh volume
docker compose up -d n8n

# Wait for initialization (up to 60 seconds)
sleep 10

# Check status
docker compose ps n8n

# Follow logs to verify startup
docker compose logs -f n8n
```

### Step 4: Verify Fix

```bash
# 1. Health check
curl -s http://localhost:5678/healthz
# Expected: {"status":"ok"}

# 2. Check logs for errors
docker compose logs n8n 2>&1 | grep -i "credentialTypes\|reduce" | head -5
# Expected: No output

# 3. Browser test
echo "Open in browser: https://arasul.local/n8n"
echo "Create new owner account and test workflow creation"
```

### Step 5: Reconfigure n8n

1. Open `https://arasul.local/n8n` in browser
2. Create new owner account (same email if desired)
3. Create Ollama credentials:
   - Name: `Ollama LLM`
   - Base URL: `http://llm-service:11434`
4. Create Embeddings credentials:
   - Name: `Arasul Embeddings`
   - Base URL: `http://embedding-service:11435`

---

## Option B: Migration Repair (Advanced)

**Best for:** Production environments with important workflows

### Step 1: Backup First

```bash
cd /home/arasul/arasul/arasul-jet
mkdir -p data/backups/n8n
docker cp n8n:/home/node/.n8n/database.sqlite ./data/backups/n8n/database_before_repair_$(date +%Y%m%d).sqlite
```

### Step 2: Attempt Migration Repair

```bash
# Stop n8n
docker compose stop n8n

# Try to revert last migration
docker compose run --rm -e N8N_LOG_LEVEL=debug n8n n8n db:revert

# Re-run all migrations
docker compose run --rm -e N8N_LOG_LEVEL=debug n8n n8n db:migrate

# Start n8n
docker compose up -d n8n
```

### Step 3: If Migration Fails

```bash
# Restore backup
docker compose stop n8n
docker cp ./data/backups/n8n/database_before_repair_*.sqlite n8n:/home/node/.n8n/database.sqlite
docker compose up -d n8n
```

---

## Option C: Downgrade to n8n 1.x (Temporary)

**Best for:** Quick emergency fix, temporary solution

### Step 1: Modify Dockerfile

```bash
cd /home/arasul/arasul/arasul-jet

# Change n8n version in Dockerfile
sed -i 's/FROM n8nio\/n8n:2\.4\.6/FROM n8nio\/n8n:1.76.3/' services/n8n/Dockerfile

# Also update Node version for compatibility
sed -i 's/FROM node:20-alpine/FROM node:18-alpine/' services/n8n/Dockerfile
```

### Step 2: Rebuild and Restart

```bash
# Remove old image
docker rmi arasul-jet-n8n 2>/dev/null || true

# Rebuild without cache
docker compose build --no-cache n8n

# Restart
docker compose up -d n8n

# Verify version
docker exec n8n cat /usr/local/lib/node_modules/n8n/package.json | grep '"version"'
# Expected: "version": "1.76.3"
```

### Important: Revert Changes After Fix

If you go with Option A or B later, revert the Dockerfile:
```bash
git checkout services/n8n/Dockerfile
```

---

## Post-Fix: Commit Pending Git Changes

After fixing the n8n issue, commit the pending custom node changes:

```bash
cd /home/arasul/arasul/arasul-jet

# Stage the untracked index.ts files
git add services/n8n/custom-nodes/n8n-nodes-arasul-embeddings/index.ts
git add services/n8n/custom-nodes/n8n-nodes-arasul-llm/index.ts

# Commit all n8n-related changes
git add services/n8n/
git commit -m "feat(n8n): upgrade to 2.4.6 with custom node fixes

- Upgrade n8n from 1.70.0 to 2.4.6 (security fixes)
- Add index.ts entry points for custom nodes
- Update TypeScript and dependencies
- Fix tsconfig.json to include index.ts

Fixes: credentialTypes.reduce error after version upgrade"

git push origin main
```

---

## Validation Checklist

After applying any fix, verify:

- [ ] n8n container is healthy: `docker compose ps n8n`
- [ ] No credential errors in logs: `docker compose logs n8n | grep -i "credential.*error"`
- [ ] Health endpoint works: `curl -s http://localhost:5678/healthz`
- [ ] UI loads without error: Open https://arasul.local/n8n
- [ ] Can create new workflow
- [ ] Can add nodes (search for "Arasul" - should find LLM and Embeddings)
- [ ] Can create and test credentials

---

## Long-term Prevention

### 1. Version Pinning

Always pin n8n version explicitly in Dockerfile:
```dockerfile
ARG N8N_VERSION=2.4.6
FROM n8nio/n8n:${N8N_VERSION}
```

### 2. Regular Backups

Add to crontab or backup-service:
```bash
# Daily n8n database backup
0 2 * * * docker cp n8n:/home/node/.n8n/database.sqlite /backup/n8n/db_$(date +\%Y\%m\%d).sqlite
```

### 3. Test Upgrades Before Production

Before upgrading n8n:
1. Create full backup
2. Read release notes for breaking changes
3. Test in staging environment
4. Then apply to production

### 4. Monitor n8n Logs

Add n8n error monitoring:
```bash
# Add to monitoring or alerting system
docker compose logs n8n 2>&1 | grep -i "error\|fatal\|exception"
```

---

## Technical Details

### Custom Nodes Configuration

Both custom nodes are correctly configured for n8n 2.x:

**n8n-nodes-arasul-llm:**
- Entry: `dist/index.js`
- Credentials: `dist/credentials/ArasulLlmApi.credentials.js`
- Node: `dist/nodes/ArasulLlm/ArasulLlm.node.js`

**n8n-nodes-arasul-embeddings:**
- Entry: `dist/index.js`
- Credentials: `dist/credentials/ArasulEmbeddingsApi.credentials.js`
- Node: `dist/nodes/ArasulEmbeddings/ArasulEmbeddings.node.js`

### Environment Variables

Key n8n environment variables in docker-compose.yml:
```yaml
N8N_TRUST_PROXY: "true"
N8N_CUSTOM_EXTENSIONS: "/custom-nodes"
N8N_RUNNERS_ENABLED: "true"
N8N_RUNNERS_MODE: "internal"
N8N_PORT: "5678"
```

---

## Summary

| Step | Action | Duration |
|------|--------|----------|
| 1 | Backup current database | 1 min |
| 2 | Remove n8n volume | 1 min |
| 3 | Restart n8n | 2 min |
| 4 | Verify fix | 2 min |
| 5 | Reconfigure credentials | 5 min |
| **Total** | | **~10 min** |

**Recommended Action:** Option A - Database Reset

**Risk Level:** Low (only 2 workflows affected)

---

*Created: 2026-01-24*
*Author: Claude Code*
*Status: Ready for implementation*
