# ARASUL Platform API - Usage Guide

Comprehensive guide for using the ARASUL Platform REST API.

## Table of Contents

- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Common Workflows](#common-workflows)
- [WebSocket Streaming](#websocket-streaming)
- [Best Practices](#best-practices)
- [Code Examples](#code-examples)

---

## Getting Started

### Base URL

All API endpoints are prefixed with `/api`:

```
http://arasul.local/api
```

### Interactive Documentation

Access the interactive Swagger UI documentation at:

```
http://arasul.local/api/docs
```

This provides:
- Complete endpoint reference
- Request/response examples
- Try-it-out functionality
- Schema definitions

### Download OpenAPI Spec

- **JSON**: `http://arasul.local/api/docs/openapi.json`
- **YAML**: `http://arasul.local/api/docs/openapi.yaml`

---

## Authentication

### 1. Obtain JWT Token

```bash
curl -X POST http://arasul.local/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-secure-password"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 86400,
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Token Validity**: 24 hours

---

### 2. Use Token in Requests

Include the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer <your-token>" \
  http://arasul.local/api/system/status
```

---

### 3. Logout

**Single session logout:**
```bash
curl -X POST http://arasul.local/api/auth/logout \
  -H "Authorization: Bearer <your-token>"
```

**Logout all sessions:**
```bash
curl -X POST http://arasul.local/api/auth/logout-all \
  -H "Authorization: Bearer <your-token>"
```

---

## Common Workflows

### Workflow 1: Monitor System Health

```javascript
// 1. Login
const loginResponse = await fetch('http://arasul.local/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'password' })
});
const { token } = await loginResponse.json();

// 2. Get system status
const statusResponse = await fetch('http://arasul.local/api/system/status', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const status = await statusResponse.json();

console.log(`System Status: ${status.status}`);
console.log(`LLM Service: ${status.llm}`);
console.log(`Warnings: ${status.warnings.length}`);

// 3. Get current metrics
const metricsResponse = await fetch('http://arasul.local/api/metrics/live', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const metrics = await metricsResponse.json();

console.log(`CPU: ${metrics.cpu}%`);
console.log(`RAM: ${metrics.ram}%`);
console.log(`GPU: ${metrics.gpu}%`);
console.log(`Temperature: ${metrics.temperature}°C`);
```

---

### Workflow 2: LLM Chat Interaction

```python
import requests

# Login
login_resp = requests.post('http://arasul.local/api/auth/login', json={
    'username': 'admin',
    'password': 'password'
})
token = login_resp.json()['token']

headers = {'Authorization': f'Bearer {token}'}

# Get available models
models_resp = requests.get('http://arasul.local/api/services/llm/models', headers=headers)
models = models_resp.json()['models']
print(f"Available models: {[m['name'] for m in models]}")

# Chat with LLM
chat_resp = requests.post('http://arasul.local/api/llm/chat',
    headers=headers,
    json={
        'model': 'llama2',
        'prompt': 'What is the capital of France?',
        'stream': False
    }
)
response = chat_resp.json()
print(f"Response: {response['response']}")
```

---

### Workflow 3: Real-Time Metrics Streaming

```javascript
// Connect to WebSocket for live metrics
const ws = new WebSocket('ws://arasul.local/api/metrics/live-stream');

ws.onopen = () => {
  console.log('Connected to metrics stream');
};

ws.onmessage = (event) => {
  const metrics = JSON.parse(event.data);

  updateDashboard({
    cpu: metrics.cpu,
    ram: metrics.ram,
    gpu: metrics.gpu,
    temperature: metrics.temperature
  });
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from metrics stream');
  // Implement reconnection logic
};
```

---

### Workflow 4: Check Self-Healing Events

```bash
# Get self-healing status
curl -H "Authorization: Bearer <token>" \
  http://arasul.local/api/self-healing/status

# Get recent self-healing events
curl -H "Authorization: Bearer <token>" \
  "http://arasul.local/api/self-healing/events?limit=10"

# Get events by severity
curl -H "Authorization: Bearer <token>" \
  "http://arasul.local/api/self-healing/events?severity=CRITICAL"

# Get self-healing statistics
curl -H "Authorization: Bearer <token>" \
  http://arasul.local/api/self-healing/stats
```

---

### Workflow 5: View System Logs

```bash
# List available log files
curl -H "Authorization: Bearer <token>" \
  http://arasul.local/api/logs/list

# Read system log
curl -H "Authorization: Bearer <token>" \
  "http://arasul.local/api/logs?log_type=system&lines=100"

# Stream logs in real-time (Server-Sent Events)
curl -H "Authorization: Bearer <token>" \
  -H "Accept: text/event-stream" \
  "http://arasul.local/api/logs/stream?log_type=system"

# Search logs
curl -H "Authorization: Bearer <token>" \
  "http://arasul.local/api/logs/search?query=error&log_type=system"
```

---

## WebSocket Streaming

### Metrics Live Stream

**Endpoint**: `ws://arasul.local/api/metrics/live-stream`

**Authentication**: Include JWT token as query parameter:
```
ws://arasul.local/api/metrics/live-stream?token=<your-jwt-token>
```

**Update Frequency**: Every 5 seconds

**Message Format**:
```json
{
  "cpu": 45.2,
  "ram": 62.8,
  "gpu": 78.5,
  "temperature": 65.3,
  "disk": {
    "used": 52428800000,
    "free": 47571200000,
    "total": 100000000000,
    "percent": 52.4
  },
  "timestamp": "2025-11-12T10:30:45.123Z"
}
```

**Example Implementation**:
```javascript
function connectMetricsStream(token) {
  const ws = new WebSocket(`ws://arasul.local/api/metrics/live-stream?token=${token}`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Metrics update:', data);
  };

  ws.onclose = () => {
    console.log('Stream closed, reconnecting in 5s...');
    setTimeout(() => connectMetricsStream(token), 5000);
  };

  return ws;
}
```

---

## Best Practices

### 1. Token Management

**Store tokens securely:**
```javascript
// Good: Use secure storage
sessionStorage.setItem('auth_token', token);

// Bad: Don't store in localStorage (vulnerable to XSS)
// localStorage.setItem('auth_token', token);
```

**Implement token refresh:**
```javascript
async function getToken() {
  let token = sessionStorage.getItem('auth_token');

  // Check if token is expired (tokens have 24h validity)
  const tokenAge = Date.now() - parseInt(sessionStorage.getItem('token_timestamp'));
  if (tokenAge > 23 * 60 * 60 * 1000) { // Refresh after 23 hours
    token = await refreshToken();
  }

  return token;
}
```

---

### 2. Error Handling

**Always handle errors:**
```javascript
async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);

    // Handle specific errors
    if (error.message.includes('401')) {
      // Redirect to login
      window.location.href = '/login';
    }

    throw error;
  }
}
```

---

### 3. Rate Limiting

**Implement exponential backoff:**
```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

**Batch requests:**
```javascript
// Bad: Many individual requests
for (const id of ids) {
  await fetch(`/api/services/${id}`);
}

// Good: Use batch endpoint if available
await fetch('/api/services', {
  method: 'POST',
  body: JSON.stringify({ ids })
});
```

---

### 4. Pagination

**Use limit/offset for large datasets:**
```javascript
async function getAllEvents() {
  const allEvents = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const response = await fetch(
      `/api/self-healing/events?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await response.json();

    allEvents.push(...data.events);

    if (data.events.length < limit) break;
    offset += limit;
  }

  return allEvents;
}
```

---

### 5. Caching

**Cache static data:**
```javascript
const cache = new Map();

async function getSystemInfo() {
  // System info rarely changes
  if (cache.has('system_info')) {
    return cache.get('system_info');
  }

  const response = await fetch('/api/system/info', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();

  // Cache for 1 hour
  cache.set('system_info', data);
  setTimeout(() => cache.delete('system_info'), 3600000);

  return data;
}
```

---

## Code Examples

### Complete React Example

```jsx
import React, { useState, useEffect } from 'react';

function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');

    // Fetch initial data
    Promise.all([
      fetch('/api/system/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      }),
      fetch('/api/metrics/live', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
    ])
    .then(async ([statusRes, metricsRes]) => {
      setStatus(await statusRes.json());
      setMetrics(await metricsRes.json());
    })
    .catch(err => setError(err.message));

    // Connect to WebSocket for live updates
    const ws = new WebSocket(`ws://arasul.local/api/metrics/live-stream?token=${token}`);
    ws.onmessage = (event) => {
      setMetrics(JSON.parse(event.data));
    };

    return () => ws.close();
  }, []);

  if (error) return <div>Error: {error}</div>;
  if (!metrics || !status) return <div>Loading...</div>;

  return (
    <div>
      <h1>System Status: {status.status}</h1>
      <div>
        <h2>Metrics</h2>
        <p>CPU: {metrics.cpu}%</p>
        <p>RAM: {metrics.ram}%</p>
        <p>GPU: {metrics.gpu}%</p>
        <p>Temperature: {metrics.temperature}°C</p>
      </div>
    </div>
  );
}
```

---

### Complete Python CLI Example

```python
#!/usr/bin/env python3
import requests
import sys

class ArasulClient:
    def __init__(self, base_url='http://arasul.local/api'):
        self.base_url = base_url
        self.token = None

    def login(self, username, password):
        response = requests.post(f'{self.base_url}/auth/login', json={
            'username': username,
            'password': password
        })
        response.raise_for_status()
        self.token = response.json()['token']

    def _headers(self):
        return {'Authorization': f'Bearer {self.token}'}

    def get_status(self):
        response = requests.get(
            f'{self.base_url}/system/status',
            headers=self._headers()
        )
        response.raise_for_status()
        return response.json()

    def get_metrics(self):
        response = requests.get(
            f'{self.base_url}/metrics/live',
            headers=self._headers()
        )
        response.raise_for_status()
        return response.json()

    def chat(self, prompt, model='llama2'):
        response = requests.post(
            f'{self.base_url}/llm/chat',
            headers=self._headers(),
            json={'model': model, 'prompt': prompt, 'stream': False}
        )
        response.raise_for_status()
        return response.json()['response']

# Usage
if __name__ == '__main__':
    client = ArasulClient()
    client.login('admin', 'password')

    status = client.get_status()
    print(f"System Status: {status['status']}")

    metrics = client.get_metrics()
    print(f"CPU: {metrics['cpu']}%")
    print(f"GPU: {metrics['gpu']}%")
```

---

## Additional Resources

- **API Documentation**: http://arasul.local/api/docs
- **Error Reference**: See [API_ERRORS.md](./API_ERRORS.md)
- **System Logs**: `./arasul logs dashboard-backend`
- **CLI Tool**: `./arasul --help`
