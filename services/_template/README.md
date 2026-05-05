# <Service Name>

One-sentence description: what this service does and why it exists.

## Overview

| Property      | Value                 |
| ------------- | --------------------- |
| Base image    | `python:3.11.12-slim` |
| Framework     | Flask                 |
| Port          | 8080 (internal)       |
| Compose entry | `compose/<file>.yaml` |
| Health check  | `GET /healthz`        |

## Components

```
<service-name>/
├── Dockerfile         Build instructions (template uses python:3.11-slim)
├── requirements.txt   Python deps (pinned)
├── server.py          Flask app entrypoint
└── tests/             pytest suites (optional, encouraged)
```

## API

- `GET /healthz` — liveness check. Returns `{"status": "ok"}`.
- _Add your endpoints here, one bullet each: method, path, request shape, response shape._

## Environment variables

| Var         | Required | Default | Purpose               |
| ----------- | -------- | ------- | --------------------- |
| `LOG_LEVEL` | no       | `INFO`  | Python logging level. |

## Local testing

```bash
cd services/<service-name>
docker build -t arasul-<service-name>:dev .
docker run --rm -p 8080:8080 arasul-<service-name>:dev
curl localhost:8080/healthz
```

## Wiring into compose

1. Decide which compose file the service belongs to (`compose.core.yaml`, `compose.monitoring.yaml`, ...).
2. Add a service block — see neighbouring services for the established pattern (build context, volumes, networks, depends_on, healthcheck).
3. If the service needs secrets, mount them via `compose.secrets.yaml`, never via env-vars in the public compose file.
4. Document any new env vars in [`docs/ENVIRONMENT_VARIABLES.md`](../../docs/ENVIRONMENT_VARIABLES.md).

## Conventions

See [`services/CLAUDE.md`](../CLAUDE.md) for the cross-service contract (Dockerfile rules, naming, healthcheck format, log destinations).
