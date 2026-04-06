# Context: Security

## Authentication Flow

```
Client → Authorization: Bearer <JWT> → auth.js middleware → Route Handler
                                    ↓
                              1. verifyToken(token) — HS256, issuer check
                              2. Check token_blacklist (logout)
                              3. Check userCache (60s TTL, max 50)
                              4. Fallback: DB query admin_users
                              5. req.user = { id, username, email }
```

### JWT Configuration

- Algorithm: HS256
- Secret: `JWT_SECRET` (min 32 chars, validated at startup)
- Expiry: 4h (configurable via `JWT_EXPIRY`)
- Unique JTI (UUID v4) per token
- Session tracking: `active_sessions` table (JTI, IP, user_agent)
- Blacklist: `token_blacklist` table (immediate revocation on logout)
- Token Cache: 100 entries, 60s TTL, throttled activity updates

### Key Files

- `src/middleware/auth.js` — requireAuth middleware
- `src/utils/jwt.js` — Token creation/verification/caching
- `src/utils/password.js` — bcrypt (12 rounds)
- `src/routes/auth.js` — Login/logout/password-change

---

## CSRF Protection

**Pattern:** Double-submit cookie

- Cookie: `arasul_csrf` (non-HttpOnly, SameSite=strict in prod)
- Header: `X-CSRF-Token`
- Comparison: `crypto.timingSafeEqual` (timing-attack safe)
- Token rotation: After every state-changing request

**Exempt:**

- Safe methods (GET, HEAD, OPTIONS)
- API key authenticated requests
- Bearer-only requests (no session cookie)
- `/api/auth/login` (creates the token)

**File:** `src/middleware/csrf.js`

---

## API Key Authentication

**Pattern:** `aras_*` prefix, bcrypt-hashed storage

- Rate limiting per key (configurable, default 60/min)
- Endpoint whitelist per key (`allowedEndpoints`)
- Expiration checking
- Format validation

**File:** `src/middleware/apiKeyAuth.js`

---

## Rate Limiting

| Endpoint    | Limit        | Window       |
| ----------- | ------------ | ------------ |
| Login       | 10 requests  | 15 min       |
| General API | 100 req      | 1 min        |
| LLM         | 10 req       | 1 sec        |
| Upload      | 20 req       | 1 min        |
| Per API Key | configurable | configurable |

**Traefik-Level zusätzlich:**
| Route | Limit |
|-------|-------|
| Auth API | 30/min |
| n8n Webhooks | 100/min |
| LLM API | 10/sec |
| General API | 100/sec |

**File:** `src/middleware/rateLimit.js`
Deaktivierbar in Tests: `RATE_LIMIT_ENABLED=false`

---

## Secrets Management

**Alle Secrets via Docker Secrets** (nicht Env-Vars):

```yaml
secrets:
  postgres_password:
    file: ../config/secrets/postgres_password
  jwt_secret:
    file: ../config/secrets/jwt_secret
  # ... 8 Secrets total
```

Services lesen via `_FILE` Pattern:

```javascript
// resolveSecrets.js liest z.B. POSTGRES_PASSWORD_FILE → /run/secrets/postgres_password
```

**Startup-Validation** (`src/bootstrap.js`):

```javascript
// Weak secret detection
const weakPatterns = ['dev', 'test', 'default', 'example', 'changeme'];
const secretChecks = [
  { name: 'JWT_SECRET', minLen: 32 },
  { name: 'POSTGRES_PASSWORD', minLen: 16 },
  { name: 'MINIO_ROOT_PASSWORD', minLen: 16 },
];
```

---

## Input Validation Patterns

### SQL Injection Prevention

```javascript
// IMMER parameterisierte Queries:
db.query('SELECT * FROM users WHERE id = $1', [userId]);

// NIE String-Concatenation:
// db.query(`SELECT * FROM users WHERE id = ${userId}`);  ← VERBOTEN
```

### File Upload Security

```javascript
// src/routes/documents.js
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.md', '.markdown', '.txt', '.yaml', '.yml'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function sanitizeFilename(filename) {
  // Removes: ../, ./, /, <>"'|?*\x00-\x1F, leading dots
  // Truncates to 200 chars
}

function isValidMinioPath(filePath) {
  // Checks for: .., ./, leading /, \, null bytes
}
```

### ORDER BY Injection Prevention

```javascript
const validOrderFields = ['uploaded_at', 'filename', 'title', 'file_size'];
const orderField = validOrderFields.includes(order_by) ? order_by : 'uploaded_at';
```

---

## Audit Logging

**File:** `src/middleware/audit.js`

Loggt: User-ID, Method, Endpoint, Payload, Status, Duration, IP, User-Agent

**Sensitive Field Masking:**

```javascript
const SENSITIVE_FIELDS = ['password', 'token', 'api_key', 'secret', 'bot_token', 'private_key'];
// Rekursiv maskiert als ***REDACTED***
```

**Excluded Endpoints** (High-Frequency, Low-Value):
`/api/health`, `/api/metrics/live-stream`, `/api/models/status`

---

## Container Security

- `no-new-privileges: true` auf ALLEN Containern
- `cap_drop: [ALL]` + selektives `cap_add` wo nötig
- Read-only Root-Filesystem: Traefik, Frontend, Loki, Promtail
- Tmpfs mit `noexec,nosuid` für /tmp
- Docker Socket Proxy (tecnativa) für kontrollierte Docker-API
- Keine privileged Container
- Non-root Users auf allen Services

---

## Traefik Security

- TLS 1.2 Minimum, ECDHE + ChaCha20-Poly1305
- HSTS: 2 Jahre
- CSP: `default-src 'self'`
- X-Frame-Options: SAMEORIGIN
- Forward-Auth auf allen geschützten Routes
- CORS: Nur private Netzwerke (RFC 1918)
- Port-Exposure: Nur 80, 443, 8080 (localhost)

**Config:** `config/traefik/` (traefik.yml, routes.yml, middlewares.yml, websockets.yml, tls.yml)
