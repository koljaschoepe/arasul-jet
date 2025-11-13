# Arasul Platform - Logging Infrastructure

## Overview

The Arasul Platform implements comprehensive logging with automatic rotation and centralized file management.

## Log Structure

All logs are stored in `/arasul/logs/` with the following structure:

```
/arasul/logs/
├── system.log              # General system events (Dashboard, API, DB)
├── self_healing.log        # Self-healing events (JSON format)
├── update.log              # System update events
├── service/                # Per-service logs
│   ├── dashboard-backend.log
│   ├── metrics-collector.log
│   └── ...
└── containers/             # Docker container logs (optional)
    ├── postgres-db.log
    └── ...
```

## Log Rotation

**Automatic rotation via logrotate:**
- **Size limit:** 50MB per file
- **Retention:** 10 rotated files
- **Compression:** gzip (delayed compression)
- **Schedule:** Hourly checks + daily rotation
- **Total storage per log:** ~500MB (50MB × 10 files)

**Configuration:** `/etc/logrotate.d/arasul`

**Manual rotation:**
```bash
sudo logrotate -f /etc/logrotate.d/arasul
```

**Check rotation status:**
```bash
cat /var/lib/logrotate/arasul.status
```

## Log Levels

All loggers support standard log levels:

- `DEBUG` - Verbose debugging information
- `INFO` - General informational messages (default)
- `WARN` - Warning messages
- `ERROR` - Error messages
- `CRITICAL` - Critical errors requiring immediate attention

**Set log level via environment:**
```bash
export LOG_LEVEL=debug  # or info, warn, error, critical
```

## System Log (`system.log`)

General system events including:
- Server start/stop
- API requests/responses
- Database connections
- Service errors

**Format:** Human-readable with timestamps
```
[2025-01-11T10:30:45.123Z] [INFO] [server] Server started on port 3001
[2025-01-11T10:30:50.456Z] [INFO] [api] GET /api/system/status 200 15ms
[2025-01-11T10:31:00.789Z] [ERROR] [database] Connection error: timeout
```

**Usage in Node.js:**
```javascript
const { systemLogger } = require('./utils/fileLogger');

systemLogger.serverStart(3001);
systemLogger.apiRequest('GET', '/api/status', 200, 15);
systemLogger.apiError('POST', '/api/data', new Error('Validation failed'));
```

## Self-Healing Log (`self_healing.log`)

Self-healing events in structured JSON format for easy parsing and analysis.

**Format:** JSON (one event per line)
```json
{
  "timestamp": "2025-01-11T10:35:00.000Z",
  "event_type": "service_restart",
  "severity": "WARNING",
  "description": "Restarting service: dashboard-backend",
  "action_taken": "Service restart initiated",
  "service_name": "dashboard-backend",
  "reason": "health_check_failed",
  "service": "self-healing-agent",
  "pid": 1234
}
```

**Usage in Python:**
```python
from logger import get_logger

logger = get_logger()

# Simple events
logger.info("health_check", "System healthy")
logger.warning("cpu_overload", "CPU at 95%", action_taken="Throttling services")

# Convenience methods
logger.service_restart("dashboard-backend", "health check failed", success=True, duration_ms=2500)
logger.cpu_overload(95.5, "Throttling LLM service")
logger.temperature_warning(87.5, "Activating cooling")
logger.system_reboot("Critical failures detected", scheduled=True)
```

**Query logs:**
```bash
# All critical events
jq 'select(.severity=="CRITICAL")' /arasul/logs/self_healing.log

# Service restarts in last hour
jq 'select(.event_type=="service_restart")' /arasul/logs/self_healing.log | tail -n 20

# CPU warnings
jq 'select(.event_type | contains("cpu"))' /arasul/logs/self_healing.log
```

## Update Log (`update.log`)

System update events including upload, validation, application, and rollback.

**Format:** Human-readable with source tags
```
[2025-01-11T11:00:00.000Z] [INFO] [upload] Update upload started: update-1.2.0.araupdate (52428800 bytes)
[2025-01-11T11:00:15.123Z] [INFO] [validation] Validation passed: update-1.2.0.araupdate (version 1.2.0)
[2025-01-11T11:00:20.456Z] [INFO] [apply] Applying update to version 1.2.0
[2025-01-11T11:05:30.789Z] [INFO] [apply] Update completed: version 1.2.0 (310333ms)
```

**Usage:**
```javascript
const { updateLogger } = require('./utils/fileLogger');

updateLogger.uploadStarted('update-1.2.0.araupdate', 52428800);
updateLogger.validationPassed('update-1.2.0.araupdate', '1.2.0');
updateLogger.applyStarted('1.2.0');
updateLogger.applyStep('backup', 'Creating system backup');
updateLogger.applyCompleted('1.2.0', 310333);
```

## Service Logs (`service/*.log`)

Per-service logs for detailed debugging.

**Usage:**
```javascript
const { createServiceLogger } = require('./utils/fileLogger');

const logger = createServiceLogger('dashboard-backend');

logger.info('WebSocket connection established', { client_id: '123' });
logger.warn('High memory usage', { memory_mb: 512 });
logger.error('Database query failed', { query: 'SELECT ...', error: 'timeout' });
```

## Docker Container Logs

Docker's built-in logging with size limits:
- **Max size:** 50MB per file
- **Max files:** 5
- **Compression:** Enabled
- **Driver:** json-file

**View container logs:**
```bash
docker-compose logs -f dashboard-backend
docker logs postgres-db --tail 100
```

**Export container logs:**
```bash
docker logs postgres-db > /arasul/logs/containers/postgres-db.log 2>&1
```

## Setup

**Install logging infrastructure:**
```bash
sudo ./scripts/setup_logrotate.sh
```

This will:
1. Install logrotate if not present
2. Create `/arasul/logs/` directory structure
3. Install logrotate config to `/etc/logrotate.d/arasul`
4. Setup hourly rotation checks
5. Initialize log files with correct permissions

**Manual setup:**
```bash
# Create log directories
sudo mkdir -p /arasul/logs/{service,containers}
sudo chown -R arasul:arasul /arasul/logs
sudo chmod 755 /arasul/logs

# Copy logrotate config
sudo cp config/logrotate.d/arasul /etc/logrotate.d/arasul
sudo chmod 644 /etc/logrotate.d/arasul

# Test configuration
sudo logrotate -d /etc/logrotate.d/arasul
```

## Monitoring Logs

**Real-time monitoring:**
```bash
# All system logs
tail -f /arasul/logs/system.log

# Self-healing events
tail -f /arasul/logs/self_healing.log | jq .

# Updates
tail -f /arasul/logs/update.log

# All logs
tail -f /arasul/logs/*.log
```

**Search logs:**
```bash
# Errors in system log
grep ERROR /arasul/logs/system.log

# Critical events (JSON)
grep '"severity":"CRITICAL"' /arasul/logs/self_healing.log | jq .

# Recent service restarts
grep service_restart /arasul/logs/self_healing.log | tail -n 10 | jq .
```

**Log analysis:**
```bash
# Count events by type
jq -r .event_type /arasul/logs/self_healing.log | sort | uniq -c

# Events in last hour
jq 'select(.timestamp > "'$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)'")' \
  /arasul/logs/self_healing.log

# Service restart frequency
jq 'select(.event_type=="service_restart") | .service_name' \
  /arasul/logs/self_healing.log | sort | uniq -c | sort -rn
```

## Integration with Services

**Dashboard Backend:**
```javascript
// In app.js or server.js
const { systemLogger } = require('./utils/fileLogger');

// Log server start
systemLogger.serverStart(PORT);

// Log API requests (middleware)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    systemLogger.apiRequest(req.method, req.path, res.statusCode, duration);
  });
  next();
});

// Error handler
app.use((err, req, res, next) => {
  systemLogger.apiError(req.method, req.path, err);
  // ... send error response
});
```

**Self-Healing Agent:**
```python
# In main.py
from logger import get_logger

logger = get_logger()

def main():
    logger.info("agent_start", "Self-healing agent started")

    while True:
        cycle_start = time.time()
        issues, actions = check_health()
        duration_ms = int((time.time() - cycle_start) * 1000)

        logger.check_cycle_complete(
            cycle_number,
            issues_found=issues,
            actions_taken=actions,
            duration_ms=duration_ms
        )
```

## Troubleshooting

**Logs not rotating:**
```bash
# Test rotation manually
sudo logrotate -f -v /etc/logrotate.d/arasul

# Check logrotate status
cat /var/lib/logrotate/arasul.status

# Check cron job
ls -la /etc/cron.hourly/arasul-logrotate
```

**Permission errors:**
```bash
# Fix ownership
sudo chown -R arasul:arasul /arasul/logs

# Fix permissions
sudo chmod 755 /arasul/logs
sudo chmod 644 /arasul/logs/*.log
```

**Disk space issues:**
```bash
# Check log sizes
du -sh /arasul/logs/*

# Force rotation
sudo logrotate -f /etc/logrotate.d/arasul

# Clean old compressed logs
find /arasul/logs -name "*.gz" -mtime +30 -delete
```

## Best Practices

1. **Use appropriate log levels:**
   - `DEBUG`: Only in development
   - `INFO`: Normal operations
   - `WARN`: Potential issues
   - `ERROR`: Actual errors
   - `CRITICAL`: System failures

2. **Include context:**
   ```javascript
   logger.error('Database query failed', {
     query: sql,
     params: params,
     error: err.message,
     user_id: userId
   });
   ```

3. **Avoid logging sensitive data:**
   - Never log passwords, tokens, or API keys
   - Mask or hash user data
   - Sanitize input before logging

4. **Monitor log growth:**
   - Check `/arasul/logs/` size regularly
   - Ensure rotation is working
   - Alert on excessive growth

5. **Structured logging for automation:**
   - Use JSON for machine-readable logs
   - Include consistent fields
   - Enable easy parsing and analysis

## See Also

- [PRD §35 - Logging & Retention](../prd.md#35-logging)
- [Logrotate Documentation](https://linux.die.net/man/8/logrotate)
- [Docker Logging Drivers](https://docs.docker.com/config/containers/logging/configure/)
