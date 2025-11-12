# Traefik Reverse Proxy Configuration

## Overview

Traefik serves as the central reverse proxy for the Arasul Platform, handling:
- HTTP/HTTPS routing
- TLS termination
- Rate limiting
- WebSocket upgrades
- Load balancing
- Health checks

## Architecture

```
Internet/LAN
    ↓
  Port 80/443
    ↓
  Traefik
    ├─→ Dashboard Frontend (/)
    ├─→ Dashboard Backend API (/api)
    ├─→ MinIO Console (/minio)
    ├─→ MinIO S3 API (/minio-api)
    ├─→ LLM Service (/models)
    ├─→ Embeddings (/embeddings)
    ├─→ n8n (/n8n)
    └─→ Webhooks (/webhook)
```

## Configuration Files

### Static Configuration (`traefik.yml`)
Main Traefik configuration:
- **Entrypoints**: HTTP (80), HTTPS (443), Dashboard (8080)
- **Certificate Resolver**: Let's Encrypt ACME
- **Providers**: Docker labels + file-based dynamic config
- **Logging**: JSON format to `/arasul/logs/traefik.log`
- **Metrics**: Prometheus format

### Dynamic Configuration

#### `dynamic/routes.yml`
HTTP routers and services:
- **dashboard-frontend**: `/` → dashboard-frontend:3000
- **dashboard-api**: `/api` → dashboard-backend:3001
- **auth-api**: `/api/auth` → dashboard-backend:3001 (stricter rate limit)
- **metrics-api**: `/api/metrics` → dashboard-backend:3001
- **minio-console**: `/minio` → minio:9001
- **minio-api**: `/minio-api` → minio:9000
- **llm-direct**: `/models` → llm-service:11434
- **embeddings-direct**: `/embeddings` → embedding-service:11435
- **n8n**: `/n8n` → n8n:5678
- **n8n-webhooks**: `/webhook` → n8n:5678

#### `dynamic/middlewares.yml`
Rate limiting and security:

**Rate Limits:**
- n8n Webhooks: 100 req/min
- LLM API: 10 req/s
- Metrics API: 20 req/s
- Auth API: 5 req/min (brute force prevention)
- General API: 100 req/s

**Security Headers:**
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security`
- Custom `X-Powered-By: Arasul Platform`

**Other Middlewares:**
- CORS headers
- Path prefix stripping
- Compression (gzip)
- Circuit breaker
- IP whitelist (admin routes)

#### `dynamic/websockets.yml`
WebSocket support:
- Dashboard metrics live-stream: `/api/metrics/live-stream`
- n8n WebSocket connections
- Automatic upgrade handling

## Routing Priority

Routes are matched by priority (higher = first):

| Priority | Route | Path |
|----------|-------|------|
| 50 | WebSocket routes | `/api/metrics/live-stream`, `/n8n/*` (with Upgrade header) |
| 30 | MinIO routes | `/minio`, `/minio-api` |
| 25 | AI services | `/models`, `/embeddings`, `/webhook` |
| 20 | Auth & n8n | `/api/auth`, `/n8n` |
| 15 | Metrics API | `/api/metrics` |
| 10 | General API | `/api` |
| 1 | Frontend | `/` |

## TLS/HTTPS

### Let's Encrypt Integration

Automatic certificate provisioning via ACME HTTP challenge:

**Certificate Storage:** `/letsencrypt/acme.json` (Docker volume)

**Domains:**
- Primary: `arasul.local`
- Wildcards: `*.arasul.local`

**Configuration:**
```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@arasul.local
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web
```

### HTTP to HTTPS Redirect

All HTTP traffic (port 80) is automatically redirected to HTTPS (port 443):

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true
```

### Manual Certificate Setup

For development or air-gapped environments:

1. Generate self-signed certificate:
```bash
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout /letsencrypt/key.pem \
  -out /letsencrypt/cert.pem \
  -days 365 \
  -subj "/CN=arasul.local"
```

2. Update `traefik.yml`:
```yaml
tls:
  certificates:
    - certFile: /letsencrypt/cert.pem
      keyFile: /letsencrypt/key.pem
```

## Rate Limiting

### Configuration

Rate limits use Traefik's `rateLimit` middleware with token bucket algorithm:

```yaml
rate-limit-llm:
  rateLimit:
    average: 10      # 10 requests per period
    period: 1s       # Period duration
    burst: 5         # Allow 5 burst requests
```

### Rate Limit Headers

Responses include:
- `X-RateLimit-Limit`: Maximum requests
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

### Testing Rate Limits

```bash
# Test LLM rate limit (10 req/s)
for i in {1..15}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://arasul.local/models/api/generate
done
# First 15 should be 200/429

# Test auth rate limit (5 req/min)
for i in {1..10}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://arasul.local/api/auth/login
done
# After 5 requests, should get 429 Too Many Requests
```

## WebSocket Support

Traefik automatically upgrades HTTP connections to WebSocket when:
1. Client sends `Connection: Upgrade` header
2. Client sends `Upgrade: websocket` header

### Tested Routes:
- **Dashboard Metrics**: `wss://arasul.local/api/metrics/live-stream`
- **n8n**: `wss://arasul.local/n8n/...`

### Configuration:
No special configuration needed - WebSocket upgrade is automatic.

For explicit configuration (already in `websockets.yml`):
```yaml
dashboard-websocket:
  rule: "Host(`arasul.local`) && PathPrefix(`/api/metrics/live-stream`)"
  service: dashboard-backend-service
```

## Health Checks

All backend services have health checks:

| Service | Path | Interval | Timeout |
|---------|------|----------|---------|
| Dashboard Backend | `/api/health` | 10s | 2s |
| Dashboard Frontend | `/` | 30s | 3s |
| MinIO Console | `/` | 30s | 3s |
| MinIO API | `/minio/health/live` | 30s | 3s |
| LLM Service | `/health` | 30s | 5s |
| Embeddings | `/health` | 30s | 5s |
| n8n | `/healthz` | 30s | 3s |

Unhealthy backends are automatically removed from load balancing.

## Monitoring

### Access Logs

Location: `/arasul/logs/traefik-access.log`

Format: JSON with fields:
- `ClientAddr`: Client IP
- `RequestMethod`: HTTP method
- `RequestPath`: Request path
- `RouterName`: Matched router
- `ServiceName`: Backend service
- `StatusCode`: HTTP status
- `Duration`: Request duration (ms)

**Only logs:**
- Errors (4xx, 5xx status codes)
- Slow requests (>100ms)

### Application Logs

Location: `/arasul/logs/traefik.log`

Format: JSON with fields:
- `level`: Log level (DEBUG, INFO, WARN, ERROR)
- `msg`: Log message
- `time`: Timestamp

### Prometheus Metrics

Endpoint: `http://traefik:8080/metrics`

Metrics include:
- `traefik_entrypoint_requests_total`
- `traefik_entrypoint_request_duration_seconds`
- `traefik_service_requests_total`
- `traefik_service_request_duration_seconds`

Query examples:
```promql
# Request rate per service
rate(traefik_service_requests_total[5m])

# P95 latency
histogram_quantile(0.95, traefik_service_request_duration_seconds_bucket)

# Error rate
sum(rate(traefik_service_requests_total{code=~"5.."}[5m]))
```

### Traefik Dashboard

URL: `http://arasul.local:8080/dashboard/`

**Security:** Only accessible from:
- localhost (127.0.0.1)
- Docker network (172.30.0.0/24)
- Local network (192.168.0.0/16, 10.0.0.0/8)

Shows:
- Active routers and services
- Health check status
- Request metrics
- TLS certificates

## Troubleshooting

### Check Traefik Logs

```bash
# Real-time logs
docker logs -f traefik

# File logs
tail -f /arasul/logs/traefik.log | jq .
tail -f /arasul/logs/traefik-access.log | jq .
```

### Test Routing

```bash
# Dashboard frontend
curl -I https://arasul.local/

# Dashboard API
curl -I https://arasul.local/api/system/status

# MinIO console
curl -I https://arasul.local/minio/

# LLM service
curl -I https://arasul.local/models/api/version
```

### Verify TLS

```bash
# Check certificate
openssl s_client -connect arasul.local:443 -servername arasul.local

# Test HTTPS redirect
curl -I http://arasul.local/
# Should return 301/308 redirect to https://
```

### Debug Configuration

```bash
# Validate static config
docker exec traefik traefik version

# Check dynamic config
docker exec traefik cat /etc/traefik/dynamic/routes.yml

# Test middleware
curl -H "Host: arasul.local" http://localhost/api/metrics/live
```

### Common Issues

**1. 404 Not Found**
- Check router rule matches request
- Verify priority is correct
- Check service is healthy

**2. 502 Bad Gateway**
- Backend service is down
- Check service health
- Verify service URL

**3. 429 Too Many Requests**
- Rate limit exceeded
- Wait for period to reset
- Check rate limit configuration

**4. Certificate Errors**
- Let's Encrypt challenge failing
- Check port 80 is accessible
- Verify email in config
- Check `/letsencrypt/acme.json` permissions (600)

## Security Best Practices

1. **Keep Traefik Updated**
   ```bash
   docker pull traefik:v2.11
   docker-compose up -d traefik
   ```

2. **Restrict Dashboard Access**
   - Keep `admin-whitelist` middleware enabled
   - Never expose port 8080 externally
   - Use SSH tunnel for remote access

3. **Monitor Rate Limits**
   - Review access logs for 429 errors
   - Adjust limits based on usage patterns
   - Block abusive IPs via middleware

4. **Regular Certificate Rotation**
   - Let's Encrypt auto-renews at 60 days
   - Monitor certificate expiry
   - Test renewal: `docker exec traefik traefik healthcheck`

5. **Secure Headers**
   - Keep `security-headers` middleware on all routes
   - Adjust CORS for production domains
   - Never disable TLS in production

## See Also

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [PRD §18 - Reverse Proxy](../../prd.md#18-reverse-proxy)
- [LOGGING.md](../../LOGGING.md) - Log analysis
