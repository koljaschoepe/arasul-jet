# Context: n8n Workflow Automation

## Quick Reference

**Service:** n8n Container (Docker, Port 5678)
**UI:** Via Traefik unter `/n8n/` (Basic Auth geschützt)
**Custom Nodes:** `services/n8n/custom-nodes/n8n-nodes-arasul-*`
**Database:** PostgreSQL (Schema: `n8n`)
**Dockerfile:** `services/n8n/Dockerfile` (Multi-Stage: Build Custom Nodes → n8n Base Image)

---

## Architektur

```
n8n (5678)
├── Core n8n Engine (v1.121.1)
├── Custom Nodes (TypeScript, compiled at Docker build):
│   ├── n8n-nodes-arasul-llm        # Ollama LLM integration
│   └── n8n-nodes-arasul-embeddings # Text vectorization
├── Database: PostgreSQL (schema: n8n)
├── Traefik Route: /n8n/* (Basic Auth + Forward Auth)
└── Depends on: postgres-db, llm-service, embedding-service, minio
```

---

## Custom Arasul Nodes

### Arasul LLM Node

Connects to Ollama for LLM inference (non-streaming).

**Parameters:**

- `model`: LLM model name (e.g., `qwen3:14b-q8`)
- `prompt`: User prompt
- `systemPrompt`: System instructions
- `temperature`: 0.0-1.0
- `maxTokens`: Maximum response tokens

**Output:**

```json
{ "response": "LLM response text", "model": "qwen3:14b-q8", "tokens": 150 }
```

### Arasul Embeddings Node

Generates text embeddings via embedding-service.

**Parameters:**

- `text`: Text to embed
- `model`: Embedding model (default: `BAAI/bge-m3`)

**Output:**

```json
{ "embedding": [0.123, -0.456, ...], "dimensions": 1024 }
```

---

## External LLM API (für n8n HTTP-Node)

Das Dashboard-Backend bietet einen vereinfachten LLM-Endpoint für n8n:

```
POST /api/v1/external/llm/chat
Header: X-API-Key: aras_<32-char-hex>

Body: { "messages": [...], "model": "qwen3:14b-q8" }
Response: { "response": "...", "model": "...", "tokens": ... }
```

Dieser Endpoint ist API-Key-authentifiziert (nicht JWT) und non-streaming.

---

## Workflow-Patterns

### Webhook → LLM → Response

```
Webhook (POST /webhook/chat)
  → Arasul LLM Node (prompt from body)
  → Respond to Webhook (JSON response)
```

### Scheduled Task → Database → Notification

```
Schedule Trigger (daily at 3:00)
  → PostgreSQL (VACUUM ANALYZE)
  → Telegram (send maintenance report)
```

### Document Processing Pipeline

```
Webhook (file upload)
  → HTTP Request (POST to MinIO)
  → Wait (indexing)
  → HTTP Request (POST to document-indexer /search)
  → Arasul LLM (summarize results)
```

---

## Custom Node Development

### Verzeichnis-Struktur

```
services/n8n/custom-nodes/n8n-nodes-arasul-llm/
├── package.json
├── tsconfig.json
├── src/nodes/ArasulLlm/
│   ├── ArasulLlm.node.ts     # Node-Implementierung
│   └── ArasulLlm.node.json   # UI-Definition
└── index.ts                    # Export
```

### Build-Prozess

Custom Nodes werden im Dockerfile Multi-Stage Build kompiliert:

1. Stage 1: `npm install && npm run build` für jeden Custom Node
2. Stage 2: Kopiere kompilierte Nodes nach `/custom-nodes/` im n8n-Container

### Lokaler Test

```bash
docker compose up -d --build n8n
docker compose logs -f n8n
```

---

## Umgebungsvariablen

| Variable            | Default       | Beschreibung                |
| ------------------- | ------------- | --------------------------- |
| N8N_HOST            | 0.0.0.0       | Listen-Adresse              |
| N8N_PORT            | 5678          | Port                        |
| N8N_PATH            | /n8n          | Base-Path (Traefik)         |
| N8N_ENCRYPTION_KEY  | (Secret)      | Credentials-Verschlüsselung |
| N8N_PUSH_BACKEND    | websocket     | WebSocket für Live-Updates  |
| N8N_RUNNERS_ENABLED | true          | Task Runner                 |
| GENERIC_TIMEZONE    | Europe/Berlin | Zeitzone für Schedules      |

---

## Checklist

- [ ] Workflow erstellt und getestet
- [ ] Webhook-Path ist eindeutig
- [ ] Error-Handling Nodes hinzugefügt
- [ ] Credentials sicher konfiguriert
- [ ] Rate-Limits berücksichtigt
- [ ] Bei Custom Node: Dockerfile neu bauen (`docker compose up -d --build n8n`)
