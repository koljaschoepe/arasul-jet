/**
 * Single source of truth for the n8n integration documentation.
 *
 * The Markdown returned by `renderN8nDoc()` is rendered in the n8n
 * Settings tab via react-markdown, and the very same string is offered
 * as a downloadable .md file. Live values (active model, hostname, key
 * prefix, embedding dimension) are interpolated at render time so the
 * doc that ships to the user always matches what their box is doing
 * right now.
 */

export interface N8nDocData {
  /** Active model id (e.g. `gemma4:26b-q4`). Falls back to "kein Modell geladen". */
  activeModel: string | null;
  /** Default model id from the platform (used if no model is currently loaded). */
  defaultModel: string | null;
  /** Base URL for the dashboard API (`http://hostname:3001` or remote URL). */
  baseUrl: string;
  /** Internal docker host for n8n container ↔ dashboard backend. */
  internalBackendUrl: string;
  /** Internal Ollama host. */
  internalOllamaUrl: string;
  /** Internal embedding service host. */
  internalEmbeddingUrl: string;
  /** Internal Qdrant host. */
  internalQdrantUrl: string;
  /** Most recently created API-key prefix, or null if user has none yet. */
  latestKeyPrefix: string | null;
  /** Embedding vector dimension (1024 for BGE-M3). */
  embeddingDim: number;
  /** Date the doc was generated (ISO date — for the download filename). */
  generatedAt: string;
}

const codeFence = (lang: string, body: string) => '```' + lang + '\n' + body + '\n```';

export function renderN8nDoc(data: N8nDocData): string {
  const model = data.activeModel || data.defaultModel || '<MODELL_NAME>';
  const apiKeyExample = data.latestKeyPrefix ? `${data.latestKeyPrefix}…` : 'aras_DEIN_API_KEY';

  return `# Arasul → n8n Integration

> Auto-generiert am ${data.generatedAt}. Diese Datei enthält Live-Werte deiner Box — Modell, Endpunkte und API-Key-Prefix sind eingebunden.

## Quick-Start

1. **API-Key erstellen** — Settings → Sicherheit → API-Keys → "Neuer Key". Den Key sofort kopieren, er wird nur einmal angezeigt.
2. **n8n öffnen** und einen neuen Workflow anlegen.
3. **OpenAI Chat Model Node** hinzufügen, als Base-URL \`${data.internalBackendUrl}/v1\` eintragen, API-Key einfügen — fertig.

Alle Endpunkte sind über den OpenAI-kompatiblen Layer erreichbar oder direkt über die proprietäre Arasul-API mit erweiterten Features (RAG, Document-Extract).

---

## Authentifizierung

Alle Endpunkte erwarten einen API-Key:

- Header \`X-API-Key: aras_…\` (Arasul-Stil)
- Header \`Authorization: Bearer aras_…\` (OpenAI-Stil — wird automatisch übersetzt)

Aktiver Key auf dieser Box: \`${apiKeyExample}\`

---

## Aktiver Stack

| Komponente | Wert |
|---|---|
| **Aktives LLM** | \`${data.activeModel || '— kein Modell geladen —'}\` |
| **System-Default** | \`${data.defaultModel || '—'}\` |
| **Embedding-Modell** | BGE-M3 (Dimension ${data.embeddingDim}) |
| **Dashboard API (intern)** | \`${data.internalBackendUrl}\` |
| **Dashboard API (extern)** | \`${data.baseUrl}\` |
| **Ollama (intern)** | \`${data.internalOllamaUrl}\` |
| **Embedding-Service (intern)** | \`${data.internalEmbeddingUrl}\` |
| **Qdrant (intern)** | \`${data.internalQdrantUrl}\` |

---

## OpenAI-kompatibler Layer

Drop-in-Ersatz für \`api.openai.com/v1\`. Funktioniert mit allen Tools, die eine konfigurierbare Base-URL akzeptieren — n8n's "OpenAI Chat Model" Node, dem offiziellen \`openai\` SDK, LangChain, etc.

**Base-URL für n8n:** \`${data.internalBackendUrl}/v1\`

### Chat-Completion

POST \`${data.internalBackendUrl}/v1/chat/completions\`

${codeFence(
  'json',
  `{
  "model": "${model}",
  "messages": [
    { "role": "system", "content": "Du bist ein hilfreicher Assistent." },
    { "role": "user", "content": "{{ $json.frage }}" }
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "stream": false
}`
)}

Response (\`stream: false\`) ist OpenAI-Format mit \`choices[0].message.content\`. Bei \`stream: true\` werden \`chat.completion.chunk\`-Deltas gesendet, abgeschlossen durch \`data: [DONE]\`.

### Embeddings

POST \`${data.internalBackendUrl}/v1/embeddings\`

${codeFence(
  'json',
  `{
  "model": "bge-m3",
  "input": ["Text 1", "Text 2"]
}`
)}

Liefert OpenAI-Format \`{ object: "list", data: [{ embedding: [...], index: 0 }, …], model, usage }\`. Vektor-Dimension: ${data.embeddingDim}.

### Modelle auflisten

GET \`${data.internalBackendUrl}/v1/models\`

Liefert alle installierten Chat-Modelle im OpenAI-Format. Zum Filtern oder Display in einem Dropdown verwendbar.

---

## Erweiterte Arasul-API

Für Features, die OpenAI nicht hat (RAG-Retrieval mit Quellenangabe, Document-Extract, strukturierte JSON-Extraktion).

### Chat mit RAG

POST \`${data.internalBackendUrl}/api/v1/external/llm/chat\`

${codeFence(
  'json',
  `{
  "prompt": "{{ $json.frage }}",
  "model": "${model}",
  "temperature": 0.7,
  "max_tokens": 2048,
  "wait_for_result": true,
  "timeout_seconds": 300
}`
)}

### Document Extract (OCR)

POST \`${data.internalBackendUrl}/api/v1/external/document/extract\`

Body: \`multipart/form-data\` mit Feld \`file\`. Liefert reinen Extracted-Text (PDF, DOCX, PNG, JPG, TIFF — OCR automatisch).

### Document Analyze

POST \`${data.internalBackendUrl}/api/v1/external/document/analyze\`

Body: \`multipart/form-data\` mit \`file\` + optional \`prompt\`. Extrahiert Text und schickt ihn ans LLM mit deinem Prompt — perfekt für Zusammenfassung oder Q&A auf Dokumenten.

### Strukturierte JSON-Extraktion

POST \`${data.internalBackendUrl}/api/v1/external/document/extract-structured\`

Body: \`multipart/form-data\` mit \`file\` + \`schema\` (JSON-String). Extrahiert Text und liefert strukturiertes JSON nach dem Schema — perfekt für Rechnungen, Formulare, Bestellungen.

${codeFence(
  'json',
  `{
  "invoice_number": "",
  "date": "",
  "vendor": "",
  "total_gross": 0,
  "items": [
    { "description": "", "quantity": 0, "unit_price": 0 }
  ]
}`
)}

---

## Service-Adressen (intern, ohne API-Key)

Im Docker-Netzwerk erreichst du die KI-Services auch direkt — etwa für Power-User, die Ollama-Features nutzen wollen, die nicht durchgereicht werden.

| Service | URL | Auth |
|---|---|---|
| Ollama (LLM, alle Endpoints) | \`${data.internalOllamaUrl}\` | Keine |
| Embedding-Service | \`${data.internalEmbeddingUrl}\` | Keine |
| Qdrant Vector DB | \`${data.internalQdrantUrl}\` | Keine |
| Dashboard API | \`${data.internalBackendUrl}\` | API-Key |

Beispiel — Ollama-Chat direkt (intern):

POST \`${data.internalOllamaUrl}/api/chat\`

${codeFence(
  'json',
  `{
  "model": "${model}",
  "messages": [{ "role": "user", "content": "{{ $json.message }}" }],
  "stream": false,
  "options": { "temperature": 0.7, "num_predict": 2048 }
}`
)}

---

## Troubleshooting

**\`401 invalid_api_key\`** — Der API-Key ist falsch geschrieben oder wurde widerrufen. Prüfe in Settings → Sicherheit, ob er noch aktiv ist.

**\`403 insufficient_permissions\`** — Der Key hat \`openai:chat\` nicht in seinen \`allowed_endpoints\`. Lösche den Key und erstelle einen neuen — neue Keys haben die OpenAI-Endpoints standardmäßig.

**\`503 service_unavailable\`** — Ollama oder das Embedding-Service ist nicht bereit. Im Dashboard auf der Hauptseite den Service-Status checken.

**Streaming hängt** — n8n's HTTP-Request-Node wartet bei \`stream: true\` auf \`data: [DONE]\`. Stell sicher, dass kein Reverse-Proxy davor SSE-Buffering aktiviert hat (\`X-Accel-Buffering: no\` ist im Backend gesetzt).

**Modell wird nicht erkannt** — Liste verfügbare Modelle mit \`GET /v1/models\` ab und nutze einen Wert aus \`data[].id\`. Im Store kannst du fehlende Modelle nachladen.

---

_Generiert vom Arasul Dashboard. Diese Datei ist Live-Daten-basiert — beim erneuten Öffnen des n8n-Tabs wird sie mit den aktuellen Werten neu gerendert._
`;
}
