# Self-Healing Agent

Autonomous service monitoring and recovery engine.

## Overview

| Property | Value |
|----------|-------|
| Port | 9200 (internal) |
| Runtime | Python 3.10+ |
| Check Interval | 10 seconds |
| Strategy | 4-tier recovery |

## Directory Structure

```
self-healing-agent/
├── healing_engine.py         # Main recovery engine
├── gpu_recovery.py           # NVIDIA GPU error handling
├── usb_monitor.py            # USB update detection
├── heartbeat.py              # Service health checks
├── post_reboot_validation.py # Post-reboot system validation
├── verify_healing.py         # Manual verification tool
├── logger.py                 # Custom logging
├── requirements.txt          # Python dependencies
├── Dockerfile               # Container definition
└── tests/
    └── test_healing_mock.py  # Unit tests
```

## 4-Tier Recovery Strategy

### Category A: Service Down
Container healthcheck fails 3 consecutive times.

**Actions (escalating):**
1. Restart container
2. Stop + Start container
3. Escalate to Category C

### Category B: Overload
Resource thresholds exceeded.

| Resource | Warning | Critical |
|----------|---------|----------|
| CPU | 80% | 90% |
| RAM | 80% | 90% |
| GPU | 90% | 95% |
| Temperature | 75°C | 83°C |
| Disk | 80% | 90% |

**Actions (escalating):**
1. Clear service cache
2. Reset service session
3. Enable throttling
4. Restart service
5. Escalate to Category C

### Category C: Critical
Multiple failures or system-level issues.

**Triggers:**
- Database connection lost
- MinIO corruption detected
- 3+ service failures in 10 minutes

**Actions:**
1. Hard restart all affected services
2. Disk cleanup (temporary files)
3. Database vacuum
4. GPU reset (if needed)
5. Full system restart (all containers)

### Category D: Ultima Ratio
System-level emergency.

**Triggers:**
- Disk usage >97%
- Database inconsistent
- GPU permanently failed
- 3 critical events in 30 minutes

**Action:** System reboot (if enabled)

## Monitored Services

| Category | Services |
|----------|----------|
| System | postgres-db, minio, qdrant, reverse-proxy, metrics-collector |
| Application | llm-service, embedding-service, n8n, dashboard-backend, dashboard-frontend |
| Self | document-indexer |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| SELF_HEALING_INTERVAL | 10 | Check interval (seconds) |
| SELF_HEALING_ENABLED | true | Enable healing actions |
| SELF_HEALING_REBOOT_ENABLED | false | Enable system reboot |
| DISK_WARNING_PERCENT | 80 | Disk warning threshold |
| DISK_CLEANUP_PERCENT | 90 | Disk cleanup threshold |
| DISK_CRITICAL_PERCENT | 95 | Disk critical threshold |
| DISK_REBOOT_PERCENT | 97 | Disk reboot threshold |
| CPU_CRITICAL_PERCENT | 90 | CPU critical threshold |
| RAM_CRITICAL_PERCENT | 90 | RAM critical threshold |
| GPU_CRITICAL_PERCENT | 95 | GPU critical threshold |
| TEMP_THROTTLE_CELSIUS | 83 | Temperature throttle |
| TEMP_RESTART_CELSIUS | 85 | Temperature restart |

## Event Logging

All healing actions are logged to PostgreSQL:

```sql
INSERT INTO self_healing_events (
  event_type,
  severity,
  description,
  action_taken,
  timestamp
)
```

**Severity levels:** INFO, WARNING, CRITICAL

## GPU Recovery

Handles NVIDIA GPU errors:

- CUDA errors → GPU reset
- Driver failures → Container restart
- Memory leaks → Cache clear + restart
- Temperature throttling → Workload reduction

## USB Update Detection

Monitors USB devices for `.araupdate` files:

1. Detect USB mount
2. Scan for update packages
3. Validate signature
4. Trigger update process
5. Log result

## Health Check

```bash
python heartbeat.py --test
```

Returns exit code 0 if healthy.

## Dependencies

- docker (7.0.0) - Docker API client
- psycopg2-binary (2.9.9) - PostgreSQL (with connection pooling)
- psutil (5.9.6) - System monitoring
- requests (2.31.0) - HTTP client
- python-dotenv (1.0.0) - Environment configuration

## Connection Pooling

Uses PostgreSQL connection pool to prevent connection exhaustion:

```python
# Pool configuration
MIN_CONNECTIONS = 1
MAX_CONNECTIONS = 5
```

This prevents the "too many connections" issue (HIGH-015 fix).

## Manual Verification

```bash
# Verify healing is working
python verify_healing.py

# Check specific service
docker exec self-healing-agent python -c "from healing_engine import check_service; check_service('llm-service')"
```

## Related Documentation

- [Self-Healing Implementation](../../docs/SELF_HEALING_IMPLEMENTATION.md) - Detailed strategy
- [GPU Error Handling](../../docs/GPU_ERROR_HANDLING.md) - GPU recovery details
- [Metrics Collector](../metrics-collector/README.md) - Source of threshold data
