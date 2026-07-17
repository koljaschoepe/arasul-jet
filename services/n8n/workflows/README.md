# n8n Workflow Templates

Pre-configured workflow templates for the Arasul Platform.

## Available Workflows

| Workflow                   | Description                                | Schedule          |
| -------------------------- | ------------------------------------------ | ----------------- |
| `db-maintenance.json`      | Database cleanup and optimization          | Daily             |
| `alerting-pipeline.json`   | Processes alerts and sends notifications   | Webhook-triggered |
| `system-health-check.json` | Monitors system health and triggers alerts | Every 5 minutes   |

## Import Instructions

### Via n8n UI

1. Open n8n at `http://localhost:5678`
2. Click **Workflows** → **Import from File**
3. Select the workflow JSON file
4. Configure credentials (see below)
5. Activate the workflow

### Via n8n CLI

```bash
# Import workflow
docker exec -it n8n n8n import:workflow --input=/home/node/.n8n/workflows/db-maintenance.json

# List imported workflows
docker exec -it n8n n8n export:workflow --all
```

## Required Credentials

Before activating workflows, configure these credentials in n8n:

### 1. Arasul PostgreSQL

- **Type:** PostgreSQL
- **Host:** `postgres-db`
- **Port:** `5432`
- **Database:** `arasul_db`
- **User:** `arasul`
- **Password:** (from `POSTGRES_PASSWORD` env var)

### 2. Internal API Key

- **Type:** Header Auth
- **Name:** `Authorization`
- **Value:** `Bearer <JWT_TOKEN>`

Generate a service token:

```bash
curl -X POST http://localhost:3001/api/auth/service-token \
  -H "Content-Type: application/json" \
  -d '{"service": "n8n"}'
```

## Workflow Details

### DB Maintenance

Runs daily at midnight:

- Deletes metrics older than 30 days
- Removes expired sessions and tokens
- Cleans audit logs older than 90 days
- Runs VACUUM ANALYZE on all tables
- Reports the result to the dashboard backend

### Alerting Pipeline

Receives alerts via webhook (`POST /webhook/alerts`):

- Normalizes alert structure
- Routes by severity (critical/warning/info)
- Logs all alerts to database

**Webhook Payload:**

```json
{
  "type": "cpu_critical",
  "severity": "critical",
  "source": "health-check",
  "message": "CPU usage critically high",
  "value": 95,
  "threshold": 90
}
```

### System Health Check

Runs every 5 minutes:

- Fetches live system metrics
- Checks service health status
- Compares against thresholds
- Forwards alerts to Alerting Pipeline

**Default Thresholds:**
| Metric | Warning | Critical |
|--------|---------|----------|
| CPU | 80% | 95% |
| RAM | 85% | 95% |
| GPU | 85% | 95% |
| Temperature | 75°C | 85°C |
| Disk | 80% | 90% |

## Environment Variables

These workflows require the PostgreSQL credential and the Internal API Key
described above. Configure them in n8n via **Settings** → **Credentials**.

## Troubleshooting

### Workflow Not Triggering

1. Check workflow is activated (toggle ON)
2. Verify credentials are configured
3. Check n8n logs: `docker compose logs n8n`

### Database Connection Failed

1. Verify postgres-db is healthy
2. Check credentials match `.env` values
3. Test connection: `docker exec postgres-db pg_isready`
