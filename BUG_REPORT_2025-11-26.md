# Bug Report - System Startup Analysis
**Date**: 2025-11-26
**System Version**: 1.0.0
**Environment**: NVIDIA Jetson AGX Orin, JetPack 6.x
**Test Type**: Full System Startup & Health Check

## Executive Summary

Das System wurde erfolgreich gestartet, aber mehrere kritische und high-priority Bugs wurden identifiziert, die die Produktivität beeinträchtigen:

- **CRITICAL**: LLM Service hat keine Modelle geladen (Service nicht nutzbar)
- **HIGH**: GPU Monitoring funktioniert nicht (nvidia-smi im metrics-collector Container nicht verfügbar)
- **HIGH**: Service Status API gibt "unknown" für alle Services zurück
- **MEDIUM**: n8n Deprecation Warnings
- **MEDIUM**: HTTP-zu-HTTPS Redirect ohne gültiges Zertifikat
- **LOW**: Embedding Service Latenz über Spezifikation

---

## Critical Issues

### BUG-001: LLM Service - Keine Modelle geladen (CRITICAL)

**Severity**: CRITICAL
**Component**: llm-service
**Status**: UNHEALTHY (2/5 health checks bestanden)

**Beschreibung**:
Der LLM Service ist gestartet, aber es sind keine Modelle geladen. Der Service kann keine Inferenz durchführen.

**Symptome**:
- Health Check Status: `health: starting` (seit >3 Minuten)
- API Endpoint `/api/tags` gibt zurück: `{"models":[]}`
- Health Check Fehler:
  ```
  [ERROR] No models loaded
  [ERROR] Prompt test failed with HTTP 404000
  ```
- GPU Memory: 0 MB verwendet (keine GPU-Prozesse laufen)

**Root Cause**:
Kein Modell wurde beim Start automatisch geladen. Der LLM Service erwartet ein Modell über:
- Volume Mount: `/models` → Ollama Models Directory
- Oder: Automatischer Download eines Default-Modells beim Start

**Impact**:
- LLM Service komplett nicht funktionsfähig
- Dashboard Backend kann keine LLM-Anfragen verarbeiten
- AI-Features der Plattform nicht verfügbar

**Reproduktion**:
1. `docker compose up -d`
2. `docker exec llm-service curl -s http://localhost:11434/api/tags`
3. Ergebnis: `{"models":[]}`

**Lösung**:
Eine der folgenden Optionen:

**Option A - Model Pulling beim Start (Empfohlen)**:
```bash
# In llm-service/entrypoint.sh hinzufügen:
if [ $(ollama list | wc -l) -eq 0 ]; then
    echo "No models found. Pulling default model..."
    ollama pull ${DEFAULT_MODEL:-llama2}
fi
```

**Option B - Pre-downloaded Model Volume**:
```yaml
# docker-compose.yml
volumes:
  - ./data/models:/root/.ollama
```

Dann vor dem Start:
```bash
docker run --rm -v ./data/models:/root/.ollama ollama/ollama pull llama2
```

**Files to Check/Modify**:
- `/home/arasul/arasul/arasul-jet/services/llm-service/entrypoint.sh`
- `/home/arasul/arasul/arasul-jet/services/llm-service/Dockerfile`
- `/home/arasul/arasul/arasul-jet/docker-compose.yml`

---

### BUG-002: LLM Service - GPU Memory Informationen nicht abrufbar (CRITICAL)

**Severity**: CRITICAL
**Component**: llm-service
**Related to**: BUG-001

**Beschreibung**:
Der Health Check kann GPU Memory Informationen nicht abrufen, obwohl nvidia-smi im Container funktioniert.

**Symptome**:
```
[ERROR] Failed to retrieve GPU memory information
GPU availability check failed
```

**Diagnose**:
```bash
$ docker exec llm-service nvidia-smi
# Funktioniert! GPU ist sichtbar

$ docker exec llm-service nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits
# Gibt nichts zurück oder leere Zeile
```

**Root Cause**:
NVIDIA Jetson Orin GPUs unterstützen möglicherweise nicht alle nvidia-smi Query-Parameter, die der Health Check verwendet.

**Lösung**:
Health Check anpassen für Jetson-kompatible Queries:

**File**: `/home/arasul/arasul/arasul-jet/services/llm-service/healthcheck.sh`

**Lines 80-81** ändern:
```bash
# VORHER:
GPU_MEM_USED=$(timeout 5 nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | head -1)
GPU_MEM_TOTAL=$(timeout 5 nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)

# NACHHER - Jetson-kompatibel:
GPU_MEM_USED=$(timeout 5 nvidia-smi --query-gpu=memory.used --format=csv,noheader 2>/dev/null | head -1 | tr -d ' MiB')
GPU_MEM_TOTAL=$(timeout 5 nvidia-smi --query-gpu=memory.total --format=csv,noheader 2>/dev/null | head -1 | tr -d ' MiB')
```

Oder als Alternative: NVML statt nvidia-smi verwenden.

---

## High Priority Issues

### BUG-003: Metrics Collector - nvidia-smi nicht verfügbar (HIGH)

**Severity**: HIGH
**Component**: metrics-collector
**Status**: Service läuft, aber GPU-Metriken nicht verfügbar

**Beschreibung**:
Der Metrics Collector kann keine GPU-Statistiken erfassen, weil nvidia-smi im Container nicht verfügbar ist.

**Symptome**:
```
2025-11-26 17:41:05,728 - gpu-monitor - ERROR - Fallback GPU stats failed: [Errno 2] No such file or directory: 'nvidia-smi'
```

**API-Responses**:
- `GET /api/gpu` → HTTP 503 Service Unavailable
- `GET /api/metrics/live` → `"gpu": 0` (immer 0)

**Root Cause**:
Der `metrics-collector` Container hat keinen Zugriff auf nvidia-smi, obwohl der Container mit NVIDIA Runtime läuft.

**Diagnose**:
```bash
$ docker exec metrics-collector which nvidia-smi
# Kein Output → nvidia-smi nicht im PATH

$ docker exec metrics-collector ls /usr/bin/nvidia-smi
# ls: cannot access '/usr/bin/nvidia-smi': No such file or directory
```

**Lösung**:

**Option A - NVML Python Bindings nutzen (Empfohlen)**:
Die GPU Monitor Datei unterstützt bereits pynvml, aber es ist nicht installiert.

**File**: `/home/arasul/arasul/arasul-jet/services/metrics-collector/requirements.txt`

Hinzufügen:
```
nvidia-ml-py3==12.535.161
```

**File**: `/home/arasul/arasul/arasul-jet/services/metrics-collector/Dockerfile`

Sicherstellen, dass Requirements installiert werden:
```dockerfile
RUN pip install --no-cache-dir -r requirements.txt
```

**Option B - nvidia-smi im Container verfügbar machen**:
```yaml
# docker-compose.yml
volumes:
  - /usr/bin/nvidia-smi:/usr/bin/nvidia-smi:ro
```

**Validation**:
Nach dem Fix sollte:
- `GET /api/gpu` → HTTP 200 mit GPU Stats
- Logs zeigen: "NVML initialized successfully. Found 1 GPU(s)"

---

### BUG-004: Dashboard Backend - Service Status gibt "unknown" zurück (HIGH)

**Severity**: HIGH
**Component**: dashboard-backend
**Affected Endpoints**: `/api/system/status`, `/api/services`

**Beschreibung**:
Der Dashboard Backend kann den Status aller Services nicht korrekt ermitteln. Alle Services werden als "unknown" angezeigt.

**Symptome**:
```json
{
  "status": "OK",
  "llm": "unknown",
  "embeddings": "unknown",
  "n8n": "unknown",
  "minio": "unknown",
  "postgres": "unknown",
  "self_healing_active": false,
  "timestamp": "2025-11-26T17:43:20.608Z"
}
```

**Expected**:
```json
{
  "status": "OK",
  "llm": "unhealthy",        // wegen BUG-001
  "embeddings": "healthy",
  "n8n": "healthy",
  "minio": "healthy",
  "postgres": "healthy",
  "self_healing_active": true,
  "timestamp": "..."
}
```

**Root Cause**:
Mögliche Ursachen (erfordert Code-Analyse):
1. Docker API Integration funktioniert nicht
2. Service Health Check Endpoints werden nicht korrekt abgefragt
3. Network Connectivity zwischen dashboard-backend und anderen Services

**Diagnose benötigt**:
```bash
# Dashboard Backend Logs durchsuchen
docker compose logs dashboard-backend | grep -i "service\|health\|status"

# Prüfen ob dockerode funktioniert
docker exec dashboard-backend node -e "const Docker = require('dockerode'); const docker = new Docker(); docker.ping().then(console.log).catch(console.error);"
```

**Files to Check**:
- `/home/arasul/arasul/arasul-jet/services/dashboard-backend/src/routes/system.js`
- `/home/arasul/arasul/arasul-jet/services/dashboard-backend/src/routes/services.js`
- `/home/arasul/arasul/arasul-jet/services/dashboard-backend/src/services/dockerManager.js`

---

### BUG-005: Self-Healing Engine - self_healing_active ist false (HIGH)

**Severity**: HIGH
**Component**: self-healing-agent
**Related to**: BUG-004

**Beschreibung**:
Die Self-Healing Engine läuft (laut Logs und Container Status), aber das Dashboard Backend meldet `self_healing_active: false`.

**Symptome**:
```json
// API Response
{
  "self_healing_active": false,
  "last_self_healing_event": "Self-Healing Engine v2.0 started successfully"
}
```

**Expected**:
```json
{
  "self_healing_active": true,
  "last_self_healing_event": "Self-Healing Engine v2.0 started successfully"
}
```

**Diagnose**:
```bash
$ docker ps --filter name=self-healing-agent --format "{{.Status}}"
Up 9 minutes (healthy)

$ docker exec self-healing-agent ps aux | grep healing_engine.py
root  15  0.2  0.0  53924 36924 ?  S  17:33  0:01 python3 healing_engine.py
```

Der Self-Healing Agent läuft definitiv!

**Root Cause**:
Das Dashboard Backend ermittelt den Self-Healing Status vermutlich über:
1. Container Status Check (korrekt)
2. Oder: Database Query auf `self_healing_events` Tabelle
3. Oder: Direkter Health Endpoint beim Self-Healing Agent (existiert nicht?)

**Lösung**:
Option A: Container Status nutzen (falls noch nicht implementiert)
```javascript
// dashboard-backend
const container = docker.getContainer('self-healing-agent');
const info = await container.inspect();
const isHealthy = info.State.Health?.Status === 'healthy';
```

Option B: Self-Healing Agent Endpoint hinzufügen:
```python
# services/self-healing-agent/healing_engine.py
@app.route('/api/status')
def get_status():
    return jsonify({
        'active': True,
        'last_run': last_check_time,
        'healthy': True
    })
```

---

## Medium Priority Issues

### BUG-006: n8n - Mehrere Deprecation Warnings (MEDIUM)

**Severity**: MEDIUM
**Component**: n8n
**Impact**: Keine Funktionseinschränkung, aber zukünftige Kompatibilitätsprobleme

**Beschreibung**:
n8n meldet 4 Deprecation Warnings für Environment Variables.

**Warnings**:
```
1. DB_SQLITE_POOL_SIZE -> Running SQLite without a pool of read connections is deprecated
2. N8N_RUNNERS_ENABLED -> Running n8n without task runners is deprecated
3. N8N_BLOCK_ENV_ACCESS_IN_NODE -> Default will change from false to true
4. N8N_GIT_NODE_DISABLE_BARE_REPOS -> Support for bare repos will be removed
```

**Lösung**:
**File**: `/home/arasul/arasul/arasul-jet/.env` (oder docker-compose.yml environment)

Hinzufügen:
```bash
# n8n Configuration
DB_SQLITE_POOL_SIZE=5
N8N_RUNNERS_ENABLED=true
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
N8N_GIT_NODE_DISABLE_BARE_REPOS=true
N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
```

---

### BUG-007: Reverse Proxy - HTTP zu HTTPS Redirect ohne gültiges Zertifikat (MEDIUM)

**Severity**: MEDIUM
**Component**: reverse-proxy (Traefik)
**Impact**: Externe Zugriffe funktionieren nicht ohne `-k` Flag

**Beschreibung**:
Traefik erzwingt HTTPS-Redirect, aber es sind keine gültigen TLS-Zertifikate konfiguriert.

**Symptome**:
```bash
$ curl http://localhost/api/health
Moved Permanently

$ curl https://localhost/api/health
curl: (60) SSL certificate problem: self-signed certificate
```

**Erwartetes Verhalten**:
Für eine lokale Edge-AI-Appliance sollte HTTP standardmäßig erlaubt sein, oder:
- Self-signed Zertifikate sollten automatisch generiert werden
- Let's Encrypt sollte optional für Geräte mit Internet-Zugang sein

**Lösung**:

**Option A - HTTP erlauben (für lokalen Zugriff)**:
**File**: `/home/arasul/arasul/arasul-jet/config/traefik.yml`

```yaml
entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"

# HTTP Redirect OPTIONAL machen
http:
  redirections:
    entryPoint:
      to: websecure
      scheme: https
      permanent: false  # Kein permanenter Redirect
```

**Option B - Self-signed Cert generieren**:
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /home/arasul/arasul/arasul-jet/config/selfsigned.key \
  -out /home/arasul/arasul/arasul-jet/config/selfsigned.crt \
  -subj "/CN=arasul.local"
```

Dann in Traefik konfigurieren.

---

### BUG-008: Embedding Service - Latenz über Spezifikation (MEDIUM)

**Severity**: MEDIUM
**Component**: embedding-service
**Impact**: Performance unterhalb der Spezifikation

**Beschreibung**:
Embedding Service Latenz liegt bei 140-160ms, aber die Spezifikation fordert <50ms.

**Gemessen**:
```
2025-11-26 17:41:36,137 - embedding-service - INFO - Generated 1 embeddings in 141.24ms
2025-11-26 17:41:36,137 - embedding-service - INFO - Generated 1 embeddings in 148.32ms
2025-11-26 17:41:36,139 - embedding-service - INFO - Generated 1 embeddings in 151.85ms
```

**Spezifikation** (laut CLAUDE.md):
> embedding-service Health Check: test vectorization <50ms

**Root Cause**:
Mögliche Ursachen:
1. Model lädt bei jedem Request neu (Cold Start)
2. GPU wird nicht optimal genutzt
3. Batch Processing overhead
4. CPU statt GPU Inferenz

**Lösung**:
Erfordert Profiling und Performance-Analyse:

1. **Prüfen ob GPU genutzt wird**:
```python
# In embedding_server.py
import torch
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"Device: {model.device}")
```

2. **Model Warmup beim Start**:
```python
# Beim Start einmal dummy embedding erzeugen
model.encode(["warmup"], convert_to_tensor=True)
```

3. **Benchmark durchführen**:
```bash
docker exec embedding-service python3 -c "
import time
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('all-MiniLM-L6-v2')
start = time.time()
model.encode(['test'])
print(f'Time: {(time.time()-start)*1000:.2f}ms')
"
```

**File**: `/home/arasul/arasul/arasul-jet/services/embedding-service/embedding_server.py`

---

## Low Priority Issues

### BUG-009: Frontend - HTTP zu HTTPS Redirect (LOW)

**Severity**: LOW
**Component**: dashboard-frontend
**Related to**: BUG-007

**Beschreibung**:
Frontend ist über HTTP nicht direkt erreichbar wegen Traefik Redirect.

**Lösung**: Siehe BUG-007

---

## System Health Summary

| Component            | Status    | Health | Issues                        |
|----------------------|-----------|--------|-------------------------------|
| postgres-db          | Up        | ✅ Healthy | None                          |
| minio                | Up        | ✅ Healthy | None                          |
| metrics-collector    | Up        | ⚠️ Degraded | BUG-003 (GPU nicht verfügbar) |
| llm-service          | Up        | ❌ Unhealthy | BUG-001, BUG-002 (keine Models)|
| embedding-service    | Up        | ⚠️ Degraded | BUG-008 (langsam)             |
| reverse-proxy        | Up        | ✅ Healthy | BUG-007 (TLS Config)          |
| dashboard-backend    | Up        | ⚠️ Degraded | BUG-004, BUG-005 (Status API) |
| dashboard-frontend   | Up        | ✅ Healthy | None                          |
| n8n                  | Up        | ⚠️ Degraded | BUG-006 (Warnings)            |
| self-healing-agent   | Up        | ✅ Healthy | BUG-005 (Status Reporting)    |

---

## Recommendations

### Sofortmaßnahmen (Fix vor Deployment):

1. **BUG-001 beheben**: LLM Modell automatisch laden beim Start
2. **BUG-003 beheben**: pynvml in metrics-collector installieren
3. **BUG-002 beheben**: Health Check für Jetson kompatibel machen
4. **BUG-004 untersuchen**: Dashboard Backend Service Status Logik prüfen

### Kurz-/Mittelfristig:

5. **BUG-006**: n8n Environment Variables konfigurieren
6. **BUG-007**: TLS-Strategie festlegen (HTTP erlauben oder Self-signed Cert)
7. **BUG-008**: Embedding Performance optimieren
8. **BUG-005**: Self-Healing Status Reporting fixen

### Testing vor Production:

- [ ] Alle Health Checks grün
- [ ] LLM Inference Test mit echtem Modell
- [ ] Embedding Performance <50ms
- [ ] Dashboard zeigt korrekte Service Status
- [ ] Self-Healing aktiv und funktionsfähig
- [ ] GPU Monitoring funktioniert
- [ ] Frontend erreichbar über konfigurierten Endpunkt

---

## Additional Notes

### GPU Status
```
NVIDIA-SMI 540.4.0
Driver Version: 540.4.0
CUDA Version: 12.6
GPU: Orin (nvgpu)
Status: Available (No running processes)
```

### Database Schema
Alle 31 Tabellen korrekt erstellt:
- Metrics Tables: ✅
- Self-Healing Tables: ✅
- Update Tables: ✅
- Admin/Auth Tables: ✅

### Docker Network
Network `arasul-net` (172.30.0.0/24) funktioniert korrekt.

### Container Resource Usage
Alle Container innerhalb der definierten Limits (Prüfung über `docker stats`).

---

**Report Generated**: 2025-11-26T17:43:00Z
**Next Review**: Nach Bug-Fixes, vor Production Deployment
