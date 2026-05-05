# Changelog

Alle relevanten Aenderungen an der Arasul Platform werden hier dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)
und das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Geaendert — DX Overhaul (2026-05-03 bis 2026-05-05)

Strukturelle Ueberarbeitung des Repos fuer bessere Onboarding- und AI-Agent-Erfahrung. Keine Funktionsaenderungen — alle Aenderungen betreffen Doku, Naming, `.claude/`-Workspace und CI. Details: `docs/plans/archive/2026-05_dx-overhaul.md`.

- **Doku-Reorganisation:** `docs/` von 56 auf ~20 Dateien reduziert, Subfolder `development/`, `api/`, `ops/`, `features/`, `archive/`, `plans/{active,archive,audits}/`. Alle Doppelungen aufgeloest.
- **Subfolder CLAUDE.md Hierarchie:** Konventionen leben jetzt nahe am Code (`apps/dashboard-{backend,frontend}/CLAUDE.md`, `services/CLAUDE.md`, `services/postgres/CLAUDE.md`).
- **`.claude/` Workspace neu strukturiert:** `commands/`, `agents/`, `hooks/`, `skills/`, `context/` als kanonische Folder. Slash-Commands minimalist (`/plan` + `/ship`). Subagents minimalist (`research-agent` + `code-reviewer`, beide auto-invoked von `/plan`).
- **Hooks:** PreToolUse `block-destructive.sh` blockt `rm -rf` gegen kritische Pfade, `git push --force` gegen main/master (alle Flag-Reihenfolgen + Refspec-Form), `git reset --hard origin/main`, `dd`, `mkfs.*`, `fdisk`. `settings.local.example.json` als Template fuer persoenliche Hooks.
- **Slim CI-Verbesserungen:** `.github/workflows/test.yml` lief schon — Node-Version jetzt aus `.nvmrc` (22) statt hardcoded 20, stale `develop`-Branch-Trigger entfernt, `concurrency cancel-in-progress` ergaenzt.
- **Naming-Konsistenz:** 8 Bash-Skripte snake_case → kebab-case (`setup_mdns.sh` etc., 23 Cross-Refs aktualisiert). Backend-Route `knowledge-graph.js` → `knowledgeGraph.js` (REST URL `/api/knowledge-graph` bleibt kebab).
- **Service-Templates + READMEs:** `services/_template/` Skelett fuer neue Python-Services. READMEs ergaenzt fuer `backup-service`, `claude-code`, `cloudflared`, `mcp-remote-bash`, `sandbox`. `scripts/README.md` mit Folder-Map + Konventionen.
- **Doc-Link-Validator:** `scripts/validate/validate-doc-links.sh` — Python-basierter Walker, prueft alle relativen Markdown-Links. 19 broken Links aus Doku-Reorg-Fallout gefixt.
- **README-Trim:** Root-`README.md` von 516 auf 115 Zeilen, single canonical Onboarding-Pfad (Jetson via SSH).
- **Verworfen:** Stage 10 (`make dev` mit Mock-LLM/Mock-Qdrant) — widerspricht Rule #4 (kein lokaler Dev-Server, alles via `docker compose up -d --build` auf der Jetson). Stage 11 von 6 Jobs auf 1 Job slim — bestehende `test.yml` deckt bereits mehr ab als Slim-Plan.

## [1.0.0] - 2026-02-17

### Erstveroeffentlichung

Erste produktionsreife Version der Arasul Platform fuer NVIDIA Jetson AGX Orin.

#### Hinzugefuegt

- **Dashboard** - Echtzeit-Uebersicht ueber CPU, RAM, GPU, Temperatur, Speicher
- **AI Chat** - Multi-Tab KI-Chat mit Ollama-Integration (Qwen3, Llama3, etc.)
- **RAG-System** - Dokumentenbasierte KI-Antworten mit Qdrant-Vektordatenbank
- **Dokumentenverwaltung** - Upload, Indizierung und Verwaltung von PDF, DOCX, TXT und mehr
- **Datentabellen** - Strukturierte Daten mit NL-Query und RAG-Indexierung
- **Telegram-Bot** - Multi-Bot-Verwaltung mit Sprach- und Textnachrichten
- **App Store** - Installierbare Erweiterungen fuer die Plattform
- **Model Store** - Ollama-Modelle herunterladen, verwalten und wechseln
- **n8n Workflows** - Visuelle Automatisierung mit benutzerdefinierten KI-Nodes
- **Self-Healing** - Automatische Erkennung und Behebung von Serviceproblemen
- **Backup-Service** - Automatische Datensicherung mit Wiederherstellung
- **Setup-Wizard** - Gefuehrte Ersteinrichtung in 5 Schritten
- **Update-System** - Signierte Offline-Updates via USB oder Dashboard-Upload
- **Metriken-Collector** - GPU/CPU/RAM/Temperatur/Disk-Monitoring
- **Logging** - Zentrales Logging via Loki + Promtail
- **Cloudflare-Tunnel** - Optionaler sicherer Fernzugriff

#### Sicherheit

- RSA-SHA256 signierte Update-Pakete
- JWT-basierte Authentifizierung mit Token-Rotation
- Rate-Limiting auf allen API-Endpunkten
- DOMPurify fuer alle HTML-Ausgaben
- CORS-Konfiguration fuer Produktionsbetrieb
- Keine Shell-Injection-Risiken (execFile statt exec)

#### Unterstuetzte Hardware

- NVIDIA Jetson AGX Orin (primaer)
- NVIDIA Jetson Orin NX
- NVIDIA Jetson Orin Nano
- Generische Linux x86_64 (eingeschraenkt)
