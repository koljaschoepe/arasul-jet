# CLAUDE.md — Arasul Platform

## Vision

Arasul is an autonomous Edge-AI platform for NVIDIA Jetson, sold to companies
as a plug-&-play appliance: chat, document analysis, flows, and automation,
running fully local and GDPR-compliant. Target: 5 years of unattended operation.

## Architecture at a glance

```
Internet (443) → Traefik → Dashboard-Frontend (React 19 SPA)
                         → Dashboard-Backend (Express API :3001)
                              ├─ PostgreSQL 16 (migrations in services/postgres/init/)
                              ├─ Ollama / LLM-Service (:11434/:11436) [GPU]
                              ├─ Document-Indexer (:9102, nur Text-Extraktion)
                              └─ Docker-Proxy → Self-Healing, Metrics, Backup
```

**Es gibt kein RAG und keine Wissensbasis mehr.** Plan 021, Schritt 8 hatte
das Vektor-RAG durch agentisches ersetzt; am 24.08.2026 ist `qdrant` samt Code
ausgebaut worden, weil drei Features still durchfielen, statt zu melden, dass
sie nichts tun. Am 26.08.2026 (Phase B4 des Rückbaus) sind auch Dokumente,
Wissensräume, Projekte und der Textlayer (`document_chunks`) gefallen, dazu
MinIO, Loki, Promtail, Sandbox, Terminal und der Erweiterungs-Baukasten
(Migration 163); mit Phase B5 (gleicher Tag) n8n samt Schema, SearXNG und
die Plattform-Apps (Migration 164); mit Phase B6 (gleicher Tag) die Chat-Tabellen
und `/api/chats`, `/api/llm` (Migration 165), `llm_jobs` ist zustandslos und
gehört dem Ersteller des API-Schlüssels. Der `document-indexer` extrahiert nur noch Text auf Anfrage
(`POST /extract-text`); Flows arbeiten mit ihren Datei-Werkzeugen in den im
Flow deklarierten Ordnern. `embedding-service` läuft weiter und ohne Profil:
die OpenAI-kompatible `/v1/embeddings` braucht ihn. Wer eine Doku findet, die
Qdrant, MinIO, n8n oder Wissensräume als Teil des Geräts nennt, hat eine veraltete
Doku gefunden — nachsehen mit `docker compose ps`.

| Layer    | Stack                                                             | Path                                                          |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Frontend | React 19 + Vite 6 + Tailwind v4 + shadcn/ui + TypeScript          | `apps/dashboard-frontend/`                                    |
| Backend  | Node.js/Express + PostgreSQL + WebSocket/SSE                      | `apps/dashboard-backend/`                                     |
| AI       | Ollama (LLM) + Text-Extraktion (Indexer)                          | `services/llm-service/`, `services/document-indexer/`         |
| Infra    | Docker Compose V2 + NVIDIA Container Runtime + Traefik v2.11      | `compose/`, `config/traefik/`                                 |
| Ops      | Self-Healing Agent + Metrics Collector + Backup Service           | `services/self-healing-agent/`, `services/metrics-collector/` |
| DB       | PostgreSQL 16 (sequential migrations; next = highest on disk + 1) | `services/postgres/init/`                                     |
| Hardware | Jetson AGX Orin / Thor (ARM64, 32–128 GB, CUDA 8.7–10.0)          | Detection: `scripts/setup/detect-platform.sh`                 |

## Non-negotiable rules

1. **Backend** — every route uses `asyncHandler` and throws custom errors from
   `utils/errors.js`. Never `try/catch` at route level, never `throw new Error`.
   Details: [`apps/dashboard-backend/CLAUDE.md`](apps/dashboard-backend/CLAUDE.md).
2. **Frontend** — every call goes through `useApi`. TypeScript only, theme
   tokens via CSS variables (no hex literals). Details:
   [`apps/dashboard-frontend/CLAUDE.md`](apps/dashboard-frontend/CLAUDE.md).
3. **Tests before commit** — `./scripts/test/run-tests.sh --backend|--frontend|--all`.
4. **Deploy** — there is no local dev server. After code changes:
   `docker compose up -d --build <service>`. The user verifies in the browser.
5. **Docs stay in sync**: API change → `docs/api/API_REFERENCE.md`,
   schema change → `docs/api/DATABASE_SCHEMA.md`,
   new env var → `docs/ENVIRONMENT_VARIABLES.md`.
6. **Conventional commits** — `feat|fix|docs|refactor|test|chore: <subject>`.
7. **Lockfile strategy: root-only.** This is an npm-workspaces monorepo with
   exactly **one** lockfile — `/package-lock.json`. Never add a per-workspace
   `package-lock.json` (they drift from the root lock and break `npm ci` on
   `main` — see the 2026-05-05 incident, festgehalten im Plan
   „Dependabot + Lock-File Hardening" vom 02.07.2026, nachzulesen ueber
   [`docs/plans/HISTORIE.md`](docs/plans/HISTORIE.md)).
   Install with `npm ci` from the repo root; Dockerfiles install via
   `npm ci --workspace=<name> --include-workspace-root`. CI's **Lockfile drift
   guard** fails any PR whose root lock is out of sync. **Dependabot is off**
   since 24.08.2026 (`.github/dependabot.yml` removed) — dependencies move only
   inside a plan with a gate reference, never by a bot's PR.
8. **PR hygiene** — keep the queue clean: one active PR per work-stream (finish
   what's open before starting the next related change), always merge/close with
   `--delete-branch` (no branch outlives its PR), and sweep stale/merged/superseded
   PRs on sight. Details: [`CONTRIBUTING.md`](CONTRIBUTING.md#pr-hygiene).

## Task router — which CLAUDE.md to read

Each subfolder owns its own `CLAUDE.md` with the conventions for code in that
folder. Read the closest one to where you're working:

| If you're touching…                     | Read first                                      |
| --------------------------------------- | ----------------------------------------------- |
| A backend route / service / middleware  | `apps/dashboard-backend/CLAUDE.md`              |
| A React component, hook, or feature     | `apps/dashboard-frontend/CLAUDE.md`             |
| A new long-running service / Dockerfile | `services/CLAUDE.md`                            |
| A SQL migration                         | `services/postgres/CLAUDE.md`                   |
| Compose / Traefik / infra wiring        | `services/CLAUDE.md` + `docs/ops/DEPLOYMENT.md` |
| Onboarding / first-time setup           | `docs/development/ONBOARDING.md`                |
| Testing strategy across the platform    | `docs/development/TESTING.md`                   |

Deeper-dive context packs (one-off topics — LLM queue, security review
checklist, etc.) live under `.claude/context/`.

## Woran gerade gearbeitet wird

**Der laufende Plan liegt nicht in diesem Repo.** Seit dem 26.08.2026 steuert
der Überordner-Plan `arasul/roadmap/plans/aktiv/2026-08-26-umbau-standardsoftware.md`
(Steuer-Repo `Arasul-GmbH/arasul-os`, nicht öffentlich) die Arbeit an allen drei
Repos. Er legt je Phase einen Worktree dieses Repos an und gibt dem Worker eine
`PHASE.md` mit: was zu tun ist, woran es gemessen wird, wie hier gearbeitet
wird. Wer eine `PHASE.md` im Wurzelverzeichnis findet, liest sie nach dieser
Datei. Sie wird nie committet.

Plan `024` (Urlaubslauf) ist am 26.08.2026 abgelöst worden und liegt unter
[`docs/plans/done/024-urlaubslauf/`](docs/plans/done/024-urlaubslauf/). Seine
Übergabe nennt, was auf dem Gerät ohne Sitzung weiterläuft; für alles Ältere
verweist sie auf die Übergabe des Vorgängers
[`docs/plans/done/023-feature-audit/UEBERGABE.md`](docs/plans/done/023-feature-audit/UEBERGABE.md)
— dort stehen die **acht Fallen**, die einen halben Tag gekostet haben. Sie
gelten weiter.

Eine Aufgabe gilt erst als erledigt, wenn ihre Abnahme **live auf dem Orin**
belegt ist, nicht wenn der Branch gemerged wurde.

`docs/plans/active/` enthält **höchstens einen** Plan und ist normalerweise
leer. Das ist keine Konvention, sondern eine Prüfung: `scripts/test/plan-faden.py`
schlägt fehl, sobald dort zwei liegen. Ein Plan dort ist ein Einzelauftrag, kein
zweiter Faden neben dem Überordner. Angefangene, aber ruhende Pläne liegen unter
[`docs/plans/paused/`](docs/plans/paused/README.md) mit einem Satz, warum sie
ruhen und was noch offen ist.

**Ziele kommen von außen.** Was dieses Repo bis wann können muss, entscheidet
das Steuer-Repo, nicht dieses hier. Hier steht, _wie_ gebaut wird. Wer ein Ziel
ohne Bezug zu einer Phase oder Abnahme findet, hat eine Idee gefunden, keine
Aufgabe.

**Die acht Abnahmen** (A1 bis A8) haben am 26.08.2026 die sieben Verkaufs-Gates
ersetzt; G5 Recht bleibt bei Kolja außerhalb der Abnahmen. Ihr Stand steht in
`#roadmap-meta` von [`docs/plans/ROADMAP.html`](docs/plans/ROADMAP.html), alle
`open`, und wird aus einer Messung gesetzt, nie von Hand; der Überordner liest
ihn mit `roadmap-build.py`. Achtung: der Themenspeicher auf derselben Seite
stammt aus der Zeit **vor** Plan 023 und ist nicht der laufende Faden.

**Die vier Befehle** sind der Mechanismus, nicht die Quelle: `/plan` (Interview
zu einer Planseite), `/work` (autonome Ausführung bis zum Live-Verify auf dem
Jetson — bleibt für **Einzelaufträge**, die keine Phase des Überordners sind),
`/audit` (Scan zu Befunden), `/status` (Lagebild). Sie liegen als Skills unter
`.claude/skills/`, nicht als Befehle unter `.claude/commands/` — den Ordner gibt
es nicht.

**Nichts in diesem Repo läuft nach Uhrzeit.** Ein langer autonomer Lauf wird
von Hand gestartet: `./scripts/util/autonom-run.sh` (führt `/work --autonom`
aus, Voreinstellung fünf Stunden, `ARASUL_LAUF_STUNDEN=30` für einen Lauf über
einen Tag hinaus). Er mergt **einmal je Plan-Phase**, nicht je Aufgabe — am
24.08.2026 waren es sonst elf Deploys in 66 Minuten.

## Quick reference

### Entry points

| Domain      | File                                                                 |
| ----------- | -------------------------------------------------------------------- |
| Backend API | `apps/dashboard-backend/src/index.js` → `routes/index.js`            |
| Frontend    | `apps/dashboard-frontend/src/App.tsx`                                |
| Database    | `services/postgres/init/` (next migration = highest NNN on disk + 1) |
| LLM Service | `services/llm-service/api_server.py`                                 |
| Setup       | `scripts/interactive_setup.sh`                                       |
| Bootstrap   | `./arasul bootstrap`                                                 |

### Commands

```bash
docker compose up -d                               # Start all services
docker compose up -d --build <service>             # Rebuild one service
docker compose logs -f <service>                   # Stream logs
docker compose ps                                  # Service status (incl. health)
docker exec -it postgres-db psql -U arasul -d arasul_db   # DB shell
make build s=dashboard-frontend                    # Makefile shortcut
make logs s=dashboard-backend                      # Logs via Make
./scripts/test/run-tests.sh --all                  # All tests
```

### Debugging

| Symptom             | Command                                                |
| ------------------- | ------------------------------------------------------ |
| Service won't start | `docker compose logs <service>`                        |
| DB problem          | `docker exec postgres-db pg_isready -U arasul`         |
| LLM not responding  | `docker compose logs llm-service`                      |
| GPU status          | `docker exec llm-service nvidia-smi` (or `tegrastats`) |

## Documentation

| Topic                  | File                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Architecture           | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                                           |
| API reference          | [docs/api/API_REFERENCE.md](docs/api/API_REFERENCE.md)                                                                 |
| API errors             | [docs/api/API_ERRORS.md](docs/api/API_ERRORS.md)                                                                       |
| Database schema        | [docs/api/DATABASE_SCHEMA.md](docs/api/DATABASE_SCHEMA.md)                                                             |
| Design system          | [docs/development/DESIGN.md](docs/development/DESIGN.md)                                                 |
| Development            | [docs/development/DEVELOPMENT.md](docs/development/DEVELOPMENT.md)                                                     |
| Onboarding             | [docs/development/ONBOARDING.md](docs/development/ONBOARDING.md)                                                       |
| Testing                | [docs/development/TESTING.md](docs/development/TESTING.md)                                                             |
| Environment variables  | [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)                                                         |
| Platform compatibility | [docs/features/PLATFORM_COMPATIBILITY.md](docs/features/PLATFORM_COMPATIBILITY.md)                                     |
| Admin handbook         | [docs/ops/ADMIN_HANDBUCH.md](docs/ops/ADMIN_HANDBUCH.md) (DE)                                                          |
| Deployment             | [docs/ops/DEPLOYMENT.md](docs/ops/DEPLOYMENT.md)                                                                       |
| Troubleshooting        | [docs/ops/TROUBLESHOOTING.md](docs/ops/TROUBLESHOOTING.md)                                                             |
| Backup & DR            | [docs/ops/BACKUP_SYSTEM.md](docs/ops/BACKUP_SYSTEM.md), [docs/ops/DISASTER_RECOVERY.md](docs/ops/DISASTER_RECOVERY.md) |
| Flows                  | [docs/features/FLOWS.md](docs/features/FLOWS.md) (Definitionen, Argumente, Werkzeuge, Läufe, externer Trigger)         |
| Workspace              | [docs/features/WORKSPACE.md](docs/features/WORKSPACE.md) (was nach Phase B4 davon bleibt)                              |
| Legal / DSGVO          | [docs/legal/](docs/legal/) (AVV-Vorlage, Datenschutz-Module, Drittland-Konnektoren)                                    |
| Full doc index         | [docs/INDEX.md](docs/INDEX.md)                                                                                         |
| Contributing           | [CONTRIBUTING.md](CONTRIBUTING.md)                                                                                     |
