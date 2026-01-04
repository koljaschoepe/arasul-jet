# Arasul Platform - Umfassender Verbesserungsplan

**Erstellt**: 2026-01-04
**Analysiert von**: Claude Opus 4.5
**Scope**: Vollständige Codebase-Analyse mit 5 parallelen Deep-Dive-Untersuchungen
**Gesamtanalyse**: ~3.500 Zeilen Findings, 150+ Issues identifiziert

---

## Executive Summary

Die Arasul Platform ist eine solide Edge-AI-Appliance mit gut durchdachter Architektur. Nach umfassender Analyse aller Komponenten wurden **kritische Sicherheitslücken**, **Performance-Bottlenecks** und **fehlende Features** identifiziert, die vor Produktions-Skalierung adressiert werden müssen.

### Kritische Statistiken

| Kategorie | Kritisch | Hoch | Mittel | Niedrig |
|-----------|----------|------|--------|---------|
| Security | 8 | 12 | 15 | 5 |
| Performance | 3 | 10 | 18 | 8 |
| Features | 2 | 8 | 15 | 10 |
| Code-Qualität | 1 | 5 | 12 | 20 |
| **Gesamt** | **14** | **35** | **60** | **43** |

---

## Phase 1: Kritische Security-Fixes (Woche 1)

### 1.1 Command Injection in Settings API [KRITISCH]

**Problem**: `services/dashboard-backend/src/routes/settings.js:52-54`
```javascript
child_process.exec(`docker compose restart ${serviceName}`)
// serviceName kommt unvalidiert aus req.body - erlaubt Befehlsinjektion!
```

**Angriffsszenario**:
```bash
serviceName: "minio; rm -rf /"  # Löscht gesamtes Dateisystem
```

**Fix**:
```javascript
const ALLOWED_SERVICES = ['llm-service', 'embedding-service', 'n8n', 'minio', 'postgres-db'];
if (!ALLOWED_SERVICES.includes(serviceName)) {
  return res.status(400).json({ error: 'Invalid service name' });
}
// Verwende Array-Parameter statt String-Interpolation
const { execFile } = require('child_process');
execFile('docker', ['compose', 'restart', serviceName], callback);
```

**Aufwand**: 1 Stunde | **Priorität**: SOFORT

---

### 1.2 XSS-Schwachstelle in MarkdownEditor [KRITISCH]

**Problem**: `services/dashboard-frontend/src/components/MarkdownEditor.js:361`
```javascript
dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
// Regex-basierte HTML-Sanitization ist unzureichend!
```

**Angriffsszenario**:
```markdown
![alt](javascript:alert('XSS'))
[link](javascript:document.cookie)
```

**Fix**:
```bash
cd services/dashboard-frontend && npm install dompurify
```

```javascript
import DOMPurify from 'dompurify';

function markdownToHtml(markdown) {
  // ... existing conversion ...
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'strong', 'em'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class'],
    ALLOW_DATA_ATTR: false
  });
}
```

**Aufwand**: 2 Stunden | **Priorität**: SOFORT

---

### 1.3 Schwache Passwort-Anforderungen [KRITISCH]

**Problem**: `services/dashboard-backend/src/utils/password.js:10-18`
```javascript
// Nur 4 Zeichen Minimum, keine Komplexitätsanforderungen!
if (password.length < 4) return { valid: false, ... };
```

**OWASP-Empfehlung**: Minimum 12 Zeichen, Groß/Klein/Zahl/Sonderzeichen

**Fix**:
```javascript
function validatePasswordStrength(password) {
  const requirements = {
    minLength: password.length >= 12,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    noCommonPatterns: !/(123|abc|password|admin|qwerty)/i.test(password)
  };

  const passed = Object.values(requirements).filter(Boolean).length;
  return {
    valid: passed >= 5,
    score: passed,
    requirements
  };
}
```

**Aufwand**: 2 Stunden | **Priorität**: SOFORT

---

### 1.4 Token-Key Inkonsistenz (Bug) [KRITISCH]

**Problem**: `services/dashboard-frontend/src/components/PasswordManagement.js:39,111,139`
```javascript
localStorage.getItem('token')  // FALSCH!
// Rest der App verwendet 'arasul_token'
```

**Auswirkung**: Passwort-Management funktioniert nicht, da Token nie gefunden wird.

**Fix**:
```javascript
// Ersetze alle Vorkommen von 'token' mit 'arasul_token'
const token = localStorage.getItem('arasul_token');
```

**Aufwand**: 15 Minuten | **Priorität**: SOFORT

---

### 1.5 Klartext-Passwort in .env [HOCH]

**Problem**: `services/dashboard-backend/src/routes/settings.js:128-131`
```javascript
// Speichert Klartext-Passwort in .env ZUSÄTZLICH zum Hash in DB
await updateEnvVariable('ADMIN_PASSWORD', newPassword);
```

**Risiko**: Zwei Quellen der Wahrheit, Klartext in Konfigurationsdatei

**Fix**:
- Entferne ADMIN_PASSWORD aus .env komplett
- Speichere nur Hash in Datenbank
- Bootstrap generiert initialen Hash ohne Klartext-Speicherung

**Aufwand**: 3 Stunden | **Priorität**: Diese Woche

---

### 1.6 Document Upload Path Traversal [HOCH]

**Problem**: `services/dashboard-backend/src/routes/documents.js:280-281`
```javascript
// Filename kommt vom Client, kein Sanitizing!
const filename = req.file.originalname;
```

**Angriffsszenario**:
```
originalname: "../../../etc/passwd"
```

**Fix**:
```javascript
const path = require('path');
const sanitizedFilename = path.basename(req.file.originalname)
  .replace(/[^a-zA-Z0-9._-]/g, '_')
  .slice(0, 200);  // Längenbegrenzung
```

**Aufwand**: 1 Stunde | **Priorität**: Diese Woche

---

### 1.7 Fehlende CSRF-Protection [MITTEL]

**Problem**: Keine CSRF-Tokens bei POST/PUT/DELETE Requests

**Fix**:
```bash
cd services/dashboard-backend && npm install csurf
```

```javascript
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

app.use(csrfProtection);
app.use((req, res, next) => {
  res.cookie('XSRF-TOKEN', req.csrfToken());
  next();
});
```

**Aufwand**: 4 Stunden | **Priorität**: Woche 2

---

## Phase 2: Performance-Optimierung (Woche 2-3)

### 2.1 Fehlende Datenbank-Indizes [KRITISCH]

**Problem**: Langsame Abfragen ohne entsprechende Indizes

**Migration erstellen**: `services/postgres/init/010_performance_indexes.sql`

```sql
-- Dokumente: Filter + Sort
CREATE INDEX CONCURRENTLY idx_documents_category_uploaded
    ON documents(category_id, uploaded_at DESC)
    WHERE deleted_at IS NULL;

-- Dokumente: Volltextsuche (statt ILIKE)
CREATE INDEX CONCURRENTLY idx_documents_search
    ON documents
    USING GIN(to_tsvector('german', filename || ' ' || COALESCE(title, '')))
    WHERE deleted_at IS NULL;

-- Chat Messages: Conversation Load
CREATE INDEX CONCURRENTLY idx_chat_messages_conv_created
    ON chat_messages(conversation_id, created_at ASC);

-- LLM Jobs: Active Job Queries
CREATE INDEX CONCURRENTLY idx_llm_jobs_conv_status
    ON llm_jobs(conversation_id, status)
    WHERE status IN ('pending', 'streaming');

-- Login Attempts: Brute Force Detection
CREATE INDEX CONCURRENTLY idx_login_attempts_user_time
    ON login_attempts(username, attempted_at DESC)
    WHERE attempted_at > NOW() - INTERVAL '1 hour';

-- Metrics: Time-Series Queries
CREATE INDEX CONCURRENTLY idx_metrics_cpu_recent
    ON metrics_cpu(timestamp DESC)
    WHERE timestamp > NOW() - INTERVAL '7 days';
```

**Erwartete Verbesserung**: 10-100x schnellere Queries
**Aufwand**: 2 Stunden | **Priorität**: HOCH

---

### 2.2 Frontend Re-Render Optimierung [HOCH]

**Problem**: ChatMulti.js (1193 Zeilen) hat keine Memoization
- Jede State-Änderung rendert alle Messages neu
- Array-Index als Key (Anti-Pattern)

**Betroffene Dateien**:
- `ChatMulti.js`: handleSend, createNewChat, selectChat unmemoized
- `DocumentManager.js`: Keine useCallback für Event-Handler
- `App.js`: 9 Props an DashboardHome → ständige Re-Renders

**Fix-Strategie**:

```javascript
// ChatMulti.js - Memoize expensive functions
const handleSend = useCallback(async (message) => {
  // ... implementation
}, [currentChatId, ragEnabled]); // Only necessary deps

// Use proper keys for message list
{messages.map(msg => (
  <MessageItem key={msg.id || `temp-${msg.created_at}`} message={msg} />
))}

// Extract MessageItem as memoized component
const MessageItem = React.memo(({ message }) => {
  // ... render logic
});
```

**Aufwand**: 8 Stunden | **Priorität**: HOCH

---

### 2.3 RAG Hybrid Search implementieren [HOCH]

**Problem**: `services/dashboard-backend/src/routes/rag.js` - nur Vector-Suche
- Exakte Matches scheitern ("2024 Q3 Report" findet nichts)
- Kein Keyword-Fallback

**Aktuelle Implementierung**:
```javascript
// Nur Vektor-Suche (Line 91)
const searchResults = await searchQdrant(queryEmbedding, 5);
```

**Fix - Hybrid Search implementieren**:

```javascript
async function hybridSearch(query, embedding, topK = 5) {
  // 1. Vector Search
  const vectorResults = await searchQdrant(embedding, topK * 2);

  // 2. Keyword Search (PostgreSQL Full-Text)
  const keywordResults = await db.query(`
    SELECT d.id, d.filename, dc.text_content,
           ts_rank(to_tsvector('german', dc.text_content),
                   plainto_tsquery('german', $1)) as keyword_score
    FROM documents d
    JOIN document_chunks dc ON d.id = dc.document_id
    WHERE to_tsvector('german', dc.text_content) @@ plainto_tsquery('german', $1)
    ORDER BY keyword_score DESC
    LIMIT $2
  `, [query, topK * 2]);

  // 3. Reciprocal Rank Fusion
  const combined = reciprocalRankFusion(
    vectorResults.map(r => r.id),
    keywordResults.rows.map(r => r.id),
    k = 60  // RRF constant
  );

  return combined.slice(0, topK);
}
```

**Aufwand**: 6 Stunden | **Priorität**: HOCH

---

### 2.4 Token-Konvertierungs-Bug in Chunker [KRITISCH]

**Problem**: `services/document-indexer/text_chunker.py:86`
```python
max_words = int(max_tokens * 0.75)  # FALSCH!
# Standard: 1 Token ≈ 4 Zeichen oder 0.25 Wörter
# Dieser Fehler führt zu 3x zu großen Chunks!
```

**Auswirkung**: Chunks überschreiten Embedding-Token-Limit (4096)

**Fix**:
```python
# Korrektur: Token-zu-Zeichen Konvertierung
def chunk_by_tokens(text, max_tokens=500, overlap_tokens=50):
    """
    Chunk text by estimated token count.
    1 token ≈ 4 characters (tiktoken average for nomic-embed)
    """
    max_chars = max_tokens * 4  # Nicht * 0.75!
    overlap_chars = overlap_tokens * 4

    chunks = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        chunk = text[start:end]
        chunks.append(chunk)
        start = end - overlap_chars
    return chunks
```

**Aufwand**: 2 Stunden | **Priorität**: KRITISCH

---

### 2.5 Connection Pool Monitoring [MITTEL]

**Problem**: Pool-Erschöpfung wird nicht erkannt

**Fix** in `database.js`:
```javascript
// Health-Endpoint erweitern
async function getPoolHealth() {
  const stats = getPoolStats();
  const utilization = stats.totalCount / poolConfig.max;

  return {
    ...stats,
    utilization: Math.round(utilization * 100),
    healthy: utilization < 0.8 && stats.waitingCount < 5,
    warning: utilization >= 0.8 || stats.waitingCount >= 3,
    critical: utilization >= 0.95 || stats.waitingCount >= 10
  };
}

// Warnung bei hoher Auslastung
pool.on('acquire', () => {
  if (pool.totalCount > poolConfig.max * 0.8) {
    logger.warn(`Pool utilization high: ${pool.totalCount}/${poolConfig.max}`);
  }
});
```

**Aufwand**: 2 Stunden | **Priorität**: MITTEL

---

## Phase 3: Fehlende Features (Woche 3-4)

### 3.1 Conversation Memory für RAG [HOCH]

**Problem**: Jede RAG-Anfrage ist stateless - kein Kontext aus vorherigen Nachrichten

**Lösung**: Conversation Context Window

```javascript
// services/dashboard-backend/src/services/ragContextService.js
class RAGContextService {
  constructor() {
    this.contextWindow = 3;  // Letzte 3 Nachrichten
  }

  async buildContextPrompt(conversationId, currentQuery) {
    const recentMessages = await db.query(`
      SELECT role, content FROM chat_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [conversationId, this.contextWindow * 2]);

    // Build conversation context
    const context = recentMessages.rows.reverse()
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    return `Vorheriger Kontext:\n${context}\n\nAktuelle Frage: ${currentQuery}`;
  }
}
```

**Aufwand**: 4 Stunden | **Priorität**: HOCH

---

### 3.2 Graceful Shutdown [HOCH]

**Problem**: `services/dashboard-backend/src/index.js` - keine SIGTERM-Handler
- WebSocket-Verbindungen werden abrupt getrennt
- Datenbankverbindungen können leaken

**Fix**:
```javascript
// index.js - am Ende hinzufügen
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // 1. Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // 2. Close WebSocket connections gracefully
  wss.clients.forEach(client => {
    client.close(1001, 'Server shutting down');
  });

  // 3. Wait for in-flight requests (max 30s)
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 4. Close database pool
  await pool.end();
  logger.info('Database pool closed');

  process.exit(0);
}
```

**Aufwand**: 3 Stunden | **Priorität**: HOCH

---

### 3.3 Request Correlation IDs [MITTEL]

**Problem**: Logs können nicht über Services hinweg verfolgt werden

**Fix**:
```javascript
// middleware/correlationId.js
const { v4: uuidv4 } = require('uuid');

function correlationIdMiddleware(req, res, next) {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('X-Correlation-ID', req.correlationId);

  // Attach to logger context
  req.logger = logger.child({ correlationId: req.correlationId });

  next();
}

// In index.js
app.use(correlationIdMiddleware);

// In allen Route-Handlern
req.logger.info('Processing request', { endpoint: req.path });
```

**Aufwand**: 4 Stunden | **Priorität**: MITTEL

---

### 3.4 Input Validation Framework [MITTEL]

**Problem**: Ad-hoc Validierung in jedem Endpoint

**Lösung**: Zentralisierte Schema-Validierung mit Joi

```bash
cd services/dashboard-backend && npm install joi
```

```javascript
// middleware/validate.js
const Joi = require('joi');

const schemas = {
  login: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(12).required()
  }),

  chatMessage: Joi.object({
    message: Joi.string().min(1).max(10000).required(),
    conversationId: Joi.string().uuid().required(),
    ragEnabled: Joi.boolean().default(false)
  }),

  documentUpload: Joi.object({
    title: Joi.string().max(255),
    category_id: Joi.number().integer().positive(),
    tags: Joi.array().items(Joi.string().max(50)).max(10)
  })
};

function validate(schemaName) {
  return (req, res, next) => {
    const { error, value } = schemas[schemaName].validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    req.validatedBody = value;
    next();
  };
}

// Verwendung in Routes
router.post('/login', validate('login'), async (req, res) => {
  const { username, password } = req.validatedBody;
  // ...
});
```

**Aufwand**: 6 Stunden | **Priorität**: MITTEL

---

### 3.5 Audit-Log System [HOCH]

**Problem**: Keine zentrale Protokollierung von Änderungen

**Datenbank-Migration**: `011_audit_log.sql`
```sql
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
    ip_address INET,
    old_values JSONB,
    new_values JSONB,
    change_summary TEXT,
    status VARCHAR(20) DEFAULT 'success'
);

CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);

-- Retention: 1 Jahr
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;
```

**Backend-Service**:
```javascript
// services/auditService.js
class AuditService {
  async log(event) {
    const { eventType, resourceType, resourceId, userId, oldValues, newValues, ip } = event;

    await db.query(`
      INSERT INTO audit_log
      (event_type, resource_type, resource_id, user_id, ip_address, old_values, new_values)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [eventType, resourceType, resourceId, userId, ip, oldValues, newValues]);
  }
}

// Verwendung
await auditService.log({
  eventType: 'document.delete',
  resourceType: 'document',
  resourceId: documentId,
  userId: req.user.id,
  ip: req.ip,
  oldValues: { filename: doc.filename, title: doc.title }
});
```

**Aufwand**: 6 Stunden | **Priorität**: HOCH

---

### 3.6 Circuit Breaker Pattern [MITTEL]

**Problem**: Kaskaden-Failures wenn externe Services ausfallen

**Implementation**:
```javascript
// utils/circuitBreaker.js
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
      }
    }
    this.failureCount = 0;
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

// Verwendung für Embedding Service
const embeddingCircuit = new CircuitBreaker({ failureThreshold: 3, timeout: 60000 });

async function getEmbedding(text) {
  return embeddingCircuit.execute(async () => {
    return axios.post(`${EMBEDDING_URL}/embed`, { text }, { timeout: 10000 });
  });
}
```

**Aufwand**: 4 Stunden | **Priorität**: MITTEL

---

## Phase 4: Testing & Qualität (Woche 4-5)

### 4.1 Backend Unit Tests [KRITISCH]

**Problem**: KEINE Tests vorhanden trotz Jest-Konfiguration in package.json

**Prioritäts-Tests erstellen**:

```
services/dashboard-backend/src/
├── __tests__/
│   ├── auth.test.js         # JWT, Password, Login
│   ├── documents.test.js    # Upload, Delete, Search
│   ├── llmQueue.test.js     # Race Conditions
│   ├── database.test.js     # Connection Pool, Transactions
│   └── security.test.js     # SQL Injection, XSS, CSRF
```

**Beispiel**: `__tests__/auth.test.js`
```javascript
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/password');
const { generateToken, verifyToken } = require('../utils/jwt');

describe('Password Security', () => {
  test('rejects weak passwords', () => {
    expect(validatePasswordStrength('1234').valid).toBe(false);
    expect(validatePasswordStrength('password').valid).toBe(false);
    expect(validatePasswordStrength('Str0ng!Pass#2024').valid).toBe(true);
  });

  test('password hash is not reversible', async () => {
    const hash = await hashPassword('testPassword123!');
    expect(hash).not.toBe('testPassword123!');
    expect(hash).toMatch(/^\$2[aby]?\$\d+\$/);  // bcrypt format
  });

  test('verifies correct password', async () => {
    const hash = await hashPassword('correctPassword');
    expect(await verifyPassword('correctPassword', hash)).toBe(true);
    expect(await verifyPassword('wrongPassword', hash)).toBe(false);
  });
});

describe('JWT Security', () => {
  test('generates valid token', () => {
    const token = generateToken({ userId: 1, username: 'admin' });
    expect(token).toBeDefined();
    expect(token.split('.')).toHaveLength(3);
  });

  test('rejects expired token', async () => {
    // Create token with 1ms expiry
    const token = generateToken({ userId: 1 }, { expiresIn: '1ms' });
    await new Promise(r => setTimeout(r, 10));
    expect(() => verifyToken(token)).toThrow(/expired/i);
  });
});
```

**Coverage-Ziel**: 70% (wie in package.json konfiguriert)
**Aufwand**: 16 Stunden | **Priorität**: KRITISCH

---

### 4.2 Frontend Tests [HOCH]

**Komponenten-Tests erstellen**:
```
services/dashboard-frontend/src/
├── __tests__/
│   ├── Login.test.js
│   ├── ChatMulti.test.js
│   ├── DocumentManager.test.js
│   └── MarkdownEditor.test.js
```

**Beispiel**: `__tests__/Login.test.js`
```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../components/Login';

describe('Login Component', () => {
  test('shows error on empty submission', async () => {
    render(<Login onLogin={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /anmelden/i }));

    await waitFor(() => {
      expect(screen.getByText(/benutzername.*erforderlich/i)).toBeInTheDocument();
    });
  });

  test('calls onLogin with credentials', async () => {
    const mockLogin = jest.fn().mockResolvedValue({ success: true });
    render(<Login onLogin={mockLogin} />);

    fireEvent.change(screen.getByLabelText(/benutzername/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/passwort/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /anmelden/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin', 'password123');
    });
  });
});
```

**Aufwand**: 12 Stunden | **Priorität**: HOCH

---

### 4.3 Integration Tests [MITTEL]

```javascript
// __tests__/integration/rag.test.js
describe('RAG Pipeline Integration', () => {
  beforeAll(async () => {
    // Setup: Upload test document
    await uploadTestDocument('test-rag.pdf');
    await waitForIndexing();
  });

  test('retrieves relevant chunks for query', async () => {
    const response = await request(app)
      .post('/api/rag/query')
      .send({ query: 'Was ist im Testdokument?', conversationId: testConvId })
      .expect(200);

    expect(response.body.sources).toHaveLength(greaterThan(0));
    expect(response.body.sources[0].document_name).toBe('test-rag.pdf');
  });

  test('handles missing documents gracefully', async () => {
    const response = await request(app)
      .post('/api/rag/query')
      .send({ query: 'Nicht existierende Info', conversationId: testConvId })
      .expect(200);

    expect(response.body.fallback_response).toBe(true);
  });
});
```

**Aufwand**: 8 Stunden | **Priorität**: MITTEL

---

## Phase 5: Accessibility & UX (Woche 5-6)

### 5.1 ARIA Labels für Icon-Buttons [HOCH]

**Problem**: 50+ Icon-only Buttons ohne Beschreibung für Screenreader

**Betroffene Dateien**:
- `ChatMulti.js`: FiX, FiPlus, FiTrash2, FiSend
- `DocumentManager.js`: FiUpload, FiSearch, FiEye, FiTrash2
- `Settings.js`: Tab-Icons

**Fix-Muster**:
```javascript
// VORHER
<button onClick={handleDelete}><FiTrash2 /></button>

// NACHHER
<button
  onClick={handleDelete}
  aria-label="Dokument löschen"
  title="Dokument löschen"
>
  <FiTrash2 aria-hidden="true" />
</button>
```

**Aufwand**: 4 Stunden | **Priorität**: HOCH

---

### 5.2 Focus Management in Modals [MITTEL]

**Problem**: Modals trappen Focus nicht, Escape schließt nicht

**Fix**:
```javascript
// hooks/useFocusTrap.js
function useFocusTrap(isOpen) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    modal.addEventListener('keydown', handleKeyDown);
    return () => modal.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return modalRef;
}
```

**Aufwand**: 4 Stunden | **Priorität**: MITTEL

---

### 5.3 Copy-to-Clipboard für AI-Antworten [NIEDRIG]

**Feature**: Button zum Kopieren von AI-Responses

```javascript
// components/CopyButton.js
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? 'Kopiert!' : 'In Zwischenablage kopieren'}
      className="copy-button"
    >
      {copied ? <FiCheck /> : <FiCopy />}
    </button>
  );
}
```

**Aufwand**: 2 Stunden | **Priorität**: NIEDRIG

---

## Phase 6: Infrastructure & DevOps (Woche 6-7)

### 6.1 Docker Image Tags pinnen [MITTEL]

**Problem**: `docker-compose.yml` verwendet `:latest` Tags

```yaml
# VORHER
image: minio/minio:latest

# NACHHER (deterministische Builds)
image: minio/minio:RELEASE.2024-12-18T13-15-44Z
image: postgres:16.4-alpine3.20
image: traefik:v2.11.14
image: qdrant/qdrant:v1.12.5
```

**Aufwand**: 1 Stunde | **Priorität**: MITTEL

---

### 6.2 Backup-Strategie implementieren [HOCH]

**Problem**: Keine dokumentierte Backup-Prozedur

**Implementierung**:

```bash
#!/bin/bash
# scripts/backup.sh

BACKUP_DIR="/arasul/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 1. PostgreSQL Full Backup
docker exec postgres-db pg_dump -U arasul -F c arasul_db > "$BACKUP_DIR/postgres.dump"

# 2. Qdrant Snapshot
curl -X POST "http://localhost:6333/collections/documents/snapshots"

# 3. MinIO Backup (wichtige Buckets)
mc mirror minio/documents "$BACKUP_DIR/minio/documents"

# 4. Konfiguration
cp .env "$BACKUP_DIR/env.backup"

# 5. Compress
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

# 6. Upload to external storage (optional)
# mc cp "$BACKUP_DIR.tar.gz" remote/backups/

# 7. Cleanup old backups (keep 30 days)
find /arasul/backups -name "*.tar.gz" -mtime +30 -delete
```

**Cron-Job**:
```bash
# Täglich um 2:00 UTC
0 2 * * * /arasul/scripts/backup.sh >> /arasul/logs/backup.log 2>&1
```

**Aufwand**: 4 Stunden | **Priorität**: HOCH

---

### 6.3 Health Check Dashboard [MITTEL]

**Neuer Endpoint**: `/api/health/detailed`

```javascript
router.get('/health/detailed', async (req, res) => {
  const checks = await Promise.allSettled([
    checkPostgres(),
    checkQdrant(),
    checkEmbeddingService(),
    checkLLMService(),
    checkMinIO()
  ]);

  const results = {
    postgres: checks[0],
    qdrant: checks[1],
    embedding: checks[2],
    llm: checks[3],
    minio: checks[4]
  };

  const healthy = checks.every(c => c.status === 'fulfilled');

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    checks: results,
    timestamp: new Date().toISOString()
  });
});
```

**Aufwand**: 3 Stunden | **Priorität**: MITTEL

---

## Implementierungs-Checkliste

### Woche 1: Kritische Security
- [ ] Command Injection Fix (settings.js)
- [ ] XSS Fix mit DOMPurify (MarkdownEditor.js)
- [ ] Passwort-Stärke erhöhen (password.js)
- [ ] Token-Key Fix (PasswordManagement.js)
- [ ] Path Traversal Fix (documents.js)
- [ ] Klartext-Passwort entfernen

### Woche 2: Performance Basics
- [ ] Database Indizes erstellen
- [ ] Token-Konvertierung Fix (text_chunker.py)
- [ ] Connection Pool Monitoring
- [ ] Frontend Memoization (ChatMulti.js)

### Woche 3: RAG & Features
- [ ] Hybrid Search implementieren
- [ ] Conversation Memory
- [ ] Graceful Shutdown
- [ ] Request Correlation IDs

### Woche 4: Testing
- [ ] Backend Unit Tests (70% Coverage)
- [ ] Security Tests
- [ ] Integration Tests

### Woche 5: UX & Accessibility
- [ ] ARIA Labels
- [ ] Focus Management
- [ ] Copy Buttons
- [ ] Validation Framework

### Woche 6: Infrastructure
- [ ] Docker Tags pinnen
- [ ] Backup-Strategie
- [ ] Health Dashboard
- [ ] Audit-Log System

### Woche 7: Polish
- [ ] Circuit Breaker
- [ ] Frontend Tests
- [ ] Documentation Update
- [ ] Final Security Audit

---

## Geschätzter Gesamtaufwand

| Phase | Aufwand | Priorität |
|-------|---------|-----------|
| Security Fixes | 15 Stunden | KRITISCH |
| Performance | 20 Stunden | HOCH |
| Features | 25 Stunden | HOCH |
| Testing | 36 Stunden | KRITISCH |
| Accessibility | 10 Stunden | MITTEL |
| Infrastructure | 10 Stunden | MITTEL |
| **Gesamt** | **~116 Stunden** | - |

---

## Nächste Schritte

1. **Sofort (heute)**: Command Injection + XSS + Token-Key Bug fixen
2. **Diese Woche**: Alle kritischen Security-Issues
3. **Woche 2**: Performance-Indizes + Token-Bug
4. **Woche 3+**: Features nach Priorität

Diesen Plan können wir Schritt für Schritt durchgehen. Welche Phase möchtest du zuerst angehen?
