# Regressed-Features-Inventar (Phase-0-Output)

> **Archived 2026-06-03** — Cherry-picks completed via commit `c370cad` (Mig 082-089, OpenAI-Compat, GDPR, CB). Remaining side-branch items tracked in `docs/plans/active/side-branch-cherry-pick-2026-05-14.md`.

**Status:** archived
**Erstellt:** 2026-05-08
**Begleitdokument zu:** `docs/plans/active/repo-deep-audit-2026-05-08.md` (Phase 0)

## Kern-Erkenntnis

Die in MEMORY als "live" markierten Features sind **nicht regressed**, sondern existieren auf zwei langen Side-Branches, die **nie nach main gemerged wurden**:

| Branch                          | Alter  | Größe                         | Zustand                                                                            |
| ------------------------------- | ------ | ----------------------------- | ---------------------------------------------------------------------------------- |
| `feat/telegram-bot-overhaul`    | 5 Tage | +44 997 / -18 498 (525 files) | **Superset** von `cleanup/phase-6-test-coverage` (1 zusätzlicher Commit `eb14000`) |
| `cleanup/phase-6-test-coverage` | 9 Tage | +35 342 / -18 439 (477 files) | Subset des oberen                                                                  |

Branch-Point: `aa1dacf` "Phase-0 — critical runtime, hook, and doc fixes" (vor 9 Tagen).
main hat seitdem 30+ Commits gesehen (Audit-Sanierung P0-P22, External-Integrations-Hardening d9d6b89, Doku-Fixes, Indexer-Fixes).

Merge-Test (`git merge-tree`) zeigt **keine Git-Konflikte** — die `CONFLICT`-Treffer sind alle SQL `ON CONFLICT`-Klauseln, nicht Merge-Konflikte. Die Branche ist theoretisch sauber merge-bar.

## Inventar: was auf der Side-Branche aber nicht auf main ist

### 1. Migrationen 082-089 (8 Stück, alle SQL)

| #   | Datei                             | Zweck                                                                                     | MEMORY-Behauptung              | Auf main? |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------ | --------- |
| 082 | `alert_history_retention_90d.sql` | Alert-History 90-Tage-Retention                                                           | —                              | ❌        |
| 083 | `model_download_progress.sql`     | Resume + paused-status für Downloads                                                      | "Phase 0 live 2026-04-26"      | ❌        |
| 084 | `rag_log_privacy.sql`             | Prompt-Hash statt Plaintext                                                               | "Phase 5 P0 live"              | ❌        |
| 085 | `revoke_wildcard_api_keys.sql`    | Wildcard-Reject + Rate-Limit per Key-ID                                                   | "Phase 5 P1 live 2026-04-29"   | ❌        |
| 086 | `compliance_settings.sql`         | Telegram OFF, AI-Act Art.50 Transparency                                                  | "Phase 1 Commercial Launch"    | ❌        |
| 087 | `n8n_external_calls.sql`          | n8n-External-Calls-Log                                                                    | —                              | ❌        |
| 088 | `audit_log_7y_retention.sql`      | Audit-Log 7-Jahre-Retention                                                               | —                              | ❌        |
| 089 | `resource_ownership_and_acl.sql`  | **Multi-User-Isolation**: projects/documents/knowledge_spaces.owner_id, space_members ACL | "Phase 1.1 Mandanten-Trennung" | ❌        |

**Achtung:** main hat Migrationen 090-092 (`n8n_audit_log`, `telegram_bot_health`, `telegram_dsgvo`), die parallel zu 086-089 für ähnliche Themen entwickelt wurden. Aber **keine Tabellen-Doppelung beim Schnelltest** — 086-089 ergänzen `system_settings`, `audit_log`, `projects/documents/knowledge_spaces`; 090-092 erstellen neue Tabellen `n8n_audit_log`, `bot_health`, `telegram_user_consent`. Nähere Reihenfolgen-Analyse für Phase 3 nötig.

**Laut Commit-Body von `8ef342f`** ist die laufende Appliance bereits auf 089 — d.h. **die DB hat 082-089 + 090-092 (potenziell) angewendet, aber main reflektiert das nicht.** Falls das stimmt: schon-deployed-aber-nicht-im-Repo-Zustand.

### 2. Backend-Code

| Datei                                                        | Zeilen    | Zweck                                                                                                            | MEMORY-Behauptung                   |
| ------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `apps/dashboard-backend/src/routes/external/openaiCompat.js` | 447       | `/v1/chat/completions`, `/v1/embeddings`, `/v1/models` (drop-in OpenAI replacement, scope-basierte API-Key-Auth) | "Phase 3 live 2026-04-27"           |
| `apps/dashboard-backend/src/schemas/openaiCompat.js`         | 37        | Zod-Schemas für OpenAI-Compat                                                                                    | —                                   |
| `apps/dashboard-backend/__tests__/unit/openaiCompat.test.js` | n.a.      | Test-Coverage                                                                                                    | —                                   |
| `apps/dashboard-backend/src/routes/admin/gdpr.js`            | n.a.      | `GET /api/gdpr/export` + `DELETE /api/gdpr/me` (mit Confirmation-Token "LOESCHEN-BESTAETIGT")                    | "Phase 5.6 live 2026-04-28"         |
| `apps/dashboard-backend/__tests__/unit/gdprDelete.test.js`   | n.a.      | Test-Coverage                                                                                                    | —                                   |
| `apps/dashboard-backend/src/services/llm/ollamaReadiness.js` | erweitert | **Circuit-Breaker tatsächlich gewrapt** (`circuitBreakers.get('ollama').execute(...)`)                           | "Phase 6 Ollama-CB live 2026-04-29" |
| `apps/dashboard-backend/src/utils/retry.js`                  | erweitert | Breaker tatsächlich um Calls gewrapt                                                                             | —                                   |

### 3. Frontend-Code

| Datei                                                                                                    | Zeilen      | Zweck                                                                     | MEMORY-Behauptung                                                |
| -------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/dashboard-frontend/src/features/settings/hooks/useN8nIntegrationData.ts`                           | 40+         | TanStack-Query-Hook für n8n-Tab (Default-Model, API-Key-Prefix, Hostname) | "Phase 3 n8n-Tab live"                                           |
| `apps/dashboard-frontend/src/features/settings/n8n-template.ts`                                          | n.a.        | Live-Markdown-Template für n8n-Doc                                        | —                                                                |
| `apps/dashboard-frontend/src/features/system/InitialSetupWizard.tsx`                                     | 223         | Erweiterter Setup-Flow                                                    | —                                                                |
| `apps/dashboard-frontend/src/features/telegram/{components,hooks}/...`                                   | 12k+ Zeilen | Telegram-Page komplett refactored (TanStack Query)                        | "Phase 1-7 External Integrations" (überlappt mit main `d9d6b89`) |
| `apps/dashboard-frontend/src/hooks/queries/{modelKeys,system,useHardwareCompatibility,useModelState}.ts` | 300+        | TanStack-Query-Migration für Model-State                                  | "Phase 1 modelKeys SSOT"                                         |
| `apps/dashboard-frontend/src/hooks/useDashboardData.ts`                                                  | 171         | Dashboard-Aggregations-Hook                                               | —                                                                |
| `apps/dashboard-frontend/src/hooks/useEvictionWatcher.ts`                                                | 50          | Eviction-Toast                                                            | "Phase 2 live"                                                   |
| `apps/dashboard-frontend/src/utils/lazyWithRetry.ts`                                                     | 42          | Chunk-Load-Error-Recovery                                                 | (siehe Audit P2.8.3)                                             |

**Achtung:** Die Telegram-UI-Refactoring auf der Side-Branch überlappt mit dem External-Integrations-Hardening (`d9d6b89`) auf main. Das ist der heikelste Merge-Bereich.

### 4. Was auf main _zusätzlich_ gemacht wurde (geht beim Merge zurück, wenn nicht aufgepasst)

Die ~30 main-Commits seit dem Branch-Point. Grob:

- Audit-Sanierung P0-P22 (1d66830..ebd7bfe) — 14-Agent-Audit-Findings, große Korrekturwelle
- External-Integrations-Hardening (d9d6b89) — Phasen 1-7 (n8n, Telegram-Härtung)
- Indexer-LRU-Cache (0f25f0d), Watchdog (5c57048)
- Frontend ApiError-Type-Konsolidierung (80ef428), Semantic-Color-Tokens (ea206b6)
- Backend Error-Type-Refactor (31d5fd0, 76c4275, 74d93e7)
- Self-Healing os-import-Fix (2b6d6e9)
- run-tests PROJECT_ROOT-Fix (eea49d7, 47dddf0)

→ Beim Merge müssen wir verifizieren, dass diese 30 Commits nicht durch Side-Branch-Versionen überschrieben werden, weil die Side-Branch älter ist als die main-Korrekturen.

## Strategie-Optionen für Phase 3

### Option A — Full Merge

```bash
git checkout main
git merge feat/telegram-bot-overhaul
# resolve any conflicts (keine erwartet laut merge-tree)
# manuell verifizieren, dass main-Audit-Fixes nicht überschrieben sind
# tests + smoke
```

**Pro:** Alles auf einmal, alles zusammen-entwickelt, weniger Cherry-Pick-Konflikte
**Contra:** 44 997 + Zeilen Diff in einem Schwung; manuelle Review für 30 main-Commits + Side-Branch-Zustand
**Risk:** Side-Branch hat "Phase 1-7 External Integrations" nicht in der Version aus `d9d6b89` — main-Version geht verloren oder wird überschrieben

### Option B — Surgical Cherry-Pick (4 Schritte)

1. **Migrationen 082-089** als ein cherry-pick-Block (8 Files)
2. **OpenAI-Compat** (`routes/external/openaiCompat.js` + Schema + Test + Route-Mount in `routes/index.js`)
3. **GDPR** (`routes/admin/gdpr.js` + Test + Frontend-Tab)
4. **Circuit-Breaker-Wrappings** (`ollamaReadiness.js`, `retry.js`)

**Pro:** Granular kontrollierbar, jede Phase einzeln testbar, weniger Risk pro Schritt
**Contra:** Cherry-Pick könnte je Datei Konflikte werfen, Side-Branch-Hooks/Helpers fehlen (z.B. `lazyWithRetry.ts`, `useDashboardData.ts`)
**Effort:** ~2-3 Tage manuelle Cherry-Pick + Anpassung

### Option C — Re-implement on top of main

Side-Branche ignorieren, alles auf main neu bauen (nur die Features, die wir aus dem Audit als "fehlend" markiert haben).

**Pro:** Saubere main, keine Altlasten, Code passt zur main-Architektur
**Contra:** Verschwendet viel Arbeit (Side-Branch-Code ist meist OK)
**Effort:** ~1 Woche Frontend + Backend

### Option D — "Side-Branch ist die Wahrheit"

Behaupten, dass die Appliance schon den Side-Branch-Zustand hat (082-089 Migrationen, openaiCompat etc.) und main daran anpassen via reset oder Inverse-Merge.

**Pro:** Wenn die Appliance wirklich schon auf 089 ist, ist main "wrong"
**Contra:** Verliert die main-Audit-Fixes; sehr riskant
**Risk:** sehr hoch

## Empfehlung

**Option B (Surgical Cherry-Pick)** in folgender Reihenfolge:

1. **Phase 3.1 — Migrationen** (1 Tag): Die 8 SQL-Files cherry-picken. Verifizieren, dass keine main-Migration mit gleicher Nummer kollidiert (082-089 sind frei nach `8ef342f`-Renumbering). Smoke-test gegen frisches Postgres.
2. **Phase 3.2 — OpenAI-Compat** (1 Tag): `openaiCompat.js` + Schema + Test + `routes/index.js`-Mount cherry-picken. n8n-Workflow-Test gegen die Endpunkte.
3. **Phase 3.3 — GDPR-Tab** (1 Tag): Backend-Route `gdpr.js` + Test cherry-picken; Frontend-Datenschutz-Tab neu implementieren (das ist die Frontend-Lücke, die der Audit aufgedeckt hat).
4. **Phase 3.4 — Circuit-Breaker** (½ Tag): `ollamaReadiness.js`-Diff + `retry.js`-Diff übernehmen, alle anderen Service-Calls gegenprüfen.
5. **Phase 3.5 — n8n-Tab UI** (1 Tag): `useN8nIntegrationData.ts` + `n8n-template.ts` + neue Settings-Tab-Section.
6. **Phase 3.6 — Multi-User-Isolation aktivieren** (1 Tag): Migration 089 läuft, aber Backend-Routes müssen `owner_id`-Check implementieren. Das ist auf der Side-Branch teilweise schon getan (`projects.js +50`, `documents.js +23`, `chats.js +122` etc.) — diff je Route reviewen.

**Insgesamt: ~5,5 Tage** für Phase 3, eingebettet in den Master-Plan `repo-deep-audit-2026-05-08.md`.

**Was wir NICHT cherry-picken:** Telegram-UI-Refactor + TanStack-Query-Migration der Frontend-Hooks (`useDashboardData.ts`, `useModelState.ts` etc.) — das ist zu groß und überlappt mit dem main External-Integrations-Hardening. Wenn nötig, später als eigenes Refactor-Plan.

## Was MEMORY behauptet vs Realität

| MEMORY-Eintrag                                                            | Tatsächlicher Zustand                                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `phase0-download-persistence.md` "live 2026-04-26"                        | Migration 083 fehlt auf main, existiert auf Side-Branch                                        |
| `phase1-state-konsistenz.md` "modelKeys SSOT live"                        | Hooks `queries/modelKeys.ts` fehlen auf main, existieren auf Side-Branch                       |
| `phase2-hardware-awareness.md` "Eviction-Toast live"                      | `useEvictionWatcher.ts` fehlt auf main, existiert auf Side-Branch                              |
| `phase3-n8n-openai-compat.md` "live 2026-04-27"                           | `openaiCompat.js` + `useN8nIntegrationData.ts` fehlen auf main, existieren auf Side-Branch     |
| `phase4-chat-rag-robustheit.md` "P0 live"                                 | Teils auf main (Phase-4.8-Watchdog ist auf main), teils auf Side-Branch                        |
| `phase4-8-indexer-watchdog.md` "live 2026-04-28"                          | ✅ tatsächlich auf main (`5c57048`)                                                            |
| `phase5-dsgvo.md` "P0 live"                                               | Migration 084 + `gdpr.js` fehlen auf main, existieren auf Side-Branch                          |
| `phase5-p1-security.md` "live 2026-04-29 komplett"                        | Migration 085 fehlt auf main, existiert auf Side-Branch                                        |
| `phase6-p0-observability.md` "Logger-Rotation, Ollama-CB live 2026-04-29" | Logger-Rotation auf main; **Ollama-CB nur registriert, nie wired** — wired ist auf Side-Branch |
| `external-integrations-plan.md` "Phase 1.1-1.3 implementiert 2026-05-06"  | ✅ auf main (`d9d6b89`) — KORREKT                                                              |
| `repo-audit-sanierung.md` "P0-P22 alle auf main 2026-05-07"               | ✅ auf main — KORREKT                                                                          |

## Frage an User vor Phase 3

**Wir haben einen riesigen Side-Branch (`feat/telegram-bot-overhaul`), der den größten Teil der "regressed" Features enthält.** Wie soll Phase 3 den überführen?

→ Empfehlung: **Option B (Surgical Cherry-Pick)** wie oben skizziert. Aber nur, wenn der Branche nicht "tot" ist (also: aktive Arbeit darauf? oder bereit, zu verschrotten?).

→ Alternative: Wenn der Branch noch aktiv weitergebaut wird, wäre Option A (full merge) eventuell pragmatischer.
