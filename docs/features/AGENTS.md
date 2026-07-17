# Workspace-Agenten

Arasul ist eine Plattform zur **Agenten-Orchestrierung** (Plan 008). Ein Agent
ist eine Markdown-Datei in einem Workspace; er wird aus dem Chat oder per HTTP
(z. B. n8n) gestartet und arbeitet mit path-gejailten Werkzeugen ausschließlich
innerhalb seines Workspace.

## Workspace

Ein **Workspace** ist die einzige „Projekt"-Entität (`sandbox_projects`): ein
Host-Ordner (`host_path`) plus ein Container, mit einem Besitzer und einem
Netzwerkmodus. Der Netzwerkschalter („Was darf dieser Workspace?") steuert, was
der Container erreichen darf (`VALID_NETWORK_MODES`):

| Modus            | UI-Bezeichnung | Zugriff                                    |
| ---------------- | -------------- | ------------------------------------------ |
| `isolated`       | Abgeschottet   | Internet ja, Plattform nein (Standard)     |
| `internal`       | Am System      | interne Dienste: DB / MinIO / Qdrant / RAG |
| `infrastructure` | Voller Zugriff | Infrastruktur — **nur Admin**              |

Jeder Workspace besitzt genau **einen unsichtbaren Wissensraum** (in der UI
„Ordner"): Dateien, die im Workspace geschrieben werden, werden automatisch
indiziert (kein manueller Upload), und die RAG-Suche eines Agenten ist auf
diesen Raum beschränkt.

## Agent-Format

Ablage: `<workspace host_path>/agenten/<name>.md`. YAML-Frontmatter-Kopf +
Markdown-Body (der Body ist der System-Prompt):

```markdown
---
name: Texter
beschreibung: Schreibt und überarbeitet Texte im Workspace.
modell: qwen2.5:7b
werkzeuge: [dateien, rag]
---

Du bist ein präziser Lektor. Nutze `dateien` zum Lesen und Schreiben und
`rag`, um im Workspace-Wissen zu recherchieren. Antworte auf Deutsch.
```

- `name` (Pflicht), `beschreibung`, `modell` (Default, falls leer), `werkzeuge`
  (Liste). Deutsche Schlüssel; die englischen Aliasse `description`, `model`,
  `tools` werden ebenfalls akzeptiert.
- **Werkzeuge** (nur diese sind erlaubt):
  - `dateien` — Dateien im Workspace lesen/schreiben (path-gejailt).
  - `rag` — im Wissensraum des Workspace suchen.
  - `terminal` — einen Befehl im Workspace-Container ausführen.

Die Engine liegt in `apps/dashboard-backend/src/services/agents/` (`agentFile.js`,
`toolLoop.js`, `tools/`) und erweitert die bestehende Ollama-Function-Calling-
Schleife (`BaseTool` / `ToolRegistry`).

## Ausführen

### Aus dem Chat (Kommandozentrale)

`@agentname <eingabe>` im Chat startet den Agenten; die Werkzeug-Schritte
streamen live. Route:

```
POST /api/sandbox/projects/:workspace/agenten/:agent/run/stream
```

Cookie-/Session-authentifiziert, Server-Sent Events. Jeder Schritt ist ein
`data:`-Frame (`tool_start`, `tool_result`, `text`, `done`, `error`).

### Per HTTP (n8n / extern)

```
POST /api/sandbox/projects/:workspace/agenten/:agent/run
Authorization: Bearer arun_…
```

Nicht-streamend, Antwort `{ result, steps, iterations, truncated, timestamp }`.
Das pro-Workspace-Token wird erzeugt mit:

```
POST /api/sandbox/projects/:workspace/agenten/token
```

Es wird **genau einmal** im Klartext zurückgegeben (`arun_…`), nur der
bcrypt-Hash wird gespeichert (`sandbox_projects.agent_run_token_hash`), und
jede Neu-Erzeugung ersetzt das alte Token. Jeder Auth-Fehler (fehlendes/
unbekanntes Workspace, kein Token gesetzt, falsches Token) endet in genau einem
`401`, damit die Route nicht verrät, welche Workspaces existieren. Details zum
n8n-HTTP-Trigger: [`docs/integrations/N8N.md`](../integrations/N8N.md).

## Externe Anmeldung (Claude-Login)

Ein einmaliger Claude-Login in einem Sandbox-Terminal wird pro Nutzer
verschlüsselt gespeichert (`user_external_credentials`, AES-256-GCM via
`utils/tokenCrypto.js`) und beim Container-Start zurückgeschrieben — er
überlebt damit ein `docker compose up -d --build`.
