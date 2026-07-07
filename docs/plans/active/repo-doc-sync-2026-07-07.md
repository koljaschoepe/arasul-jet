# Repo Doc-Sync — Doku wieder mit Code in Deckung bringen

> Sammelplan aus dem Repo-Cleanup-Audit vom 2026-07-07 (22-Agenten-Sweep). Die
> **echten Defekte** (Compose-Mount, Orphan, Trailer, useApi-Ausnahmen,
> CLAUDE.md-Refs, Branch-Cleanup, /plan-Skill-Autonomie, Plan-Reconcile) sind
> bereits im Cleanup-Branch `004-repo-cleanup-audit` erledigt. **Offen bleibt
> nur die Doku-Drift** — hier gebündelt, weil sie viel Diff erzeugt und besser
> als eigener, fokussierter `/plan`-Lauf abgearbeitet wird.

## Goal & Success Criteria

Jede der sieben driftenden Doc-Dateien beschreibt wieder den echten Code-Stand.
„Done" = ein Entwickler/Agent, der die Doc liest, findet keine Endpoints, Env-Vars,
Ports, Tokens oder Workflow-Beschreibungen mehr, die nicht (mehr) existieren.

## Scope

**In scope:** reine Doku-/Kommentar-Änderungen in den unten gelisteten Dateien.
**Out of scope:** Code-Verhalten ändern, neue Features, DB-Schema (ist bereits
konsistent), CI/CD-Pipeline (ist korrekt verdrahtet).

## Acceptance Criteria

- [ ] `docs/api/API_REFERENCE.md` deckt die real gemounteten Routes ab (siehe P0).
- [ ] `docs/api/API_ERRORS.md` nutzt durchgehend das echte Fehler-Envelope.
- [ ] `docs/ENVIRONMENT_VARIABLES.md` hat keine toten und keine fehlenden Vars mehr.
- [ ] `docs/ARCHITECTURE.md` + Root-`CLAUDE.md` geben die real published Ports korrekt an.
- [ ] `docs/INDEX.md` listet alle Doc-Dateien/Ordner.
- [ ] `CONTRIBUTING.md` §8–§9 beschreibt die Auto-Ship-`/plan`-Pipeline.
- [ ] `docs/development/DESIGN_SYSTEM.md` referenziert nur existierende Tokens.
- [ ] Kleinere Nits (siehe P7) bereinigt.

## Phases

### P0 — API_REFERENCE.md (größte Drift)

**Files:** `docs/api/API_REFERENCE.md`
**Risk:** low (nur Doku) — aber viel Fläche.
**Belege aus Audit:**

- **Dokumentiert, aber entfernt/umbenannt:** `GET /api/llm/status` (real: `/models`, `/queue*`, `/jobs*`); `GET /api/database/status|metrics` (real: `/pool`, `/health`, `/connections`, `/queries`); `GET /api/logs/:filename` (real: `/list`, `/stream`, `/search`); `PATCH /api/telegram-app/rules/:ruleId/toggle` (kein Toggle-Route); `POST /orchestrator/process` + `GET /orchestrator/stats` (real nur `/orchestrator/status`, `/orchestrator/thinking/:agentType`); `POST /zero-config/chat-detected` (real nur `/zero-config/cancel`).
- **Ganzer undokumentierter Block:** OpenAI-kompatibles API unter `/v1` (`POST /v1/chat/completions`, `POST /v1/embeddings`, `GET /v1/models`) — app-level gemountet in `src/index.js`.
- **Dutzende implementiert-aber-undokumentiert** (auth `/needs-setup`,`/setup`; chats `/recent`,`/search`,`/:id/jobs`; documents `/statistics`,`/categories`,`/:id/reindex`,batch-ops,images; llm queue/jobs; system `/heartbeat`,`/diagnostics*`; services, settings, update, self-healing, models, apps, workflows, telegram audit-logs …). Vollständige Liste im Audit-Transcript.

### P1 — API_ERRORS.md

**Files:** `docs/api/API_ERRORS.md`
**Risk:** low.
**Belege:** Alle Beispiel-Bodies nutzen die veraltete Form `{"error":"string"}` statt des echten Envelopes `{"error":{code,message,details}}` (widerspricht der eigenen Format-Definition + `ApiError.toJSON()`). `NotImplementedError`/501 fehlt komplett. Codes `FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, SERVICE_UNAVAILABLE, INTERNAL_ERROR` + der `ServiceUnavailableError`-Custom-Code-Override sind nicht als Maschinen-Codes gelistet. PG-/Zod-/ECONNREFUSED-Mappings aus `middleware/errorHandler.js` undokumentiert.

### P2 — ENVIRONMENT_VARIABLES.md

**Files:** `docs/ENVIRONMENT_VARIABLES.md`
**Risk:** medium — hier stecken zwei **funktionale Fallen**:

- **Naming-Mismatch (dokumentierte Var wird nie gelesen):** Doc `TELEGRAM_DEFAULT_CLAUDE_MODEL`/`TELEGRAM_DEFAULT_OLLAMA_MODEL` → Code liest `DEFAULT_CLAUDE_MODEL`/`DEFAULT_OLLAMA_MODEL`. Doc `TEMP_THROTTLE_CELSIUS`/`TEMP_RESTART_CELSIUS` → Code liest `TEMP_THROTTLE_THRESHOLD`/`TEMP_RESTART_THRESHOLD`.
- **Undokumentiert:** Licensing (`LICENSE_*`), Update (`UPDATE_SERVER_URL`/`_CHANNEL`), Sandbox (`SANDBOX_*`), `CLAUDE_CLI_PATH`, LLM-Queue/Timeouts, RAG-Timeouts (`RAG_TIMEOUT_SEARCH/SPARSE/ENTITY/FALLBACK_MS`), Memory-, Embedding-CB-, Document-Indexer-, KG-, OCR- (`TESSERACT_*`/`PADDLEOCR_*`), Self-Healing-Schwellen (`TEMP_*`/`*_OVERLOAD_*`/`MAX_REBOOTS_*`), `RAM_LIMIT_*`, `DOCKER_GID`, `N8N_WEBHOOK_URL`, `BACKUP_PATH`/`BACKUP_WEEKLY_RETENTION_WEEKS`. Volle Tabelle im Audit-Transcript.
- **Tot (nur in Doc):** diverse `TELEGRAM_*`, `LLM_BURST_WINDOW_MS`, `QDRANT_GRPC_PORT`, `LOGIN_LOCKOUT_*`, `LOG_MAX_*`, `JETSON_*RAM_GB`, `TRAEFIK_*` u.a. — prüfen und entfernen/als deprecated markieren.

### P3 — ARCHITECTURE.md + Root CLAUDE.md (Port-Exposure)

**Files:** `docs/ARCHITECTURE.md`, `CLAUDE.md`
**Risk:** low, aber sicherheitsrelevant fürs mentale Modell.
**Belege:** `ARCHITECTURE.md:439` „Exposed Ports: 80, 443, 5678, 9001, 6333, 6334" ist **falsch** — Compose published real nur `80`, `443` und localhost-gebunden `8080`/`9000`/`11434`. qdrant (6333/6334), n8n (5678), minio-Console (9001) sind **nicht** published. §4-Port-Tabelle + Root-CLAUDE.md-Diagramm entsprechend korrigieren (intern vs. published trennen).

### P4 — INDEX.md

**Files:** `docs/INDEX.md`
**Risk:** low.
**Belege:** Fehlen komplett: Ordner `integrations/` (N8N, N8N_OVERVIEW, TELEGRAM_BOT_SETUP) und `legal/` (README, AVV_TEMPLATE, DATENSCHUTZ_N8N, DRITTLAND_KONNEKTOREN); Einzeldocs `CICD.md`, `api/DATABASE_DOMAINS.md`, `development/FRONTEND_HANDBOOK.md`, `development/PYTHON_SERVICES.md`, `ops/INFRASTRUCTURE.md`, `ops/FRESH_INSTALL_CHECKLIST.md`. Außerdem: INDEX beschreibt `plans/audits/` als Audit-Ablage, der Ordner ist aber leer (Audits liegen in `plans/archive/`) — entweder Beschreibung anpassen oder Audits nach `audits/` verschieben.

### P5 — CONTRIBUTING.md §8–§9

**Files:** `CONTRIBUTING.md`
**Risk:** low.
**Belege:** §8/§9 beschreiben noch das alte Modell (`/plan` „endet beim Diff-Review", `/ship` als Normalweg, code-reviewer „vor /ship"). Real: `/plan` läuft autonom bis Commit→PR→Auto-Merge→Jetson-Deploy; `/ship` ist Fallback („normally never type"). Plan-Pfad `active/<slug>.md` → `done/<slug>.md` (nicht `<NAME>_PLAN.md`); `archive/` erwähnen.

### P6 — DESIGN_SYSTEM.md

**Files:** `docs/development/DESIGN_SYSTEM.md`
**Risk:** low.
**Belege:** Tote Token-Refs — `--status-success/error/info` (real: `--status-neutral/critical/warning/performance`), `--space-2..6` (real: `--space-sm/md/lg`), `--radius-2xl`/`--radius-full` (real: `--radius-pill`). Interner Widerspruch: Success-Farbe `#22C55E` (Status-Tabelle) vs. `#10b981` (Copy-Template) — Code ist `--success: #10B981`. „kein Custom-CSS außer Animationen" ist überzeichnet (index.css hat 4751 Zeilen Custom-CSS) — Formulierung entschärfen. Optional: Kontext dokumentieren, dass `check-design-system.js` bewusst auf 59 Hardcoded-Colors / 49 Non-Token-Transitions geratcht ist (aspirationales „Single Source", nicht 0).

### P7 — Kleinere Nits (schnell)

**Files:** `.claude/context/telegram.md`, `.claude/context/n8n-workflow.md`, evtl. `docs/INDEX.md`, `scripts/README.md`
**Risk:** low.
**Belege:**

- Context-Pack `telegram.md`: Route-Dateinamen stale (`telegram.js`/`telegramApp.js` → real `app.js`/`bots.js`/`settings.js`); Case-Drift `telegramRAGService.js` → `telegramRagService.js`.
- Context-Pack `n8n-workflow.md`: dritter Custom-Node `n8n-nodes-arasul-documents` fehlt (nur `arasul-llm`/`arasul-embeddings` gelistet).
- Live-Docs (`INDEX.md:115`, `scripts/README.md:28`, `CONTRIBUTING.md:162`) zitieren den **archivierten** Plan `2026-05_dx-overhaul.md` als „still in flight / Stage 9" — Formulierung auf „historisch" umstellen oder Aussage streichen.

## Rollback

Reine Doku/Kommentare — `git revert` des Doc-Commits genügt. Keine Migrationen,
keine Feature-Flags.

## Open Questions

- Bei P2: tote Env-Vars **löschen** oder als `# deprecated` behalten? (Default-Vorschlag: löschen, da irreführend.)
- Bei P4: `audits/`-Ordner mit Inhalt füllen (Audits verschieben) oder INDEX-Beschreibung anpassen? (Default: Beschreibung anpassen, weniger Churn.)
