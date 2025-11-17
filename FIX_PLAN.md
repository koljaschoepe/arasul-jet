# Arasul Platform - Complete Fix Plan

**Erstellt**: 2025-11-17
**Basis**: CODEBASE_ANALYSIS_REPORT.md (78 Issues)
**Geschätzte Gesamtdauer**: 2-3 Wochen

---

## Inhaltsverzeichnis

- [Phase 0: System Lauffähig Machen (P0)](#phase-0-p0) - Tasks 1-5 (2-3 Stunden)
- [Phase 1: Kritische Sicherheit & Stabilität (P1)](#phase-1-p1) - Tasks 6-13 (1-2 Tage)
- [Phase 2: Performance & PRD Compliance (P2)](#phase-2-p2) - Tasks 14-20 (2-3 Tage)
- [Phase 3: Technische Schulden (P3)](#phase-3-p3) - Tasks 21-60 (1 Woche)
- [Phase 4: Code Quality (P4)](#phase-4-p4) - Tasks 61-78 (1 Woche)

---

# Phase 0: System Lauffähig Machen (P0 - SOFORT) {#phase-0-p0}

**Ziel**: System kann überhaupt starten
**Dauer**: 2-3 Stunden
**Blocker**: Ja - ohne diese Fixes startet nichts

## Task 1: TLS Private Key generieren
**Issue**: CRITICAL-INFRA-001
**File**: `config/traefik/certs/arasul.key` (fehlt)
**Aufwand**: 5 Minuten

```bash
cd /Users/koljaschope/Documents/dev/ara/arasul-jet

# Self-signed certificate für Development
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout config/traefik/certs/arasul.key \
  -out config/traefik/certs/arasul.crt \
  -subj "/CN=arasul.local/O=Arasul Platform/C=DE"

# Permissions
chmod 600 config/traefik/certs/arasul.key
chmod 644 config/traefik/certs/arasul.crt
```

**Validierung**:
```bash
ls -la config/traefik/certs/
# Sollte zeigen: arasul.key (600), arasul.crt (644)

openssl x509 -in config/traefik/certs/arasul.crt -text -noout | grep CN
# Sollte zeigen: CN = arasul.local
```

---

## Task 2: .env File mit sicheren Secrets erstellen
**Issue**: CRITICAL-INFRA-002
**File**: `.env` (fehlt)
**Aufwand**: 15 Minuten

```bash
cd /Users/koljaschope/Documents/dev/ara/arasul-jet

# Kopiere Template
cp .env.template .env

# Generiere sichere Secrets
export JWT_SECRET=$(openssl rand -base64 32)
export POSTGRES_PASSWORD=$(openssl rand -base64 24)
export ADMIN_PASSWORD=$(openssl rand -base64 16)
export MINIO_ROOT_PASSWORD=$(openssl rand -base64 24)
export N8N_ENCRYPTION_KEY=$(openssl rand -base64 32)
export N8N_BASIC_AUTH_PASSWORD=$(openssl rand -base64 16)

# Ersetze Placeholders (macOS sed syntax)
sed -i '' "s|__JWT_SECRET_PLACEHOLDER__|$JWT_SECRET|g" .env
sed -i '' "s|__POSTGRES_PASSWORD_PLACEHOLDER__|$POSTGRES_PASSWORD|g" .env
sed -i '' "s|__ADMIN_PASSWORD_PLACEHOLDER__|$ADMIN_PASSWORD|g" .env
sed -i '' "s|__MINIO_ROOT_PASSWORD_PLACEHOLDER__|$MINIO_ROOT_PASSWORD|g" .env
sed -i '' "s|__N8N_ENCRYPTION_KEY_PLACEHOLDER__|$N8N_ENCRYPTION_KEY|g" .env
sed -i '' "s|__N8N_BASIC_AUTH_PASSWORD_PLACEHOLDER__|$N8N_BASIC_AUTH_PASSWORD|g" .env

# Permissions
chmod 600 .env
```

**Wichtig**: Speichere Passwörter sicher!
```bash
echo "=== GENERATED CREDENTIALS ===" > CREDENTIALS.txt
echo "Admin Password: $ADMIN_PASSWORD" >> CREDENTIALS.txt
echo "Postgres Password: $POSTGRES_PASSWORD" >> CREDENTIALS.txt
echo "MinIO Password: $MINIO_ROOT_PASSWORD" >> CREDENTIALS.txt
echo "n8n Password: $N8N_BASIC_AUTH_PASSWORD" >> CREDENTIALS.txt
chmod 600 CREDENTIALS.txt
```

---

## Task 3: Fehlende Host-Verzeichnisse anlegen
**Issue**: CRITICAL-INFRA-003
**Files**: `/arasul/*`, `./data/*`, `./logs/*`
**Aufwand**: 10 Minuten

```bash
cd /Users/koljaschope/Documents/dev/ara/arasul-jet

# System-Verzeichnisse (require sudo auf macOS)
sudo mkdir -p /arasul/{logs,config,data,cache,updates,bootstrap}
sudo mkdir -p /arasul/data/{postgres,minio,models,n8n}
sudo mkdir -p /arasul/logs/service

# Ownership
sudo chown -R $USER:staff /arasul

# Projekt-Verzeichnisse
mkdir -p ./data/{updates,backups}
mkdir -p ./logs

# Permissions
chmod 755 /arasul
chmod 755 /arasul/logs
chmod 700 /arasul/config  # Secrets
chmod 755 ./data
```

---

## Task 4: req.file Bug in update.js fixen
**Issue**: CRITICAL-BACKEND-001
**File**: `services/dashboard-backend/src/routes/update.js:124`
**Aufwand**: 2 Minuten

**Kontext**: Line 56 wurde zu `multer.fields()` geändert, aber Line 124 referenziert noch `req.file` (singular).

**VORHER** (Line 124):
```javascript
size: req.file.size,  // BUG: req.file ist undefined
```

**NACHHER**:
```javascript
size: uploadedFile.size,  // uploadedFile bereits auf Line 69 definiert
```

**Manuelle Änderung** mit Edit tool oder direkt in Editor.

---

## Task 5: AI Models vorinstallieren (Offline-First)
**Issue**: CRITICAL-AI-001, CRITICAL-AI-002
**Aufwand**: 1-2 Stunden (Model Downloads)

### 5a: LLM Service Dockerfile

**File**: `services/llm-service/Dockerfile`
**Nach Line 24** hinzufügen:

```dockerfile
# Pre-load default model for offline-first operation
ENV OLLAMA_MODELS=/models
RUN mkdir -p /models

# Start Ollama, pull model, stop server
RUN /bin/bash -c "ollama serve & \
    SERVER_PID=\$! && \
    sleep 10 && \
    OLLAMA_HOST=http://localhost:11434 ollama pull \${DEFAULT_MODEL_NAME:-mistral} && \
    kill \$SERVER_PID && \
    wait \$SERVER_PID 2>/dev/null || true"
```

### 5b: LLM Service entrypoint.sh

**File**: `services/llm-service/entrypoint.sh`
**Nach Line 14** hinzufügen:

```bash
# Verify models are available offline
echo "Checking if default model is available..."
if ! ls /models/*.gguf 2>/dev/null | grep -q .; then
    echo "ERROR: No models found in /models/"
    echo "This violates offline-first principle. Models must be pre-installed."
    exit 1
fi
echo "✓ Models available offline"
```

### 5c: Embedding Service Dockerfile

**File**: `services/embedding-service/Dockerfile`
**Nach Line 27** hinzufügen:

```dockerfile
# Pre-download embedding model
ARG EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
RUN python3 -c "from sentence_transformers import SentenceTransformer; \
    print('Downloading embedding model...'); \
    model = SentenceTransformer('${EMBEDDING_MODEL_NAME}'); \
    print('Model cached successfully')"
```

### 5d: Embedding Service GPU Enforcement

**File**: `services/embedding-service/embedding_server.py`
**Lines 44-52 ersetzen**:

```python
# VORHER:
if not torch.cuda.is_available():
    logger.warning("No GPU detected, using CPU. Performance may be degraded.")
    self.device = "cpu"

# NACHHER:
if not torch.cuda.is_available():
    logger.critical("GPU not available. GPU is REQUIRED for production.")
    logger.critical("Set ALLOW_CPU_FALLBACK=true in .env to override (NOT RECOMMENDED)")

    if os.getenv('ALLOW_CPU_FALLBACK', 'false').lower() != 'true':
        raise RuntimeError("GPU not available - cannot start embedding service")

    logger.warning("ALLOW_CPU_FALLBACK enabled - using CPU (performance degraded)")
    self.device = "cpu"
else:
    self.device = "cuda"
    logger.info(f"✓ GPU available: {torch.cuda.get_device_name(0)}")
```

### 5e: Rebuild Images

```bash
docker-compose build --no-cache llm-service embedding-service
# Dies dauert lange (mehrere GB Downloads)
```

---

## Phase 0 Abschluss-Validierung

```bash
cd /Users/koljaschope/Documents/dev/ara/arasul-jet

# Alle kritischen Files vorhanden?
test -f config/traefik/certs/arasul.key && echo "✓ TLS key exists"
test -f .env && echo "✓ .env exists"
test -d /arasul/logs && echo "✓ /arasul/logs exists"
test -d ./data/updates && echo "✓ ./data/updates exists"

# Code-Fixes angewendet?
grep -q "size: uploadedFile.size" services/dashboard-backend/src/routes/update.js && echo "✓ req.file bug fixed"

# Docker Images gebaut?
docker images | grep -q arasul-jet-llm-service && echo "✓ LLM service image exists"
docker images | grep -q arasul-jet-embedding-service && echo "✓ Embedding service image exists"

echo ""
echo "=== Phase 0 Complete ==="
echo "System should now be able to start."
echo "Test with: docker-compose up -d"
```

---

# Phase 1: Kritische Sicherheit & Stabilität (P1) {#phase-1-p1}

**Ziel**: System sicher und stabil
**Dauer**: 1-2 Tage
**Blocker**: Nein, aber Sicherheitsrisiken

## Task 6: Content Security Policy implementieren
**Issue**: CRITICAL-FRONTEND-001
**Aufwand**: 15 Minuten

### 6a: nginx.conf CSP Header

**File**: `services/dashboard-frontend/nginx.conf`
**Nach Line 26** hinzufügen:

```nginx
# Content Security Policy
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://arasul.local wss://arasul.local http://localhost:3001 ws://localhost:3001; font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self';" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

**Explanation**:
- `script-src 'unsafe-inline'`: React benötigt inline scripts
- `connect-src ws://`: WebSocket metrics stream
- `img-src data:`: Base64-encoded images

### 6b: Traefik Middleware

**File**: `config/traefik/dynamic/middlewares.yml`
**Lines 44-56 erweitern**:

```yaml
security-headers:
  headers:
    frameDeny: true
    browserXssFilter: true
    contentTypeNosniff: true
    stsSeconds: 31536000
    stsIncludeSubdomains: true
    stsPreload: true
    customResponseHeaders:
      X-Robots-Tag: "noindex, nofollow"
      X-Download-Options: "noopen"
      X-Permitted-Cross-Domain-Policies: "none"
      Content-Security-Policy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:;"
      Referrer-Policy: "strict-origin-when-cross-origin"
```

**Validierung**:
```bash
docker-compose build dashboard-frontend
docker-compose up -d dashboard-frontend
sleep 5
curl -I http://localhost:3000 | grep -i "content-security-policy"
```

---

## Task 7: XSS Protection via JSON.parse Validation
**Issue**: CRITICAL-FRONTEND-002
**File**: `services/dashboard-frontend/src/App.js`
**Aufwand**: 20 Minuten

### 7a: localStorage User Data Validation

**Lines 60-70 ersetzen**:

```javascript
// VORHER:
const storedUser = localStorage.getItem('arasul_user');
if (token && storedUser) {
  setIsAuthenticated(true);
  setUser(JSON.parse(storedUser));
}

// NACHHER:
const storedUser = localStorage.getItem('arasul_user');
if (token && storedUser) {
  try {
    const userData = JSON.parse(storedUser);

    // Validate structure
    if (!userData || typeof userData.username !== 'string' || typeof userData.id !== 'number') {
      throw new Error('Invalid user data structure');
    }

    // Sanitize strings
    const sanitizedUser = {
      id: parseInt(userData.id),
      username: String(userData.username).replace(/[<>"'&]/g, '').substring(0, 100),
      email: userData.email ? String(userData.email).replace(/[<>"'&]/g, '').substring(0, 200) : ''
    };

    setUser(sanitizedUser);
    setIsAuthenticated(true);
  } catch (error) {
    console.error('Failed to parse stored user data:', error);
    localStorage.removeItem('arasul_user');
    localStorage.removeItem('arasul_token');
    setIsAuthenticated(false);
  }
}
```

### 7b: WebSocket Metrics Validation

**Lines 181-190 ersetzen**:

```javascript
// VORHER:
websocket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (!data.error) {
      setMetrics(data);
    }
  } catch (error) {
    console.error('Failed to parse WebSocket message:', error);
  }
};

// NACHHER:
websocket.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);

    // Validate structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid metrics data');
    }

    if (data.error) {
      console.error('Metrics error:', data.error);
      return;
    }

    // Validate and sanitize numeric fields
    const validatedMetrics = {
      cpu: parseFloat(data.cpu) || 0,
      ram: parseFloat(data.ram) || 0,
      gpu: parseFloat(data.gpu) || 0,
      temperature: parseFloat(data.temperature) || 0,
      disk: parseFloat(data.disk) || 0,
      timestamp: data.timestamp || new Date().toISOString()
    };

    // Range checks
    if (validatedMetrics.cpu < 0 || validatedMetrics.cpu > 100) validatedMetrics.cpu = 0;
    if (validatedMetrics.ram < 0 || validatedMetrics.ram > 100) validatedMetrics.ram = 0;
    if (validatedMetrics.gpu < 0 || validatedMetrics.gpu > 100) validatedMetrics.gpu = 0;
    if (validatedMetrics.temperature < 0 || validatedMetrics.temperature > 200) validatedMetrics.temperature = 0;

    setMetrics(validatedMetrics);
  } catch (error) {
    console.error('Failed to parse WebSocket message:', error);
  }
};
```

---

## Task 8: CSRF Protection implementieren
**Issue**: CRITICAL-FRONTEND-003
**Aufwand**: 30 Minuten

### 8a: Install Dependencies

```bash
cd services/dashboard-backend
npm install csurf cookie-parser
```

### 8b: Configure Backend

**File**: `services/dashboard-backend/src/index.js`
**Nach Line 2** hinzufügen:

```javascript
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
```

**Nach Line 15** (vor Routes):

```javascript
// CSRF middleware setup
app.use(cookieParser());

app.use(cors({
  origin: process.env.DASHBOARD_FRONTEND_URL || 'http://localhost:3000',
  credentials: true,  // Wichtig für CSRF Cookies
  maxAge: 86400
}));

const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// CSRF Token Endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

### 8c: Protect Routes

**State-changing Routes schützen**:

**File**: `services/dashboard-backend/src/routes/update.js`

Route-Export ändern zu:
```javascript
module.exports = (requireAuth, csrfProtection) => {
  const router = express.Router();

  // Protect state-changing routes
  router.post('/apply', requireAuth, csrfProtection, async (req, res) => {
    // ... existing code
  });

  router.post('/upload', requireAuth, csrfProtection, upload.fields([...]), async (req, res) => {
    // ... existing code
  });

  return router;
};
```

**In index.js Routes einbinden** (Line ~50):
```javascript
app.use('/api/update', updateRoutes(requireAuth, csrfProtection));
```

**Ähnlich für**:
- `routes/auth.js` - POST /change-password
- `routes/services.js` - POST /restart, DELETE /models/:name
- `routes/llm.js` - POST /chat

### 8d: Frontend Integration

**File**: `services/dashboard-frontend/src/App.js`

**State hinzufügen** (Line ~54):
```javascript
const [csrfToken, setCsrfToken] = useState(null);
```

**Nach Login CSRF Token holen**:
```javascript
const handleLoginSuccess = async (userData) => {
  setUser(userData.user);
  setIsAuthenticated(true);
  localStorage.setItem('arasul_token', userData.token);
  localStorage.setItem('arasul_user', JSON.stringify(userData.user));

  // Fetch CSRF token
  try {
    const response = await axios.get(`${API_BASE}/csrf-token`, {
      headers: { Authorization: `Bearer ${userData.token}` }
    });
    setCsrfToken(response.data.csrfToken);
    axios.defaults.headers.common['X-CSRF-Token'] = response.data.csrfToken;
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
  }
};
```

---

## Task 9: WebSocket Authentication
**Issue**: HIGH-BACKEND-004
**File**: `services/dashboard-backend/src/index.js`
**Aufwand**: 20 Minuten

**Lines 86-135 komplett ersetzen**:

```javascript
const { verifyToken } = require('./utils/jwt');

wss.on('connection', async (ws, req) => {
  let intervalId = null;
  let authenticated = false;

  try {
    // Extract token from query string
    const urlParams = new URL(req.url, 'ws://localhost').searchParams;
    const token = urlParams.get('token');

    if (!token) {
      logger.warn('WebSocket connection attempt without token');
      ws.close(1008, 'Authentication required');
      return;
    }

    // Verify JWT
    const decoded = await verifyToken(token);
    authenticated = true;

    logger.info(`WebSocket authenticated: ${decoded.username}`);

    // Metrics sender
    const sendMetrics = async () => {
      if (!authenticated || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        const metricsData = {
          cpu: await getCpuMetrics(),
          ram: await getRamMetrics(),
          gpu: await getGpuMetrics(),
          temperature: await getTemperatureMetrics(),
          disk: await getDiskMetrics(),
          timestamp: new Date().toISOString()
        };

        ws.send(JSON.stringify(metricsData));
      } catch (error) {
        logger.error(`Error sending metrics: ${error.message}`);
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    // Start interval after auth
    intervalId = setInterval(sendMetrics, 5000);
    await sendMetrics(); // Initial send

    // Cleanup handlers
    ws.on('close', (code) => {
      authenticated = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      logger.info(`WebSocket disconnected: ${decoded.username} (${code})`);
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error: ${error.message}`);
      authenticated = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    });

  } catch (error) {
    logger.error(`WebSocket auth failed: ${error.message}`);
    ws.close(1008, 'Invalid token');
  }
});
```

**Frontend Update** - `services/dashboard-frontend/src/App.js`:

```javascript
const connectWebSocket = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    const token = localStorage.getItem('arasul_token');
    if (!token) {
      console.error('No token for WebSocket');
      startHttpPolling();
      return;
    }

    // Include token in URL
    websocket = new WebSocket(`${WS_BASE}/metrics/live-stream?token=${encodeURIComponent(token)}`);

    websocket.onopen = () => {
      console.log('WebSocket connected (authenticated)');
      reconnectAttempts = 0;
      if (httpPollingInterval) {
        clearInterval(httpPollingInterval);
        httpPollingInterval = null;
      }
    };

    // ... rest of handlers
  } catch (error) {
    console.error('WebSocket error:', error);
    startHttpPolling();
  }
};
```

---

## Task 10: Self-Healing Escalation Loop Fix
**Issue**: CRITICAL-SH-001
**File**: `services/self-healing-agent/healing_engine.py`
**Aufwand**: 25 Minuten

### 10a: Cooldown in handle_category_a

**Lines 339-352 ersetzen**:

```python
def handle_category_a_service_down(self, service_name, status):
    """Handle Category A: Service Down with escalation."""
    failure_count = self.get_service_failure_count(service_name)

    # Check escalation cooldown
    cooldown_key = f'category_c_{service_name}'
    if cooldown_key in self.last_overload_actions:
        last_escalation = self.last_overload_actions[cooldown_key]
        cooldown_remaining = 3600 - (time.time() - last_escalation)  # 1h cooldown

        if cooldown_remaining > 0:
            logger.warning(
                f"Service {service_name} failing but in Category C cooldown "
                f"({cooldown_remaining:.0f}s remaining). Skipping escalation."
            )
            self.log_event(
                'category_a_cooldown',
                'warning',
                f'Service {service_name} in cooldown, basic restart only'
            )
            return self.restart_service(service_name)

    logger.warning(
        f"Service {service_name} unhealthy. "
        f"Status: {status.get('status')}, Health: {status.get('health')}. "
        f"Failures: {failure_count}"
    )

    if failure_count >= 3:
        logger.critical(
            f"Service {service_name} failed {failure_count} times. "
            f"Escalating to Category C."
        )
        self.log_event(
            'category_a_escalation',
            'critical',
            f'Service {service_name} escalated to Category C after {failure_count} failures'
        )

        # Set cooldown BEFORE escalation
        self.last_overload_actions[cooldown_key] = time.time()

        # Escalate
        self.handle_category_c_critical(f"Service {service_name} repeated failures")
        return

    # Regular Category A recovery
    # ... existing code
```

### 10b: Category C → D Escalation Check

**Lines 609-640 erweitern**:

```python
def handle_category_c_critical(self, reason="Multiple critical conditions"):
    """Handle Category C: Critical System Issues."""
    logger.critical(f"Category C triggered: {reason}")

    # Check recent Category C events
    recent_c_events = self.get_recent_critical_events(event_type='category_c', minutes=30)

    if recent_c_events >= 3:
        logger.critical(
            "3+ Category C events in 30 minutes. "
            "System unstable - escalating to Category D (Ultima Ratio)."
        )
        self.handle_category_d_reboot(reason="Repeated Category C failures")
        return

    # Log event
    self.log_event('category_c', 'critical', f'Critical recovery: {reason}')

    # ... existing Category C recovery logic
```

### 10c: Helper Function

**Nach Line 277 hinzufügen**:

```python
def get_recent_critical_events(self, event_type, minutes=30):
    """Get count of recent critical events."""
    try:
        query = """
            SELECT COUNT(*) as count
            FROM self_healing_events
            WHERE event_type = %s
              AND severity = 'critical'
              AND timestamp > NOW() - INTERVAL '%s minutes'
        """
        result = self.execute_query(query, (event_type, minutes))
        return result[0]['count'] if result else 0
    except Exception as e:
        logger.error(f"Failed to get recent critical events: {e}")
        return 0
```

---

## Task 11: GPU Recovery Schema Mismatch Fix
**Issue**: CRITICAL-SH-002
**File**: `services/self-healing-agent/healing_engine.py`
**Lines**: 1112-1121
**Aufwand**: 5 Minuten

**Problem**: `action_type_map` verwendet 'gpu_recovery' als Fallback, aber DB Schema erlaubt nur:
- 'restart', 'stop_start', 'llm_cache_clear', 'gpu_session_reset', 'gpu_reset', 'system_reboot'

**VORHER**:
```python
action_type_map = {
    'clear_cache': 'llm_cache_clear',
    'reset_session': 'gpu_session_reset',
    'restart_service': 'service_restart'
}
action_type = action_type_map.get(recovery_action, 'gpu_recovery')  # INVALID!
```

**NACHHER**:
```python
action_type_map = {
    'clear_cache': 'llm_cache_clear',
    'reset_session': 'gpu_session_reset',
    'restart_service': 'restart'
}
action_type = action_type_map.get(recovery_action, 'gpu_reset')  # VALID constraint value
```

---

## Task 12: PostgreSQL WAL Configuration
**Issue**: CRITICAL-DB-001
**Aufwand**: 20 Minuten

### 12a: Erstelle postgresql.conf

**Neue Datei**: `services/postgres/conf/postgresql.conf`

```ini
# PostgreSQL Configuration for Arasul Platform
# WAL Configuration (PRD Requirement)

# WAL Settings
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /arasul/data/postgres/archive/%f && cp %p /arasul/data/postgres/archive/%f'
max_wal_size = 4GB
min_wal_size = 1GB
checkpoint_completion_target = 0.9
wal_compression = on

# Connection Settings
max_connections = 100
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 16MB

# Autovacuum (already configured per-table, these are globals)
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min

# Logging
log_destination = 'stderr'
logging_collector = on
log_directory = '/var/log/postgresql'
log_filename = 'postgresql-%Y-%m-%d.log'
log_rotation_age = 1d
log_rotation_size = 50MB
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_duration = off
log_lock_waits = on
log_statement = 'ddl'
log_temp_files = 0

# Performance
random_page_cost = 1.1  # For SSD
effective_io_concurrency = 200  # For SSD
```

### 12b: Archive Directory erstellen

```bash
sudo mkdir -p /arasul/data/postgres/archive
sudo chown -R 999:999 /arasul/data/postgres/archive  # Postgres UID
```

### 12c: docker-compose.yml anpassen

**File**: `docker-compose.yml`
**Service postgres-db** - Volume hinzufügen (Line ~75):

```yaml
postgres-db:
  volumes:
    - ./services/postgres/init:/docker-entrypoint-initdb.d:ro
    - ./services/postgres/conf/postgresql.conf:/etc/postgresql/postgresql.conf:ro  # NEU
    - arasul-postgres-data:/var/lib/postgresql/data
    - /arasul/data/postgres/archive:/arasul/data/postgres/archive  # NEU - WAL archive
  command: postgres -c config_file=/etc/postgresql/postgresql.conf  # NEU
```

**Validierung**:
```bash
docker-compose up -d postgres-db
docker exec postgres-db psql -U arasul -d arasul_db -c "SHOW wal_level;"
# Sollte: replica

docker exec postgres-db psql -U arasul -d arasul_db -c "SHOW archive_mode;"
# Sollte: on
```

---

## Task 13: Database Cleanup Functions schedulen
**Issue**: CRITICAL-DB-002
**Aufwand**: 15 Minuten

**Problem**: Cleanup-Funktionen definiert aber nie ausgeführt.

### 13a: Scheduled Cleanup in Backend

**File**: `services/dashboard-backend/src/index.js`
**Nach Server-Start** (Line ~150):

```javascript
// Schedule database cleanup tasks
setInterval(async () => {
  try {
    logger.info('Running scheduled database cleanup...');

    // Auth cleanup
    await db.query('SELECT cleanup_expired_auth_data()');

    // Update cleanup
    await db.query('SELECT cleanup_old_update_files()');
    await db.query('SELECT cleanup_old_update_events()');

    // Metrics cleanup (bereits in cleanup_old_metrics(), aber sicherstellen)
    await db.query('SELECT cleanup_old_metrics()');

    logger.info('Database cleanup completed successfully');
  } catch (error) {
    logger.error(`Database cleanup failed: ${error.message}`);
  }
}, 3600000);  // Jede Stunde

// Initial cleanup beim Start (nach 60s delay)
setTimeout(async () => {
  try {
    await db.query('SELECT cleanup_expired_auth_data()');
    await db.query('SELECT cleanup_old_update_files()');
    await db.query('SELECT cleanup_old_update_events()');
    logger.info('Initial database cleanup completed');
  } catch (error) {
    logger.error(`Initial cleanup failed: ${error.message}`);
  }
}, 60000);
```

### 13b: Logging für Cleanup

**Optional**: Cleanup-Statistiken loggen:

```javascript
const result = await db.query('SELECT cleanup_expired_auth_data()');
logger.info(`Cleaned up auth data: ${result.rows[0].cleanup_expired_auth_data} rows`);
```

**Validierung**:
```bash
# Check logs nach 1 Stunde
docker-compose logs dashboard-backend | grep "Database cleanup"
# Sollte: "Database cleanup completed successfully"
```

---

# Phase 2: Performance & PRD Compliance (P2) {#phase-2-p2}

**Ziel**: System erfüllt Performance-Specs und PRD-Requirements
**Dauer**: 2-3 Tage

## Task 14: Port Mismatch Dashboard Frontend Fix
**Issue**: HIGH-INFRA-004
**File**: `docker-compose.yml`
**Line**: 362
**Aufwand**: 2 Minuten

**Problem**: Traefik Label sagt Port 80, aber nginx lauscht auf 3000.

**VORHER**:
```yaml
traefik.http.services.dashboard-frontend.loadbalancer.server.port=80
```

**NACHHER**:
```yaml
traefik.http.services.dashboard-frontend.loadbalancer.server.port=3000
```

---

## Task 15: LLM/Embedding Healthcheck Conflicts Fix
**Issue**: HIGH-INFRA-005
**Files**: `docker-compose.yml` Lines 172-177, 218-222
**Aufwand**: 10 Minuten

### 15a: LLM Service Healthcheck

**VORHER**:
```yaml
healthcheck:
  test: ["CMD", "/bin/bash", "/healthcheck.sh"]
  timeout: 5s
  start_period: 300s
```

**NACHHER**:
```yaml
healthcheck:
  test: ["CMD", "/bin/bash", "/healthcheck.sh"]
  timeout: 10s
  interval: 30s
  retries: 3
  start_period: 120s  # Reduziert von 300s
```

### 15b: Embedding Service Healthcheck

**VORHER**:
```yaml
healthcheck:
  test: ["CMD", "/bin/bash", "/healthcheck.sh"]
  timeout: 5s
  start_period: 300s
```

**NACHHER**:
```yaml
healthcheck:
  test: ["CMD", "/bin/bash", "/healthcheck.sh"]
  timeout: 10s
  interval: 15s
  retries: 3
  start_period: 90s  # Schneller als LLM
```

---

## Task 16: Hardcoded Credentials in Traefik entfernen
**Issue**: HIGH-INFRA-006
**File**: `config/traefik/dynamic/middlewares.yml`
**Lines**: 156-173
**Aufwand**: 20 Minuten

### 16a: Environment Variables nutzen

**VORHER**:
```yaml
basicAuth-traefik:
  basicAuth:
    users:
      - "admin:$apr1$H6uskkkW$IgXLP6ewTrSuBkTrqE8wj/"  # admin:arasul123
```

**NACHHER**:
```yaml
basicAuth-traefik:
  basicAuth:
    users:
      - "{{env \"TRAEFIK_ADMIN_HASH\"}}"

basicAuth-n8n:
  basicAuth:
    users:
      - "{{env \"N8N_ADMIN_HASH\"}}"
```

### 16b: .env.template erweitern

**File**: `.env.template`
**Hinzufügen**:

```bash
# Traefik Dashboard Auth (htpasswd format)
TRAEFIK_ADMIN_HASH=__TRAEFIK_ADMIN_HASH_PLACEHOLDER__

# n8n Basic Auth (bcrypt format)
N8N_ADMIN_HASH=__N8N_ADMIN_HASH_PLACEHOLDER__
```

### 16c: Bootstrap-Script anpassen

**Task 2 erweitern** - Nach Secret-Generierung:

```bash
# Generate htpasswd hash for Traefik
export TRAEFIK_ADMIN_HASH=$(htpasswd -nbB admin "$ADMIN_PASSWORD" | sed 's/:/\\:/g')
sed -i '' "s|__TRAEFIK_ADMIN_HASH_PLACEHOLDER__|$TRAEFIK_ADMIN_HASH|g" .env

# Generate bcrypt hash for n8n (same password)
export N8N_ADMIN_HASH=$(htpasswd -nbB admin "$N8N_BASIC_AUTH_PASSWORD" | sed 's/:/\\:/g')
sed -i '' "s|__N8N_ADMIN_HASH_PLACEHOLDER__|$N8N_ADMIN_HASH|g" .env
```

---

## Task 17: Dashboard Frontend fehlende Dependencies
**Issue**: MEDIUM-INFRA-007
**File**: `docker-compose.yml`
**Lines**: 342-368
**Aufwand**: 3 Minuten

**VORHER** (keine depends_on):
```yaml
dashboard-frontend:
  build: ./services/dashboard-frontend
  container_name: dashboard-frontend
  # KEINE depends_on
```

**NACHHER**:
```yaml
dashboard-frontend:
  build: ./services/dashboard-frontend
  container_name: dashboard-frontend
  depends_on:
    reverse-proxy:
      condition: service_healthy
    postgres-db:
      condition: service_healthy
```

---

## Task 18: LLM Healthcheck zu tolerant
**Issue**: HIGH-AI-003
**File**: `services/llm-service/healthcheck.sh`
**Lines**: 100-136
**Aufwand**: 15 Minuten

### 18a: Spezifisches Modell prüfen

**Lines 100-136 ersetzen**:

```bash
# VORHER: Akzeptiert JEDES Modell
LOADED_MODELS=$(echo "$TAGS_RESPONSE" | jq -r '.models | length')

# NACHHER: Prüfe spezifisches Modell
EXPECTED_MODEL="${DEFAULT_MODEL_NAME:-mistral}"
LOADED_MODEL=$(echo "$TAGS_RESPONSE" | jq -r '.models[0].name')

if [ "$LOADED_MODEL" != "$EXPECTED_MODEL" ]; then
    echo "ERROR: Wrong model loaded: $LOADED_MODEL (expected $EXPECTED_MODEL)"
    exit 1
fi

echo "✓ Correct model loaded: $LOADED_MODEL"
```

### 18b: Response Time auf PRD-Spec reduzieren

**Line 138**:

```bash
# VORHER
MAX_RESPONSE_TIME_MS=5000

# NACHHER (PRD: <2s)
MAX_RESPONSE_TIME_MS=2000
```

---

## Task 19: GPU Memory Management
**Issue**: HIGH-AI-004
**File**: `services/llm-service/api_server.py`
**Lines**: 179-221
**Aufwand**: 20 Minuten

### 19a: Verify Memory Release

**Nach Line 202** (nach cache clear success):

```python
# Verify GPU memory was actually freed
try:
    import pynvml
    pynvml.nvmlInit()
    handle = pynvml.nvmlDeviceGetHandleByIndex(0)
    mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
    mem_used_gb = mem_info.used / (1024**3)

    logger.info(f"GPU memory after cache clear: {mem_used_gb:.2f}GB used")

    # Warn if still high usage
    if mem_used_gb > 35:  # LLM should use max 32GB
        logger.warning(f"GPU memory still high after cache clear: {mem_used_gb:.2f}GB")
        return jsonify({
            'success': True,
            'message': 'Cache cleared but GPU memory still high',
            'gpu_memory_gb': mem_used_gb
        }), 200

except Exception as e:
    logger.error(f"Failed to check GPU memory: {e}")

return jsonify({
    'success': True,
    'message': 'LLM cache cleared successfully',
    'gpu_memory_gb': mem_used_gb if 'mem_used_gb' in locals() else None
}), 200
```

### 19b: Add pynvml to requirements

**File**: `services/llm-service/requirements.txt`

```txt
flask==3.0.0
requests==2.31.0
nvidia-ml-py==12.535.133  # NEU - pynvml
```

---

## Task 20: Jetson GPU Throttling Fix
**Issue**: HIGH-SH-004
**File**: `services/self-healing-agent/gpu_recovery.py`
**Lines**: 212-234
**Aufwand**: 25 Minuten

### 20a: Jetson-spezifisches Throttling

**Lines 212-234 ersetzen**:

```python
def throttle_gpu(self):
    """Throttle GPU to reduce temperature."""
    try:
        # Try nvidia-smi first (won't work on Jetson but try anyway)
        result = subprocess.run(
            ['nvidia-smi', '--power-limit=80'],
            capture_output=True,
            timeout=5
        )

        if result.returncode == 0:
            logger.info("GPU throttled via nvidia-smi")
            return True

    except Exception as e:
        logger.warning(f"nvidia-smi throttle failed: {e}, trying Jetson method")

    # Jetson-specific throttling
    return self._throttle_gpu_jetson()

def _throttle_gpu_jetson(self):
    """Jetson AGX Orin specific GPU throttling."""
    try:
        # Check if we're on Jetson
        if not os.path.exists('/sys/kernel/debug/bpmp/debug/clk/gpu/rate'):
            logger.error("Not running on Jetson platform")
            return False

        # Read current GPU frequency
        with open('/sys/kernel/debug/bpmp/debug/clk/gpu/rate', 'r') as f:
            current_freq = int(f.read().strip())

        logger.info(f"Current GPU frequency: {current_freq / 1e6:.0f} MHz")

        # Reduce to 800 MHz (from max ~1.3GHz)
        throttled_freq = 800000000  # 800 MHz

        subprocess.run(
            ['sudo', 'bash', '-c', f'echo {throttled_freq} > /sys/kernel/debug/bpmp/debug/clk/gpu/rate'],
            check=True,
            timeout=5
        )

        logger.info(f"GPU frequency reduced to {throttled_freq / 1e6:.0f} MHz")

        # Enable fan at high speed
        subprocess.run(['jetson_clocks', '--fan'], check=True, timeout=5)
        logger.info("Fan enabled at high speed")

        return True

    except Exception as e:
        logger.error(f"Jetson GPU throttling failed: {e}")
        return False
```

### 20b: Dockerfile Permissions

**File**: `services/self-healing-agent/Dockerfile`
**Nach Line 15**:

```dockerfile
# Need sudo for GPU frequency control on Jetson
RUN apt-get update && apt-get install -y sudo && rm -rf /var/lib/apt/lists/*
```

### 20c: docker-compose.yml

**Capabilities erweitern** (bereits vorhanden, aber sicherstellen):

```yaml
self-healing-agent:
  cap_add:
    - SYS_ADMIN  # Required for GPU frequency control
```

---

# Phase 3: Technische Schulden (P3) {#phase-3-p3}

**Ziel**: Codequalität, Wartbarkeit, Best Practices
**Dauer**: 1 Woche
**Aufwand**: ~40 Tasks

## Task 21: Retention Policy Standardisierung
**Issue**: HIGH-DB-003
**File**: `services/postgres/init/001_init_schema.sql`
**Lines**: 148-156
**Aufwand**: 5 Minuten

**VORHER**:
```sql
DELETE FROM self_healing_events WHERE timestamp < NOW() - INTERVAL '30 days';
DELETE FROM service_restarts WHERE timestamp < NOW() - INTERVAL '30 days';
```

**NACHHER**:
```sql
DELETE FROM self_healing_events WHERE timestamp < NOW() - INTERVAL '7 days';
DELETE FROM service_restarts WHERE timestamp < NOW() - INTERVAL '7 days';
```

---

## Task 22: Autovacuum für alle High-Write Tables
**Issue**: HIGH-DB-004
**File**: `services/postgres/init/001_init_schema.sql`
**Nach Line 285**
**Aufwand**: 10 Minuten

```sql
-- Autovacuum for high-write tables (zusätzlich zu metrics_*)

-- workflow_activity
ALTER TABLE workflow_activity SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_vacuum_cost_delay = 10,
    autovacuum_vacuum_cost_limit = 1000
);

-- self_healing_events (sehr frequent!)
ALTER TABLE self_healing_events SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

-- service_failures (alle 10s bei Problemen)
ALTER TABLE service_failures SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

-- recovery_actions
ALTER TABLE recovery_actions SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);
```

---

## Task 23: Composite Indexes für Performance
**Issue**: MEDIUM-DB-006
**File**: `services/postgres/init/003_self_healing_schema.sql`
**Nach Line 24**
**Aufwand**: 5 Minuten

```sql
-- Composite index for get_service_failure_count query
CREATE INDEX idx_service_failures_name_time
ON service_failures(service_name, timestamp DESC);

-- Can drop separate indexes if composite covers usage
-- DROP INDEX idx_service_failures_name;
-- DROP INDEX idx_service_failures_timestamp;
```

---

## Task 24: Redundante created_at Spalten entfernen
**Issue**: MEDIUM-DB-005
**Files**: Alle Schema-Dateien
**Aufwand**: 30 Minuten

**Migration**: Neue Datei `services/postgres/init/005_remove_redundant_created_at.sql`

```sql
-- Remove redundant created_at columns
-- All tables have timestamp column which serves same purpose

ALTER TABLE metrics_cpu DROP COLUMN IF EXISTS created_at;
ALTER TABLE metrics_ram DROP COLUMN IF EXISTS created_at;
ALTER TABLE metrics_gpu DROP COLUMN IF EXISTS created_at;
ALTER TABLE metrics_temperature DROP COLUMN IF EXISTS created_at;
ALTER TABLE metrics_disk DROP COLUMN IF EXISTS created_at;

ALTER TABLE workflow_activity DROP COLUMN IF EXISTS created_at;
ALTER TABLE self_healing_events DROP COLUMN IF EXISTS created_at;
ALTER TABLE service_failures DROP COLUMN IF EXISTS created_at;
ALTER TABLE recovery_actions DROP COLUMN IF EXISTS created_at;

-- Token tables keep created_at as it's semantically different from expiry
-- ALTER TABLE token_blacklist DROP COLUMN IF EXISTS created_at;  -- Keep
-- ALTER TABLE active_sessions DROP COLUMN IF EXISTS created_at;  -- Keep
```

---

## Task 25: Backend Memory Leak - WebSocket Interval
**Issue**: CRITICAL-BACKEND-002
**File**: `services/dashboard-backend/src/index.js`
**Lines**: 86-135
**Aufwand**: Bereits in Task 9 gefixt

**Hinweis**: Task 9 (WebSocket Authentication) hat diesen Bug bereits behoben durch:
- Interval wird erst NACH erfolgreicher Auth erstellt
- Interval wird bei Error, Close und unauth cleared
- Kein orphaned interval mehr möglich

---

## Task 26: Input Validation auf Query Parameters
**Issue**: HIGH-BACKEND-003
**File**: `services/dashboard-backend/src/routes/selfhealing.js`
**Lines**: 24-40
**Aufwand**: 10 Minuten

**VORHER**:
```javascript
const {
    limit = 20,
    offset = 0,
    severity = null,
    event_type = null,
    since = null
} = req.query;
```

**NACHHER**:
```javascript
// Validate and sanitize query parameters
const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 1000);
const offset = Math.max(parseInt(req.query.offset) || 0, 0);

// Whitelist for severity
const validSeverities = ['info', 'warning', 'error', 'critical'];
const severity = req.query.severity && validSeverities.includes(req.query.severity)
    ? req.query.severity
    : null;

// Whitelist for event_type
const validEventTypes = ['category_a', 'category_b', 'category_c', 'category_d', 'gpu_recovery'];
const event_type = req.query.event_type && validEventTypes.includes(req.query.event_type)
    ? req.query.event_type
    : null;

// Validate timestamp format
let since = null;
if (req.query.since) {
    const sinceDate = new Date(req.query.since);
    if (!isNaN(sinceDate.getTime())) {
        since = sinceDate.toISOString();
    }
}
```

---

## Task 27: Connection Pool Limits für Jetson
**Issue**: MEDIUM-BACKEND-005
**File**: `services/dashboard-backend/src/database.js`
**Lines**: 17-19
**Aufwand**: 2 Minuten

**VORHER**:
```javascript
max: parseInt(process.env.POSTGRES_POOL_MAX || '20'),
```

**NACHHER**:
```javascript
max: parseInt(process.env.POSTGRES_POOL_MAX || '10'),  // Optimized for Jetson
```

**Und in .env.template**:
```bash
# Connection Pool (optimized for Jetson AGX Orin)
POSTGRES_POOL_MAX=10
```

---

## Task 28: Backend No Request Body Size Limit
**Issue**: FRONTEND-BUG-004 / BACKEND
**File**: `services/dashboard-backend/src/index.js`
**Line**: 25
**Aufwand**: 2 Minuten

**VORHER**:
```javascript
app.use(express.json());
```

**NACHHER**:
```javascript
app.use(express.json({ limit: '10mb' }));  // Prevent DoS via large payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

---

## Task 29: Backend Missing Graceful Shutdown
**Issue**: FRONTEND-BUG-002 / BACKEND
**File**: `services/dashboard-backend/src/index.js`
**Nach Server-Start**
**Aufwand**: 15 Minuten

```javascript
// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown...');

  // Close WebSocket server
  if (wss) {
    wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });
    wss.close(() => {
      logger.info('WebSocket server closed');
    });
  }

  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close database pool
  try {
    await db.closePool();
    logger.info('Database pool closed');
  } catch (error) {
    logger.error(`Error closing database pool: ${error.message}`);
  }

  // Exit
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(0);
  }, 10000);  // Force exit after 10s
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  process.emit('SIGTERM');
});
```

---

## Task 30: Embedding Batch Limit Hardcoded
**Issue**: MEDIUM-AI-005
**File**: `services/embedding-service/embedding_server.py`
**Lines**: 150-155
**Aufwand**: 5 Minuten

**VORHER**:
```python
if len(texts) > 100:
    return jsonify({'error': 'Too many texts. Maximum 100 per request'}), 400
```

**NACHHER**:
```python
MAX_BATCH_SIZE = int(os.getenv('MAX_EMBEDDING_BATCH_SIZE', '100'))

if len(texts) > MAX_BATCH_SIZE:
    return jsonify({
        'error': f'Too many texts. Maximum {MAX_BATCH_SIZE} per request'
    }), 400
```

**In .env.template**:
```bash
# Embedding Service
MAX_EMBEDDING_BATCH_SIZE=100
```

---

## Task 31: Metrics Collector Failure Silent Override
**Issue**: CRITICAL-SH-003
**File**: `services/self-healing-agent/healing_engine.py`
**Lines**: 232-242
**Aufwand**: 15 Minuten

**VORHER**:
```python
def get_metrics(self):
    try:
        response = requests.get(f'{self.metrics_url}/api/metrics/live', timeout=5)
        return response.json()
    except Exception as e:
        return {'cpu': 0, 'ram': 0, 'gpu': 0, 'temperature': 0}  # PROBLEM!
```

**NACHHER**:
```python
def __init__(self):
    # ... existing init
    self.last_successful_metrics_time = time.time()
    self.metrics_collector_down_alerted = False

def get_metrics(self):
    try:
        response = requests.get(f'{self.metrics_url}/api/metrics/live', timeout=5)
        metrics = response.json()

        # Update last successful time
        self.last_successful_metrics_time = time.time()
        self.metrics_collector_down_alerted = False

        return metrics

    except Exception as e:
        logger.error(f"Metrics collector unavailable: {e}")

        # Check if down for too long
        downtime = time.time() - self.last_successful_metrics_time

        if downtime > 60 and not self.metrics_collector_down_alerted:
            logger.critical("Metrics collector down >1min - escalating to Category C")
            self.metrics_collector_down_alerted = True
            self.handle_category_c_critical("Metrics collector unavailable")

        # Return None instead of zeros
        return None

def check_overload_conditions(self):
    """Check for resource overload."""
    metrics = self.get_metrics()

    # Skip if metrics unavailable
    if metrics is None:
        logger.warning("Skipping overload check - metrics unavailable")
        return

    # ... existing overload checks
```

---

## Task 32: USB Monitor Hardcoded Password
**Issue**: MEDIUM-SH-006
**File**: `services/self-healing-agent/usb_monitor.py`
**Lines**: 215-222
**Aufwand**: 5 Minuten

**VORHER**:
```python
password = os.getenv('ADMIN_PASSWORD', 'admin')  # Fallback dangerous!
```

**NACHHER**:
```python
password = os.getenv('ADMIN_PASSWORD')
if not password:
    logger.critical("ADMIN_PASSWORD not set in environment")
    logger.critical("Cannot process USB updates without admin password")
    return False

logger.info("Using admin credentials for USB update")
```

---

## Task 33: Frontend Race Condition WebSocket Reconnect
**Issue**: HIGH-FRONTEND-005
**File**: `services/dashboard-frontend/src/App.js`
**Lines**: 148, 162-246
**Aufwand**: 10 Minuten

**VORHER** (Line 148):
```javascript
const startHttpPolling = () => {
  console.log('Starting HTTP polling...');
  httpPollingInterval = setInterval(async () => {
    // ...
  }, 5000);
};
```

**NACHHER**:
```javascript
const startHttpPolling = () => {
  // Clear any existing interval first
  if (httpPollingInterval) {
    clearInterval(httpPollingInterval);
    httpPollingInterval = null;
  }

  console.log('Starting HTTP polling...');
  httpPollingInterval = setInterval(async () => {
    try {
      const response = await axios.get(`${API_BASE}/metrics/live`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('arasul_token')}` }
      });
      setMetrics(response.data);
    } catch (error) {
      console.error('HTTP polling error:', error);
    }
  }, 5000);
};

const connectWebSocket = () => {
  // Clear existing reconnect timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // ... rest of WebSocket setup
};
```

---

## Task 34: CORS Wildcard Fix
**Issue**: HIGH-FRONTEND-004
**File**: `config/traefik/dynamic/middlewares.yml`
**Lines**: 67-68
**Aufwand**: 3 Minuten

**VORHER**:
```yaml
accessControlAllowOriginList:
  - "*"  # Adjust for production
```

**NACHHER**:
```yaml
accessControlAllowOriginList:
  - "https://arasul.local"
  - "http://arasul.local"
  - "https://{{env \"SYSTEM_DOMAIN\"}}"
accessControlAllowCredentials: true
```

---

## Task 35: Frontend Missing File Upload Validation
**Issue**: MEDIUM-FRONTEND-BUG-004
**File**: `services/dashboard-frontend/src/components/UpdatePage.js`
**Lines**: 67-78
**Aufwand**: 10 Minuten

**VORHER**:
```javascript
const handleFileSelect = (event) => {
  const file = event.target.files[0];
  if (file && file.name.endsWith('.araupdate')) {
    setSelectedFile(file);
  } else {
    setErrorMessage('Please select a valid .araupdate file');
  }
};
```

**NACHHER**:
```javascript
const MAX_UPDATE_SIZE = 10 * 1024 * 1024 * 1024;  // 10GB

const handleFileSelect = (event) => {
  const file = event.target.files[0];

  if (!file) return;

  // Check extension
  if (!file.name.endsWith('.araupdate')) {
    setErrorMessage('Please select a valid .araupdate file');
    setSelectedFile(null);
    return;
  }

  // Check size
  if (file.size > MAX_UPDATE_SIZE) {
    setErrorMessage(`File too large. Maximum size is ${MAX_UPDATE_SIZE / 1024 / 1024 / 1024}GB`);
    setSelectedFile(null);
    return;
  }

  // Check not empty
  if (file.size === 0) {
    setErrorMessage('File is empty');
    setSelectedFile(null);
    return;
  }

  setSelectedFile(file);
  setErrorMessage('');
  setSuccessMessage(`Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
};
```

---

## Task 36-60: Weitere Medium/Low Priority Fixes

**Aufgrund der Länge hier eine Übersicht der verbleibenden P3 Tasks**:

- **Task 36**: No GPU Memory Limits (docker-compose CUDA_MEM_LIMIT)
- **Task 37**: Resource Limits fehlen für minio, reverse-proxy, etc.
- **Task 38**: Database Connection Pool Stats exposed (bereits gut implementiert)
- **Task 39**: Logging Configuration Inconsistency
- **Task 40**: MINIO Healthcheck Path Inconsistency
- **Task 41**: Service Health Check ignores starting containers
- **Task 42**: Hard Restart doesn't wait for services
- **Task 43**: Disk Cleanup uses unsafe find command
- **Task 44**: Temperature Thresholds don't match PRD
- **Task 45**: Missing Timeout on LLM API calls
- **Task 46**: Insufficient Validation on Model Names
- **Task 47**: Inconsistent Error Message Format
- **Task 48**: Magic Numbers in Rate Limiting
- **Task 49**: Potential Memory Leak in Update Service
- **Task 50**: Missing Input Validation on Version Comparison
- **Task 51**: No Request ID Tracing
- **Task 52**: Inefficient History Query
- **Task 53**: Connection Pool Not Closed on Shutdown (teilweise in Task 29)
- **Task 54**: Container Restart Timeout Too Short
- **Task 55**: Missing Heartbeat Update After Actions
- **Task 56**: Circular Database Dependency
- **Task 57**: Periodic Cleanup runs too frequently
- **Task 58**: GPU Recovery Stats never reset
- **Task 59**: Overload Action Cooldown uses wrong key
- **Task 60**: Missing Validation in Post-Reboot Check

**Details für Tasks 36-60 verfügbar in CODEBASE_ANALYSIS_REPORT.md**

---

# Phase 4: Code Quality (P4) {#phase-4-p4}

**Ziel**: Code-Qualität, Best Practices, Dokumentation
**Dauer**: 1 Woche
**Tasks**: 61-78

## Übersicht P4 Tasks

**Task 61**: Inconsistent Logging Levels
**Task 62**: Start Script has no error handling
**Task 63**: Missing CORS Preflight Cache optimization
**Task 64**: No Connection Pooling stats exposed (gut implementiert)
**Task 65**: Cleanup Functions Not Atomic
**Task 66**: Missing Indexes for Foreign Key Relationships
**Task 67**: Security Issue: UPDATE_EVENTS lacks audit columns
**Task 68**: No Partition Strategy for High-Volume Tables
**Task 69**: Connection Pool Configuration missing
**Task 70**: No Manual Vacuum Scheduled (Task 12 teils behoben)
**Task 71**: Missing Constraints for Data Integrity
**Task 72**: Improper Index on Primary Key Timestamp
**Task 73**: Missing Network Creation in Bootstrap
**Task 74**: n8n Custom Nodes Build Failure Risk
**Task 75**: Postgres Healthcheck Missing Database Validation
**Task 76**: Self-Healing Agent Runs as Root (dokumentiert, by design)
**Task 77**: Docker Socket Exposed (dokumentiert, by design)
**Task 78**: No Secrets Management System

**Details für alle P4 Tasks in CODEBASE_ANALYSIS_REPORT.md**

---

# Zusammenfassung & Execution Order

## Empfohlene Ausführungsreihenfolge

### Tag 1: System zum Laufen bringen
1. **Phase 0 komplett** (Tasks 1-5) - 2-3 Stunden
2. **Test**: `docker-compose up -d`
3. **Smoke Test**: Dashboard erreichbar, Services starten

### Tag 2-3: Kritische Sicherheit
4. **Phase 1 Tasks 6-9** - CSP, XSS, CSRF, WebSocket Auth
5. **Test**: Security Headers, Authentication, CSRF Token
6. **Phase 1 Tasks 10-13** - Self-Healing, GPU Recovery, DB
7. **Test**: Healing Engine, Database Cleanup

### Tag 4-6: Performance & Compliance
8. **Phase 2 Tasks 14-20** - Port Fixes, Healthchecks, GPU Throttling
9. **Test**: Healthchecks, Traefik Routing, GPU Recovery
10. **Load Testing**: Metriken, WebSocket, AI Services

### Woche 2: Technische Schulden
11. **Phase 3 ausgewählte Tasks** (21-35) - Datenbank, Backend, Frontend
12. **Code Review** aller Änderungen
13. **Integration Tests**

### Woche 3: Polish & Documentation
14. **Phase 3 Rest** (36-60) - Wenn Zeit
15. **Phase 4** (61-78) - Best Practices, Dokumentation
16. **End-to-End Tests**
17. **Deployment Guide aktualisieren**

---

## Validierungs-Checkliste

### Nach Phase 0:
- [ ] System startet ohne Errors
- [ ] Alle Container sind healthy
- [ ] Dashboard erreichbar auf https://arasul.local
- [ ] Login funktioniert
- [ ] LLM/Embedding Services ohne Internet-Zugriff

### Nach Phase 1:
- [ ] Security Headers vorhanden (CSP, X-Frame-Options, etc.)
- [ ] XSS-Test schlägt fehl (payload wird sanitized)
- [ ] CSRF-Token erforderlich für state-changing requests
- [ ] WebSocket benötigt Auth Token
- [ ] Self-Healing Loop tritt nicht auf
- [ ] GPU Recovery loggt korrekt in DB
- [ ] WAL ist aktiviert
- [ ] DB Cleanup läuft stündlich

### Nach Phase 2:
- [ ] Dashboard Frontend Port korrekt geroutet
- [ ] Healthchecks realistic (nicht 5min start_period)
- [ ] Keine Hardcoded Credentials in Configs
- [ ] LLM Latency <2s
- [ ] GPU Throttling funktioniert auf Jetson
- [ ] Alle Dependencies korrekt

### Nach Phase 3:
- [ ] Retention Policy = 7 Tage überall
- [ ] Autovacuum auf allen high-write tables
- [ ] Input Validation auf allen Endpoints
- [ ] Connection Pool optimiert für Jetson
- [ ] Graceful Shutdown funktioniert
- [ ] Keine Memory Leaks

### Nach Phase 4:
- [ ] Code Review abgeschlossen
- [ ] Dokumentation aktualisiert
- [ ] Security Audit durchgeführt
- [ ] Performance Benchmarks erfüllt
- [ ] 30-Tage Stabilitätstest gestartet

---

## Quick Reference: File Locations

### Kritische Files die geändert werden:

**Infrastructure**:
- `docker-compose.yml` - Dependencies, Ports, Healthchecks
- `config/traefik/certs/` - TLS Keys
- `config/traefik/dynamic/middlewares.yml` - Security Headers, Auth
- `.env` - Secrets (neu erstellen)

**Backend**:
- `services/dashboard-backend/src/index.js` - CSRF, WebSocket Auth, Cleanup
- `services/dashboard-backend/src/routes/update.js` - req.file Bug
- `services/dashboard-backend/src/routes/selfhealing.js` - Input Validation
- `services/dashboard-backend/src/database.js` - Pool Limits

**Frontend**:
- `services/dashboard-frontend/src/App.js` - XSS Protection, WebSocket, Race Conditions
- `services/dashboard-frontend/src/components/UpdatePage.js` - File Validation
- `services/dashboard-frontend/nginx.conf` - CSP Headers

**AI Services**:
- `services/llm-service/Dockerfile` - Model Pre-load
- `services/llm-service/entrypoint.sh` - Offline-First Check
- `services/llm-service/healthcheck.sh` - Timeout, Model Validation
- `services/llm-service/api_server.py` - GPU Memory Verification
- `services/embedding-service/Dockerfile` - Model Pre-load
- `services/embedding-service/embedding_server.py` - GPU Enforcement

**Self-Healing**:
- `services/self-healing-agent/healing_engine.py` - Escalation Loop, Metrics Fallback
- `services/self-healing-agent/gpu_recovery.py` - Jetson Throttling
- `services/self-healing-agent/usb_monitor.py` - Password Validation

**Database**:
- `services/postgres/init/001_init_schema.sql` - Retention, Autovacuum, Redundant Columns
- `services/postgres/init/003_self_healing_schema.sql` - Composite Indexes
- `services/postgres/init/005_remove_redundant_created_at.sql` - Migration (neu)
- `services/postgres/conf/postgresql.conf` - WAL Config (neu)

---

## Support & Troubleshooting

### Häufige Probleme:

**"TLS handshake failed"**
→ Task 1 nicht ausgeführt (arasul.key fehlt)

**"Environment variable not set"**
→ Task 2 nicht ausgeführt (.env fehlt oder incomplete)

**"Volume mount failed: no such file"**
→ Task 3 nicht ausgeführt (Verzeichnisse fehlen)

**"req.file is undefined"**
→ Task 4 nicht ausgeführt (update.js Bug)

**"Model download failed"**
→ Task 5 nicht vollständig (Internet während Build nötig)

**"WebSocket authentication required"**
→ Task 9 implementiert, Frontend muss Token mitsenden

**"CSRF token invalid"**
→ Task 8 implementiert, Frontend muss Token holen

**"GPU memory not released"**
→ Task 19 implementiert, prüfe Logs für Memory-Werte

**"Self-healing loop detected"**
→ Task 10 implementiert, prüfe Cooldown-Logs

---

## Maintenance After Fixes

**Wöchentlich**:
- DB Size prüfen: `docker exec postgres-db psql -U arasul -d arasul_db -c "SELECT pg_database_size('arasul_db');"`
- Logs prüfen: `docker-compose logs --tail=100 dashboard-backend self-healing-agent`
- Disk Usage: `df -h /arasul`

**Monatlich**:
- Security Updates: `docker-compose pull && docker-compose up -d`
- Backup PostgreSQL: `docker exec postgres-db pg_dump -U arasul arasul_db > backup.sql`
- Review Self-Healing Events: Dashboard → Self-Healing Page

**Bei Problemen**:
1. Check Container Health: `docker-compose ps`
2. Check Logs: `docker-compose logs <service-name>`
3. Check Resource Usage: `docker stats`
4. Check DB Size: `docker exec postgres-db psql -U arasul -d arasul_db -c "\dt+"`

---

**Ende des Fix Plans**

**Nächster Schritt**: Starte mit Phase 0, Task 1
