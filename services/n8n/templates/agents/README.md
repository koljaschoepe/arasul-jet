# Agent-Vorlagen (n8n 2.x)

First-Boot-Vorlagen für Agent-Workflows mit lokalem Tool-Calling
(Tools Agent + Ollama `qwen3:8b`). Beide Workflows kommen **deaktiviert** an
und tragen `[Vorlage]` im Namen.

| Datei                  | Muster                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `agent-recherche.json` | Tools Agent + generisches HTTP-Tool (Web-Abruf) + Code-Tool (Datei-Ablage im Agent-Workspace) |
| `agent-rag.json`       | Tools Agent + Qdrant Vector Store Tool (retrieve-as-tool) + Ollama Embeddings                 |

## Import

Automatisch beim Bootstrap (`./arasul bootstrap`) oder manuell, idempotent:

```bash
./scripts/util/n8n-import-templates.sh
```

Das Skript nutzt die n8n-CLI im Container (`n8n import:workflow --separate
--input=/custom-templates/agents`); dieses Verzeichnis ist read-only nach
`/custom-templates` gemountet (compose/compose.app.yaml). Feste Workflow-IDs
(`arasul-vorlage-agent-*`) machen den Re-Import zum Update statt Duplikat.

## Nach dem Import (einmalig, im n8n-Editor)

1. **Ollama-Credential**: Base URL `http://llm-service:11434`, in allen
   Ollama-Nodes auswählen (die Vorlagen referenzieren einen Platzhalter).
2. **Qdrant-Credential** (nur RAG): URL `http://qdrant:6333`.
3. **Collection-Name** (nur RAG): Platzhalter `MEINE_COLLECTION` ersetzen —
   Achtung Embedding-Kompatibilität, siehe Sticky Note im Workflow.
4. Modelle: `qwen3:8b` (zieht das Import-Skript automatisch), für RAG
   zusätzlich `bge-m3`.

Betreiber-/Entwickler-Doku: [docs/integrations/N8N_AGENTS.md](../../../../docs/integrations/N8N_AGENTS.md)

## Wartungshinweis zu Node-Typversionen

Die JSONs sind gegen n8n 2.29.x gebaut (`@n8n/n8n-nodes-langchain.agent`
typeVersion 2.2, `vectorStoreQdrant` 1.3, `toolHttpRequest`/`toolCode` 1.1).
Ältere typeVersions lädt n8n abwärtskompatibel; nach großen n8n-Upgrades die
Vorlagen einmal öffnen und auf Deprecation-Hinweise prüfen.
