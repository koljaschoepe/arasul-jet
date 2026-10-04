# ARASUL Platform API - Error Codes Reference

This document provides a comprehensive reference for all HTTP status codes and error responses in the ARASUL Platform API.

## Table of Contents

- [Error Response Format](#error-response-format)
- [HTTP Status Codes](#http-status-codes)
- [Authentication Errors (401, 403)](#authentication-errors)
- [Rate Limiting Errors (429)](#rate-limiting-errors)
- [Validation Errors (400)](#validation-errors)
- [Resource Not Found Errors (404)](#resource-not-found-errors)
- [Server Errors (500, 503)](#server-errors)
- [Error Handling Best Practices](#error-handling-best-practices)

---

## Error Response Format

All error responses follow this consistent structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error description",
    "details": { "field": "email", "issue": "Invalid format" }
  },
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Fields:**

- `error.code` (string, required): Stable machine-readable error code (see Error Codes below)
- `error.message` (string, required): Human-readable error description
- `error.details` (object|null, optional): Structured details, e.g. validation field errors
- `timestamp` (string, required): ISO8601 timestamp of the error

**Token-specific error codes** (HTTP 401):

| Code            | When                                           |
| --------------- | ---------------------------------------------- |
| `TOKEN_EXPIRED` | JWT has passed its `exp` claim                 |
| `INVALID_TOKEN` | JWT signature invalid or malformed             |
| `TOKEN_REVOKED` | Token was explicitly revoked (e.g. logout-all) |
| `UNAUTHORIZED`  | Missing `Authorization` header                 |

**CSRF error code** (HTTP 403):

| Code              | When                                                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CSRF_INVALID`    | CSRF token missing or mismatched on a state-changing request. Recoverable: fetch `GET /api/auth/csrf`, retry once (`useApi` does this automatically). Distinct from `FORBIDDEN` (a genuine permission denial that must **not** be retried).                                |
| `PASSWORT_FALSCH` | 403. Ein schwerer Handgriff (Zurückholen aus einer Sicherung, M5) verlangt das Passwort des angemeldeten Menschen, und es stimmt nicht oder fehlt. Die Sitzung bleibt gültig (deshalb kein `401`); die Oberfläche zeigt den Satz im Dialog. Nicht automatisch wiederholen. |

**Narrower 403 codes** (since J34, 27.09.2026). A client dispatches on the code,
never on the status alone: before J34 the login page read every 403 as a locked
account, and a login refused by the CORS rule under `https://arasul` sent a
person with a healthy account to the administrator.

| Code                 | When                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACCOUNT_LOCKED`     | `POST /api/auth/login`: five failed passwords locked the account for 15 minutes (`record_login_attempt`). The only code that says „gesperrt". |
| `ACCOUNT_DISABLED`   | `POST /api/auth/login`: the account is deactivated (`is_active = false`).                                                                     |
| `ORIGIN_NOT_ALLOWED` | Any route: the request's `Origin` is not one of the device's addresses (`utils/corsOrigin.js`). Technical, says nothing about the account.    |

**A narrower 409 code** (since J33, 28.09.2026, `GrenzeErreichtError`).

| Code                     | When                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GRENZE_ERREICHT`        | `GET /api/firmenordner/passt`: what the caller wants to upload does not fit into the folder — its size limit or the free space of the device. The message is a sentence for the person; `details` carries `pfad`, `bytes`, `frei`, `belegt`, `grenze`. Not a 5xx on purpose: retrying does not help.                                                                                                                                                                                |
| `LIVE_ZURUECKGESCHALTET` | 409. `POST …/apps/:id/schalten` mit `live`: die neue Fassung kam nicht hoch (beendet, neu gestartet, `unhealthy` oder nach 180 s nicht gesund), und das Gerät hat Fassung und Daten von vorher wiederhergestellt. `message` ist der Satz für den Admin, `details.hilfe` der zweite, `details.schaltung` trägt Sicherung und Technik (`ergebnis` `zurueckgeschaltet` oder, wenn auch der Rückfall misslang, `fehlgeschlagen`). Nicht wiederholen: dieselbe Fassung scheitert gleich. |
| `FLOW_INAKTIV`           | 409. Ein Start eines Flows einer App, den der Admin auf der Seite der App ausgeschaltet hat (`PUT /api/apps/:id/flows/:name/aktiv`). Kein Lauf entsteht. Erst wiederholen, wenn er wieder eingeschaltet ist.                                                                                                                                                                                                                                                                        |
| `LIVE_NICHT_GESICHERT`   | 409. Die Sicherung vor dem Live-Schalten misslang (oder eine andere Sicherung lief gerade); geschaltet wurde nichts, der alte Livestand läuft weiter. Nach einem Blick in die Sicherung erneut versuchen.                                                                                                                                                                                                                                                                           |

---

## HTTP Status Codes

| Code | Name                  | Description              | Common Causes                              |
| ---- | --------------------- | ------------------------ | ------------------------------------------ |
| 200  | OK                    | Success                  | Request processed successfully             |
| 400  | Bad Request           | Invalid input            | Malformed JSON, missing required fields    |
| 401  | Unauthorized          | Authentication required  | Missing/invalid/expired JWT token          |
| 403  | Forbidden             | Insufficient permissions | Valid token but lacks required permissions |
| 404  | Not Found             | Resource doesn't exist   | Invalid endpoint or resource ID            |
| 409  | Conflict              | Resource conflict        | Duplicate entry, state conflict            |
| 429  | Too Many Requests     | Rate limit exceeded      | Too many requests in time window           |
| 500  | Internal Server Error | Server-side error        | Database error, unexpected exception       |
| 502  | Bad Gateway           | A dependency refused     | The tailscale program on the host failed   |
| 503  | Service Unavailable   | Service temporarily down | Service starting, maintenance mode         |

---

## Authentication Errors

### 401 Unauthorized

Returned when authentication is required but not provided, or authentication credentials are invalid.

#### Missing Token

```json
{
  "error": "No token provided",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Cause**: Request to protected endpoint without `Authorization` header

**Solution**: Include JWT token in request:

```
Authorization: Bearer <your-jwt-token>
```

---

#### Invalid Token

```json
{
  "error": "Invalid token",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Causes**:

- Malformed JWT
- Token signed with wrong secret
- Token tampered with

**Solution**: Obtain a new token via `/api/auth/login`

---

#### Expired Token

```json
{
  "error": "Token expired",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Cause**: JWT token has exceeded its 24-hour validity period

**Solution**: Obtain a new token via `/api/auth/login`

---

#### Invalid Credentials (Login)

```json
{
  "error": "Invalid credentials",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Cause**: Incorrect username or password

**Endpoint**: `POST /api/auth/login`

**Solution**: Verify credentials and retry

---

#### Account Locked

```json
{
  "error": "Account locked due to multiple failed login attempts",
  "details": "Please wait 15 minutes before trying again",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Cause**: 5 or more failed login attempts within 15 minutes

**Endpoint**: `POST /api/auth/login`

**Solution**: Wait 15 minutes or contact administrator

---

## Rate Limiting Errors

### 429 Too Many Requests

Returned when API rate limits are exceeded.

#### Auth Endpoint Rate Limit

```json
{
  "error": "Too many login attempts. Please try again in 15 minutes.",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Limit**: 5 requests per 15 minutes
**Endpoint**: `POST /api/auth/login`
**Solution**: Wait for rate limit window to reset

---

#### LLM API Rate Limit

```json
{
  "error": "Rate limit exceeded for LLM API",
  "details": "Limit: 10 requests per second",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Limit**: 10 requests per second
**Endpoints**: `/api/v1/external/llm/*`, `/api/embeddings`
**Solution**: Reduce request frequency or implement client-side queueing

---

#### Metrics API Rate Limit

```json
{
  "error": "Rate limit exceeded for Metrics API",
  "details": "Limit: 20 requests per second",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Limit**: 20 requests per second
**Endpoints**: `/api/metrics/*`
**Solution**: Use WebSocket endpoint for real-time data instead

---

#### General API Rate Limit

```json
{
  "error": "Rate limit exceeded",
  "details": "Limit: 100 requests per minute",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Limit**: 100 requests per minute
**Endpoints**: Most API endpoints
**Solution**: Implement exponential backoff

---

## Validation Errors

### 400 Bad Request

Returned when request data is invalid or malformed.

#### Ungültiger Wert in der Adresse (seit 23.08.2026)

Eine Id, die nicht zum Spaltentyp passt (etwa Text statt UUID), gibt **400**,
nicht 500:

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "Ungültiger Wert in der Anfrage" },
  "timestamp": "2026-08-23T10:21:21.000Z"
}
```

Vorher warf Postgres `22P02`, der Fehlerpfad kannte den Code nicht, und der
Aufrufer bekam HTTP 500 mit der rohen Datenbankmeldung samt seiner eigenen
Eingabe zurueck. Gefunden an einer inzwischen entfernten Route. Fuer den
Betreiber ist das der Unterschied zwischen "ich habe mich vertippt" und "das
Geraet ist kaputt".

#### Missing Required Field

```json
{
  "error": "Missing required field: username",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Common Endpoints**: `POST /api/auth/login`, `POST /api/auth/change-password`

**Solution**: Include all required fields in request body

---

#### Invalid JSON

```json
{
  "error": "Invalid JSON in request body",
  "details": "Unexpected token } in JSON at position 42",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Solution**: Validate JSON syntax before sending

---

#### Password Validation Failed

```json
{
  "error": "Password does not meet complexity requirements",
  "details": "Password must be at least 12 characters and contain uppercase, lowercase, numbers, and special characters",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Endpoint**: `POST /api/auth/change-password`

**Requirements**:

- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

---

#### Invalid Query Parameters

```json
{
  "error": "Invalid query parameter: range",
  "details": "Valid values: 1h, 6h, 24h, 7d, 30d",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Common Endpoints**: `GET /api/metrics/history`, `GET /api/logs`

---

## Resource Not Found Errors

### 404 Not Found

Returned when a requested resource doesn't exist.

#### Endpoint Not Found

```json
{
  "error": "Endpoint not found",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Cause**: Invalid URL path

**Solution**: Check API documentation for correct endpoint

---

#### Resource Not Found

```json
{
  "error": "Service not found",
  "details": "Service 'invalid-service' does not exist",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Common Endpoints**: Service management endpoints

**Solution**: Verify resource ID/name

---

#### Log File Not Found

```json
{
  "error": "Log file not found",
  "details": "File 'system.log.20251112' does not exist",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Endpoint**: `GET /api/logs`

**Solution**: Check available log files via `GET /api/logs/list`

---

## Server Errors

### 500 Internal Server Error

Returned when an unexpected error occurs on the server.

#### Database Connection Failed

```json
{
  "error": "Database connection failed",
  "details": "Unable to connect to PostgreSQL",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Cause**: PostgreSQL service unavailable

**Solution**: Check service status via `GET /api/system/status`

---

#### Query Failed

```json
{
  "error": "Failed to execute query",
  "details": "relation \"metrics_cpu\" does not exist",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Cause**: Database schema issue or migration not run

**Solution**: Run database migrations

---

### 503 Service Unavailable

Returned when a dependent service is unavailable.

#### Service Unavailable

```json
{
  "error": "LLM service unavailable",
  "details": "Service is starting or unhealthy",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Cause**: LLM service not ready or crashed

**Solution**: Wait for service to become healthy, check `/api/system/status`

---

#### Database Unhealthy

```json
{
  "error": "Database health check failed",
  "details": "Connection pool exhausted",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Cause**: Database connection pool saturated

**Solution**: Check database pool stats via `GET /api/database/pool`

---

#### App-Dateien fehlen (`APP_DATEIEN_FEHLEN`)

```json
{
  "error": {
    "code": "APP_DATEIEN_FEHLEN",
    "message": "urlaubsantrag 1.0.0 steht als live, aber die Dateien fehlen am Geraet. Die App entfernen oder neu einspielen (Einstellungen -> Apps)."
  },
  "timestamp": "2026-08-28T18:00:00.000Z"
}
```

**Cause**: `GET /apps/<id>/` (oder `/apps/<id>/test/`) trifft einen Stand, der
in `app_staende` steht, dessen Ordner unter `/arasul/apps/<id>/<version>/`
aber nicht mehr da ist (Auftrag app-leiche, 28.08.2026). Der Container kann
dabei `healthy` sein — seine Prüfung sieht nur sein Backend.

**Solution**: Einstellungen → Apps zeigt den Stand rot mit dem Grund. Die App
entfernen (**App entfernen**, oder `DELETE /api/apps/:id?dateien=true`) oder
vom Partner neu einspielen lassen.

---

### Eigene Codes statt `INTERNAL_ERROR` (M5, Auftrag jet-fehlerklassen)

Seit Oktober 2026 wirft das Backend keine schlichten `Error` mehr. Ein Fehler
im Gerät kommt weiter als `500` an, aber mit einem deutschen Satz und einem
eigenen `code` statt „Internal server error" (`InternalError`); ein
abgelehnter Aufruf eines Fremddienstes als `UpstreamError`. Der technische
Text (Ausgabe eines Programms, Antwort eines Dienstes) steht nur im Log des
Backends, nie in der Antwort.

Beispiele: `ENV_NICHT_LESBAR`, `ENV_NICHT_GESCHRIEBEN` (die `.env` des Geräts),
`PASSWORT_HASH_FEHLER`, `PASSWORT_PRUEFUNG_FEHLER`, `SCHLUESSEL_FEHLT`,
`DATENBANK_PASSWORT_UNLESBAR`, `FIRMENORDNER_FEHLER` und `FIRMENORDNER_AUS`
(alle `500`).

#### Fernzugriff (`/api/tailscale/*`)

Jeder Fehler des Fernzugriffs trägt zwei Sätze: was passiert ist und was der
Admin tun kann. Die Ausgabe des tailscale-Programms steht nur im Log.

| Status | Code                                    | When                                                                                |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`                      | Auth-Key oder Gerätename haben nicht die erwartete Form (vor jedem Aufruf geprüft). |
| 400    | `TAILSCALE_KEY_UNGUELTIG`               | `connect`: Tailscale lehnt den Auth-Key ab (ungültig, abgelaufen, verbraucht).      |
| 409    | `CONFLICT`                              | `connect`/`disconnect`: Tailscale ist auf dem Gerät nicht installiert.              |
| 409    | `TAILSCALE_CURL_FEHLT`                  | `install`: auf dem Host fehlt `curl`.                                               |
| 502    | `TAILSCALE_VERBINDEN_FEHLGESCHLAGEN`    | `connect`: `tailscale up` scheitert aus einem anderen Grund.                        |
| 502    | `TAILSCALE_TRENNEN_FEHLGESCHLAGEN`      | `disconnect`: `tailscale down` scheitert.                                           |
| 502    | `TAILSCALE_INSTALLATION_FEHLGESCHLAGEN` | `install`: der Installer scheitert, oder das Programm fehlt danach trotzdem.        |
| 503    | `TAILSCALE_DIENST_AUS`                  | `connect`/`disconnect`: `tailscaled` läuft auf dem Host nicht.                      |
| 503    | `TAILSCALE_ZEITLIMIT`                   | Der Befehl auf dem Host kam nicht rechtzeitig zurück.                               |
| 503    | `TAILSCALE_HOST_NICHT_ERREICHBAR`       | Der Befehl lief gar nicht (Hilfs-Image, Docker-Proxy).                              |
| 503    | `SERVICE_UNAVAILABLE`                   | Ob Tailscale installiert ist, ließ sich nicht prüfen.                               |

```json
{
  "error": {
    "code": "TAILSCALE_KEY_UNGUELTIG",
    "message": "Tailscale hat den Auth-Key abgelehnt, er ist ungültig, abgelaufen oder schon verbraucht. Erzeugen Sie in der Tailscale-Verwaltung einen neuen Auth-Key und versuchen Sie es damit."
  },
  "timestamp": "2026-10-05T10:00:00.000Z"
}
```

---

## Error Handling Best Practices

### 1. Always Check HTTP Status Code

```javascript
if (response.status >= 400) {
  const error = await response.json();
  console.error(`Error: ${error.error}`);

  if (response.status === 401) {
    // Redirect to login
  } else if (response.status === 429) {
    // Implement exponential backoff
  }
}
```

### 2. Handle Rate Limits with Exponential Backoff

```javascript
async function makeRequestWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url);

    if (response.status !== 429) {
      return response;
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, i) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw new Error('Max retries exceeded');
}
```

### 3. Implement Token Refresh Logic

```javascript
async function apiCall(endpoint) {
  let response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });

  if (response.status === 401) {
    // Token expired, refresh it
    await refreshToken();

    // Retry request with new token
    response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });
  }

  return response;
}
```

### 4. Log Errors with Context

```javascript
try {
  const response = await apiCall('/api/metrics/live');
  const data = await response.json();
} catch (error) {
  console.error('Failed to fetch metrics', {
    error: error.message,
    endpoint: '/api/metrics/live',
    timestamp: new Date().toISOString(),
    stack: error.stack,
  });
}
```

### 5. User-Friendly Error Messages

```javascript
function getErrorMessage(error) {
  const messages = {
    401: 'Your session has expired. Please log in again.',
    403: "You don't have permission to perform this action.",
    429: 'Too many requests. Please wait a moment and try again.',
    500: 'Something went wrong. Please try again later.',
    503: 'Service temporarily unavailable. Please try again in a few minutes.',
  };

  return messages[error.status] || 'An unexpected error occurred.';
}
```

---

## Quick Reference: Status Code Checklist

When implementing error handling, ensure you handle these status codes:

- [ ] **200** - Success (process response data)
- [ ] **400** - Bad Request (show validation errors to user)
- [ ] **401** - Unauthorized (redirect to login, refresh token)
- [ ] **403** - Forbidden (show permission error)
- [ ] **404** - Not Found (show resource not found message)
- [ ] **429** - Rate Limited (implement exponential backoff)
- [ ] **500** - Server Error (show generic error, log details)
- [ ] **503** - Service Unavailable (show maintenance message, retry)

---

## Support

For additional help with API errors:

- Check system logs: `./arasul logs dashboard-backend`
- View system status: `GET /api/system/status`
- Check service health: `GET /api/services`
- Review self-healing events: `GET /api/self-healing/events`
