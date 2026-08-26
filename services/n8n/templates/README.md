# n8n-Vorlagen für die Arasul-Plattform

Zwei Verzeichnisse, beide read-only nach `/custom-templates` in den
n8n-Container gemountet (`compose/compose.app.yaml`):

| Verzeichnis   | Inhalt                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents/`     | First-Boot-Vorlagen für Agent-Workflows (Tools Agent + Ollama), Import über `scripts/util/n8n-import-templates.sh`. Details: [`agents/README.md`](agents/README.md)                |
| `smoketests/` | Drei Referenz-Workflows für HTTP-Egress, OAuth2 und eingehende Webhooks, nach jedem n8n-Image-Bump von Hand laufen lassen. Details: [`smoketests/README.md`](smoketests/README.md) |

Die früheren Beispiele hier (LLM-Chat-Workflow, Dokument-Embedding-Pipeline
über MinIO, Telemetrie-Reporting) lagen nie als Dateien in diesem Verzeichnis;
mit Phase B4 des Rückbaus (26.08.2026) ist MinIO ausgebaut, die Beschreibung
dazu ist gestrichen.

## Interne Dienste aus einem Workflow erreichen

n8n darf per `N8N_SSRF_ALLOWED_HOSTNAMES` genau vier interne Hostnamen
anfragen: `llm-service`, `dashboard-backend`, `embedding-service`,
`document-indexer` (`postgres-db` bewusst nicht, siehe
[`docs/integrations/N8N_AGENTS.md`](../../../docs/integrations/N8N_AGENTS.md)).

```json
{
  "method": "POST",
  "url": "http://llm-service:11434/api/chat",
  "body": {
    "model": "qwen3:8b",
    "messages": [{ "role": "user", "content": "{{$json.prompt}}" }],
    "stream": false
  }
}
```

```json
{
  "method": "POST",
  "url": "http://embedding-service:11435/embed",
  "body": { "text": "{{$json.text}}", "normalize": true }
}
```

Flows der Plattform startet ein Workflow über die externe API
(`POST /api/v1/external/flows/:name/run` mit API-Key, siehe
[`docs/features/FLOWS.md`](../../../docs/features/FLOWS.md)).

## Fehlersuche

- LLM antwortet leer: `GET http://llm-service:11434/api/tags` zeigt die
  geladenen Modelle; `docker logs llm-service`.
- Embedding-Timeout: kleinere Batches, `GET http://embedding-service:11435/health`.
- Weitere Fälle: [`docs/integrations/N8N.md`](../../../docs/integrations/N8N.md), Abschnitt 7.
