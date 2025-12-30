# Metrics Collector

System metrics collection service for real-time monitoring.

## Overview

| Property | Value |
|----------|-------|
| Port | 9100 (internal) |
| Framework | aiohttp |
| Runtime | Python 3.10+ |
| Live Interval | 5 seconds |
| Persist Interval | 30 seconds |

## Directory Structure

```
metrics-collector/
├── collector.py      # Main collector & HTTP server
├── gpu_monitor.py    # NVIDIA GPU monitoring via pynvml
├── requirements.txt  # Python dependencies
├── Dockerfile       # Container definition
└── tests/
    └── test_collector.py  # Unit tests
```

## Metrics Collected

| Metric | Source | Unit |
|--------|--------|------|
| CPU Usage | psutil | % |
| RAM Usage | psutil | % |
| GPU Usage | pynvml (NVML) | % |
| Temperature | psutil/nvml | °C |
| Disk Used | psutil | bytes |
| Disk Free | psutil | bytes |
| Disk Percent | psutil | % |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/metrics` | Current metrics (JSON) |
| GET | `/health` | Health check |
| GET | `/gpu` | GPU-specific metrics |

### GET /metrics

**Response:**
```json
{
  "cpu": 45.2,
  "ram": 62.8,
  "gpu": 30.5,
  "temperature": 55.0,
  "disk": {
    "used": 107374182400,
    "free": 429496729600,
    "total": 536870912000,
    "percent": 20.0
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Data Flow

```
┌─────────────┐     5s      ┌──────────────┐
│   psutil    │ ─────────▶  │   In-Memory  │
│   pynvml    │             │    Cache     │
└─────────────┘             └──────┬───────┘
                                   │
                                   │ HTTP
                                   ▼
                            ┌──────────────┐
                            │   Clients    │
                            │  (Backend,   │
                            │   Frontend)  │
                            └──────────────┘
                                   │
                                   │ 30s
                                   ▼
                            ┌──────────────┐
                            │  PostgreSQL  │
                            │  (7-day      │
                            │  retention)  │
                            └──────────────┘
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| METRICS_INTERVAL_LIVE | 5 | Live collection interval (seconds) |
| METRICS_INTERVAL_PERSIST | 30 | Database persist interval (seconds) |
| METRICS_RETENTION_DAYS | 7 | Data retention period |
| POSTGRES_HOST | postgres-db | Database host |
| POSTGRES_PORT | 5432 | Database port |
| POSTGRES_USER | arasul | Database user |
| POSTGRES_DB | arasul_db | Database name |

## Database Tables

Metrics are persisted to PostgreSQL:

- `metrics_cpu` (timestamp, value)
- `metrics_ram` (timestamp, value)
- `metrics_gpu` (timestamp, value)
- `metrics_temperature` (timestamp, value)
- `metrics_disk` (timestamp, used, free, percent)

Auto-cleanup removes data older than 7 days.

## GPU Monitoring

Uses NVIDIA Management Library (NVML) via pynvml:

```python
# GPU metrics via pynvml
- GPU utilization %
- GPU memory used/total
- GPU temperature
- Power draw
```

Falls back gracefully if GPU unavailable.

## Dependencies

- aiohttp (3.9.1) - Async HTTP server
- psutil (5.9.6) - System metrics
- pynvml (11.5.0) - NVIDIA GPU metrics
- psycopg2-binary (2.9.9) - PostgreSQL client
- python-dotenv (1.0.0) - Environment configuration

## Health Check

```bash
curl http://localhost:9100/health
```

Returns `200 OK` with current metrics summary.

## WebSocket Integration

The Dashboard Backend proxies metrics to frontend via WebSocket:

```
Metrics Collector (HTTP) → Dashboard Backend → Frontend (WebSocket)
```

5-second update interval maintains real-time display.

## Related Documentation

- [Dashboard Backend](../dashboard-backend/README.md) - WebSocket proxy
- [Self-Healing Agent](../self-healing-agent/README.md) - Uses metrics for thresholds
