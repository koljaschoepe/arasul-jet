# CLAUDE.md — Arasul Platform

## Vision

**Arasul ist Standardsoftware, die auf einem Server im Unternehmen interne
Apps hostet.** Die Apps baut ein Partner oder ein tech-affiner Mensch im
Unternehmen mit dem **Ara-Kit** (offen, Apache 2.0, eigenes Repo) und rollt sie
auf das Gerät, einen NVIDIA Jetson. Mitarbeiter melden sich mit E-Mail und
Passwort an und sehen die Apps, die ein Admin ihnen freigegeben hat. Die Lizenz
kauft drei Dinge: Anmelden und Zuweisen, die Flow-Engine mit
Nachvollziehbarkeit, den Betrieb (Updates, Backup, Wiederherstellung,
Wartung); dazu Freigaben als Plattformdienst. Alles läuft lokal und
DSGVO-konform, Ziel: fünf Jahre unbeaufsichtigter Betrieb. Ein Wort für alles,
was auf dem Gerät läuft: **App**.

## Architecture at a glance

```
Internet (443) → Traefik → Dashboard-Frontend (React 19 SPA)
                         → Dashboard-Backend (Express API :3001)
                              ├─ PostgreSQL 16 (migrations in services/postgres/init/)
                              ├─ Ollama / LLM-Service (:11434/:11436) [GPU]
                              ├─ Document-Indexer (:9102, nur Text-Extraktion)
                              └─ Docker-Proxy → Self-Healing, Metrics, Backup
```

Zwölf Container, `docker compose ps` ist die Wahrheit. Das Backend ist der
alte Express-Kern, radikal gekürzt (Phasen B1 bis B7 des Umbaus vom
26.08.2026, Messungen unter `docs/plans/audits/`): keine Dokumente, kein RAG,
kein Chat in der Oberfläche, kein Editor, kein Terminal, keine Sandbox, kein
n8n, kein Erweiterungs-Baukasten. Was bleibt: Anmeldung, Modelle, Flows mit
Läufen und Schritten, die externe API mit Schlüssel (`/api/v1/external`,
OpenAI-kompatibel unter `/v1`), Betrieb (Updates, Backup, Selbstheilung,
Werksreset, Fernzugriff). `llm_jobs` ist zustandslos und gehört dem Ersteller
des API-Schlüssels; der `document-indexer` extrahiert Text auf Anfrage
(`POST /extract-text`); Flows arbeiten mit ihren Datei-Werkzeugen in den im
Flow deklarierten Ordnern; `embedding-service` läuft ohne Profil, weil die
OpenAI-kompatible `/v1/embeddings` ihn braucht. Das App-Modell steht seit C3
(Manifest `app.json`, Tabellen `apps` und `app_staende`, Frontend unter
`/apps/<id>/` von Arasul ausgeliefert, Backend als Container über Traefik unter
`/apps/<id>/api/`, je App ein Test- und ein Livestand — siehe
[`docs/features/APPS.md`](docs/features/APPS.md)); die App-Anmeldung steht seit
C4 (Forward-Auth vor jedem App-Backend, `X-Arasul-User` und `X-Arasul-Role`),
der Deploy-Endpunkt seit C5 (`POST /api/v1/external/apps` nimmt ein Paket, baut
das Image am Gerät, rollt in den Teststand; `schalten` setzt den Livestand und
nimmt ihn zurück; `GET /api/v1/external/contract` ist der Vertrag mit dem
Ara-Kit — siehe [`docs/features/APP-PAKET.md`](docs/features/APP-PAKET.md)).
Seit C6 bringt eine App ihre **Flows** im Paket mit (`flows/*.md`, je App und
Stand registriert in `app_flows`, Namensraum ist die App); das Modell je Flow
steht im Frontmatter, der Admin überschreibt es in `flow_settings`, und diese
Überschreibung überlebt ein App-Update. Eine App startet nur ihre eigenen
Flows — der Schlüssel aus C4 trägt App und Stand, gesucht wird mit beiden.
Seit C7 kann ein Flow **anhalten**: das Werkzeug `freigabe_anfordern` legt eine
Zeile in `approvals`, der Lauf steht auf `wartend`, und wer die App freigegeben
hat, bestätigt oder lehnt über `/api/freigabe-anfragen` ab (der Flow nennt keine
Person). Bestätigt läuft er ab dem angehaltenen Schritt weiter, abgelehnt endet
er als `abgebrochen` mit Begründung, ohne Entscheidung nach der Frist als
`abgelaufen` — siehe [`docs/features/FLOWS.md`](docs/features/FLOWS.md).
Seit C8 ist der **Modellkatalog die Kurzliste**: vier Modelle, festgelegt an
`ollama list` am Orin und einmal notiert in
[`config/modelle/kurzliste.json`](config/modelle/kurzliste.json) — das
Standardmodell der Flows (`hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS`), ein kleines
schnelles (`gemma4:e4b`), eines für Einbettungen (`nomic-embed-text`), eines für
Bilder und eingescannten Text (`llava-phi3`). Geladen wird nur, was darin steht;
der Katalog kommt ausschließlich aus Migrationen, und die Plattformprofile
(`config/platforms/*.json`, `utils/hardware.js`, `detect-platform.sh`) tragen
dieselbe Liste — `scripts/test/kurzliste.py` hält sie aneinander. Gestrichene
Gewichte nimmt `scripts/util/modelle-aufraeumen.sh` von Hand vom Gerät, nicht
der Deploy. Bei RAM-Überlast entlädt die Selbstheilung jetzt das Modell (der
Idle-Unload bleibt daneben bestehen).
Seit C9 nimmt die **Sicherung** Apps und Konfiguration mit, ein Weg zurück holt
sie samt Containern wieder.
Seit C10 gibt es die **Auslieferung**: die CI baut aus einem Tag ein
versioniertes Artefakt (`scripts/deploy/artefakt-bauen.sh`,
`.github/workflows/release.yml`), hängt es als GitHub-Release an das Jet-Repo,
und `install.sh` im Wurzelverzeichnis des Artefakts ist sein Einstiegspunkt —
er schreibt die `.env`, setzt den Netznamen und ruft `./arasul bootstrap`. Die
**Fassung kommt aus dem Bau** und nicht mehr aus einer Datei `VERSION`
(`scripts/lib/fassung.sh`: Tag auf HEAD, sonst Datum plus SHA); der Bootstrap
zeigt einmal das Startpasswort und den **Kit-Schlüssel** (`app:deploy`). Das
Gerät heißt im Firmennetz schlicht `arasul` (DHCP-Hostname, Rückfall
`arasul.local` über mDNS) und trägt ein Zertifikat aus einer beim ersten Start
erzeugten **Geräte-CA**, deren Zertifikat der Admin einmal aus der Oberfläche
lädt und verteilt — siehe [`docs/ops/AUSLIEFERUNG.md`](docs/ops/AUSLIEFERUNG.md)
und [`docs/ops/NETZNAME_UND_ZERTIFIKAT.md`](docs/ops/NETZNAME_UND_ZERTIFIKAT.md).
Der erste Werksreset am Orin (28.08.2026) hat fünf Wege gefunden, auf denen die
Installation nicht ohne Hand durchlief, und alle fünf sind zu: der
**Werksreset installiert nichts mehr** (kein `preconfigure.sh`, kein
Modell-Pull) und räumt App-Container, App-Images und alle Volumes des Geräts
weg; `tailscale serve` ist **gestrichen**, weil es Traefik den Port 443 nimmt
(auch aus Oberfläche und API); Geheimnisse mit `$` stehen in der `.env` in
Anführungszeichen, sonst liest docker compose sie als Variable. Zwei neue
Wächter halten die Klassen fest: `scripts/test/wurzelpfad.py` (ein Skript, das
sein Wurzelverzeichnis eine Ebene zu hoch ansetzt) und der erweiterte
`stiller-tod.py`, der jetzt auch `arasul` selbst liest. Gemessen wird die
Installation seither **bei jedem Zug**: der CI-Job `Installation` baut das
Artefakt, packt es aus und fährt `./install.sh --nur-vorbereiten` darin;
`scripts/test/bootstrap-abnahme.sh` misst am Gerät, was danach wirklich läuft.
Seit D1 steht die **Shell** aus Beschluss 10: dreispaltig, links die Apps aus
`GET /api/apps/meine`, in der Mitte die Übersicht oder eine App (iframe auf
`/apps/<id>/`, Forward-Auth aus C4), rechts die **Notizen** (`/api/notizen`,
einer je Mensch). Mitarbeiter-Sicht zuerst: **die Rolle blendet aus, das
Backend entscheidet** — die Verwaltung (Modelle, Einstellungen) ist für einen
Mitarbeiter nicht sichtbar, und `requireRole` antwortet ihm dort ohnehin mit
403; das Abmelden sitzt deshalb im Benutzermenü der Kopfleiste und nicht mehr
in den Einstellungen. Angemeldet wird mit Benutzername **oder** E-Mail (C1);
ein vom Administrator gesetztes Passwort ist ein Startpasswort und wird beim
ersten Anmelden gewechselt (`admin_users.passwort_vom_admin`, Migration 178).
Die Zahl der offenen Freigaben aus C7 steht in der Statusleiste. Abnahme:
`scripts/test/shell-abnahme.sh` (Bilder in drei Breiten:
`scripts/test/shell-bilder.mjs`) — sie läuft **neben** `abnahmen.sh`, weil die
Reihe dort mit zehn Anmeldungen auf der Drossel sitzt.
Seit D2 wird die **Freigabe aus C7 im Dashboard entschieden**: die Übersicht
zeigt die offenen Anfragen mit Titel, Zusammenhang und Restzeit, bestätigen
oder ablehnen mit Begründung geht an `POST /api/freigabe-anfragen/:id/…`, und
die Liste aktualisiert sich über die Entwertung der Abfrage — ohne Neuladen,
auch nach einem Fehler (ein 409 heißt gerade, dass die Liste veraltet ist).
Die Oberfläche liegt in `features/freigaben/`, zusammengesetzt wird sie in
`features/workspace/TabContent.tsx`: nur die Shell importiert quer, die
Übersicht bekommt die Liste als Slot. Zwei Funde der D1-Abnahme sind zu:
`DownloadContext` fragt `/models/catalog` nur noch als `admin` (für einen
Mitarbeiter war es ein 403 in der Konsole beim Laden der Shell), und
`GET /api/settings` ist aus der Verwaltungsprobe von `shell-abnahme.sh` heraus
— diesen Weg gibt es gar nicht, 404 war richtig, gemessen wird jetzt
`GET /api/system/info`. Abnahme: `scripts/test/dashboard-abnahme.sh` (Klick im
Browser über `scripts/test/dashboard-bilder.mjs`); sie läuft ebenfalls neben
`abnahmen.sh` und **nicht** in derselben Viertelstunde wie `shell-abnahme.sh`.
Der Rest der neuen Oberfläche kommt mit den weiteren D-Phasen.

| Layer    | Stack                                                             | Path                                                          |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Frontend | React 19 + Vite 6 + Tailwind v4 + shadcn/ui + TypeScript          | `apps/dashboard-frontend/`                                    |
| Backend  | Node.js/Express + PostgreSQL + WebSocket/SSE                      | `apps/dashboard-backend/`                                     |
| AI       | Ollama (LLM) + Text-Extraktion (Indexer) + Embeddings             | `services/llm-service/`, `services/document-indexer/`         |
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
| Design                 | [docs/development/DESIGN.md](docs/development/DESIGN.md)                                                               |
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
| Legal / DSGVO          | [docs/legal/](docs/legal/) (AVV-Vorlage, Datenschutz-Module, Drittland-Konnektoren)                                    |
| Full doc index         | [docs/INDEX.md](docs/INDEX.md)                                                                                         |
| Contributing           | [CONTRIBUTING.md](CONTRIBUTING.md)                                                                                     |
