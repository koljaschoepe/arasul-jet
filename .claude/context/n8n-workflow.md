# Context: n8n Workflow Automation

## Quick Reference

**Service:** `services/n8n/`
**UI:** Port 5678 (via Traefik: `/n8n/`)
**Custom Nodes:** `custom-nodes/n8n-nodes-arasul-*`
**Database:** PostgreSQL (schema: n8n)

---

## Architecture

```
n8n (5678)
├── Core n8n Engine
├── Custom Nodes:
│   ├── n8n-nodes-arasul-llm      # Ollama LLM integration
│   └── n8n-nodes-arasul-embeddings # Text vectorization
├── Database: PostgreSQL
└── Traefik Routes: /n8n/*
```

---

## Custom Nodes

### Arasul LLM Node

Connects to Ollama for LLM inference.

**Parameters:**
- `model`: LLM model name (e.g., `qwen3:14b-q8`)
- `prompt`: User prompt
- `systemPrompt`: System instructions
- `temperature`: 0.0-1.0
- `maxTokens`: Maximum response tokens

**Output:**
```json
{
  "response": "LLM response text",
  "model": "qwen3:14b-q8",
  "tokens": 150
}
```

### Arasul Embeddings Node

Generates text embeddings.

**Parameters:**
- `text`: Text to embed
- `model`: Embedding model (default: `nomic-embed-text-v1.5`)

**Output:**
```json
{
  "embedding": [0.123, -0.456, ...],
  "dimensions": 768
}
```

---

## Common Workflow Patterns

### Webhook → LLM → Response

```json
{
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "chat",
        "httpMethod": "POST"
      }
    },
    {
      "name": "Arasul LLM",
      "type": "n8n-nodes-arasul-llm",
      "parameters": {
        "model": "qwen3:14b-q8",
        "prompt": "={{ $json.body.message }}",
        "systemPrompt": "You are a helpful assistant."
      }
    },
    {
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { response: $json.response } }}"
      }
    }
  ]
}
```

### Scheduled Task → Database

```json
{
  "nodes": [
    {
      "name": "Schedule",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [{ "field": "hours", "hour": 3 }]
        }
      }
    },
    {
      "name": "PostgreSQL",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "VACUUM ANALYZE; SELECT COUNT(*) FROM documents;"
      }
    },
    {
      "name": "Telegram",
      "type": "n8n-nodes-base.telegram",
      "parameters": {
        "operation": "sendMessage",
        "chatId": "={{ $env.TELEGRAM_CHAT_ID }}",
        "text": "DB Maintenance: {{ $json.count }} documents"
      }
    }
  ]
}
```

---

## API Integration

### Trigger Workflow via API

```bash
# Webhook trigger
curl -X POST http://localhost:5678/webhook/your-path \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

### From Backend

```javascript
// services/dashboard-backend/src/routes/workflows.js
const axios = require('axios');

async function triggerWorkflow(webhookPath, data) {
  const response = await axios.post(
    `http://n8n:5678/webhook/${webhookPath}`,
    data
  );
  return response.data;
}
```

---

## Custom Node Development

### Structure

```
custom-nodes/n8n-nodes-arasul-llm/
├── package.json
├── tsconfig.json
├── src/
│   └── nodes/
│       └── ArasulLlm/
│           ├── ArasulLlm.node.ts    # Node implementation
│           └── ArasulLlm.node.json  # Node definition
└── index.ts                          # Export
```

### Node Implementation

```typescript
// src/nodes/ArasulLlm/ArasulLlm.node.ts
import { IExecuteFunctions, INodeType, INodeTypeDescription } from 'n8n-workflow';

export class ArasulLlm implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Arasul LLM',
    name: 'arasulLlm',
    group: ['transform'],
    version: 1,
    description: 'Interact with Arasul LLM service',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Prompt',
        name: 'prompt',
        type: 'string',
        default: '',
        required: true,
      },
    ],
  };

  async execute(this: IExecuteFunctions) {
    const items = this.getInputData();
    const results = [];

    for (let i = 0; i < items.length; i++) {
      const prompt = this.getNodeParameter('prompt', i) as string;

      const response = await this.helpers.request({
        method: 'POST',
        url: 'http://llm-service:11434/api/generate',
        body: { model: 'qwen3:14b-q8', prompt },
        json: true,
      });

      results.push({ json: { response: response.response } });
    }

    return [results];
  }
}
```

---

## Environment Variables

```bash
N8N_ENCRYPTION_KEY=<32+ random chars>
N8N_HOST=0.0.0.0
N8N_PORT=5678
N8N_PROTOCOL=http
N8N_PATH=/n8n
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=postgres-db
DB_POSTGRESDB_DATABASE=arasul_db
DB_POSTGRESDB_USER=arasul
DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}
DB_POSTGRESDB_SCHEMA=n8n
```

---

## Checklist

- [ ] Workflow created and tested
- [ ] Webhook path is unique
- [ ] Error handling nodes added
- [ ] Credentials configured securely
- [ ] Rate limits considered
- [ ] Logging/notifications added
