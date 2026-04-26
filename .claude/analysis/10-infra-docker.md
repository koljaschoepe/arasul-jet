# Docker Compose & Traefik — Findings

## BLOCKERS

### I-B01: Embedding-Service start_period 600s viel zu lang

- `compose/compose.ai.yaml:154`: `start_period: 600s` (10min)
- document-indexer wartet (depends_on healthy) → Chain-Stall
- Fix: 300s + timeout auf 10s erhöhen (von 5s)

### I-B02: LLM-Healthcheck kann hängen (nvidia-smi)

- `services/llm-service/healthcheck.sh:65-73` — timeout 5 pro Call, aber Script kann insgesamt länger blockieren
- Fix: Gesamter Healthcheck in `timeout 20 bash -c 'main'` wrappen

## MAJORS

### I-M01: N8n-Healthcheck unzuverlässig (wget, timeout 2s)

- `compose/compose.app.yaml:211-216`
- Fix: `curl -f --max-time 3 http://localhost:5678/healthz`

### I-M02: Backup-Service Healthcheck prüft nur `pgrep crond`

- Running crond ≠ working backups
- Fix: Health-Endpoint prüft jüngstes Backup-Timestamp

### I-M03: Docker-Proxy Healthcheck prüft keine Netzwerk-Konnektivität

- Wenn Netzwerk-Init langsam → Traefik's docker-provider fails silently

### I-M04: RAM_LIMIT-Defaults für Jetson Nano (4GB) inkompatibel

- LLM=32G, Embedding=12G, Qdrant=6G, Postgres=4G → Orin64GB OK, Nano/Xavier scheitert
- Fix: Profile-based overrides in compose.override.<profile>.yaml

### I-M05: Hardcoded group_add '994' (docker group)

- `compose/compose.app.yaml:29-30` — GID 994 system-abhängig
- Alternative: docker-socket-proxy (bereits da) exklusiv nutzen

### I-M06: LD_LIBRARY_PATH Jetson-hardcoded

- `compose/compose.ai.yaml:65` — JetPack 6-spezifisch
- Für Thor (JetPack 7): Paths anpassen

## MINORS

- I-m01: Healthcheck-Intervals nicht konsistent (10/15/30/60s) — standardisieren auf 30s
- I-m02: Traefik-Access-Log filtert 400-599, ok aber für Debugging 200-399 einschalten
- I-m03: Promtail: `/var/lib/docker/containers` hardcoded — dokumentieren
- I-m04: Metrics-Collector Healthcheck prüft nicht /sys-Lesbarkeit
- I-m05: Image-Pinning gut (postgres:16-alpine, minio:RELEASE.2025-09-07, qdrant:v1.16.1) aber Build-ARG-Versionen (PYTHON_VERSION, L4T_PYTORCH_TAG) nicht in .env

## OK / SEHR GUT

- 15 Services mit Healthchecks + depends_on service_healthy
- Named Volumes (arasul-postgres/minio/qdrant/llm-models/embeddings-models/n8n/metrics/logs/loki)
- CSP + CORS mit Private-Network-Regex (LAN-only)
- Rate-Limit-Auth 30/min (war 5/15min, zu strikt)
- TLS Self-Signed OK für arasul.local
- Traefik responseForwarding.flushInterval 1ms (SSE-Streaming)
- forward-auth für Traefik-Dashboard (nicht basicAuth)
- no-new-privileges auf security-relevante Services
- restart: always überall
- SSE-Flush-Interval 1ms für Live-Streams

## Matrix (laufend OK):

postgres-db ✓ | minio ✓ | qdrant ✓ | llm-service ✓ GPU | embedding-service ✓ GPU | document-indexer ✓ | dashboard-backend ✓ | dashboard-frontend ✓ | n8n ✓ | metrics-collector ✓ | self-healing-agent ✓ | backup-service ✓ | reverse-proxy (Traefik) ✓ | docker-proxy ✓

## Priorität für Rollout

1. I-B01 (Embedding start_period) — sofort, beeinflusst First-Run-Experience
2. I-B02 (LLM-Healthcheck Timeout-Wrapper)
3. I-M04 (RAM-Profile für Jetson-Varianten)
4. I-M06 (LD_LIBRARY_PATH für Thor/JP7)
