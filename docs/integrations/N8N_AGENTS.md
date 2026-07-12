# Agent-Workflows mit n8n 2.x und Ollama

> **Audience:** Betreiber und Entwickler, die auf der Arasul-Appliance
> Agent-Workflows (Tools Agent + lokales LLM) bauen, betreiben und die
> n8n-2.x-Engine upgraden/zurückrollen müssen.
>
> Grundlagen-Doku (Routing, Webhooks, OAuth, Basis-Härtung):
> [`N8N.md`](N8N.md) · Lizenzlage: [`../legal/N8N_LIZENZ.md`](../legal/N8N_LIZENZ.md)

---

## 1. Architektur seit dem 2.x-Upgrade

```
Traefik /n8n → n8n (n8nio/n8n 2.29.10 + Arasul-Custom-Nodes)
                 ├─ Task-Broker :5679 ←── n8n-runners (n8nio/runners 2.29.10)
                 │                          └─ führt Code-Nodes (JS/Python) aus
                 ├─ PostgreSQL (Schema "n8n")
                 ├─ Ollama  http://llm-service:11434  (Agent-LLM: qwen3:8b)
                 └─ Qdrant  http://qdrant:6333        (Vector Store Tool)

Gemeinsames Volume n8n-agent-workspace → /data/agent-workspace
(in n8n UND n8n-runners gemountet)
```

- **n8n** (Custom-Build, `services/n8n/Dockerfile`, Pin `ARG N8N_VERSION`)
  läuft den Editor, Trigger, HTTP-Nodes und die Agent-Orchestrierung.
- **n8n-runners** (`compose/compose.app.yaml`) ist ein Sidecar mit dem
  offiziellen `n8nio/runners`-Image. Er führt **Code-Nodes** (JavaScript,
  Python) getrennt vom Hauptprozess aus — ein Ausbruch aus einem Code-Node
  landet in einem Container ohne DB-Zugang, ohne Encryption-Key, ohne
  n8n-Konfiguration. Auth über das Docker-Secret `n8n_runners_auth_token`.
  **Die Image-Version muss immer exakt dem n8n-Pin entsprechen.**
- **Agent-Workspace**: `/data/agent-workspace` ist der einzige Pfad, auf
  den Datei-Nodes (`N8N_RESTRICT_FILE_ACCESS_TO`) und Agent-Code-Tools
  schreiben können. Er ist in beiden Containern gemountet, damit ein vom
  Agenten (im Runner) geschriebenes Ergebnis für Read/Write-File-Nodes (im
  Hauptprozess) sichtbar ist.

## 2. Sicherheitsmodell

| Kontrolle                                                                                                                                                | Wert        | Wirkung                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `N8N_RUNNERS_MODE=external`                                                                                                                              | Sidecar     | Code-Ausführung raus aus dem n8n-Prozess (Blast-Radius).                                                                                                                                                                                                                                                                          |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`                                                                                                                      | n8n         | Code-Nodes sehen kein `process.env` (keine Secrets-Exfiltration).                                                                                                                                                                                                                                                                 |
| `N8N_RESTRICT_FILE_ACCESS_TO=/data/agent-workspace`                                                                                                      | n8n         | Datei-Nodes können nur den Agent-Workspace lesen/schreiben.                                                                                                                                                                                                                                                                       |
| `N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES=true`                                                                                                                | n8n         | Eigene n8n-Config/Key-Dateien tabu.                                                                                                                                                                                                                                                                                               |
| `N8N_SSRF_PROTECTION_ENABLED=true` (ab 2.12)                                                                                                             | n8n         | HTTP-Nodes können keine RFC1918-/Loopback-/Link-Local-Adressen anfragen (inkl. DNS-Rebinding- und Redirect-Schutz).                                                                                                                                                                                                               |
| `N8N_SSRF_ALLOWED_HOSTNAMES=llm-service,qdrant,dashboard-backend,minio,embedding-service,document-indexer`                                               | n8n         | Interne Dienste, die Workflows legitim brauchen. **postgres-db ist bewusst nicht freigegeben.** Allowlist schlägt Blocklist.                                                                                                                                                                                                      |
| `NODES_EXCLUDE` executeCommand+ssh                                                                                                                       | n8n         | Shell-äquivalente Nodes bleiben zusätzlich zum 2.x-Default-Disable ausgeschlossen.                                                                                                                                                                                                                                                |
| `N8N_DISABLED_MODULES=mcp`                                                                                                                               | n8n         | Der instanzweite MCP-**Server** (Workflows als MCP-Tools nach außen) ist hart abgeschaltet. Der MCP-**Client**-Tool-Node in Agenten funktioniert weiter (§6).                                                                                                                                                                     |
| Telemetrie aus                                                                                                                                           | n8n         | `N8N_DIAGNOSTICS_ENABLED=false`, `N8N_VERSION_NOTIFICATIONS_ENABLED=false`, `N8N_TEMPLATES_ENABLED=false` — keine Calls zu n8n.io/api.n8n.io (GDPR, Offline-Fähigkeit).                                                                                                                                                           |
| `NODE_FUNCTION_ALLOW_BUILTIN=crypto,fs,fs/promises,path` (via `services/n8n/runners/n8n-task-runners.json`, gemountet nach `/etc/n8n-task-runners.json`) | n8n-runners | Bewusste Freigabe, damit Code-Tools in den Workspace schreiben können. **Nur über die Launcher-Konfig wirksam** — der Launcher überschreibt die Variable hart aus dieser Datei; eine Container-Env reicht nicht. Der Sandbox-Rand ist der Runner-Container selbst (non-root, eigenes FS, einziger persistenter Pfad = Workspace). |

**Egress:** n8n hängt an `arasul-frontend`/`arasul-backend` (nicht
`internal`), darf also ins Internet — das ist für SaaS-Konnektoren und
Recherche-Agenten gewollt. Die SSRF-Allowlist regelt nur den Zugriff auf
_interne_ Adressen. Wer Internet-Egress ganz kappen will: eigenes
`internal: true`-Netz + expliziter Proxy (nicht Standard-Setup).

**iframe:** n8n sendet `X-Frame-Options: sameorigin`. Das Dashboard bettet
den Editor same-origin über Traefik (`/n8n`) ein — es ist **keine**
CSP-/Header-Aufweichung nötig und es darf auch keine eingebaut werden.

## 3. Agent-Workflows bauen (Ollama, lokal)

### Modellwahl

- **Default: `qwen3:8b`** — bestes lokales Tool-Calling-Modell dieser
  Größenklasse (Stand Juli 2026) und auf allen unterstützten
  Jetson-Profilen lauffähig. Wird vom Import-Skript automatisch gezogen.
- Größere Boxen können auf `qwen3:14b`/`qwen3:32b` wechseln (bessere
  Tool-Disziplin, mehr RAM/Latenz). Nicht-Tool-Calling-Modelle (z. B.
  reine gemma-Chat-Modelle) funktionieren im Tools Agent NICHT zuverlässig.

### Die num_ctx-Falle (Kontextfenster ≥ 32k)

Ollamas Default-Kontext (4k) ist für Agenten **zu klein**: System-Prompt +
Tool-Definitionen + Verlauf + Tool-Ergebnisse überschreiten das schnell,
und Ollama schneidet dann **still** vorne ab — der Agent „vergisst" seine
Tools oder seine Aufgabe, ohne Fehlermeldung. Deshalb gilt auf der
Plattform doppelt:

1. `OLLAMA_CONTEXT_LENGTH=32768` global am llm-service
   (`compose/compose.ai.yaml`, via `.env` übersteuerbar), und
2. `numCtx: 32768` explizit in den Options des Ollama-Chat-Model-Nodes
   (so machen es die Vorlagen).

Auf knappen 32-GB-Orins kostet das KV-Cache-RAM; gegensteuern mit
`OLLAMA_NUM_PARALLEL=1` bzw. kleinerem Agent-Modell — **nicht** mit
kleinerem Kontext.

### Regeln, die lokal den Unterschied machen

- **Ein Tool pro Subagent.** 8B-Modelle degradieren spürbar ab 2–3 Tools.
  Lieber einen Orchestrator-Agenten, der spezialisierte Subagenten (je
  genau ein Tool) aufruft, als einen Agenten mit fünf Tools.
- **Tool-Beschreibungen sind Prompts.** Präzise, deutsch, mit
  Eingabeformat und Beispiel — der Agent entscheidet allein anhand dieser
  Texte.
- **Structured Output sparsam einsetzen.** JSON-Schema-erzwungene Ausgaben
  klappen mit qwen3:8b für flache Objekte; tief verschachtelte Schemata
  scheitern häufig. Grenzen akzeptieren oder Ausgabe zweistufig bauen
  (frei antworten lassen → separater Parser-Schritt).
- **Temperature niedrig** (0.1–0.3) für Tool-Calling.
- **Timeouts großzügig**: erster Agent-Call nach Modell-Kaltstart kann
  Minuten dauern (Modell-Load auf dem Jetson).

## 4. Subagenten

Zwei Muster, beide mit den mitgelieferten Nodes:

1. **AI Agent Tool** (`@n8n/n8n-nodes-langchain.agentTool`): ein Agent als
   Tool eines anderen Agenten, im selben Workflow. Leichtgewichtig, gut
   für „Orchestrator + 2 Spezialisten". Jeder Subagent bekommt sein
   eigenes Ollama-Chat-Model (gern dasselbe Modell — Ollama dedupliziert
   den Load) und **genau ein** Tool.
2. **Sub-Workflows als Tools** (`toolWorkflow` / „Call n8n Workflow
   Tool"): der Subagent lebt als eigener Workflow und wird per Tool
   aufgerufen. Schwergewichtiger, aber testbar, versionierbar und aus
   mehreren Eltern-Workflows wiederverwendbar. Empfohlen, sobald ein
   Subagent mehr als ein Wegwerf-Helfer ist. `callerPolicy` auf
   `workflowsFromSameOwner` lassen (Default der Vorlagen).

## 5. Vorlagen importieren

```bash
./scripts/util/n8n-import-templates.sh          # idempotent; zieht auch qwen3:8b
./scripts/util/n8n-import-templates.sh --skip-model
```

Läuft automatisch als optionaler Schritt in `./arasul bootstrap` (13b).
Details zu den zwei Vorlagen (`[Vorlage] Agent — Recherche`, `[Vorlage]
Agent — RAG`) und den nötigen Credential-Schritten:
[`services/n8n/templates/agents/README.md`](../../services/n8n/templates/agents/README.md).
Beide kommen **deaktiviert** an; nach CLI-Import den Editor neu laden.

**RAG-Vorlage — Embedding-Kompatibilität:** Das Qdrant-Tool findet nur
dann Sinnvolles, wenn die Collection mit demselben Embedding-Modell
befüllt wurde, das der Workflow nutzt (Vorlage: `bge-m3` via Ollama,
1024-dim). Die Plattform-Collection des Dokument-Indexers wird vom
separaten embedding-service (BGE-M3) befüllt — gleiche Modellfamilie, aber
vor produktiver Nutzung mit einer Score-Stichprobe verifizieren, sonst
eigene Collection über den Insert-Mode des Qdrant-Nodes aufbauen.

## 6. MCP-Client gegen interne Server

Der instanzweite MCP-Server von n8n ist abgeschaltet
(`N8N_DISABLED_MODULES=mcp`) — niemand kann die Appliance-Workflows von
außen als MCP-Tools ansprechen. Umgekehrt dürfen Agent-Workflows aber als
**MCP-Client** interne MCP-Server nutzen (MCP-Client-Tool-Node), z. B.
den `mcp-remote-bash`-Service oder künftige interne Tool-Server. Regeln:

- Nur `http://<service>:<port>`-Adressen im Docker-Netz; der Ziel-Hostname
  muss ggf. in `N8N_SSRF_ALLOWED_HOSTNAMES` aufgenommen werden.
- Keine MCP-Server mit Shell-Zugriff an Kunden-Workflows geben — das
  hebelt das NODES_EXCLUDE von executeCommand faktisch aus.

## 7. Upgrade- und Backup-Prozedur

### Vor jedem n8n-Upgrade (PFLICHT, besonders 1.x → 2.x)

Die Engine migriert ihr DB-Schema (Postgres-Schema `n8n`) beim ersten
Start der neuen Version **irreversibel**. Deshalb unmittelbar davor:

```bash
# 1. Workflows-Inventar für den Nachher-Abgleich (API oder CLI)
docker compose exec -T n8n n8n export:workflow --all --output=/data/agent-workspace/pre-upgrade-workflows.json

# 2. n8n-Volume sichern
docker compose stop n8n n8n-runners
docker run --rm -v arasul-platform_arasul-n8n:/src -v "$PWD/data/backups:/dst" \
  alpine tar czf /dst/n8n-volume-$(date +%Y%m%d-%H%M).tar.gz -C /src .

# 3. DB sichern (n8n lebt im Schema "n8n" der Plattform-DB)
docker exec postgres-db pg_dump -U arasul -d arasul_db -n n8n \
  > data/backups/n8n-schema-$(date +%Y%m%d-%H%M).sql
```

### Upgrade

```bash
# Pin bumpen: services/n8n/Dockerfile (ARG N8N_VERSION) UND
# compose/compose.app.yaml (image: n8nio/runners:<gleiche Version>)
docker compose build n8n
docker compose up -d n8n n8n-runners
docker compose ps            # beide healthy?
docker compose logs -f n8n   # Migrations-Log ohne Fehler?
```

### Nachher-Abgleich (Gate)

1. Workflow-Liste identisch zu vorher (Export vergleichen oder
   `GET /api/v1/workflows` mit API-Key).
2. Eine Test-Execution eines bestehenden Workflows läuft grün.
3. Ein Code-Node läuft (beweist Runner-Sidecar-Anbindung):
   `docker compose logs n8n-runners` zeigt eine Task-Ausführung.
4. Agent-Vorlage antwortet mit qwen3:8b.

### Rollback

```bash
docker compose stop n8n n8n-runners
# Pin in services/n8n/Dockerfile + runners-Tag zurückdrehen, dann:
docker run --rm -v arasul-platform_arasul-n8n:/dst -v "$PWD/data/backups:/src" \
  alpine sh -c "rm -rf /dst/* && tar xzf /src/n8n-volume-<STAND>.tar.gz -C /dst"
docker exec -i postgres-db psql -U arasul -d arasul_db \
  -c 'DROP SCHEMA n8n CASCADE; CREATE SCHEMA n8n;'
docker exec -i postgres-db psql -U arasul -d arasul_db < data/backups/n8n-schema-<STAND>.sql
docker compose build n8n && docker compose up -d n8n n8n-runners
```

**Image-Pin allein reicht NICHT als Rollback**, sobald die neue Version
einmal gegen die DB gelaufen ist — Volume + Schema müssen mit zurück.

## 8. Troubleshooting

| Symptom                                                   | Ursache / Fix                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code-Node hängt / „no task runner available"              | n8n-runners down oder Token-Mismatch. `docker compose ps n8n-runners`, `docker compose logs n8n-runners`. Beide Container lesen `config/secrets/n8n_runners_auth_token`; nach Token-Änderung beide neu starten.                               |
| Agent „vergisst" Tools, antwortet ohne Tool-Call          | Kontextfenster zu klein → §3 num_ctx-Falle. `numCtx` am Model-Node und `OLLAMA_CONTEXT_LENGTH` prüfen.                                                                                                                                        |
| HTTP-Tool: „Request blocked (SSRF protection)"            | Ziel ist intern/privat. Interne Dienste gehören in `N8N_SSRF_ALLOWED_HOSTNAMES` (compose.app.yaml) — bewusst entscheiden, nicht pauschal öffnen.                                                                                              |
| Code-Tool: „Cannot find module 'fs'"                      | Mount von `services/n8n/runners/n8n-task-runners.json` nach `/etc/n8n-task-runners.json` im n8n-runners-Service prüfen — dort (env-overrides) muss `fs` in `NODE_FUNCTION_ALLOW_BUILTIN` stehen. Eine Env-Variable am Container genügt NICHT. |
| Datei geschrieben, aber Read-File-Node findet sie nicht   | In einen anderen Pfad als `/data/agent-workspace` geschrieben — nur dieser ist in beiden Containern gemountet und whitelisted.                                                                                                                |
| Vorlagen nach Import nicht sichtbar                       | CLI-Import zur Laufzeit → Editor/Workflow-Liste neu laden.                                                                                                                                                                                    |
| n8n startet nicht: „secret file … n8n_runners_auth_token" | Secret-Datei fehlt (Bestandsgerät nach git pull). `openssl rand -hex 32 > config/secrets/n8n_runners_auth_token && chmod 600 …`, dann `docker compose up -d`.                                                                                 |
