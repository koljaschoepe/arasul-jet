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
  "error": "Human-readable error message",
  "details": "Optional detailed explanation",
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Fields:**
- `error` (string, required): Brief, human-readable error description
- `details` (string, optional): Additional context or technical details
- `timestamp` (string, required): ISO8601 timestamp of the error

---

## HTTP Status Codes

| Code | Name | Description | Common Causes |
|------|------|-------------|---------------|
| 200 | OK | Success | Request processed successfully |
| 400 | Bad Request | Invalid input | Malformed JSON, missing required fields |
| 401 | Unauthorized | Authentication required | Missing/invalid/expired JWT token |
| 403 | Forbidden | Insufficient permissions | Valid token but lacks required permissions |
| 404 | Not Found | Resource doesn't exist | Invalid endpoint or resource ID |
| 429 | Too Many Requests | Rate limit exceeded | Too many requests in time window |
| 500 | Internal Server Error | Server-side error | Database error, unexpected exception |
| 503 | Service Unavailable | Service temporarily down | Service starting, maintenance mode |

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
**Endpoints**: `/api/llm/*`, `/api/embeddings/*`
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
      'Authorization': `Bearer ${getToken()}`
    }
  });

  if (response.status === 401) {
    // Token expired, refresh it
    await refreshToken();

    // Retry request with new token
    response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
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
    stack: error.stack
  });
}
```

### 5. User-Friendly Error Messages

```javascript
function getErrorMessage(error) {
  const messages = {
    401: 'Your session has expired. Please log in again.',
    403: 'You don\'t have permission to perform this action.',
    429: 'Too many requests. Please wait a moment and try again.',
    500: 'Something went wrong. Please try again later.',
    503: 'Service temporarily unavailable. Please try again in a few minutes.'
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
