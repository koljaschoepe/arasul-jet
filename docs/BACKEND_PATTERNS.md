# Backend Code Patterns

Standardisierte Patterns für die Backend-Entwicklung im Arasul Platform.

---

## 1. Route Handler Pattern

### Standard: asyncHandler verwenden

**IMMER** `asyncHandler` für alle async Route-Handler verwenden:

```javascript
const { asyncHandler } = require('../middleware/errorHandler');

// ✅ KORREKT
router.get('/endpoint', requireAuth, asyncHandler(async (req, res) => {
    const result = await service.getData();
    res.json({ data: result, timestamp: new Date().toISOString() });
}));

// ❌ FALSCH - Kein manuelles try-catch
router.get('/endpoint', requireAuth, async (req, res) => {
    try {
        const result = await service.getData();
        res.json({ data: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

### Middleware-Reihenfolge

```javascript
router.post('/endpoint',
    requireAuth,        // 1. Authentication
    apiLimiter,         // 2. Rate Limiting (wenn nötig)
    asyncHandler(async (req, res) => {
        // 3. Handler
    })
);
```

---

## 2. Error Handling

### Custom Error Classes verwenden

```javascript
const {
    ValidationError,      // 400 - Ungültige Eingabe
    NotFoundError,        // 404 - Ressource nicht gefunden
    ForbiddenError,       // 403 - Zugriff verweigert
    RateLimitError,       // 429 - Zu viele Anfragen
    ServiceUnavailableError // 503 - Service nicht verfügbar
} = require('../utils/errors');

// Verwendung
if (!req.body.name) {
    throw new ValidationError('Name ist erforderlich');
}

if (!resource) {
    throw new NotFoundError('Ressource nicht gefunden');
}

if (!allowed) {
    throw new ForbiddenError('Zugriff auf diese Ressource nicht erlaubt');
}
```

### Fallback-Pattern mit Errors

```javascript
router.get('/live', asyncHandler(async (req, res) => {
    // Primäre Quelle versuchen
    try {
        const response = await axios.get(`${PRIMARY_URL}/data`, { timeout: 1000 });
        return res.json(response.data);
    } catch (primaryError) {
        logger.warn(`Primary source unavailable: ${primaryError.message}`);
    }

    // Fallback versuchen
    try {
        const result = await db.query('SELECT * FROM cache');
        return res.json({
            ...result.rows[0],
            source: 'fallback'
        });
    } catch (fallbackError) {
        logger.error(`Fallback also failed: ${fallbackError.message}`);
        throw new ServiceUnavailableError('Service temporarily unavailable');
    }
}));
```

---

## 3. Response Format

### Erfolgreiche Antworten

**IMMER** `timestamp` in Antworten inkludieren:

```javascript
// Single Resource
res.json({
    data: resource,
    timestamp: new Date().toISOString()
});

// List/Collection
res.json({
    data: items,
    total: items.length,
    timestamp: new Date().toISOString()
});

// Paginated List
res.json({
    data: items,
    total: totalCount,
    page: currentPage,
    pageSize: pageSize,
    timestamp: new Date().toISOString()
});

// Action Result
res.json({
    success: true,
    message: 'Operation completed successfully',
    timestamp: new Date().toISOString()
});
```

### Status Codes

| Code | Verwendung |
|------|------------|
| 200 | Erfolgreiche GET/PUT/DELETE |
| 201 | Erfolgreiche POST (Ressource erstellt) |
| 400 | ValidationError |
| 401 | Nicht authentifiziert |
| 403 | ForbiddenError |
| 404 | NotFoundError |
| 429 | RateLimitError |
| 500 | Unerwarteter Fehler |
| 503 | ServiceUnavailableError |

---

## 4. Logging Standards

### Context-basiertes Logging

```javascript
// ✅ KORREKT - Mit Context
logger.info('Service restart initiated', {
    service: serviceName,
    userId: req.user?.id,
    username: req.user?.username
});

logger.error('Database query failed', {
    query: 'SELECT * FROM users',
    error: error.message,
    duration: `${Date.now() - startTime}ms`
});

// ❌ FALSCH - Nur String
logger.info(`User ${userId} restarted ${serviceName}`);
```

### Log Levels

| Level | Verwendung |
|-------|------------|
| `error` | Unerwartete Fehler, die Aufmerksamkeit erfordern |
| `warn` | Erwartete Fehler, Fallbacks, Rate Limits |
| `info` | Wichtige Ereignisse (Restart, Login, etc.) |
| `debug` | Entwickler-Details (nur in Development) |

---

## 5. Input Validation

### Whitelist-Validation

```javascript
// ✅ KORREKT - Whitelist
const VALID_RANGES = ['1h', '6h', '12h', '24h', '48h', '7d', '30d'];
if (!VALID_RANGES.includes(range)) {
    throw new ValidationError(`Invalid range. Valid: ${VALID_RANGES.join(', ')}`);
}

// ❌ FALSCH - Keine Validation
const hours = parseInt(req.query.range);
```

### Pflichtfelder prüfen

```javascript
const { name, email, password } = req.body;

if (!name || typeof name !== 'string') {
    throw new ValidationError('Name ist erforderlich');
}

if (!email || !email.includes('@')) {
    throw new ValidationError('Gültige E-Mail-Adresse erforderlich');
}
```

---

## 6. Database Queries

### Parametrisierte Queries

```javascript
// ✅ KORREKT - Parametrisiert
const result = await db.query(
    'SELECT * FROM users WHERE id = $1 AND status = $2',
    [userId, 'active']
);

// ❌ FALSCH - String Interpolation (SQL Injection!)
const result = await db.query(
    `SELECT * FROM users WHERE id = ${userId}`
);
```

### Transaktionen

```javascript
const client = await db.pool.connect();
try {
    await client.query('BEGIN');
    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]);
    await client.query('COMMIT');
} catch (error) {
    await client.query('ROLLBACK');
    throw error;
} finally {
    client.release();
}
```

---

## 7. External Service Calls

### Timeout setzen

```javascript
// ✅ IMMER Timeout setzen
const response = await axios.get(url, { timeout: 5000 });

// Für kritische Services: kürzere Timeouts
const metricsResponse = await axios.get(metricsUrl, { timeout: 1000 });

// Für lange Operationen: längere Timeouts
const modelResponse = await axios.post(pullUrl, data, { timeout: 3600000 });
```

### Connection Errors behandeln

```javascript
try {
    const response = await axios.get(serviceUrl, { timeout: 5000 });
    return response.data;
} catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new ServiceUnavailableError('External service unavailable');
    }
    if (error.response?.status === 404) {
        throw new NotFoundError('Resource not found');
    }
    throw error; // Unbekannte Fehler weiterleiten
}
```

---

## 8. Rate Limiting

### Standard Rate Limits

| Endpoint-Typ | Limit | Begründung |
|--------------|-------|------------|
| Metrics | 20/s | Häufige Polling-Requests |
| API Standard | 100/min | Normale Nutzung |
| Auth | 5/min | Brute-Force-Schutz |
| File Upload | 10/min | Resource-Schutz |

### Implementation

```javascript
const { apiLimiter, metricsLimiter, authLimiter } = require('../middleware/rateLimit');

// Metrics-Endpoints
router.get('/metrics/live', metricsLimiter, asyncHandler(async (req, res) => { }));

// Standard API
router.get('/resources', apiLimiter, asyncHandler(async (req, res) => { }));

// Auth-Endpoints
router.post('/login', authLimiter, asyncHandler(async (req, res) => { }));
```

---

## 9. Checkliste für neue Routes

- [ ] `asyncHandler` verwendet
- [ ] Alle Inputs validiert (Whitelist wenn möglich)
- [ ] Parametrisierte SQL-Queries
- [ ] Custom Error Classes verwendet
- [ ] Timeouts für externe Calls gesetzt
- [ ] `timestamp` in allen Responses
- [ ] Logging mit Context-Objekt
- [ ] Rate Limiting wenn nötig
- [ ] Tests geschrieben

---

## 10. Beispiel: Komplette Route

```javascript
/**
 * Items API routes
 */
const express = require('express');
const router = express.Router();
const db = require('../database');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');

// GET /api/items
router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const { page = 1, pageSize = 20, status } = req.query;

    // Validation
    const validStatuses = ['active', 'inactive', 'pending'];
    if (status && !validStatuses.includes(status)) {
        throw new ValidationError(`Invalid status. Valid: ${validStatuses.join(', ')}`);
    }

    // Query
    const result = await db.query(
        `SELECT * FROM items
         WHERE ($1::text IS NULL OR status = $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [status || null, parseInt(pageSize), (parseInt(page) - 1) * parseInt(pageSize)]
    );

    // Response
    res.json({
        data: result.rows,
        total: result.rows.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        timestamp: new Date().toISOString()
    });
}));

// POST /api/items
router.post('/', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.length < 1) {
        throw new ValidationError('Name ist erforderlich');
    }

    // Insert
    const result = await db.query(
        `INSERT INTO items (name, description, created_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, description || null, req.user.id]
    );

    // Logging
    logger.info('Item created', {
        itemId: result.rows[0].id,
        userId: req.user.id
    });

    // Response
    res.status(201).json({
        data: result.rows[0],
        timestamp: new Date().toISOString()
    });
}));

// DELETE /api/items/:id
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await db.query(
        `DELETE FROM items WHERE id = $1 RETURNING id`,
        [id]
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('Item nicht gefunden');
    }

    logger.info('Item deleted', { itemId: id, userId: req.user.id });

    res.json({
        success: true,
        message: 'Item gelöscht',
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;
```

---

_Letzte Aktualisierung: 2026-01-25_
