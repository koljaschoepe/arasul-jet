# Traefik Reverse Proxy Configuration

## Overview

Traefik serves as the central reverse proxy for the Arasul Platform, handling:

- HTTP/HTTPS routing
- TLS termination
- Rate limiting
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
    ├─→ Dashboard Backend API (/api, /v1/*)
    └─→ Apps (/apps, über das Backend)
```

## Configuration Files

### Static Configuration (`traefik.yml`)

Main Traefik configuration:

- **Entrypoints**: HTTP (80), HTTPS (443), Dashboard (8080)
- **Certificate Resolver**: Let's Encrypt ACME
- **Providers**: Docker labels + file-based dynamic config
- **Logging**: JSON format to `/arasul/logs/reverse-proxy/traefik.log`
- **Metrics**: Prometheus format

### Dynamic Configuration

#### `dynamic/routes.yml`

HTTP routers and services:

- **dashboard-frontend**: `/` → dashboard-frontend:3000
- **dashboard-api**: `/api` → dashboard-backend:3001
- **dashboard-v1-openai**: `/v1/chat`, `/v1/embeddings`, `/v1/models` → dashboard-backend:3001
- **auth-api**: `/api/auth` → dashboard-backend:3001 (stricter rate limit)
- **auth-probe-api**: `/api/auth/session`, `/api/auth/needs-setup` → dashboard-backend:3001
- **apps-frontend**, **apps-me**, **apps-me-test**: `/apps` → dashboard-backend:3001
- **traefik-dashboard**: `/api/traefik` → `api@internal` (forward-auth)

Sprachmodell und Einbettungen erreicht niemand mehr an Backend und
Warteschlange vorbei: die Direktwege `/models` und `/embeddings` sind am
06.10.2026 gefallen. Modelle gehen über `/api/models`, Einbettungen über
`/v1/embeddings`.

#### `dynamic/middlewares.yml`

Rate limiting and security:

**Rate Limits:**

- Auth API: 30 req/min, burst 10 (`rate-limit-auth`)
- Auth-Proben: 120 req/min (`rate-limit-auth-probe`)
- General API: 100 req/s (`rate-limit-api`)

**Security Headers:**

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security`
- Custom `X-Powered-By: Arasul Platform`

**Other Middlewares:**

- Compression (gzip)
- Body limit (50 MB)
- Forward-Auth (`/api/auth/verify`)

## Routing Priority

Routes are matched by priority (higher = first):

| Priority | Route         | Path                                          |
| -------- | ------------- | --------------------------------------------- |
| 50       | App-Anmeldung | `/apps/<id>/api/me`, `/apps/<id>/test/api/me` |
| 35       | Traefik       | `/api/traefik`                                |
| 30       | Apps          | `/apps`                                       |
| 25       | Auth-Proben   | `/api/auth/session`, `/api/auth/needs-setup`  |
| 20       | Auth          | `/api/auth`                                   |
| 12       | OpenAI-Weg    | `/v1/chat`, `/v1/embeddings`, `/v1/models`    |
| 10       | General API   | `/api`                                        |
| 1        | Frontend      | `/`                                           |

## TLS/HTTPS

### Das Zertifikat kommt vom Gerät selbst

Hier stand bis zum 27.08.2026 eine Anleitung für Let's Encrypt samt ACME-Resolver
und daneben ein `openssl req -x509` von Hand. Beides gab es nicht: `traefik.yml`
hat keinen `certificatesResolvers`-Block, und `arasul.local` ist eine Adresse im
lokalen Netz — Let's Encrypt kann sie gar nicht bestätigen.

Was es wirklich gibt (Phase C10):

```
config/traefik/certs/
  arasul-ca.key    der private Schlüssel der Geräte-CA. Verlässt das Gerät nie.
  arasul-ca.crt    das CA-Zertifikat. Diese Datei verteilt der Admin.
  arasul.key       der private Schlüssel des Geräts.
  arasul.crt       das Zertifikat des Geräts, dahinter die CA.
```

Angelegt von `scripts/security/geraete-zertifikat.sh` (aufgerufen von
`./arasul bootstrap`, `scripts/setup/preconfigure.sh` und `./arasul zertifikat`),
erneuert von der Selbstheilung, sobald weniger als 60 Tage bleiben. Traefik
liest die Dateien über `dynamic/tls.yml` unter `/etc/traefik/certs`.

Warum `stores.default.defaultCertificate` dort steht und `sniStrict` aus
bleibt: ein Aufruf über eine IP-Adresse schickt keinen Namen mit, und ohne
Vorgabezertifikat hätte Traefik an dieser Stelle nichts anzubieten.

Die ganze Geschichte, samt Anleitung zum Verteilen der CA auf Windows, macOS,
iOS und Android: [`docs/ops/NETZNAME_UND_ZERTIFIKAT.md`](../../docs/ops/NETZNAME_UND_ZERTIFIKAT.md).

### HTTP to HTTPS Redirect

All HTTP traffic (port 80) is automatically redirected to HTTPS (port 443):

```yaml
entryPoints:
  web:
    address: ':80'
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true
```

## Rate Limiting

### Configuration

Rate limits use Traefik's `rateLimit` middleware with token bucket algorithm:

```yaml
rate-limit-api:
  rateLimit:
    average: 100 # 100 requests per period
    period: 1s # Period duration
    burst: 50 # Allow 50 burst requests
```

### Die zwei Proben jeder Seitenladung

`GET /api/auth/session` und `GET /api/auth/needs-setup` haben seit dem
29.08.2026 eine eigene Middleware (`rate-limit-auth-probe`, 120 je Minute) und
einen eigenen Router mit hoeherer Prioritaet. Vorher lagen sie unter
`rate-limit-auth` mit 30 je Minute fuer das ganze Praefix `/api/auth` -- eine
Seitenladung kostet beide, also war ein Buero hinter einer NAT-IP nach fuenf
Seiten dicht. Das Backend hatte diese Grenze in G1 auf 120 gehoben; wirksam
wurde es erst, als hier dieselbe Zahl stand.

`scripts/test/drosselzahlen.py` prueft bei jedem Zug, dass der Vorbau nicht
enger ist als das Backend.

### Rate Limit Headers — es gibt KEINE

Traefiks `rateLimit` schickt **keine** `RateLimit-*`- oder
`X-RateLimit-*`-Kopfzeilen. Hier stand bis zum 29.08.2026 das Gegenteil, und
das war teuer: die Abnahmen fuehren ueber jede Drossel Buch, die eine
Kopfzeile traegt, meldeten „nie auf eine Drossel gewartet" und wurden trotzdem
rot -- an einer Drossel, die sie nicht sehen konnten.

Woran die beiden zu unterscheiden sind:

|               | Traefik                      | Backend (`express-rate-limit`) |
| ------------- | ---------------------------- | ------------------------------ |
| `RateLimit-*` | fehlen                       | immer da                       |
| Rumpf des 429 | `Too Many Requests` als Text | JSON mit `error`               |

Wer eine Drossel sucht, prueft deshalb **beide** Schichten. Ein 429 ohne
Kopfzeilen kam aus dem Vorbau und steht nicht im Backend-Log.

### Testing Rate Limits

```bash
# Test auth rate limit (30 req/min, burst 10 — die Proben haben ihre eigene)
for i in {1..10}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://arasul.local/api/auth/login
done
# After 5 requests, should get 429 Too Many Requests
```

## Health Checks

All backend services have health checks:

| Service            | Path          | Interval | Timeout |
| ------------------ | ------------- | -------- | ------- |
| Dashboard Backend  | `/api/health` | 10s      | 2s      |
| Dashboard Frontend | `/`           | 30s      | 3s      |

Unhealthy backends are automatically removed from load balancing.

## Monitoring

### Access Logs

Location: `/arasul/logs/reverse-proxy/traefik-access.log`

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

Location: `/arasul/logs/reverse-proxy/traefik.log`

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

Die API des Dashboards läuft nicht offen (`api.insecure: false`). Erreichbar ist
sie über den Router `traefik-dashboard` unter `/api/traefik`, hinter
`forward-auth` (eine gültige Sitzung des Geräts) und `rate-limit-auth`.

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
tail -f /arasul/logs/reverse-proxy/traefik.log | jq .
tail -f /arasul/logs/reverse-proxy/traefik-access.log | jq .
```

### Test Routing

```bash
# Dashboard frontend
curl -I https://arasul.local/

# Dashboard API
curl -I https://arasul.local/api/system/status
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
curl -I https://arasul.local/api/health
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
- Check `config/traefik/certs/arasul.crt` und `arasul.key` (`./arasul zertifikat` stellt sie neu aus)

## Security Best Practices

1. **Keep Traefik Updated**

   ```bash
   docker pull traefik:v2.11
   docker-compose up -d traefik
   ```

2. **Restrict Dashboard Access**
   - The dashboard route `/api/traefik` sits behind `forward-auth`
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
   - Never disable TLS in production

## See Also

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [LOGGING.md](../../docs/ops/LOGGING.md) - Log analysis
