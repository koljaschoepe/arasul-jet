# Repo-Deep-Audit 2026-05-08 — Bug-Sanierung (20-Agent-Audit)

**Status:** active
**Owner:** Kolja
**Erstellt:** 2026-05-08
**Methodik:** 20 parallele Sub-Agents (12 Frontend, 8 Backend/Infra), frischer Audit ohne Annahmen über vorhergehende Sanierungen.
**Plan-Slug:** `repo-deep-audit-2026-05-08`

## Kurzüberblick

20 Agents haben ~80 Findings produziert: 23 CRITICAL, 38 WARNING, ~25 INFO.
Schwerwiegendste Erkenntnis: **mehrere in MEMORY als "live" markierte Phasen sind entweder regressed oder nie auf main gelandet.** Das ist hier als Phase 0 ("MEMORY-Reconciliation") priorisiert, weil sonst der Plan auf falschen Annahmen aufsetzt.

### Was ist regressed / nie gelandet

| MEMORY-Claim                                                                                 | Tatsächlicher Zustand auf main                                                                                  | Quelle                                                                 |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Phase 0 Migration 083 (download-persistence) live                                            | `services/postgres/init/083_*.sql` existiert nicht (Lücke 081→090)                                              | `ls services/postgres/init/`                                           |
| Phase 5 P1 Migration 085 (wildcard-reject + rate-limit per key-id) live                      | `085_*.sql` existiert nicht                                                                                     | `ls services/postgres/init/`                                           |
| Phase 3 OpenAI-Compat `/v1/chat/completions`, `/v1/embeddings`, `/v1/models` live 2026-04-27 | 0 Treffer im Backend-Code                                                                                       | `grep -rn "v1/chat/completions" apps/dashboard-backend/src/`           |
| Phase 3 eigener n8n-Tab mit Live-Markdown live                                               | `useN8nIntegrationData.ts` fehlt; nur alter `N8nIntegrationGuide.tsx` existiert                                 | `ls apps/dashboard-frontend/src/features/settings/`                    |
| Phase 5.6 Datenschutz-Tab + DELETE `/api/gdpr/me` live                                       | 0 Treffer für `Datenschutz`, `gdpr`, `/api/gdpr` im Frontend                                                    | `grep -rn "Datenschutz\|gdpr\|/api/gdpr" apps/dashboard-frontend/src/` |
| Phase 6 Ollama-Circuit-Breaker live                                                          | Breakers registriert, aber **NIE** als `cb.execute(...)` um echte Calls gewrapt — nur in `/api/health` sichtbar | `grep -rn "circuitBreakers.get\|breaker.execute"`                      |
| Phase 1 Optimistic Delete für Modelle                                                        | `StoreModels.tsx:189-201` ist serverbestätigt (kein optimistic)                                                 | F4-Audit                                                               |

→ **MEMORY in `/.claude/projects/.../memory/` muss dringend reconciled werden** (Phase 0 unten).

### Top-Severity-Defekte (Auswahl der gefährlichsten)

1. **IDOR auf LLM-Jobs** (`routes/llm.js:194-409`) — jeder authentifizierte User kann fremde Jobs lesen/canceln/streamen.
2. **Webhook-Auth Timing-Attack** (`routes/external/events.js:245,282`) — `!==` statt `crypto.timingSafeEqual`.
3. **Destruktive Admin-Migration ohne `requireAdmin`** (`routes/rag.js:576`).
4. **Embedding Circuit-Breaker self-disables permanently** (`embeddingService.js:43`).
5. **Indexer-Watchdog hebt Retry-Cap aus den Angeln** (`database.py:330-343`) — Poison-Docs loopen ewig.
6. **VACUUM FREEZE fires inside transaction → throws always** (`healing_engine.py:452`) — 5-Jahre-Run XID-Wraparound-Risiko ist real.
7. **Self-Healing renews public TLS cert mit self-signed** (`healing_engine.py:508`) — Real-CA-Cert wird ersetzt.
8. **multer 1.4.5 + axios 1.8.0** — beide haben aktive 2025-CVEs (DoS / SSRF).
9. **Frontend: zwei separate `DownloadProvider`-Bäume** (`App.tsx:406-419` vs `:447`) — orphan downloads beim Wizard-Exit.
10. **`useTokenBatching`** — kein Unmount-Cleanup, capture-of-stale-index nach Compaction → Tokens landen im falschen Message-Slot.

---

## Phasen

Phasen sind nach Risiko + Abhängigkeit sortiert. **Ship-Reihenfolge ist verbindlich** — Phase 0 zuerst, dann P1 (Sicherheit/Datenkorrektheit) parallel zu P2 (Frontend-Korrektheit).

### Phase 0 — MEMORY-Reconciliation + verlorene Phasen-Audit (½ Tag)

**Ziel:** sauberer Boden, bevor wir bauen.

- [ ] 0.1 MEMORY-Einträge `phase0-download-persistence.md`, `phase5-p1-security.md`, `phase3-n8n-openai-compat.md`, `phase5-dsgvo.md`, `phase6-p0-observability.md` mit Code-Realität abgleichen. Status auf "regressed" oder "nie gelandet" updaten.
- [ ] 0.2 `git log --all --oneline | grep -E "phase0|phase3|phase5|phase6"` + `git branch -a` → herausfinden, ob die Features auf einem Side-Branch leben (Agent meldete `cleanup/phase-6-test-coverage` und `feat/telegram-bot-overhaul`). Falls ja: cherry-pick-Plan in P3.
- [ ] 0.3 Inventar der nicht persistierten Features in einem temporären Doku-File (`docs/plans/active/regressed-features.md`), damit Phase 1-5 weiß, was wieder reincoded werden muss vs was neu gebaut wird.

**Done-Kriterium:** klar dokumentiert, welche der 7 oben gelisteten "live"-Claims Realität sind und welche nicht.

---

### Phase 1 — Sicherheit & Datenintegrität (CRITICAL, sofort)

**Ziel:** keine offenen Sicherheits-/Datenkorrektheits-Lücken in Production.

#### 1.1 IDOR + Auth-Defekte (Backend)

- [ ] **1.1.1** `apps/dashboard-backend/src/routes/llm.js:194-409` — Jobs-Endpunkte (`GET /jobs/:id`, `GET /jobs/:id/stream`, `DELETE /jobs/:id`) müssen `job.user_id === req.user.id` prüfen. Bei Mismatch: `NotFoundError` (kein "Forbidden", um Existenz nicht zu leaken).
- [ ] **1.1.2** `routes/rag.js:576-671` — `POST /fix-space-ids` zusätzlich mit `requireAdmin` gaten oder besser: aus Production-Routen entfernen und in CLI-Skript verschieben.
- [ ] **1.1.3** `routes/external/events.js:245,282` — Webhook-Secret-Vergleich auf `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`.
- [ ] **1.1.4** `utils/jwt.js:101-104` — `audience: 'arasul-dashboard'` zu sign+verify hinzufügen.
- [ ] **1.1.5** `services/alertEngine.js:45-77` — SSRF-Guard erweitern: `dns.lookup(name, { family: 0 })` statt `resolve4`, IPv6-private-Ranges (`::1`, `fc00::/7`, `fe80::/10`) reject; pin resolved IP via custom https.Agent → kein DNS-Rebinding-TOCTOU.

#### 1.2 Dependency-CVEs

- [ ] **1.2.1** `apps/dashboard-backend/package.json` → `multer ^2.0.0` (CVE-2025-7338, -47935, -47944, alle DoS).
- [ ] **1.2.2** `axios ^1.12.0` (CVE-2025-27152 SSRF + CVE-2025-62718 NO_PROXY).
- [ ] **1.2.3** `npm audit` clean nach Upgrades; falls Breaking-Changes: Tests laufen lassen (`./scripts/test/run-tests.sh --backend`).

#### 1.3 WebSocket-Authentifizierung

- [ ] **1.3.1** JWT raus aus `?token=` Query-String — laut MEMORY Phase 5 P1 erledigt, aber `apps/dashboard-backend/src/index.js:584,615,649` zeigt: ist NICHT aktiv. Migration: Token via `Sec-WebSocket-Protocol` Subprotocol (`['arasul.v1', token]`) oder via httpOnly-Cookie.
- [ ] **1.3.2** `useTerminal.ts:210` und `useWebSocketMetrics.ts:120-124` — Frontend-Seite mitziehen.

#### 1.4 SSE-Robustness (Traefik buffering)

- [ ] **1.4.1** `routes/system/logs.js:184-186` und `routes/external/claudeTerminal.js:230-234` — `flushHeaders()` + `X-Accel-Buffering: no` + 15s-Keepalive-Comment-Frame; alternativ: `sseHelper.initSSE()` benutzen, der das schon richtig macht.

#### 1.5 DB-Schema-Defekte

- [ ] **1.5.1** `092_telegram_dsgvo.sql` referenziert `telegram_user_chats`, aber diese Tabelle existiert nirgends (CREATE TABLE fehlt). `telegramCommandHandlers.js:244,284` (`/loeschen`, `/auskunft`) crashen zur Laufzeit. Entweder Migration nachschieben (CREATE TABLE telegram_user_chats) ODER Code auf `telegram_bot_chats` umbiegen — User-Entscheidung.
- [ ] **1.5.2** `external/externalApi.js:113,491,621` — `INSERT INTO chat_conversations (...)` ohne `project_id` → NOT-NULL-Violation seit Migration 043. Default-Project ID einsetzen oder Spalte wieder optional machen.
- [ ] **1.5.3** `008_llm_queue_schema.sql` `get_next_queue_position()` ohne Lock → Race. `SELECT MAX(...) FOR UPDATE` oder Sequence verwenden.

#### 1.6 Webhook-secrets nicht in Logs

- [ ] **1.6.1** `services/backup-service/backup.sh:24-37` — `openssl enc -pass pass:$KEY` per CLI exposed via `/proc/<pid>/cmdline`. Auf `-pass file:<fd>` umstellen.

**Done-Kriterium:** `npm audit` clean, kein IDOR mehr (manueller Test: User A loggt ein, kopiert Job-ID, versucht GET als User B → 404), `git grep "throw new Error\|!==.*secret"` in routes/ leer.

---

### Phase 2 — Frontend-Korrektheit (HOCH, parallel zu P1)

**Ziel:** Logik-Bugs fixen, die User direkt erleben. Frontend-Schwerpunkt 60% wie gewünscht.

#### 2.1 Auth/Session-Flow

- [ ] **2.1.1** `AuthContext.tsx:82-97` — bei `checkAuth`-Network-Error NICHT mehr `isAuthenticated=true` aus localStorage-Cache wiederherstellen. Stattdessen `isAuthenticated=null` (loading) + Retry mit Backoff.
- [ ] **2.1.2** `hooks/useApi.ts:169-174` — In-flight-Guard für 401-getriggertes `logout()`: `if (logoutInFlight) return; logoutInFlight = true;` damit 7 parallele 401s nicht 7 Logouts feuern.
- [ ] **2.1.3** `AuthContext.tsx:122-142` (`logout()`) — `queryClient.clear()` + `localStorage.clear()` + Cookie-Cleanup (`arasul_csrf`) hinzufügen, **bevor** API-Call. Verhindert Cross-User-Datenleak via TanStack-Query-Cache.
- [ ] **2.1.4** `AuthContext.tsx:59` — `checkAuth` mit `AbortController` versehen, damit StrictMode-Doppel-Mount + Logout-Während-Auth-Check nicht in Stale-State enden.
- [ ] **2.1.5** `PasswordManagement.tsx:194-200` — Dashboard-Password-Change muss `await api.post('/auth/logout')` aufrufen (Token blacklisten), dann erst `navigate('/')`. Aktuell bleibt das alte JWT 4h lang gültig.
- [ ] **2.1.6** `PasswordManagement.tsx:277-284` — Label/Placeholder dynamisch nach `activeService` (`'Aktuelles Dashboard-Passwort'` vs `'Aktuelles MinIO-Passwort'`).
- [ ] **2.1.7** Cross-Tab-Sync: `window.addEventListener('storage', e => { if (e.key === 'arasul_token' && !e.newValue) logout(); })` in AuthContext.
- [ ] **2.1.8** `App.tsx:392-397` — Login-Component muss innerhalb `<Router>` rendern (oder `?returnUrl=` in localStorage zwischenspeichern), damit Deep-Link nach Login wiederhergestellt wird.
- [ ] **2.1.9** `utils/token.ts:38,96` — base64url-decode statt `atob` verwenden (`-`/`_` → `+`/`/` ersetzen).

#### 2.2 Chat (kritischste Logik-Bugs der ganzen App)

- [ ] **2.2.1** `ChatContext.tsx:1061-1083` — `verifyPersistence`-Retries an einen `AbortController` knüpfen, der bei `cleanupChat`/Unmount/Logout aborted wird.
- [ ] **2.2.2** `ChatTopBar.tsx:79-97` — `handleDelete` muss vor dem API-DELETE `cleanupChat(chatId)` rufen (AbortController + Callbacks + activeJobIds).
- [ ] **2.2.3** `ChatContext.tsx:939-947` — bei `data.error`-Event den leeren Assistant-Placeholder entfernen (`messages.filter(m => m.id !== assistantMsgId)`), nicht nur die Error-Banner setzen.
- [ ] **2.2.4** `ChatInputArea.tsx:338-343` (`handleRetry`) — vorher den letzten User-Msg + Empty-Assistant-Placeholder aus `messagesRef.current` entfernen, sonst dupliziert sich beim Retry alles.
- [ ] **2.2.5** `useTokenBatching.ts:51-127` — Unmount-Cleanup-Effect: `return () => { if (batchTimerRef.current) clearTimeout(batchTimerRef.current); }`.
- [ ] **2.2.6** `useTokenBatching.ts:95-105` — `assistantMessageIndex` nicht im setTimeout-Closure festhalten, sondern aus Ref lesen (`indexRef.current`), damit Compaction-Shift nicht ins Leere schreibt.
- [ ] **2.2.7** `ChatMessage.tsx:24` — `Array.isArray(children) ? children.join('') : String(children)` für Mermaid-Code-Block (sonst Komma-Joins zerstören mehrzeilige Diagramme).
- [ ] **2.2.8** `ChatMessage.tsx:50-68` — `arePropsEqual` muss `message.status` mit vergleichen (sonst kein Re-Render auf streaming→completed).
- [ ] **2.2.9** `ChatView.tsx:88-135` — Race: `registerMessageCallback` und `init()` nicht parallel feuern; init zuerst awaiten, dann Callback registrieren, sonst überschreibt `setMessages(msgResult.messages)` Live-Tokens.
- [ ] **2.2.10** Cancel-Button-Lücke beim Model-Load: `ChatInputArea.tsx:805-814` — Stop-Button schon ab `isLoading && !isStreaming` zeigen (während Model-Lade-Phase, vor erstem `job_started`-Event).

#### 2.3 Provider-Architektur

- [ ] **2.3.1** `App.tsx:406-419` vs `:447` — die zwei separaten `DownloadProvider`-Bäume zu EINEM zusammenführen, der den Auth-Flip überlebt. Provider-Hierarchie: ToastProvider → AuthProvider → DownloadProvider → ActivationProvider → ChatProvider → Router → (LoginPage XOR App). Provider-Mount nicht von `isAuthenticated` abhängig machen.
- [ ] **2.3.2** `App.tsx:447-449` — Provider hinter Authentication-Gate stehen aktuell nach Auth-Flip leer. Nach 2.3.1 obsolet.
- [ ] **2.3.3** `ChatContext.tsx:464-494,1137-1199` — `cancelJob` aus dem Memo-Value-Dependency rausziehen oder mit Refs entkoppeln; aktuell re-rendert jeder `useChatContext`-Consumer auf jeden `activeJobIds`-Wechsel.

#### 2.4 Models / Downloads

- [ ] **2.4.1** `DownloadContext.tsx:165-194` — `'paused'`-Branch in der Polling-State-Machine hinzufügen + Resume-Button im UI; Phase-0-Backend-Feature ist sonst unerreichbar.
- [ ] **2.4.2** `DownloadContext.tsx:407-417` (`cancelDownload`) — Backend-Cancel-Call (`api.post('/store/cancel-download', { modelId })`) hinzufügen, sonst läuft der Server-Pull weiter.
- [ ] **2.4.3** `StoreHome.tsx:182-193` — `confirm()` (besser: `<ConfirmDialog>`) vor Delete einbauen; konsistent mit `StoreModels.tsx:189-191`.
- [ ] **2.4.4** `StoreHome.tsx:292` — `isLoaded`-Vergleich mit `effective_ollama_name`-Fallback wie in `StoreModels.tsx:373-374` (Konsistenz Frontend↔Frontend).
- [ ] **2.4.5** `StoreModels.tsx:189-201` — Optimistic Delete einbauen wie in MEMORY behauptet (oder MEMORY-Eintrag korrigieren).
- [ ] **2.4.6** `DownloadContext.tsx:258-274` — Wenn Backend `already_downloading` JSON zurückgibt, wird `abortControllersRef.current[modelId]` nicht eingetragen (bzw nicht entfernt) — fix mit `delete abortControllersRef.current[modelId]` im early-return.

#### 2.5 RAG / Documents

- [ ] **2.5.1** `App.tsx:244` — global `window.addEventListener('dragover'/'drop', e => e.preventDefault())` damit Drop außerhalb der Zone die SPA nicht navigiert.
- [ ] **2.5.2** `useDocumentActions.ts:104-110` — `URL.revokeObjectURL(url)` nach Download (Memory-Leak).
- [ ] **2.5.3** `useDocumentUpload.ts:206` — Files mit `id`-Key (UUID) tracken, nicht `file.name` (sonst zwei gleichnamige Files überschreiben sich).
- [ ] **2.5.4** `DocumentManager.tsx:925-927` — Search-Input mit Debounce (300ms) — aktuell hämmert jeder Keystroke 3 Endpunkte.
- [ ] **2.5.5** `Badges.tsx:115-127` (`IndexStatusBadge`) — `failed`-State unterstützen (Phase-4.8-Watchdog setzt jetzt diesen Status, UI zeigt ihn nicht).

#### 2.6 Settings / Theme

- [ ] **2.6.1** `useTheme.ts:12-17` — `getInitialTheme` muss `getSystemTheme()` benutzen (aktuell totes Funktion-Define + hardcoded `'dark'`).
- [ ] **2.6.2** `index.html:13-17,39` — Hex-Literale (`#101923`, `#FFFFFF`, `#000000`, `#00ff88`) durch CSS-Variablen ersetzen (CLAUDE.md non-negotiable rule).
- [ ] **2.6.3** Settings: Datenschutz-Tab (Phase 5.6) implementieren — DELETE `/api/gdpr/me`-Confirmation-Flow, Export-my-data-Button, Daten-Übersicht. Komplett neu, da regressed.

#### 2.7 Forms

- [ ] **2.7.1** `SetupWizard.tsx:837` — Placeholder `"Mindestens X Zeichen"` aus `pwMinLength`-Server-Wert ableiten, nicht hardcoded `4`.
- [ ] **2.7.2** `EditProjectDialog.tsx:32-39` — useEffect-Reset auf Prop-Change abbrechen wenn `dirty=true`; sonst gehen unsaved Edits beim Hintergrund-Refetch verloren.
- [ ] **2.7.3** `ProjectModal.tsx:268` — Textarea `maxLength={2000}` setzen (Counter zeigt es, Input erlaubt's nicht).
- [ ] **2.7.4** `UpdatePage.tsx:447-453` — Upload-Button auch während `uploading|validating|applying` disablen.
- [ ] **2.7.5** Alle Password-Inputs: `autoComplete="current-password"` / `"new-password"` setzen (Login, PasswordManagement, SetupWizard).
- [ ] **2.7.6** Sweep: `aria-invalid` + `aria-describedby` für alle Form-Inputs mit Validation-Errors (Screen-Reader-Compliance).

#### 2.8 Routing

- [ ] **2.8.1** `ChatRouter.tsx:5-11` (`ChatIndexRedirect`) — `arasul_last_chat_id` validieren via `loadChat(id)` bevor `<Navigate>`. Bei 404 → localStorage clearen + `/chat`.
- [ ] **2.8.2** `ChatView.tsx:238-248` — globaler Esc-Handler nicht firen wenn `document.querySelector('[role=dialog][open]')` existiert.
- [ ] **2.8.3** `App.tsx:608-621` — Catch-all `*` muss zwischen "Echte Server-Down-State" und "Wirkliche 404" unterscheiden. Lösung: ChunkLoadError-Boundary um Suspense, mit "Neue Version verfügbar — Reload"-UI.

#### 2.9 Hooks-Cleanup-Sweep

- [ ] **2.9.1** `useModelStatus.ts:60,107-110` — `abortRefs.current` aller in-flight SSE-Loads in der Cleanup-Function aborten.
- [ ] **2.9.2** `useTableData.ts` (4× `setTimeout(setSaveStatus(null), 2000)`) + `useExcelClipboard.ts:44` — alle `setTimeout`s in einer einzigen Ref tracken und im Unmount clearen.
- [ ] **2.9.3** `Login.tsx:46-57` — `AbortController` für submit-fetch (sonst setState auf unmounted nach Tab-Close).

#### 2.10 Theme-Compliance (39 Hex-Verstöße)

- [ ] **2.10.1** `useTerminal.ts:146-166` — xterm-Theme-Object aus `getCssVar('--term-*')` ableiten statt 21 Hex-Literale. Pro Theme (light/dark) ein Objekt; auf `themeChange`-Event re-applyen.
- [ ] **2.10.2** `SandboxTerminal.tsx:147,223` — `bg-[#0a0a0a]` durch `bg-background` (oder `--term-bg`-Variable).
- [ ] **2.10.3** `index.css:3786` `.telegram-icon` — Brand-Hex über CSS-Variable `--brand-telegram`.
- [ ] **2.10.4** `#45ADFF`-Default in `ProjectModal.tsx:19`, `CreateProjectDialog.tsx:52`, `SpaceModal.tsx:89`, `CreateTableDialog.tsx:41`, `TerminalTabs.tsx:64,111`, `ProjectListPanel.tsx:190` → eine `lib/themeColors.ts` mit `DEFAULT_PROJECT_COLOR = 'var(--primary)'`.
- [ ] **2.10.5** `MermaidDiagram.tsx:17-23,41-42` — `getCssVar(name, fallback)` Fallbacks aus Theme-Tokens lesen, nicht aus Hex-Strings.

#### 2.11 A11y

- [ ] **2.11.1** `TerminalTabs.tsx:51-81` — invalid nested `<button>` auflösen (Schließen-X als separate `<button>` außerhalb des Tab-Buttons positionieren).
- [ ] **2.11.2** Icon-only Buttons mit `aria-label`: `App.tsx:479-487`, `TerminalTabs.tsx:70`, `SearchBar.tsx:44`, `InlineColumnCreator.tsx:41`, `TableHeader.tsx:181`, alle BotDetailsModal-`<label>`s mit `htmlFor`-id-Pairing.
- [ ] **2.11.3** `ExcelEditor.tsx:318,327` — Modal-Overlay `role="dialog"` + `onKeyDown` (Esc) + Focus-Trap.
- [ ] **2.11.4** Heading-Hierarchie: `DashboardHome.tsx:437` (h3 → h1/h2 hochstufen), `Store.tsx:137,182` (h3 → h2). `Settings.tsx:164` Shell-h2 + Children-h1 zu konsistenter h2-Liste umstrukturieren.
- [ ] **2.11.5** `focus:outline-none` ohne Replacement (`ChatInputArea.tsx:795`, `DocumentManager.tsx:840/922/936/980`, `CommandsEditor.tsx:212`) — `focus-visible:ring-2 focus-visible:ring-primary` ergänzen.

**Done-Kriterium:** Manuell durchgespielt: Login → Chat starten → Streaming → Cancel → Retry → Chat löschen → Logout → relogin als anderer User → keine alten Daten sichtbar. Theme-Switch funktioniert ohne Flash. Drag-Drop außerhalb Zone navigiert nicht weg.

---

### Phase 3 — Verlorene/regressed Features wiederherstellen (M)

Hängt vom Output der Phase 0 ab.

- [ ] **3.1** Wenn Phase-3-OpenAI-Compat auf Side-Branch existiert → cherry-pick auf main, wenn nicht: neu implementieren (Backend-Routes `/v1/chat/completions` SSE, `/v1/embeddings`, `/v1/models`).
- [ ] **3.2** Wenn Phase-5.6-Datenschutz-Tab regressed → Frontend-Tab + Confirmation-Flow + `useGdprData`-Hook neu bauen. Backend `DELETE /api/gdpr/me` und `GET /api/gdpr/export` verifizieren / wieder herstellen.
- [ ] **3.3** Phase-3-n8n-Tab UI → `useN8nIntegrationData.ts`-Hook + dedizierte Tab-Page mit Live-Markdown-Rendering. Hardcoded `gemma4:26b-q4` (4 Stellen in `N8nIntegrationGuide.tsx`) durch Hook-Wert ersetzen.
- [ ] **3.4** Phase-6-Circuit-Breaker — `circuitBreakers.get('ollama').execute(() => callOllama(...))` an die kritischen Sites wrappen: `services/llm/llmOllamaStream.js`, `services/embeddingService.js`, `services/qdrantService.js`, `services/minioClient.js`. Aktuell sind sie nur registriert + im Status-Endpunkt sichtbar, schützen aber nichts.
- [ ] **3.5** Phase-1-Optimistic-Delete für Modelle in `StoreModels.tsx` einbauen (oder MEMORY korrigieren).
- [ ] **3.6** Migrationen 082-089 — entweder die fehlenden SQL-Files schreiben (falls die Features im Code referenziert werden, die aber Schema-Voraussetzungen brauchen), oder die Lücke explizit dokumentieren ("Phase 0+5-P1 wurden idempotent in 092 zusammengeführt").

---

### Phase 4 — Indexer / RAG / LLM-Robustness (M)

- [ ] **4.1** `services/document-indexer/database.py:330-343` — `recover_stuck_processing` muss `retry_count`-Cap respektieren: `WHERE status='processing' AND retry_count < MAX_RETRIES`. Bei Überschreitung: in `failed` setzen, nicht zurück nach `pending`.
- [ ] **4.2** `embedding_client.py:82-95` — bei Längen-Mismatch zwischen Request und Response: `[None] * (len(texts) - len(vectors))` padden, Caller muss expliziten None-Check machen statt blind via `zip()` zu truncaten.
- [ ] **4.3** `embedding_server.py:269-277` (`/embed`) — OOM-Retry-Logik wie in `/embed/batch` ergänzen.
- [ ] **4.4** `embedding_server.py` — Token-Pre-Check vor `model.encode`: warnen + Logger-Entry wenn Input >8192 Tokens silently truncated.
- [ ] **4.5** `document_processor.py:687-699` — Rollback bei Fehler im Qdrant-Insert muss auch `parent_chunks`-Rows aus Postgres löschen (orphan-Vermeidung).
- [ ] **4.6** `embeddingService.js:43-51` (Backend-Circuit-Breaker) — `breaker.openedAt` bei jedem Fehler aktualisieren (nicht `=== 0`-Guard); zusätzlich `successThreshold` für Half-Open-State + `inFlightCount`-Lock.
- [ ] **4.7** `llmOllamaStream.js:225` — `temperature ?? 0.7` (nicht `||`), damit `temperature=0` durchkommt.
- [ ] **4.8** `routes/external/externalApi.js:158,512,642` — `waitForJobCompletion`: Client-Disconnect-Detection (`req.on('close')`) → Job canceln, Polling-Loop verlassen.
- [ ] **4.9** `api_server.py:287-330` (`pull_model`) — Client-Disconnect-Awareness via Generator-Cleanup; aktuell hält `pull_lock` während der ganzen orphan-Stream-Dauer.

---

### Phase 5 — Self-Healing / Backup / Ops (M, wichtig für 5-Jahre-Vision)

- [ ] **5.1** `healing_engine.py:452` — `VACUUM FREEZE` außerhalb Transaction. psycopg2: `conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)` vor dem Call. Außerdem: pro Datenbank-Name aus `xid_rows` parametrisieren, nicht im aktuellen Pool-Connection-DB.
- [ ] **5.2** `healing_engine.py:188` (GPU-Recovery) — Cooldown analog zu `_is_restart_rate_limited` (pro Service mind. 5 Min zwischen Restart-Versuchen).
- [ ] **5.3** `healing_engine.py:508` (`_renew_tls_cert`) — Vor self-signed Renewal: `openssl x509 -noout -issuer` prüfen; wenn Issuer ≠ Self-CN → skip + WARNING-Event.
- [ ] **5.4** `category_handlers.py:259-262` — Min-Sample-Count-Guard: `if len(temp_history) < 3: return` bevor avg gebildet wird.
- [ ] **5.5** `recovery_actions.py:99-109` (`pause_n8n_workflows`) — entweder echte Pause-Implementierung via n8n-API (`PATCH /workflows/:id { active: false }`), oder Funktion umbenennen/entfernen. Aktuell ist es ein verkleidetes Restart.
- [ ] **5.6** `recovery_actions.py:120` — `container.stop(timeout=30)` (statt 5s) für graceful LLM/n8n shutdown.
- [ ] **5.7** `services/backup-service/restore-drill.sh:194` — `psql -v ON_ERROR_STOP=1` (sonst werden defekte Backups als "ok" gemeldet).
- [ ] **5.8** `services/backup-service/backup.sh:24-37` — `openssl enc -pass file:<(echo $KEY)` statt `pass:$KEY` (nicht in /proc/.../cmdline sichtbar).
- [ ] **5.9** `category_handlers.py:84` — Restart-Rate-Limit-Query muss auch `service_stop` und `hard_restart` zählen, nicht nur `service_restart`.

---

### Phase 6 — Infrastruktur / Compose / Healthchecks (M)

- [ ] **6.1** `services/llm-service/healthcheck.sh:251-253` — Bei "DEGRADED but functional" auch `exit 1` wenn GPU-Error oder Model-Load-Failed (nicht 3/4 = healthy).
- [ ] **6.2** `services/embedding-service/healthcheck.sh:295-305` — `/embed`-Probe mit Test-String mit ins Critical, nicht nur `/health` ping.
- [ ] **6.3** `compose/compose.app.yaml:241-244` — n8n `depends_on: llm-service: service_healthy` entfernen / auf `service_started` reduzieren (sonst LLM-Crash blockt n8n-Start).
- [ ] **6.4** `compose/compose.core.yaml:159` — Traefik-Mount von `/var/run/docker.sock:ro` durch docker-proxy ersetzen (oder explizit als akzeptiertes Risiko in CLAUDE.md/Security-Doc dokumentieren).
- [ ] **6.5** `compose/compose.core.yaml:105-107` — docker-socket-proxy `EXEC: 1` und `BUILD: 1` evaluieren — wenn nicht von self-healing/sandbox aktiv genutzt: auf `0` setzen (reduziert Blast-Radius bei Backend-RCE).
- [ ] **6.6** `compose.app.yaml:30` — `group_add: '994'` → `${DOCKER_GID:-994}` (host-portierbar).
- [ ] **6.7** `qdrant` healthcheck `bash -c "echo > /dev/tcp/..."` auf HTTP `/readyz` umstellen (qdrant-Image hat kein bash).
- [ ] **6.8** `docker-proxy` healthcheck `wget`-Verfügbarkeit prüfen (HAProxy-basiert, evtl. ohne wget).

---

### Phase 7 — WebSocket / SSE-Resilience (M)

- [ ] **7.1** Reconnect-Storm-Mitigation: erste Reconnect-Latenz auf 0–5s zufällig (`Math.random() * 5000`) statt 1s ±25%; danach exponentielles Backoff.
- [ ] **7.2** Per-User-Connection-Cap statt globalem `MAX_WS_CONNECTIONS=100`: `Map<userId, Set<ws>>` mit max 10 Sockets/User.
- [ ] **7.3** `services/telegram/telegramOrchestratorService.js:73` — `'error'`-Handler muss auch `ws.terminate()` rufen, nicht nur `unsubscribeClient`.
- [ ] **7.4** `useWebSocketMetrics.ts:91` — Stale-Threshold von 20s auf 30s erhöhen (Server-Heartbeat 15s + Buffer), sonst flapping bei Last.
- [ ] **7.5** Download-SSE-Resume bei Disconnect (`DownloadContext.tsx:241-290`) — Range-Header oder Pull-Resume-API. 70GB-Modell darf nicht bei einem Proxy-Hiccup von vorne starten.
- [ ] **7.6** `BotSetupWizard.tsx:207-263` — WS-Reconnect mit Backoff statt forever-polling-Fallback.

---

### Phase 8 — Backend-Routes-Compliance & Konsolidierung (L)

- [ ] **8.1** Sweep `routes/admin/backup.js:100-104`, `routes/documents.js:257-260`, `routes/datentabellen/index.js:239-321`: Error-Envelope `{error: {code, message}}` statt Bare-String + `success: false`. Auf typed Errors aus `utils/errors.js` umstellen.
- [ ] **8.2** Sweep `routes/llm.js:50-145`, `routes/system/services.js:175-347`: Route-Level `try/catch` entfernen, ECONNREFUSED-Mapping über global error handler.
- [ ] **8.3** Sweep `multer fileFilter cb(new Error(...))`: durch Custom-Error ersetzen (`cb(new ValidationError(...))`).
- [ ] **8.4** N+1 in `routes/rag.js:614-651` — Batch-Query statt Loop-Query.
- [ ] **8.5** `routes/admin/ops.js:118-122` — `COUNT(*)`-Polling durch Estimate (`SELECT n_live_tup FROM pg_stat_user_tables WHERE relname='chat_messages'`) ersetzen.

---

### Phase 9 — Sandbox/i18n/Doku (Cleanup, L)

- [ ] **9.1** `useDebouncedSearch.ts:74` — `JSON.stringify(deps)` durch flache Equality (`shallowEqual`) ersetzen.
- [ ] **9.2** Settings-Section `activeSection` URL-persistieren (`?section=ki-profil`) — die TODO bei `Settings.tsx:84` umsetzen.
- [ ] **9.3** Tab-State von Sandbox/ChatLanding in URL einbacken (back/forward funktioniert).
- [ ] **9.4** I18n: Reality-Check — keine `useTranslation`/`i18next` im Code. Wenn englischer Markt geplant: Phase 9.4 als eigenes Mini-Projekt aufsetzen. Wenn nur DE: hardcoded German offiziell akzeptieren + aus Vision/Doku streichen.
- [ ] **9.5** Tote Code-Pfade entfernen: `services/document-indexer/indexer.py` (Legacy parallel zu enhanced_indexer), `routes/store/workflows.js:46-54` (hardcoded empty response).
- [ ] **9.6** MEMORY.md re-konstruieren nach Phase-0-Findings (alte Phase-Files in `archive/` verschieben, neuen Status führend).

---

## Test-Plan (jede Phase abschließend)

1. `./scripts/test/run-tests.sh --all` — alle Tests grün.
2. Smoke-Test über das gesamte UI (siehe Done-Kriterium Phase 2).
3. Postgres: `pg_dump arasul_db | wc -l` vor/nach Migration zur Sanity-Check.
4. Manuelle IDOR-Tests in Phase 1 (zwei User, fremde Job-IDs).
5. Self-Healing in trockener Umgebung mit künstlich erzeugten Symptomen testen (`docker pause llm-service` → Backend reagiert?).

## Geschätzter Aufwand

| Phase                                   | Effort                 | Risk                                        |
| --------------------------------------- | ---------------------- | ------------------------------------------- |
| 0 — MEMORY-Reconciliation               | 0,5d                   | niedrig                                     |
| 1 — Sicherheit & Datenintegrität        | 2d                     | hoch (Auth-Bugs sind heikel)                |
| 2 — Frontend-Korrektheit                | 5d                     | mittel (viele kleine, wenig riskante Fixes) |
| 3 — Verlorene Features wiederherstellen | 3-5d                   | mittel (cherry-pick vs neu bauen)           |
| 4 — Indexer/RAG/LLM                     | 2d                     | mittel                                      |
| 5 — Self-Healing/Backup/Ops             | 2d                     | hoch (5-Jahre-Vision-Risiko)                |
| 6 — Infra/Compose                       | 1,5d                   | niedrig                                     |
| 7 — WS/SSE-Resilience                   | 1,5d                   | mittel                                      |
| 8 — Backend-Compliance                  | 1,5d                   | niedrig                                     |
| 9 — Cleanup/Doku                        | 1d                     | niedrig                                     |
| **Total**                               | **20-22 Personentage** |                                             |

## Reihenfolge-Empfehlung

```
P0 → (P1 ∥ P2 partial-1) → P3 → (P2 rest ∥ P4 ∥ P5) → P6 → P7 → (P8 ∥ P9)
```

P1+P2 können parallel, weil getrennte Dateien.
P3 hängt auf P0 (was ist regressed?).
P5 (Self-Healing) ist Blocker für die 5-Jahre-Vision — nicht aufschieben.

## Out-of-scope (bewusst nicht in diesem Plan)

- Performance-Optimierung außerhalb der hier identifizierten Bugs.
- Neue Features (alles hier ist Bug/Logik/Robustheit).
- Refactor/Style-Cleanup ohne Bug-Bezug.

## Smoke-Test-Findings (2026-05-09, post-deploy)

After rebuilding `dashboard-backend` + `dashboard-frontend` and running the
`scripts/test/smoke-test.sh`-style verification, two follow-up bugs surfaced
that the audit had not flagged:

- [ ] **SF-1 Traefik `/v1`-router fehlte.** Phase 3.2 cherry-pick hat
      `app.use('/v1', require('./routes/external/openaiCompat'))` in
      `dashboard-backend/src/index.js` ergänzt, aber `config/traefik/dynamic/routes.yml`
      hatte keinen `PathPrefix('/v1/...')`-Router. Folge: Requests an
      `/v1/chat/completions` etc. fielen auf den Default-Frontend-Catch-all und
      gaben 405 von nginx zurück. Fix: neuer Router `dashboard-v1-openai` mit
      `PathPrefix('/v1/chat') || PathPrefix('/v1/embeddings') || PathPrefix('/v1/models')`,
      zeigt auf `dashboard-backend-service`. Mit `docker compose restart reverse-proxy`
      live geschaltet, danach 401 (auth-required) statt 405.
- [ ] **SF-2 Migration-Runner-Bug: neue Migrationen werden geseeded statt ausgeführt.**
      `apps/dashboard-backend/src/migrationRunner.js` `seedExistingMigrations` hat
      Migration 093 (sequence-based `get_next_queue_position`) als "applied"
      eingetragen, ohne den SQL-Inhalt auszuführen. Folge: `schema_migrations`
      enthielt nach Backend-Start `version=93`, aber `public.get_next_queue_position()`
      war noch die alte `MAX(...)+1`-Version. Workaround: Migration manuell
      via `psql < 093_*.sql` nachgezogen — Function ist jetzt `nextval(seq)`.
      Eigentlicher Bug muss separat gefixt werden: der Runner muss bei jedem
      Boot prüfen, ob neue Files (höhere Version als die höchste tracked) noch
      nicht ausgeführt sind, und sie ausführen statt seed-markieren. Tickets im
      Plan als P9.7 (Migration-Runner-Härtung).

## Phase-1-Reviewer-Findings (2026-05-08, post-implementation)

Code-Reviewer-Run nach Phase 1 fand 2 zusätzliche CRITICAL-Bugs in den Phase-1-Fixes selbst (sofort behoben) plus 3 Warnings als Follow-up:

**Sofort behoben:**

- IPv6 link-local-Range war nur partiell abgedeckt (`startsWith('fe80:')` matcht nur `fe80:`, nicht `fe81:..febf:`) — Fix: Regex `/^fe[89ab][0-9a-f]:/`.
- API-Key IDOR-Check: `req.apiKey.userId` kann `null` sein wenn Key-Creator gelöscht wurde (`api_keys.created_by ON DELETE SET NULL`); `null !== null` → false → IDOR offen für orphan keys. Fix: explizit null-guarden.

**Follow-up (Phase 8 oder eigener Mini-Sweep):**

- [ ] **F1** `package-lock.json` regenerieren nach multer-Bump. Vor `docker compose up -d --build`: `cd apps/dashboard-backend && npm install` lokal laufen lassen, lock-File committen. Sonst zieht `npm install --install-links` im Container die neueste 2.x — funktioniert mit Internet, scheitert auf air-gapped Jetson.
- [ ] **F2** `llmJobService.getJob` nutzt `INNER JOIN chat_conversations` — Job-Reads schlagen fehl wenn Conversation parallel gelöscht wird (cascade). Pre-existing edge case, jetzt nur sichtbarer. Optional auf `LEFT JOIN` umstellen + null-guard.
- [ ] **F3** `backup.sh` `-pass file:` liest nur erste Zeile. Bei single-line Keys identisch zu altem `key=$(cat ...)`-Verhalten. Risiko nur bei multi-line Keys (sehr ungewöhnlich für `openssl rand -base64 32` o.ä.). **Vor Production-Deploy: einen restore-drill mit echtem Backup laufen lassen, um zu verifizieren dass alte Backups noch decryptable sind.**
- [ ] **F4** `routes/external/events.js:288` self-healing webhook ist immer noch unauthenticated wenn `SELF_HEALING_WEBHOOK_SECRET` nicht gesetzt — n8n-Pfad rejectet jetzt korrekt. Inkonsistenz: Self-healing sollte gleich strikt sein.
- [ ] **F5** (Suggestion) IPv6 Private-Range-Check via Buffer-Vergleich (z.B. via `ipaddr.js`) statt String-Prefix — robuster gegen abgekürzte Forms wie `::ffff:7f00:1` (= `127.0.0.1` in compact-hex). Aktuell wird nur die dotted-quad-Form `::ffff:127.0.0.1` erkannt.

## Anhang: Volle CRITICAL-Liste der 20 Agents

23 CRITICAL-Findings (gekürzt — full Details in den Agent-Reports oben in der Conversation):

**Frontend:** AuthContext.tsx:82-97 + :59 + :122-142, useApi.ts:169-174, App.tsx:392-397 + :406-419 vs :447 + :608-621, ChatContext.tsx:1061-1083 + :939-947, ChatTopBar.tsx:79-97, ChatInputArea.tsx:338-343, useTokenBatching.ts:51-127 + :95-105, useModelStatus.ts:60+107-110, DownloadContext.tsx:165-194 + :407-417, Settings.tsx (no GDPR), TerminalTabs.tsx:51-81, ExcelEditor.tsx:318+327, useTerminal.ts:146-166, EditProjectDialog.tsx:32-39, SetupWizard.tsx:837, PasswordManagement.tsx:277-284, BotDetailsModal.tsx (label htmlFor), index.css:3786 + index.html theme-color.

**Backend:** routes/llm.js:194-409 (IDOR), routes/external/events.js:245+282 (timing-attack), routes/rag.js:576-671 (no requireAdmin), index.js:584+615+649 (JWT-in-URL regressed), system/logs.js:184-186 + claudeTerminal.js:230-234 (SSE buffering), embeddingService.js:43-51 + :32-36 (CB self-disable + concurrency), retry.js:294-297 (CB never wired), 092_telegram_dsgvo.sql (telegram_user_chats nonexistent), 043 NOT-NULL violation in externalApi inserts, package.json (multer + axios CVEs).

**Infra/Ops:** healing_engine.py:452 (VACUUM tx) + :188 (GPU rate-limit) + :508 (TLS overwrite), restore-drill.sh:194 (ON_ERROR_STOP=0), document-indexer database.py:330-343 (watchdog reverses retry-cap), embedding_client.py:82-95 (zip-truncation), compose.app.yaml:241-244 (n8n cascade), llm/embedding healthcheck.sh (degraded=ok).
