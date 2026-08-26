# Löschliste, Phase B1 des Überordner-Plans vom 26.08.2026

Stand: Commit `94989235` auf `main`, gezählt am 26.08.2026. Reine Analyse,
nichts ist gelöscht. Die Phasen B2 bis B6 arbeiten diese Liste ab; wer dort
etwas streicht, streicht es ganz (Route, Service, Tabelle, Container, Test,
Doku) und misst die Zeilen erneut.

## Die drei Urteile

| Urteil           | Bedeutung                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **bleibt**       | Gehört zu dem, was die Lizenz kauft (Anmelden und Zuweisen, Flow-Engine mit Nachvollziehbarkeit, Betrieb) oder zum Fundament darunter. Wird höchstens gekürzt.                          |
| **fällt**        | Editor, Terminal, Agent-Chat, Sandbox, Dokumente, Wissensräume, Erweiterungs-Baukasten mit Bridge, n8n, SearXNG, Memory. Ersatzlos, samt Tabellen und Tests.                            |
| **wird ersetzt** | Der Gedanke bleibt, der Code nicht in dieser Form: Shell, Apps (Manifest `app.json`, Phase C3), Flows (v2, Phase C6), Modelle (Kurzliste, C8), externe API auf den Kern (B6), Werksreset. |

Grundlage sind die Zeilen 3 bis 7 des Überordner-Plans (was Kit und Lizenz
können) und die Phasen B2 bis B6, C und D (was ersetzt wird).

## Die Summe

Gezählt mit `wc -l` je Datei; Frontend `.ts .tsx .css`, Backend `.js .md .json`
(die Schriftdateien unter `flows/rechnung/fonts/` zählen nicht), Dienste und
Skripte jede Textdatei, `package-lock.json` und `node_modules` nie.

| Bereich                                                | fällt      | wird ersetzt | bleibt     | Summe       |
| ------------------------------------------------------ | ---------- | ------------ | ---------- | ----------- |
| Frontend `apps/dashboard-frontend/src`                 | 23 164     | 25 492       | 19 134     | 67 790      |
| Backend-Routen `src/routes`                            | 7 211      | 4 920        | 5 306      | 17 437      |
| Backend-Services `src/services`                        | 15 547     | 14 465       | 11 706     | 41 718      |
| Backend übrig (`index.js`, `schemas`, `middleware`, …) | 1 020      | 2 026        | 5 087      | 8 133       |
| Backend-Tests `__tests__`                              | 16 288     | 12 293       | 14 005     | 42 586      |
| Dienste und Container (`services/*`, `config/*`)       | 6 030      | 12 032       | 11 129     | 29 191      |
| Abnahme- und Hilfsskripte (`scripts/*`)                | 4 430      | 4 497        | 425        | 9 352       |
| **Gesamt**                                             | **73 690** | **75 725**   | **66 792** | **216 207** |

**Es fallen 73 690 Zeilen.** Weitere 75 725 werden ersetzt; wie viel davon am
Ende übrig ist, entscheiden die Phasen C und D, nicht diese Liste. Migrationen
stehen nicht in der Summe, siehe den Abschnitt dazu: die Dateien bleiben
liegen, die Tabellen fallen.

Ein Endpunkt-Zähler zum Vergleich für B4 („Routenzahl vorher und nachher"):
heute 373 `router.<verb>(`-Aufrufe in 45 Routendateien; davon fallen 173,
werden 95 ersetzt, bleiben 105.

## Frontend, jede Feature-Mappe

Der Frontend-Rückbau läuft in B2 (Editor, Terminal, Agent-Chat, Sandbox) und
B3 (Dokumente, Wissensräume, Flow-Editor, Erweiterungen). `WorkspaceShell`
bleibt dreispaltig mit leeren Spalten, bis D1 sie neu füllt.

### `features/workspace` (17 682 Zeilen)

| Pfad                                                 | Zeilen | Urteil       | Warum                                                                                        |
| ---------------------------------------------------- | ------ | ------------ | -------------------------------------------------------------------------------------------- |
| `workspace/llm/` (Agent-Chat, ConversationList)      | 5 121  | fällt        | Agent-Chat, Entscheidung 5                                                                   |
| `workspace/viewers/` (Editor, PDF, Dokumente, n8n)   | 3 712  | fällt        | Editor, Dokumente, Extension-Tab, n8n-Design                                                 |
| `workspace/explorer/`                                | 1 237  | fällt        | Dateibaum des Editors                                                                        |
| `workspace/terminal/`                                | 51     | fällt        | Terminal                                                                                     |
| `workspace/sidebar/`                                 | 388    | wird ersetzt | Seitenleiste wird zur App-Liste (D1)                                                         |
| `WorkspaceShell.tsx`                                 | 243    | wird ersetzt | bleibt dreispaltig, Inhalt aus D1                                                            |
| `ActivityBar.tsx`, `SidebarHost.tsx`, `RightPanel.tsx` | 347  | wird ersetzt | Gerüst der drei Spalten, rechts kommen Notizen (D2)                                          |
| `StatusBar.tsx`, `WorkspaceMenuBar.tsx`              | 507    | wird ersetzt | Zustandsleiste und Menü auf das Zielbild                                                     |
| `IsolatedMemoryRouter.tsx`, `useWorkspaceContext.ts`, `index.tsx` | 151 | wird ersetzt | Router-Gerüst                                                                     |
| `WorkspaceSwitcher.tsx`, `useProjects.ts`, `projektImport.ts` | 1 062 | fällt   | Projekte und Wissensräume                                                                    |
| `TabBar.tsx`, `TabContent.tsx`, `dndTypes.ts`        | 569    | fällt        | Tab-Modell des Editors                                                                       |
| `GitSyncControl.tsx` (+ Test)                        | 566    | fällt        | Git-Kopplung je Projekt                                                                      |
| `OnboardingWizard.tsx` (+ Test), `QuickOpen.tsx`, `VorlagenUpdateBanner.tsx` | 754 | fällt | Projektvorlagen, Schnellöffnen                                                     |
| `workspace/__tests__/`                               | 2 974  | wird ersetzt | Tests folgen ihrem Gegenstand; die Shell-Tests werden neu geschnitten                        |

### Die übrigen Mappen

| Mappe                                 | Zeilen | Urteil       | Warum                                                                                                                   |
| ------------------------------------- | ------ | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `features/sandbox/`                   | 3 247  | fällt        | Sandbox, Terminal, KI-Zugang, Werkstatt                                                                                 |
| `features/flows/`                     | 6 350  | wird ersetzt | Flow-Editor fällt (B3); `RunCard`, `RunStep`, `FlowRunDetail`, `RueckfrageKarte` sind der Rohstoff für D4 (Läufe lesen) |
| `features/store/`                     | 4 615  | wird ersetzt | Erweiterungs-Grid und Filter fallen; Modell-Grid wird Kurzliste (C8, D5); `ModellHinzufuegen` fällt (Download nur aus der Kurzliste) |
| `features/settings/`                  | 5 789  | gemischt     | siehe Tabelle unten                                                                                                     |
| `features/system/`                    | 5 545  | gemischt     | siehe Tabelle unten                                                                                                     |
| `features/__tests__/`                 | 360    | bleibt       | Modellname und Modellzustand überall gleich                                                                             |
| `components/editor/` (TipTap, Mermaid) | 2 845 | fällt        | Editor                                                                                                                  |
| `components/ui/`, `components/mascot/` | 4 187 | bleibt       | Bausteine und Palette bleiben (Entscheidung 21)                                                                         |

`features/settings/`:

| Datei                                                       | Zeilen | Urteil       |
| ----------------------------------------------------------- | ------ | ------------ |
| `AIProfileSettings.tsx` (Memory-Profil)                     | 508    | fällt        |
| `N8nIntegrationGuide.tsx`                                   | 526    | fällt        |
| `RagLlmSettings.tsx`                                        | 308    | fällt        |
| `KISettings.tsx`, `sections.tsx`, `Settings.tsx`            | 320    | wird ersetzt |
| `PasswordManagement.tsx`, `PrivacySettings.tsx`, `SecuritySettings.tsx`, `GeneralSettings.tsx` | 1 089 | bleibt |
| `RemoteAccessSettings.tsx`, `sitzungUeberFernzugriff.ts`    | 1 082  | bleibt (offen, siehe unten) |
| `ExterneModelleSettings.tsx`                                | 231    | wird ersetzt (Entscheidung zu Frage 3: kein Settings-Bereich, Wahl je Flow in D4) |
| `validationIssues.ts`                                       | 26     | bleibt       |
| `__tests__/`                                                | 1 699  | wird ersetzt |

`features/system/`:

| Datei                                                                                          | Zeilen | Urteil       |
| ---------------------------------------------------------------------------------------------- | ------ | ------------ |
| `SystemStatus.tsx`, `UpdatePage.tsx`                                                           | 1 123  | wird ersetzt (D5 kürzt daraus „Modelle und System") |
| `Login.tsx`, `CreateAdmin.tsx`, `SetupWizard.tsx`, `Werksreset.tsx`, `SelfHealingEvents.tsx`, `ServicesSettings.tsx`, `SystemHealthWidget.tsx`, `SystemSettings.tsx`, `DashboardCard.tsx` | 2 362 | bleibt |
| `__tests__/`                                                                                   | 2 060  | bleibt       |

### Kontexte, Hooks, Stores, Rest

| Pfad                                                                                       | Zeilen | Urteil       |
| ------------------------------------------------------------------------------------------ | ------ | ------------ |
| `contexts/ChatContext.tsx`, `chatMessageOrder.ts`                                          | 1 952  | fällt        |
| `contexts/flowRunRegistry.ts` (+ Test)                                                     | 84     | wird ersetzt |
| `contexts/AuthContext`, `ActivationContext`, `ToastContext`, `DownloadContext`             | 1 261  | bleibt       |
| `hooks/useExtensions`, `useGitSync`, `useMemoryBudget`, `useTokenBatching`, `useWorkspaceApps`, `useReportTabDirty` | 610 | fällt |
| `hooks/useFlowRun`, `useFlows`, `useStoreCatalog`                                          | 627    | wird ersetzt |
| `hooks/useApi`, `useDashboardData`, `useSchmalesFenster`, `useTheme`, `useWebSocketMetrics`, `useConfirm`, `__tests__` | 1 137 | bleibt |
| `stores/extensionStore.ts`, `flowEditorStore.ts`                                           | 96     | fällt        |
| `stores/workspaceStore.ts`, `storeFilterStore.ts`, `stores/__tests__/`                     | 1 723  | wird ersetzt |
| `stores/settingsStore.ts`                                                                  | 18     | bleibt       |
| `App.tsx`, `types/`, `src/__tests__/`                                                      | 4 341  | wird ersetzt |
| `utils/`, `lib/`, `config/`, `index.css`                                                   | 5 321  | bleibt       |

## Backend, jede Route

Die Spalte „Endpunkte" zählt `router.<verb>(`-Aufrufe in der Datei.

| Route                                | Zeilen | Endpunkte | Urteil       | Warum                                                                                     |
| ------------------------------------ | ------ | --------- | ------------ | ----------------------------------------------------------------------------------------- |
| `auth.js`                            | 531    | 12        | bleibt       | Anmelden; C1 ergänzt `requireRole`                                                        |
| `chats.js`                           | 697    | 13        | fällt        | Agent-Chat der Oberfläche; die externe API hat ihren eigenen Chat-Weg                     |
| `documents.js`                       | 1 159  | 19        | fällt        | Dokumente                                                                                 |
| `documentAnalysis.js`                | 281    | 2         | fällt        | Dokumentanalyse im Chat                                                                   |
| `documentImages.js`                  | 135    | 2         | fällt        | Bilder im Chat                                                                            |
| `llm.js`                             | 485    | 9         | fällt        | Streaming-Weg des Oberflächen-Chats                                                       |
| `rag.js`                             | 79     | 2         | fällt        | RAG-Einstellungen                                                                         |
| `docs.js`                            | 94     | 3         | bleibt       | statische API-Doku                                                                        |
| `system/system.js`                   | 732    | 12        | bleibt       | Betrieb                                                                                   |
| `system/services.js`                 | 481    | 9         | bleibt       | Betrieb                                                                                   |
| `system/metrics.js`                  | 146    | 2         | bleibt       | Betrieb                                                                                   |
| `system/logs.js`                     | 333    | 4         | bleibt       | Betrieb                                                                                   |
| `system/database.js`                 | 143    | 4         | bleibt       | Betrieb                                                                                   |
| `system/tailscale.js`                | 123    | 8         | bleibt       | Fernzugriff für Wartung (offen, siehe unten)                                              |
| `admin/settings.js`                  | 444    | 6         | wird ersetzt | RAG- und KI-Profil-Einstellungen raus                                                     |
| `admin/gdpr.js`                      | 740    | 4         | wird ersetzt | Auskunft und Löschung auf das neue Datenmodell                                            |
| `admin/audit.js`, `update.js`, `selfhealing.js`, `license.js`, `backup.js`, `ops.js`, `werksreset.js` | 1 729 | 27 | bleibt | Betrieb, Lizenz                                                              |
| `ai/models.js`                       | 997    | 21        | wird ersetzt | C8: Kurzliste, Download nur daraus                                                        |
| `ai/externeModelle.js`               | 126    | 6         | wird ersetzt | Frage 3: lokal oder extern mit API-Key je Flow (D4), kein eigener Bereich                |
| `ai/embeddings.js`                   | 75     | 1         | bleibt       | `/v1/embeddings` für App-Backends                                                         |
| `ai/profil.js`                       | 188    | 4         | fällt        | Memory                                                                                    |
| `ai/spaces.js`                       | 1 005  | 16        | fällt        | Wissensräume                                                                              |
| `ai/projects.js`                     | 526    | 23        | fällt        | Projekte (Ein-Ordner-Modell des Editors)                                                  |
| `ai/knowledgeGraph.js`               | 540    | 8         | fällt        | Wissensgraph                                                                              |
| `flows.js`                           | 589    | 21        | wird ersetzt | C6: Flows aus dem App-Paket                                                               |
| `git.js`                             | 112    | 5         | fällt        | Git-Kopplung je Projekt                                                                   |
| `store/appstore.js`                  | 377    | 14        | wird ersetzt | C3: Apps mit Manifest `app.json`                                                          |
| `store/store.js`                     | 219    | 3         | wird ersetzt | Katalog auf Apps und Kurzliste                                                            |
| `store/workflows.js`                 | 184    | 7         | fällt        | n8n-Workflows                                                                             |
| `automations.js`                     | 133    | 1         | fällt        | n8n-Proxy                                                                                 |
| `workspaceApps.js`                   | 106    | 2         | fällt        | Plattform-Apps (Migration 100)                                                            |
| `extensions.js`                      | 562    | 27        | fällt        | Erweiterungs-Baukasten                                                                    |
| `sandbox.js`                         | 466    | 28        | fällt        | Sandbox                                                                                   |
| `external/externalApi.js`            | 949    | 13        | wird ersetzt | B6: auf den Kern (Chat, Modelle, Extraktion, Flows, Schlüssel)                            |
| `external/openaiCompat.js`           | 447    | 3         | bleibt       | App-Backends arbeiten damit ohne eigenen Client                                           |
| `external/claudeTerminal.js`         | 553    | 5         | fällt        | Terminal-WebSocket                                                                        |
| `external/events.js`                 | 453    | 12        | wird ersetzt | n8n-Webhook raus, Benachrichtigungen bleiben                                              |
| `external/alerts.js`                 | 346    | 14        | bleibt       | Betrieb                                                                                   |
| `index.js`                           | 152    | 1         | wird ersetzt | Registry und `/_meta` nach dem Rückbau                                                    |

## Backend, jeder Service

| Service                                                                                             | Zeilen | Urteil       | Warum                                                                                   |
| --------------------------------------------------------------------------------------------------- | ------ | ------------ | --------------------------------------------------------------------------------------- |
| `sandbox/` (9 Dateien)                                                                              | 3 257  | fällt        | Sandbox, Terminal, OAuth, Zugangsdaten                                                  |
| `projects/` (Ablage, Ordner-Sync, Vorlagen)                                                         | 3 037  | fällt        | Projekte des Editors                                                                    |
| `extensions/` (Bridge, Paket, Werkstatt, Tabellen, Zeitpläne, Netzziele, Flow-Deploy nach n8n)      | 2 967  | fällt        | Erweiterungs-Baukasten                                                                  |
| `flows/rechnung/`                                                                                   | 1 071  | fällt        | Rechnungs-Flow, gehört in eine App                                                      |
| `context/` (Kompaktion, Kontextbudget)                                                              | 796    | fällt        | Nutzer sind `claudeTerminal` (fällt) und `llmJobProcessor`; der verliert den Aufruf     |
| `git/`                                                                                              | 613    | fällt        | Git-Kopplung                                                                            |
| `rag/` (folderContext, projectService, workspaceContext)                                            | 544    | fällt        | Wissensräume                                                                            |
| `memory/` (Kompaktion, Profil)                                                                      | 475    | fällt        | Memory                                                                                  |
| `documents/documentService.js`                                                                      | 386    | fällt        | Dokumente                                                                               |
| `flows/beispiele/`, `beispielKatalog.js`, `vorlagenStore.js`                                        | 647    | fällt        | Beispielflows und Vorlagen; Flows kommen aus dem App-Paket                              |
| `flows/sandboxResolve.js`, `snapshotService.js`, `changeTracker.js`, `tools/terminal.js`            | 1 001  | fällt        | Sandbox- und Dateiänderungs-Teil der Flows                                              |
| `n8nLogger.js`                                                                                      | 266    | fällt        | n8n                                                                                     |
| `chat/chatTitle.js`                                                                                 | 260    | fällt        | Chat                                                                                    |
| `medien/`                                                                                           | 167    | fällt        | Bilder im Chat                                                                          |
| `llm/queryComplexityAnalyzer.js`                                                                    | 60     | fällt        | Chat                                                                                    |
| `flows/` übrig (`runFlow`, `stepExecutor`, `toolLoop`, `subagent`, `runStore`, `frageStore`, `tools/dateien`, `tools/suche`, `tools/web`, `tools/symbolIndex`, `tools/frage`, `pruefung`, `pathSafe`, `markdownPdf`, `markdownDocx`, `dokumentAusgabe`, `documentText`, `flowFile`, `flowRegistry`, `flowRunner`, `resultContract`, `toolRegistry`, `gpuQueue`, `gpuVorrang`, `limits`) | 7 143 | wird ersetzt | C6: Flow-Engine v2, Läufe mit Schritten und Gedankengang in `flow_runs` |
| `llm/chatAgentRunner.js`, `agentConfig.js`, `agentTodoTool.js`, `systemPromptBuilder.js`, `textToolCalls.js`, `ollamaAgent.js`, `abbruchGrund.js` | 3 419 | wird ersetzt | die Werkzeugschleife, die `toolLoop` heute vom Chat leiht                  |
| `app/appLifecycleService.js`, `appService.js`, `configService.js`, `containerService.js`, `installService.js`, `manifestService.js` | 2 204 | wird ersetzt | C3/C5: Container-App mit `app.json`, Deploy-Endpunkt                 |
| `core/eventListenerService.js`                                                                      | 712    | wird ersetzt | n8n-Ereignisse raus, Docker- und Boot-Ereignisse bleiben                                |
| `werksreset/`                                                                                       | 715    | wird ersetzt | Tabellenliste auf das neue Datenmodell                                                  |
| `documents/minioService.js`                                                                         | 272    | fällt        | Frage 1: MinIO fällt, die Extraktion reicht die Datei direkt weiter                     |
| `llm/` Engine (`llmQueueService`, `llmJobService`, `llmJobProcessor`, `llmOllamaStream`, `modelService`, `modelLifecycleService`, `modelDownloadHelpers`, `modelSyncHelpers`, `modellQuelle`, `modelProfile`, `ollamaReadiness`, `unloadRegistry`, `engineGateway`, `AsyncMutex`) | 6 720 | bleibt | Warteschlange, Modelle, Idle-Unload |
| `llm/extern/`                                                                                       | 1 053  | wird ersetzt | Frage 3: der Anbieter-Aufruf bleibt, die Einstellungsfläche nicht (D4)                  |
| `app/licenseService.js`, `updateService.js`, `updateSignatureService.js`                            | 1 438  | bleibt       | Lizenz, Updates                                                                         |
| `alertEngine.js`                                                                                    | 818    | bleibt       | Betrieb                                                                                 |
| `network/tailscaleService.js`                                                                       | 581    | bleibt       | offen, siehe unten                                                                      |
| `core/cacheService`, `docker`, `notificationService`, `tokenService`                                | 582    | bleibt       | Fundament                                                                               |
| `auth/`, `system-settings/`, `embeddingService.js`, `documents/extractionService.js`                | 514    | bleibt       | Anmelden, Einstellungen, Embeddings, Extraktion für die externe API                     |

Backend übrig: `index.js` (889, wird ersetzt: Terminal-WebSocket, Sandbox-Leerlaufwächter, Werkstatt-Watcher, Zeitpläne, Ordner-Sync raus), `config/` (138, wird ersetzt: n8n, SearXNG, Indexer-Adressen), `tools/baseTool.js` (107, fällt), `schemas/` folgen ihren Routen (913 fällt, 999 wird ersetzt, 397 bleibt), `middleware/` (1 268), `utils/` (2 361), `bootstrap.js`, `database.js`, `migrationRunner.js` bleiben.

Backend-Tests folgen ihrem Gegenstand: 16 288 Zeilen fallen (Chats, Dokumente, Sandbox, Terminal, Bridge, Erweiterungen, Wissensräume, Projekte, Git, n8n-Workflows, Rechnung, Memory), 12 293 werden ersetzt (Flows, Apps, externe API, Modelle, Werksreset, DSGVO, Events), 14 005 bleiben. Die Zuordnung je Datei steht in der Zählung, nicht hier: 153 Zeilen Tabelle sagen nichts, was der Dateiname nicht sagt.

## Datenbank, jede Migration

**Die Migrationsdateien fallen nicht.** Eine angewandte Migration wird nicht
geändert und nicht gelöscht, ihre Prüfsumme steht im Migrationsbuch; so hat es
`102_drop_telegram.sql` vorgemacht, und `103`, `111`, `123`, `133`, `162`
haben es genauso gehalten. Was fällt, sind **Tabellen**, per neuer Migration
in B4 und B5. Deshalb stehen die 12 826 Zeilen unter `services/postgres/init/`
nicht in der Summe oben. Ob die 163 Dateien (`000` bis `162`) für ein
Neugerät zu einem Grundschema zusammengelegt werden, ist eine Frage an den
Überordner (unten).

Die Einordnung folgt `services/werksreset/tabellen.js`, das jede Tabelle
kennt; der Wächter `werksreset-tabellen.py` prüft die Vollständigkeit.

### Tabellen, die fallen (ersatzlos)

| Tabelle                                                                                                         | Angelegt in     | Bereich                  |
| --------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------ |
| `documents`, `document_chunks`, `document_parent_chunks`, `document_similarities`, `document_processing_queue`, `document_access_log`, `document_categories` | 009, 039 | Dokumente        |
| `knowledge_spaces`, `company_context`, `space_members`                                                          | 016, 089        | Wissensräume; `space_members` wird durch `app_members` (C2) abgelöst |
| `kg_entities`, `kg_entity_documents`, `kg_relations`                                                            | 044             | Wissensgraph             |
| `rag_query_log`                                                                                                 | 076             | RAG                      |
| `claude_terminal_sessions`, `claude_terminal_queries`                                                           | 018             | Terminal                 |
| `sandbox_projects`, `sandbox_terminal_sessions`, `arasul.sandbox_project_connections`, `arasul.sandbox_session_titles`, `arasul.user_external_credentials` | 073, 136, 137, 107 | Sandbox |
| `arasul.projects`, `arasul.project_git`, `arasul.pinned_documents`                                              | 118, 121, 114   | Projekte des Editors     |
| `arasul.rechnungsnummern`, `arasul.rechnungsnummern_zaehler`                                                    | 132             | Rechnungs-Flow           |
| `arasul.extensions`, `extension_tabellen`, `extension_zeitplaene`                                               | 116, 156, 157   | Erweiterungs-Baukasten   |
| `workflow_activity`, `n8n_external_call_log`, `n8n_allowed_external_domains`, `arasul.n8n_audit_log`            | 001, 087, 090   | n8n                      |
| `arasul.platform_apps`                                                                                          | 100             | Plattform-Apps (B5)      |
| `compaction_log`                                                                                                | 041             | Memory (`ai_memories` ist seit 162 weg) |
| `bot_audit_log`                                                                                                 | 017             | Telegram-Rest, den 102 übersehen hat |
| `chat_attachments`                                                                                              | 059             | Anhänge des Oberflächen-Chats |

Das sind 37 Tabellen. Dazu fallen die zugehörigen Funktionen und Views
(`generate_space_slug`, Statistik- und Cleanup-Funktionen aus 040, 050, 072,
084, 117), die B4 mit den Tabellen entfernt.

### Tabellen, die ersetzt werden

| Tabelle                                                                          | Angelegt in | Wohin                                                                            |
| -------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `app_installations`, `app_configurations`, `app_dependencies`, `app_events`      | 013         | Tabelle `apps` mit Manifest (C3)                                                 |
| `arasul.flow_runs`, `arasul.flow_run_steps`                                      | 112, 119, 124 | Flow-Engine v2 (C6), `flow_settings` kommt dazu                                |
| `chat_conversations`, `chat_messages`                                            | 005         | Frage 6: fallen, sobald B6 `/llm/chat` zustandslos macht                        |
| `admin_users`                                                                    | 002, 068    | bleibt, `role` wird `admin` oder `mitarbeiter` (C1); `app_members` (C2) kommt dazu |

### Tabellen, die bleiben

Anmeldung (`admin_users`, `active_sessions`, `token_blacklist`, `login_attempts`,
`password_history`), Schlüssel (`api_keys`, `api_key_usage`, `api_audit_logs`),
Modelle (`llm_model_catalog`, `llm_installed_models`, `llm_model_switches`,
`model_performance_metrics`, `llm_jobs`, `arasul.externe_modell_anbieter`),
Betrieb (alle `metrics_*`, `alert_*`, `self_healing_events`, `service_*`,
`recovery_actions`, `reboot_events`, `system_boot_events`, `system_snapshots`,
`notification_*`, `update_*`, `component_updates`, `audit_logs`,
`audit_log_health`, `system_settings`, `arasul.geraet`, `schema_migrations`).

### Die Migrationen nach Bereich

| Migrationen                                                                                                  | Zeilen | Bereich                             | Tabellen daraus |
| ------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------- | --------------- |
| 009, 036, 039, 040, 052, 069, 072, 076, 084, 094, 096, 097, 109, 122                                         | 1 122  | Dokumente, RAG                      | fallen          |
| 016, 044, 045, 058, 089, 098, 099, 106, 117, 129                                                             | 900    | Wissensräume, Wissensgraph          | fallen          |
| 018, 073, 074, 075, 100, 107, 108, 115, 125, 136, 137, 139                                                   | 632    | Terminal, Sandbox, Plattform-Apps   | fallen          |
| 116, 134, 135, 156, 157, 158                                                                                 | 171    | Erweiterungen                       | fallen          |
| 087, 090, 105, 067                                                                                           | 244    | n8n                                 | fallen          |
| 042, 043, 048, 104, 114, 118, 121, 130, 132                                                                  | 375    | Projekte, Vorlagen, Rechnung        | fallen          |
| 041, 046, 059, 127, 128, 155                                                                                 | 195    | Chat, Memory                        | fallen (Chat-Tabellen: ersetzt) |
| 017, 020, 022, 024, 025, 032, 033, 034, 047, 055, 091, 092, 095, 102                                         | 2 457  | Telegram (seit 102 weg)             | Geschichte      |
| 015, 031, 103, 110, 111, 120, 123, 133, 145                                                                  | 508    | Schon zurückgebaute Bereiche        | Geschichte      |
| 005, 013, 014, 112, 113, 119, 124, 131, 154                                                                  | 754    | Chat, Apps, Flows                   | werden ersetzt  |
| 000 bis 004, 006 bis 008, 010 bis 012, 019, 021, 023, 026 bis 030, 035, 037, 038, 049 bis 051, 053, 054, 056, 057, 060 bis 066, 068, 070, 071, 077 bis 083, 085, 086, 088, 093, 101, 126, 138, 140 bis 144, 146 bis 153, 159 bis 162 | 5 468 | Fundament, Betrieb, Modelle, Lizenz | bleiben |

## Container, jeder Eintrag in `compose/`

Heute 18 Container in fünf Dateien plus `compose.secrets.yaml` als Überlagerung;
dazu das Sandbox-Image, das der Backend zur Laufzeit startet.

| Container                    | Datei                     | Zeilen (+ secrets) | Urteil       | Warum                                                                          |
| ---------------------------- | ------------------------- | ------------------ | ------------ | ------------------------------------------------------------------------------ |
| `n8n`                        | `compose.app.yaml`        | 144 + 17           | fällt        | Entscheidung 7, Phase B5                                                       |
| `n8n-runners`                | `compose.app.yaml`        | 51 + 5             | fällt        | mit n8n                                                                        |
| `searxng`                    | `compose.ai.yaml`         | 68                 | fällt        | einziger Nutzer ist `flows/tools/web.js`; B5 streicht ihn                      |
| Sandbox-Image `services/sandbox/` | kein Compose-Eintrag | 1 930              | fällt        | Sandbox                                                                        |
| `document-indexer`           | `compose.ai.yaml`         | 87 + 9             | wird ersetzt | 9 848 Zeilen Indexer, davon braucht die externe API nur `/extract-text` (B6)   |
| `backup-service`             | `compose.monitoring.yaml` | 86 + 21            | wird ersetzt | C9: Backup auf das neue Datenmodell, App-Volumes dazu                          |
| `dashboard-backend`          | `compose.app.yaml`        | 190 + 19           | bleibt       | Umgebung wird kleiner (n8n, SearXNG, Sandbox-Socket raus)                      |
| `dashboard-frontend`         | `compose.app.yaml`        | 51                 | bleibt       |                                                                                |
| `llm-service`                | `compose.ai.yaml`         | 97                 | bleibt       | Ollama                                                                         |
| `embedding-service`          | `compose.ai.yaml`         | 62                 | bleibt       | `/v1/embeddings`                                                               |
| `postgres-db`                | `compose.core.yaml`       | 41 + 5             | bleibt       |                                                                                |
| `minio`                      | `compose.core.yaml`       | 37 + 7             | fällt        | Frage 1: samt `init-minio-buckets.sh` und MinIO-Passwortwechsel in `settings.js` |
| `docker-proxy`               | `compose.core.yaml`       | 52                 | bleibt       | Self-Healing, App-Container (C5)                                               |
| `reverse-proxy`              | `compose.core.yaml`       | 47                 | bleibt       | Traefik; Forward-Auth (C4), `/apps/<id>/` (C3)                                 |
| `cloudflared`                | `compose.external.yaml`   | 50                 | bleibt       | Profil `tunnel`, Fernzugriff (offen, siehe unten)                              |
| `metrics-collector`          | `compose.monitoring.yaml` | 46 + 5             | bleibt       | Betrieb                                                                        |
| `self-healing-agent`         | `compose.monitoring.yaml` | 70 + 5             | bleibt       | Betrieb                                                                        |
| `loki`, `promtail`           | `compose.monitoring.yaml` | 38 und 44          | fällt        | Frage 4: kein Leser, `logs.js` geht über Docker                                |

`config/`: `searxng/` (53) fällt; `traefik/` (1 173) wird ersetzt (n8n-Routen
raus, App-Routen und Forward-Auth rein); `appstore/` (87) wird ersetzt;
`loki/`, `promtail/` (181) fallen mit ihren Containern (Frage 4); `platforms/`,
`postgres/`, `apparmor/`, `logrotate.d/`, `secrets/`, `udev/` bleiben.

`services/n8n/` (4 047 Zeilen: drei Custom-Nodes, Vorlagen, Dockerfile) fällt
mit dem Container. Dazu 19 Skripte außerhalb von `scripts/test` und `scripts/util`, die n8n
kennen (`scripts/deploy`, `scripts/backup`, `scripts/security`,
`scripts/system`, `scripts/setup`, `interactive_setup.sh`); B5 entfernt die
Zeilen, nicht die Skripte.

## Abnahmeskripte, die Gestrichenes messen

Die Reihe `abnahmen.sh` kennt heute 13 Abnahmen. B6 schneidet sie neu.

### Fallen (messen nur Gestrichenes)

| Skript                                                | Zeilen | Misst                                                    |
| ----------------------------------------------------- | ------ | -------------------------------------------------------- |
| `scripts/test/chat-abnahme.mjs`                       | 337    | Agent-Chat                                               |
| `scripts/test/terminal-abnahme.mjs`                   | 246    | Terminal                                                 |
| `scripts/test/bruecke-abnahme.mjs`                    | 296    | KI-Brücke der Erweiterungen                              |
| `scripts/test/erweiterung-abnahme.mjs`                | 168    | Erweiterung einschalten, Tab, Brücke                     |
| `scripts/test/paket-abnahme.mjs`, `paket-vergleich.py` | 433   | Paket-Kette der Erweiterungen                            |
| `scripts/test/dokument-abnahme.mjs`                   | 180    | Dokument hochladen, Frage mit Quelle                     |
| `scripts/test/modell-link-abnahme.mjs`                | 176    | Modell per Link nachladen; C8 erlaubt nur die Kurzliste  |
| `scripts/test/vorlauf-wiegen.js`                      | 202    | Vorlauf des Chat-Agentenpfads                            |
| `scripts/test/rag_eval/`                              | 347    | RAG-Güte                                                 |
| `scripts/test/external-integrations-smoke.sh`, `-soak.sh` | 278 | n8n und Telegram                                         |
| `scripts/bench/rag_llm_smoke.sh`                      | 120    | RAG                                                      |
| `scripts/ops/n8n-auto-update.sh`                      | 104    | n8n                                                      |
| `scripts/util/n8n-import-templates.sh`, `setup-n8n-oauth-tunnel.sh`, `oauth-tunnel.sh`, `oauth-tunnel.ps1`, `inject-context.sh` | 1 076 | n8n-Vorlagen, n8n-OAuth-Tunnel, Kontext-Injektion |
| `scripts/util/phasenlauf.mjs`, `scripts/test/phasenlauf-test.mjs`, `run_phasenlauf_check` in `run-tests.sh` (Zeilen 149 bis 165 und 533) | 467 | den Phasenablauf von Plan 024, der am 26.08.2026 abgelöst wurde. `run_phasenlauf_check` hat außer `run-tests.sh` selbst keinen Aufrufer; der Kandidat aus A3 ist bestätigt |

Summe: 4 430 Zeilen.

### Werden neu geschnitten (messen Gestrichenes und Bleibendes zugleich)

| Skript                                        | Zeilen | Trifft Gestrichenes bei                                                  | Wird zu                              |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------ | ------------------------------------ |
| `rueckfrage-abnahme.mjs`                      | 302    | `/api/chats`, `/api/projects`                                            | Abnahme A5 (D4): Flow hält, Freigabe |
| `modell-abnahme.mjs`                          | 176    | Modellwechsel im Chat                                                    | Modell je Flow umstellen (D4)        |
| `oberflaeche-abnahme.mjs`                     | 232    | `/projekte`, Workspace-Ansichten                                         | D6 schneidet sie neu                 |
| `rueckmeldung-abnahme.mjs`                    | 196    | Store, Workspace                                                         | D6                                   |
| `csp-abnahme.mjs`                             | 326    | `/api/projects`, Store                                                   | D6                                   |
| `passwort-loeschung-abnahme.sh`               | 319    | `/api/chats`, `/api/documents`, `/api/spaces`                            | Löschung auf das neue Datenmodell    |
| `souveraenitaet-abnahme.sh`, `healthcheck-luft.sh` | 420 | n8n-Container                                                           | Containerliste nach B5               |
| `werksreset-abnahme.sh`, `werksreset-tabellen.py`, `pruefstand.sh` | 551 | Tabellenliste                                                  | neue Tabellenliste (B4)              |
| `abnahmen.sh`, `endpunkte-live.py`            | 385    | die Reihe selbst, Endpunktliste                                          | B6                                   |
| `dauerlauf-bericht.sh`, `dr-drill.sh`         | 381    | n8n, Dokumente im Backup                                                 | C9                                   |
| `integration-test.sh`, `smoke-test.sh`, `fresh-deploy-test.sh` | 934 | n8n, Dokumente, Sandbox                                          | B5/B6                                |
| `anleitungen.py`                              | 275    | prüft `docs/features/WORKSPACE.md`, das fällt                            | B7                                   |

Summe: 4 497 Zeilen. Bleiben unverändert: `fernzugriff-abnahme.mjs`,
`frischgeraet-abnahme.sh`, `anmeldung.mjs` (425).

CI-Wächter unter `scripts/test/*.py` (`bausteine`, `modellnamen`, `einheiten`,
`gedankenstriche`, `plan-faden`, `pfadfilter`, `durchreichung`, `datenordner`,
`endpunkte`, `geruest-regeln`, `stiller-tod`, `routenregeln`, `toter-code.sh`,
`waechter-selbsttest.sh`) bleiben scharf; die Jet-CI bleibt, wie sie ist.
`endpunkte-luecke.txt` bleibt leer und bekommt in B6 keine Einträge, sondern
die gestrichenen Endpunkte verlassen `docs/api/API_REFERENCE.md`.

## Offen (Entscheidung beim Überordner)

Am 26.08.2026 vom Überordner entschieden (Phase B2, `PHASE.md`); die Urteile
in den Tabellen oben sind nachgezogen, gelöscht wird in der Phase, zu der
das Stück gehört, nicht in B2:

| Frage | Entscheidung                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | MinIO **fällt**.                                                                                                                              |
| 2     | Fernzugriff **bleibt** bis D5.                                                                                                                |
| 3     | Externe Cloud-Modelle sind kein eigener Bereich mehr, sondern **werden ersetzt**: kein Settings-Bereich, stattdessen je Flow in der Admin-Flow-Ansicht wählbar lokal oder extern mit API-Key (D4). |
| 4     | Loki und Promtail **fallen**.                                                                                                                 |
| 5     | Stellt B4.                                                                                                                                    |
| 6     | Die Chat-Tabellen **fallen** mit dem zustandslosen `/llm/chat` in B6.                                                                        |
| 7     | Ja: der Zähler ist `scripts/test/zeilen.py`, mit Selbsttest im Wächter-Selbsttest, und die Messregel der Phasen B2 bis B6.                    |
| 8     | Messungen liegen datiert unter `docs/plans/audits/`; diese Liste ist dorthin umgezogen.                                                       |

Die Fragen im Wortlaut der ersten Fassung:


1. **MinIO.** Nach den Dokumenten nutzt nur noch `extractionService` den
   Speicher, als Zwischenablage für `/document/extract`. Ein Container für
   eine Temp-Datei ist viel; die Extraktion könnte die Datei direkt an den
   Indexer reichen. Dann fielen `minio` (44 Zeilen Compose, 272 Zeilen
   Service, `init-minio-buckets.sh`, MinIO-Passwortwechsel in `settings.js`).
2. **Fernzugriff** (`tailscale.js`, `tailscaleService.js`,
   `RemoteAccessSettings.tsx`, `cloudflared`, zusammen rund 2 000 Zeilen).
   Zeile 4 nennt „Wartung" als Teil der Lizenz; der Plan sagt nichts zu
   Tailscale. Hier als „bleibt" geführt, bis D5 die Admin-Ansicht schneidet.
3. **Externe Cloud-Modelle** (`externeModelle.js`, `llm/extern/`,
   `ExterneModelleSettings.tsx`, Migration 153, rund 1 500 Zeilen). Zeile 11
   kennt nur die Kurzliste aus `ollama list`. Hier als „bleibt" geführt, weil
   die Website es verspricht (Migration 153); C8 entscheidet.
4. **Loki und Promtail.** Kein Backend-Code liest Loki; `logs.js` liest
   Docker direkt. Hier als „bleibt (Betrieb)" geführt. Wenn niemand Loki
   abfragt, sind es 82 Zeilen Compose und 181 Zeilen Config ohne Leser.
5. **Grundschema statt 163 Migrationen.** Auf einem Neugerät laufen alle 163
   `.sql`-Dateien, davon 2 457 Zeilen Telegram, das seit 102 weg ist, und
   dazu `108a_n8n_default_disabled_fresh.sh`, das nur beim ersten
   Postgres-Init läuft und mit n8n fällt. Ein
   zusammengelegtes `001_grundschema.sql` für Neugeräte bräuchte einen Weg,
   Altgeräte (Orin) nicht zweimal migrieren zu lassen. Nicht Teil von B4,
   aber eine Frage, die B4 stellen wird.
6. **Chat-Tabellen für die externe API.** `externalApi.js` schreibt
   `/llm/chat` in `chat_conversations` und `chat_messages`. Wenn B6 den
   Chat-Endpunkt zustandslos macht, fallen beide Tabellen; sonst bleiben sie
   für einen Endpunkt.
7. **Den Zähler committen?** Die Zahlen oben stammen aus einem Wegwerfskript
   (Pfadliste plus `wc -l`). B2 und B3 sollen „Zeilen vorher und nachher"
   messen; ein committetes Skript mit dieser Liste würde beides mit derselben
   Regel zählen. Es wäre aber Code ohne Wächter, und Regel 1 sagt: kein toter
   Code.
8. **Wo solche Listen liegen.** `docs/plans/README.md` kennt `active/`,
   `done/`, `archive/`, `audits/`; diese Datei liegt daneben, weil die Phase
   „Liste in `docs/plans/`" verlangt. Wenn B2 bis B6 je eine Messung ablegen,
   sollte der Ort vorher feststehen (Vorschlag: `docs/plans/audits/`, datiert).
