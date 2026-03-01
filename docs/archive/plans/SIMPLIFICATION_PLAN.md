# Arasul Platform - Architektur-Vereinfachungsplan

> **Ziel:** Die Codebase so vereinfachen, dass neue Entwickler sie in 1-2 Tagen verstehen und produktiv mitarbeiten koennen.
> **Ansatz:** Moderat - Services zusammenlegen erlaubt, Kernfunktionalitaet bleibt komplett erhalten.
> **Sprache:** JavaScript (kein TypeScript)
> **Stand:** 2026-03-01

---

## Inhaltsverzeichnis

1. [Ist-Zustand: Die Zahlen](#1-ist-zustand-die-zahlen)
2. [Die 7 groessten Probleme](#2-die-7-groessten-probleme)
3. [Phase 1: Sofort-Massnahmen (Quick Wins)](#3-phase-1-sofort-massnahmen-quick-wins)
4. [Phase 2: Strukturelle Vereinfachung](#4-phase-2-strukturelle-vereinfachung)
5. [Phase 3: Frontend-Neuorganisation](#5-phase-3-frontend-neuorganisation)
6. [Phase 4: Backend-Neuorganisation](#6-phase-4-backend-neuorganisation)
7. [Phase 5: Infrastruktur & Docker](#7-phase-5-infrastruktur--docker)
8. [Phase 6: Dokumentation konsolidieren](#8-phase-6-dokumentation-konsolidieren)
9. [Phase 7: Test-Infrastruktur bereinigen](#9-phase-7-test-infrastruktur-bereinigen)
10. [Phase 8: Security-Haertung](#10-phase-8-security-haertung)
11. [Soll-Zustand: Zielarchitektur](#11-soll-zustand-zielarchitektur)
12. [Migrations-Reihenfolge](#12-migrations-reihenfolge)
13. [Entscheidungsprotokoll (ADRs)](#13-entscheidungsprotokoll-adrs)

---

## 1. Ist-Zustand: Die Zahlen

### Ueberblick

| Metrik                  | Wert             | Bewertung                |
| ----------------------- | ---------------- | ------------------------ |
| Gesamte Source-Dateien  | 338              | Hoch                     |
| Gesamte Lines of Code   | ~120.000         | Hoch fuer Solo/Kleinteam |
| Docker Services         | 17               | Komplex                  |
| Backend Route-Dateien   | 35               | Zu viele                 |
| Backend Service-Dateien | 33               | Zu viele                 |
| Frontend-Komponenten    | 54               | Unuebersichtlich         |
| SQL-Migrationen         | 41 (78 Tabellen) | Komplex                  |
| Dokumentations-Dateien  | 94 (.md)         | Ueberflutet              |
| Shell-Skripte           | 41               | Unuebersichtlich         |
| Dateien >1000 Zeilen    | 13               | Kritisch                 |
| Dateien >500 Zeilen     | 28+              | Problematisch            |

### Groesste Dateien (Top 10 - "God Objects")

| Datei                  | Zeilen | Problem                                               |
| ---------------------- | ------ | ----------------------------------------------------- |
| `ExcelEditor.js`       | 1.645  | 40 useState, Clipboard + Undo + Pagination + Keyboard |
| `appService.js`        | 1.637  | 35 Methoden, Manifest + Install + Docker + Start/Stop |
| `DocumentManager.js`   | 1.475  | Upload + Spaces + Ingestion + Status + Deletion       |
| `ChatMulti.js`         | 1.432  | 26 useState, 18 Nesting-Level, Streaming + Queue      |
| `ClaudeCode.js`        | 1.425  | 27 useState, Terminal + Code + Streaming              |
| `llmQueueService.js`   | 1.316  | Queue + Model Loading + Burst + Batching              |
| `documents.js` (Route) | 1.238  | 15 Endpoints, MinIO + PDF + Embedding                 |
| `DataTableEditor.js`   | 1.213  | Tabellen-Editing mit multiplen Operationen            |
| `BotSetupWizard.js`    | 1.116  | Multi-Step-Wizard mit vielen States                   |
| `docker-compose.yml`   | 1.084  | Alle 17 Services in einer Datei                       |

### Duplizierungen & Inkonsistenzen

| Problem                              | Haeufigkeit | Betroffene Dateien                 |
| ------------------------------------ | ----------- | ---------------------------------- |
| Manuelles `fetch()` + Error-Handling | 364x        | 12+ Komponenten                    |
| `formatSize()` dupliziert            | 3x          | ModelStore, StoreHome, StoreModels |
| Service-Config-Loading dupliziert    | 10x         | Alle AI-bezogenen Routes           |
| Pagination-Pattern dupliziert        | 8x          | Diverse Route-Dateien              |
| Kein zentraler Data-Fetching-Hook    | -           | Alle Komponenten einzeln           |

---

## 2. Die 7 groessten Probleme

### Problem 1: Monolithische Riesendateien

**Was:** 13 Dateien mit >1000 Zeilen, die zu viel auf einmal machen.
**Auswirkung:** Neue Entwickler brauchen Stunden, um eine einzige Datei zu verstehen. Aenderungen haben unvorhersehbare Seiteneffekte.
**Beispiel:** `ExcelEditor.js` hat 40 useState-Hooks - das ist kein Component mehr, das ist eine komplette Applikation.

### Problem 2: Keine Feature-basierte Organisation

**Was:** Frontend hat 29 Komponenten flach in `components/`. Backend hat 35 Route-Dateien flach in `routes/`.
**Auswirkung:** Um ein Feature zu verstehen (z.B. "Telegram"), muss man in 6+ verschiedenen Ordnern suchen.
**Ist-Zustand:**

```
components/
  ChatMulti.js          # Feature: Chat
  TelegramSettings.js   # Feature: Telegram
  TelegramAppModal.js   # Feature: Telegram
  DocumentManager.js    # Feature: Dokumente
  Settings.js           # Feature: Einstellungen
  ModelStore.js         # Feature: Store
  ...29 weitere flach
```

### Problem 3: 1084-Zeilen docker-compose.yml

**Was:** Alle 17 Services, 3 Networks, 13 Volumes in einer einzigen Datei.
**Auswirkung:** Selbst erfahrene Entwickler verlieren die Uebersicht. Kein selektives Starten moeglich.

### Problem 4: Dokumentations-Chaos

**Was:** 94 Markdown-Dateien, davon 11 Plan-Dokumente im Root, redundante Architektur-Docs, veraltete Inhalte.
**Auswirkung:** Niemand weiss, welches Dokument aktuell ist. ARCHITECTURE.md und CLAUDE_ARCHITECTURE.md ueberlappen zu 95%.

### Problem 5: Fehlende Abstraktionsschichten

**Was:** 189+ Raw-SQL-Queries direkt in Route-Handlern, kein Data-Access-Layer, kein zentraler API-Client im Frontend.
**Auswirkung:** SQL-Aenderungen erfordern Suchen in 35 Dateien. Kein einheitliches Error-Handling bei DB-Fehlern.

### Problem 6: Telegram-Service-Explosion

**Was:** 13 Telegram-bezogene Service-Dateien im Backend (5.950+ Zeilen), 3 Route-Dateien, 4 Frontend-Komponenten.
**Auswirkung:** Ein Feature-Bereich dominiert mit 20% des gesamten Backend-Codes.

### Problem 7: Verstreute Konfiguration & Skripte

**Was:** 41 Shell-Skripte in `scripts/`, 16 Config-Unterordner, Secrets in `.env` und `~/.bashrc`.
**Auswirkung:** Schwer nachzuvollziehen, welches Skript wann gebraucht wird. Sicherheitsrisiko durch Klartext-Secrets.

---

## 3. Phase 1: Sofort-Massnahmen (Quick Wins)

> **Aufwand:** 1-2 Tage | **Impact:** Hoch | **Risiko:** Sehr niedrig

### 1.1 docker-compose.yml aufteilen (include-Direktive)

**Vorher:** 1 Datei, 1.084 Zeilen
**Nachher:** 5 Dateien, je ~200 Zeilen

```
docker-compose.yml                    # Haupt-Einstiegspunkt (~30 Zeilen)
compose/
  compose.core.yaml                   # postgres, minio, traefik (~200 Zeilen)
  compose.ai.yaml                     # llm-service, embedding, qdrant, document-indexer (~200 Zeilen)
  compose.app.yaml                    # backend, frontend, n8n (~200 Zeilen)
  compose.monitoring.yaml             # loki, promtail, metrics, self-healing, backup (~200 Zeilen)
  compose.external.yaml               # cloudflared, ngrok (optional, profile-basiert) (~50 Zeilen)
```

**docker-compose.yml (Haupt):**

```yaml
include:
  - path: ./compose/compose.core.yaml
  - path: ./compose/compose.ai.yaml
  - path: ./compose/compose.app.yaml
  - path: ./compose/compose.monitoring.yaml
  - path: ./compose/compose.external.yaml
```

**Zusaetzlich: Docker Compose Profiles fuer optionale Services:**

```yaml
# In compose.monitoring.yaml
services:
  loki:
    profiles: ["monitoring"]
  promtail:
    profiles: ["monitoring"]

# In compose.external.yaml
services:
  cloudflared:
    profiles: ["tunnel"]
```

**Nutzung:**

```bash
docker compose up -d                              # Nur Kern + AI + App
docker compose --profile monitoring up -d          # Mit Monitoring
docker compose --profile tunnel up -d              # Mit Cloudflare Tunnel
docker compose --profile monitoring --profile tunnel up -d  # Alles
```

### 1.2 Planungsdokumente aus dem Root aufraumen

**Vorher:** 9 Plan-Dateien im Projekt-Root
**Nachher:** Archiviert oder entfernt

```bash
# Verschieben in docs/archive/plans/
mkdir -p docs/archive/plans
mv DASHBOARD_AUDIT_PLAN.md docs/archive/plans/
mv DATENTABELLEN_REFACTORING_PLAN.md docs/archive/plans/
mv TELEGRAM_APP_REFACTORING_PLAN.md docs/archive/plans/
mv STORE_IMPLEMENTATION_PLAN.md docs/archive/plans/
mv PRODUCTION_READINESS_PLAN.md docs/archive/plans/
mv DASHBOARD_AUDIT.md docs/archive/plans/
mv tasks.md docs/archive/plans/

# Root bleibt sauber:
# README.md, CLAUDE.md, INSTALLATION.md, CHANGELOG.md, BUGS_AND_FIXES.md, VERSION
```

### 1.3 Unbenutzte Dependencies entfernen

**Frontend:**

```bash
cd apps/dashboard-frontend
npm uninstall axios    # Nie importiert, Projekt nutzt fetch()
npm uninstall date-fns # Importiert aber nie aufgerufen
```

### 1.4 Duplizierte Migration #040 fixen

```bash
# Umbenennen:
mv services/postgres/init/040_filter_aware_statistics.sql \
   services/postgres/init/041_filter_aware_statistics.sql
```

### 1.5 Duplizierten Code konsolidieren

**`formatSize()` in utils/formatting.js zentralisieren:**

- Entfernen aus: `ModelStore.js`, `StoreHome.js`, `StoreModels.js`
- Importieren aus: `utils/formatting.js` (existiert bereits als `formatFileSize()`)

---

## 4. Phase 2: Strukturelle Vereinfachung

> **Aufwand:** 3-5 Tage | **Impact:** Sehr hoch | **Risiko:** Niedrig

### 2.1 Monorepo-Verzeichnisstruktur bereinigen

**Vorher:**

```
arasul-jet/
  services/         # Alles gemischt: Apps + Infra + Python + Node
  scripts/          # 41 Skripte flach
  config/           # 16 Unterordner
  docs/             # 40+ Dateien
  9 Plan-Dateien im Root
  docker-compose.yml (1084 Zeilen)
```

**Nachher:**

```
arasul-jet/
  apps/                           # <-- NEU: Deploybare Applikationen
    dashboard-frontend/           # React SPA (von services/ verschoben)
    dashboard-backend/            # Express API (von services/ verschoben)
  services/                       # Infrastruktur-Services (bleiben)
    postgres/
    llm-service/
    embedding-service/
    document-indexer/
    metrics-collector/
    self-healing-agent/
    n8n/
    telegram-bot/                 # Python Telegram Bot
    shared-python/                # Python shared lib
  compose/                        # <-- NEU: Docker Compose Dateien
    compose.core.yaml
    compose.ai.yaml
    compose.app.yaml
    compose.monitoring.yaml
    compose.external.yaml
  config/                         # Bleibt, aber aufgeraeumt
    traefik/
    loki/
    promtail/
    apparmor/
    logrotate.d/
  scripts/                        # Bleibt, aber kategorisiert (siehe 2.2)
  docs/                           # Konsolidiert (siehe Phase 6)
  docker-compose.yml              # Nur include-Direktiven
  README.md
  CLAUDE.md
  INSTALLATION.md
  CHANGELOG.md
  VERSION
  package.json
  Makefile
```

**Warum `apps/` vs `services/`?**

- `apps/` = Code den wir aktiv entwickeln (Frontend, Backend)
- `services/` = Infrastruktur die wir konfigurieren, aber selten aendern (DB, AI-Services)
- Klare Trennung: "Wo arbeite ich?" vs "Was laeuft im Hintergrund?"

### 2.2 Scripts-Verzeichnis kategorisieren

**Vorher:** 41 Skripte flach in `scripts/`
**Nachher:** Nach Zweck gruppiert

```
scripts/
  setup/                          # Erstinstallation
    preconfigure.sh
    setup_dev.sh
    setup-dev-tools.sh
    setup-service-user.sh
    setup_mdns.sh
    detect-jetson.sh
  security/                       # Haertung & Sicherheit
    setup-firewall.sh
    harden-os.sh
    harden-ssh.sh
    security-scan.sh
    generate_self_signed_cert.sh
    generate_htpasswd.sh
  test/                           # Test & Validierung
    run-tests.sh
    integration-test.sh
    measure-performance.sh
    run-typecheck.sh
  deploy/                         # Deployment & Updates
    create-deployment-image.sh
    create_update_package.sh
    sign_update_package.py
    verify-deployment.sh
  backup/                         # Backup & Restore
    backup.sh
    restore.sh
  validate/                       # Konfigurationspruefung
    validate_config.sh
    validate_dependencies.sh
    verify-dev-env.sh
    verify-hooks.sh
  util/                           # Diverses
    init_minio_buckets.sh
    setup_logrotate.sh
    export-support-logs.sh
    auto-restart-service.sh
    telegram-notify.sh
    disable-auto-updates.sh
    arasul-usb-trigger.sh
    inject-context.sh
    migrate_embeddings.py
    start-mcp-server.sh
    claude-autonomous.sh
    oauth-tunnel.sh
    oauth-tunnel.ps1
    setup-n8n-oauth-tunnel.sh
```

### 2.3 Shared-Packages einrichten

Ein neuer `packages/` Ordner fuer Code, der zwischen Frontend und Backend geteilt wird:

```
packages/
  shared/
    constants.js        # Gemeinsame Konstanten (Rollen, Status-Werte)
    validation.js       # Validierungsregeln (Passwort, E-Mail, etc.)
    formatting.js       # Formatierungs-Funktionen (Datum, Groesse, etc.)
    package.json
```

**Vorteile:**

- Keine doppelte Validierungslogik mehr
- Frontend und Backend nutzen dieselben Konstanten
- `formatSize()` existiert genau einmal

**Implementierung mit npm workspaces:**

```json
// Root package.json
{
  "workspaces": ["apps/dashboard-frontend", "apps/dashboard-backend", "packages/*"]
}
```

---

## 5. Phase 3: Frontend-Neuorganisation

> **Aufwand:** 5-8 Tage | **Impact:** Sehr hoch | **Risiko:** Mittel

### 3.1 Feature-basierte Verzeichnisstruktur

**Vorher (flach, unuebersichtlich):**

```
src/components/
  ChatMulti.js, ChatMessage.js, ChatTabsBar.js     # Chat
  DocumentManager.js, SpaceModal.js                  # Dokumente
  TelegramSettings.js, TelegramAppModal.js           # Telegram
  Settings.js, MemorySettings.js, PasswordManagement.js  # Settings
  ModelStore.js, AppStore.js, AppDetailModal.js      # Store
  DataTableEditor.js, ExcelEditor.js                 # Datentabellen
  ClaudeCode.js, ClaudeTerminal.js                   # Claude
  SetupWizard.js, Login.js, UpdatePage.js            # System
  Modal.js, Skeleton.js, LoadingSpinner.js           # Shared UI
  ... 29 weitere Dateien flach
```

**Nachher (feature-basiert, selbsterklaerend):**

```
src/
  features/                         # Feature-Module (Business Logic)
    chat/
      ChatMulti.js                  # Haupt-Chat-Ansicht
      ChatMessage.js
      ChatTabsBar.js
      useChatStreaming.js           # <-- NEU: Extrahierter Hook
      useChatQueue.js              # <-- NEU: Extrahierter Hook
      chat.css
      index.js                     # Barrel Export
    documents/
      DocumentManager.js
      DocumentUpload.js            # <-- NEU: Extrahiert aus DocumentManager
      DocumentList.js              # <-- NEU: Extrahiert aus DocumentManager
      SpaceModal.js
      Badges.js
      documents.css
      index.js
    telegram/
      TelegramSettings.js
      TelegramAppModal.js
      BotSetupWizard.js
      BotDetailsModal.js
      CommandsEditor.js
      telegram.css
      index.js
    settings/
      Settings.js
      MemorySettings.js
      PasswordManagement.js
      settings.css
      index.js
    store/
      StoreHome.js
      StoreApps.js
      StoreModels.js
      AppDetailModal.js
      store.css
      index.js
    datentabellen/
      DataTableEditor.js
      ExcelEditor.js               # Wird aufgeteilt (siehe 3.2)
      AddFieldModal.js
      CellContextMenu.js
      CellEditor.js
      ColumnMenu.js
      datentabellen.css
      index.js
    claude/
      ClaudeCode.js
      ClaudeTerminal.js
      claude.css
      index.js
    system/
      SetupWizard.js
      UpdatePage.js
      SelfHealingEvents.js
      system.css
      index.js
    database/
      DatabaseOverview.js
      DatabaseTable.js
      database.css
      index.js

  components/                       # Shared/Wiederverwendbare UI
    ui/
      Modal.js                      # Basis-Modal
      Skeleton.js
      LoadingSpinner.js
      EmptyState.js
      ConfirmIconButton.js
      ContentTransition.js
      ErrorBoundary.js
    form/                           # <-- NEU: Form-Components
      FormInput.js
      FormSelect.js
    layout/
      Sidebar.js                    # <-- NEU: Extrahiert aus App.js
      PageHeader.js                 # <-- NEU: Extrahiert aus App.js
    editor/
      MarkdownEditor.js
      MermaidDiagram.js
      GridEditor/                   # Shared Grid-Editor
        CellEditor.js
        DataCell.js
        FieldTypes.js
        index.js

  hooks/                            # Shared Hooks
    useConfirm.js
    useMinLoadingTime.js
    useTokenBatching.js
    useWebSocketMetrics.js
    useApi.js                       # <-- NEU (siehe 3.3)

  contexts/
    AuthContext.js
    ToastContext.js
    DownloadContext.js

  config/
    api.js

  utils/
    formatting.js
    sanitizeUrl.js
    token.js
```

**Regeln:**

- Jedes Feature hat einen `index.js` als Barrel-Export
- CSS lebt neben der Komponente (co-located)
- Tests leben neben der Komponente (`__tests__/` pro Feature)
- `components/` nur fuer wirklich wiederverwendbare UI-Teile
- Maximal 2 Verzeichnisebenen unter `features/`

### 3.2 God-Components aufteilen

#### ExcelEditor.js (1.645 Zeilen -> 5 Dateien)

```
features/datentabellen/
  ExcelEditor.js          # ~300 Zeilen: Orchestrierung, Layout
  ExcelToolbar.js         # ~200 Zeilen: Toolbar-Actions (Export, Filter, etc.)
  ExcelRow.js             # ~200 Zeilen: Zeilen-Rendering + Inline-Editing
  useExcelState.js        # ~400 Zeilen: useReducer fuer 40 States -> 1 Reducer
  useExcelKeyboard.js     # ~200 Zeilen: Keyboard-Navigation + Shortcuts
  useExcelClipboard.js    # ~150 Zeilen: Copy/Paste-Logik
  useExcelHistory.js      # ~150 Zeilen: Undo/Redo-Stack
```

**Kernidee:** Die 40 useState-Hooks werden zu einem `useReducer` konsolidiert:

```javascript
// VORHER: 40 einzelne States
const [rows, setRows] = useState([]);
const [columns, setColumns] = useState([]);
const [selectedCell, setSelectedCell] = useState(null);
const [editingCell, setEditingCell] = useState(null);
const [clipboard, setClipboard] = useState(null);
// ... 35 weitere

// NACHHER: 1 Reducer
const [state, dispatch] = useReducer(excelReducer, initialState);
// state.rows, state.columns, state.selectedCell, etc.
// dispatch({ type: 'SELECT_CELL', payload: { row, col } })
```

#### ChatMulti.js (1.432 Zeilen -> 4 Dateien)

```
features/chat/
  ChatMulti.js            # ~400 Zeilen: Layout + Tab-Management
  ChatInput.js            # ~200 Zeilen: Eingabefeld + Model-Auswahl
  ChatSettings.js         # ~150 Zeilen: Chat-Einstellungen
  useChatStreaming.js     # ~300 Zeilen: SSE-Streaming + Queue-Tracking
  useChatState.js         # ~200 Zeilen: useReducer fuer Chat-State
```

#### DocumentManager.js (1.475 Zeilen -> 3 Dateien)

```
features/documents/
  DocumentManager.js      # ~400 Zeilen: Layout + Routing
  DocumentUpload.js       # ~400 Zeilen: Upload-UI + MinIO-Interaktion
  DocumentList.js         # ~400 Zeilen: Tabelle + Filter + Suche
  useDocumentActions.js   # ~200 Zeilen: CRUD-Operationen
```

#### App.js (1.183 Zeilen -> 3 Dateien)

```
src/
  App.js                  # ~200 Zeilen: Router + Provider-Wrapper
  features/
    layout/
      Sidebar.js          # ~400 Zeilen: Navigation + Service-Status
      PageHeader.js       # ~150 Zeilen: Header mit Breadcrumbs
      useAppNavigation.js # ~150 Zeilen: Route-Config + Lazy-Loading
```

### 3.3 Zentraler API-Hook: useApi()

Statt 364 manuelle fetch-Calls einen wiederverwendbaren Hook:

```javascript
// hooks/useApi.js
import { useState, useCallback } from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import { useToast } from '../contexts/ToastContext';

export function useApi() {
  const toast = useToast();

  const request = useCallback(
    async (path, options = {}) => {
      const { method = 'GET', body, showError = true } = options;

      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unbekannter Fehler' }));
        if (showError) toast.error(error.message);
        throw error;
      }

      return res.json();
    },
    [toast]
  );

  return {
    get: p => request(p),
    post: (p, b) => request(p, { method: 'POST', body: b }) /* ... */,
  };
}

// Nutzung in Komponenten:
function DocumentList() {
  const api = useApi();
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    api.get('/documents').then(setDocs);
  }, []);
}
```

### 3.4 CellEditor konsolidieren

Zwei CellEditor-Implementierungen zu einer zusammenfuehren:

- `DataTable/CellEditor.js` (125 Zeilen, basic)
- `shared/GridEditor/CellEditor.js` (209 Zeilen, mit Validierung)

**Loesung:** Eine einzige Version in `components/editor/GridEditor/CellEditor.js` mit optionaler Validierung.

---

## 6. Phase 4: Backend-Neuorganisation

> **Aufwand:** 5-8 Tage | **Impact:** Sehr hoch | **Risiko:** Mittel

### 4.1 3-Schichten-Architektur konsequent durchsetzen

**Vorher (Route = alles):**

```
routes/documents.js (1.238 Zeilen)
  -> Validierung
  -> Business-Logik
  -> SQL-Queries
  -> MinIO-Calls
  -> Error-Handling
```

**Nachher (saubere Trennung):**

```
routes/documents.js (~200 Zeilen)      # HTTP: Params extrahieren, Response senden
controllers/documents.js (~300 Zeilen) # Logik: Validierung, Orchestrierung
services/documentService.js (~300 Zeilen) # Business: Upload, Indexierung
repositories/documentRepo.js (~200 Zeilen) # Daten: SQL-Queries
```

**Verzeichnisstruktur Backend:**

```
apps/dashboard-backend/src/
  routes/                   # Nur HTTP-Mapping + Middleware
    auth.js
    chats.js
    documents.js
    llm.js
    rag.js
    telegram/               # <-- Gruppiert statt 3 Einzeldateien
      index.js              # Router-Aggregation
      settings.js
      bots.js
      app.js
    datentabellen/
      index.js
      tables.js
      rows.js
      quotes.js
    system/                 # <-- Gruppiert
      index.js
      services.js
      metrics.js
      logs.js
      health.js
    admin/                  # <-- Gruppiert
      settings.js
      audit.js
      update.js
      selfhealing.js
    ai/                     # <-- Gruppiert
      models.js
      embeddings.js
      memory.js
      spaces.js
    store/                  # <-- Gruppiert
      appstore.js
      store.js
      workflows.js
    external/
      externalApi.js
      claudeTerminal.js
      events.js

  controllers/              # <-- NEU: Request/Response-Logik
    documentController.js
    chatController.js
    authController.js
    # ... (nur fuer komplexe Routes noetig)

  services/                 # Business-Logik (bleibt, wird aufgeteilt)
    # Telegram konsolidiert:
    telegram/
      telegramBotService.js
      telegramWebhookService.js
      telegramNotificationService.js
      # (7 weitere werden zusammengefuehrt, siehe 4.3)

    # AI-Services:
    ai/
      llmQueueService.js
      modelService.js
      contextBudgetManager.js
      contextInjectionService.js
      modelContextService.js
      queryOptimizer.js

    # App-Services:
    app/
      appService.js         # Aufgeteilt (siehe 4.2)
      updateService.js

    # Core-Services:
    cacheService.js
    cryptoService.js
    tokenService.js
    docker.js

  repositories/             # <-- NEU: Alle SQL-Queries zentralisiert
    documentRepo.js
    chatRepo.js
    userRepo.js
    telegramRepo.js
    metricsRepo.js
    settingsRepo.js
    auditRepo.js
    # Jedes Repo exportiert benannte Funktionen:
    # findDocumentById(id), createDocument(data), updateDocument(id, data), etc.

  middleware/                # Bleibt wie ist (gut organisiert)
    auth.js
    errorHandler.js
    rateLimit.js
    audit.js
    apiKeyAuth.js

  utils/                    # Bleibt wie ist
    errors.js
    logger.js
    jwt.js
    password.js
    retry.js
    fileLogger.js
    envManager.js

  tools/                    # Bleibt wie ist (LLM Function Calling)
  config/                   # Bleibt wie ist
  database.js               # Haupt-DB-Pool
  dataDatabase.js           # Datentabellen-DB-Pool
  index.js                  # Express-Setup
```

### 4.2 God-Services aufteilen

#### appService.js (1.637 Zeilen -> 3 Dateien)

```
services/app/
  manifestService.js      # ~400 Zeilen: Manifest laden, parsen, cachen
  installService.js       # ~500 Zeilen: Install, Uninstall, Dependencies
  containerService.js     # ~400 Zeilen: Start, Stop, Restart, Status
```

#### llmQueueService.js (1.316 Zeilen -> 2 Dateien)

```
services/ai/
  llmQueueService.js      # ~600 Zeilen: Queue-Management, FIFO, Burst
  llmJobProcessor.js      # ~500 Zeilen: Job-Ausfuehrung, Streaming, Retry
```

### 4.3 Telegram-Services konsolidieren

**Vorher: 13 Dateien, 5.950+ Zeilen**

```
telegramWebhookService.js     (1.049)
telegramApp.js                (970)
telegram.js                   (823)
telegramBotService.js         (717)
telegramOrchestratorService.js (680)
telegramLLMService.js         (491)
telegramNotificationService.js (474)
telegramWebSocketService.js   (299)
telegramAppService.js         (292)
telegramVoiceService.js       (275)
telegramPollingManager.js     (249)
telegramSetupPollingService.js (215)
telegramRateLimitService.js   (195)
```

**Nachher: 6 Dateien** (Zusammenlegen was zusammengehoert)

```
services/telegram/
  botService.js            # Bot-CRUD + Commands (aus: telegramBotService + telegramApp)
  messageService.js        # Webhook + Polling + Voice (aus: Webhook + Polling + Voice)
  notificationService.js   # Notifications + Rate-Limiting (aus: Notification + RateLimit)
  orchestratorService.js   # Orchestrierung + WebSocket (aus: Orchestrator + WebSocket + Setup)
  llmService.js            # LLM-Integration (bleibt)
  index.js                 # Barrel-Export
```

**Reduktion:** 13 Dateien -> 6 Dateien, ~5.950 -> ~4.500 Zeilen (25% weniger)

### 4.4 Repository-Layer einfuehren

Statt SQL in 35 Route-Dateien verstreut, ein zentraler Ort:

```javascript
// repositories/documentRepo.js
const db = require('../database');

const documentRepo = {
  async findAll({ limit = 20, offset = 0, spaceId, status } = {}) {
    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (spaceId) {
      params.push(spaceId);
      conditions.push(`space_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    params.push(limit, offset);
    return db.query(
      `
      SELECT id, name, status, category_id, uploaded_at, chunk_count
      FROM documents
      WHERE ${conditions.join(' AND ')}
      ORDER BY uploaded_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
      params
    );
  },

  async findById(id) {
    /* ... */
  },
  async create(data) {
    /* ... */
  },
  async update(id, data) {
    /* ... */
  },
  async softDelete(id) {
    /* ... */
  },
};

module.exports = documentRepo;
```

**Vorteile:**

- SQL-Aenderungen an genau einer Stelle
- Einfach zu testen (Mock eines Repos statt der ganzen DB)
- Pagination, Filtering, Sorting wiederverwendbar
- Kein SQL-Wissen in Route-Handlern noetig

### 4.5 Route-Dateien gruppieren

**Vorher:** 35 flache Dateien in `routes/`
**Nachher:** Logisch gruppiert in Unterordner

```
routes/
  auth.js                 # Login, Logout, Verify, Password
  chats.js                # Chat CRUD
  documents.js            # Document CRUD
  llm.js                  # LLM Chat/Streaming
  rag.js                  # RAG Search
  telegram/               # 3 Dateien -> 1 Router mit Sub-Routes
  datentabellen/          # 4 Dateien (bleibt, gut organisiert)
  system/                 # services, metrics, logs, health -> 1 Router
  admin/                  # settings, audit, update, selfhealing -> 1 Router
  ai/                     # models, embeddings, memory, spaces -> 1 Router
  store/                  # appstore, store, workflows -> 1 Router
  external/               # externalApi, claudeTerminal, events -> 1 Router
```

**Von 35 Dateien -> 6 Einzeldateien + 6 Gruppen = uebersichtlicher**

---

## 7. Phase 5: Infrastruktur & Docker

> **Aufwand:** 2-3 Tage | **Impact:** Mittel | **Risiko:** Niedrig

### 5.1 Node.js-Version aktualisieren

```dockerfile
# VORHER (EOL seit September 2025):
FROM node:18-alpine

# NACHHER:
FROM node:20-alpine
```

Betrifft: `apps/dashboard-backend/Dockerfile`

### 5.2 Docker Secrets aktivieren

**Vorher:** Alle Secrets in `.env` (Klartext)

```env
JWT_SECRET=mein-geheimes-jwt-secret
POSTGRES_PASSWORD=mein-db-passwort
MINIO_ROOT_PASSWORD=mein-minio-passwort
```

**Nachher:** Docker Compose Secrets fuer sensitive Werte

```bash
# Secrets-Dateien erstellen (einmalig):
mkdir -p config/secrets
echo "mein-geheimes-jwt-secret" > config/secrets/jwt_secret
echo "mein-db-passwort" > config/secrets/postgres_password
echo "mein-minio-passwort" > config/secrets/minio_root_password
chmod 600 config/secrets/*
```

```yaml
# compose.core.yaml
secrets:
  jwt_secret:
    file: ./config/secrets/jwt_secret
  postgres_password:
    file: ./config/secrets/postgres_password

services:
  postgres-db:
    secrets:
      - postgres_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
```

### 5.3 Backup-Service Dockerfile optimieren

```dockerfile
# VORHER: Installiert Packages zur Laufzeit
FROM alpine:3.19
# ... RUN apk add im Entrypoint

# NACHHER: Alle Packages im Image
FROM alpine:3.19
RUN apk add --no-cache postgresql16-client aws-cli curl gzip
COPY scripts/backup/backup.sh /usr/local/bin/
```

### 5.4 Traefik BasicAuth-Platzhalter ersetzen

```bash
# Platzhalter in config/traefik/dynamic/middlewares.yml ersetzen:
./scripts/security/generate_htpasswd.sh
```

### 5.5 Makefile vereinfachen

```makefile
# Statt 40+ Targets, nur die wichtigsten:
.PHONY: start stop restart logs build test

start:           ## Starte alle Kern-Services
	docker compose up -d

start-all:       ## Starte alle Services inkl. Monitoring
	docker compose --profile monitoring --profile tunnel up -d

stop:            ## Stoppe alle Services
	docker compose down

restart:         ## Neustart
	docker compose restart

logs:            ## Zeige Logs (usage: make logs s=backend)
	docker compose logs -f $(s)

build:           ## Rebuild (usage: make build s=backend)
	docker compose up -d --build $(s)

test:            ## Alle Tests ausfuehren
	./scripts/test/run-tests.sh --all

db:              ## Database Shell
	docker exec -it postgres-db psql -U arasul -d arasul_db

help:            ## Diese Hilfe anzeigen
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'
```

---

## 8. Phase 6: Dokumentation konsolidieren

> **Aufwand:** 2-3 Tage | **Impact:** Hoch | **Risiko:** Sehr niedrig

### 6.1 Von 94 Dateien auf ~15 Kerndokumente

**Zielstruktur:**

```
docs/
  getting-started.md          # <-- NEU: Einstieg fuer neue Entwickler (30min Setup)
  architecture.md             # <-- Zusammengefuehrt aus ARCHITECTURE + CLAUDE_ARCHITECTURE
  api-reference.md            # Bleibt (aktualisiert)
  api-errors.md               # Bleibt
  database-schema.md          # Bleibt (aktualisiert)
  design-system.md            # Bleibt (obligatorisch)
  environment-variables.md    # Bleibt
  deployment.md               # <-- Zusammengefuehrt aus DEPLOYMENT + INSTALLATION + CHECKLIST
  troubleshooting.md          # Bleibt
  backup-system.md            # Bleibt

  adr/                        # <-- NEU: Architecture Decision Records
    001-raw-sql-no-orm.md
    002-ollama-for-llm.md
    003-qdrant-vector-db.md
    004-feature-based-frontend.md
    005-repository-pattern.md

  archive/                    # Alte/abgeschlossene Dokumente
    plans/                    # Alle *_PLAN.md Dateien
    deprecated/               # Veraltete Docs (ARCHITECTURE.md, API_GUIDE.md, etc.)

# ENTFERNT/ZUSAMMENGEFUEHRT:
# - ARCHITECTURE.md (-> architecture.md)
# - CLAUDE_ARCHITECTURE.md (-> architecture.md)
# - DOCKER_DEPENDENCIES.md (-> architecture.md)
# - API_GUIDE.md (-> api-reference.md)
# - DEPLOYMENT_CHECKLIST.md (-> deployment.md)
# - INSTALLATION.md (Root) -> deployment.md oder getting-started.md
# - 6 *_PLAN.md Dateien -> archive/plans/
# - prd.md, prd-telegram-bot.md -> archive/
# - README_UPDATE_PLAN.md -> archive/plans/
```

### 6.2 getting-started.md erstellen

Das wichtigste fehlende Dokument - ein neuer Entwickler soll in 30 Minuten produktiv sein:

```markdown
# Getting Started

## Voraussetzungen

- Docker + Docker Compose V2
- Node.js 20+ (fuer lokale Entwicklung)
- Git

## In 5 Minuten starten

1. `git clone ...`
2. `cp .env.example .env`
3. `make start`
4. Browser: http://localhost

## Projekt verstehen (15 Minuten)

- `apps/` = Unser Code (Frontend + Backend)
- `services/` = Infrastruktur (DB, AI, etc.)
- `compose/` = Docker-Konfiguration
- `config/` = Service-Konfiguration

## Erste Aenderung machen

1. Frontend: `apps/dashboard-frontend/src/features/`
2. Backend: `apps/dashboard-backend/src/routes/`
3. Tests: `make test`

## Wichtige Befehle

[...]
```

### 6.3 CLAUDE.md verschlanken

CLAUDE.md von 174 Zeilen auf ~80 Zeilen reduzieren - nur das Allerwichtigste:

```markdown
# CLAUDE.md

## Quick Start

make start | make test | make logs s=backend

## Wo ist was?

apps/dashboard-frontend/ = React SPA
apps/dashboard-backend/ = Express API
services/ = Infrastruktur
docs/ = Dokumentation

## Regeln

1. Tests vor Commit: make test
2. Design System: docs/design-system.md
3. Error Handling: asyncHandler() + throw ValidationError()
4. API Calls: API_BASE + getAuthHeaders() aus config/api.js
5. CSS: Nur var(--name), keine Hex-Werte

## Referenzen

[Links zu den 10 Kerndokumenten]
```

### 6.4 Jedes Dokument bekommt einen Header

```markdown
---
title: Architecture Overview
last-updated: 2026-03-01
owner: @arasul
---
```

---

## 9. Phase 7: Test-Infrastruktur bereinigen

> **Aufwand:** 3-4 Tage | **Impact:** Mittel | **Risiko:** Niedrig

### 7.1 Quality-Gates aus Unit-Tests entfernen

`designSystem.test.js` und `codeQuality.test.js` sind keine echten Tests - sie parsen Code mit RegEx.
Sie gehoeren in eine separate Lint-Pipeline.

**Loesung:**

- Inhalte in ESLint Custom-Rules oder ein separates `scripts/test/code-quality-check.sh` migrieren
- Aus der Jest-Suite entfernen
- CI/CD: Als eigener Job, nicht als Test

### 7.2 Test-Verzeichnisse co-locaten

**Vorher:**

```
src/__tests__/ChatMulti.test.js     # Weit weg von der Komponente
src/components/ChatMulti.js          # Die eigentliche Komponente
```

**Nachher:**

```
src/features/chat/
  ChatMulti.js
  ChatMulti.test.js                  # Direkt daneben
```

### 7.3 Kritische Service-Coverage erhoehen

| Service              | Aktuell | Ziel | Prioritaet |
| -------------------- | ------- | ---- | ---------- |
| `memoryService.js`   | 8%      | 50%  | Hoch       |
| `pdfService.js`      | 3%      | 40%  | Hoch       |
| `updateService.js`   | 4%      | 50%  | Hoch       |
| `llmQueueService.js` | 14%     | 50%  | Mittel     |
| `appService.js`      | <10%    | 40%  | Mittel     |

### 7.4 pdfkit-Mock reparieren

Die 18 fehlschlagenden Backend-Test-Suites scheitern an fehlendem `pdfkit`. Der Mock existiert bereits unter `__mocks__/pdfkit.js`, wird aber nicht korrekt geladen.

**Loesung:** `moduleNameMapper` in `jest.config.js` pruefen und korrigieren.

---

## 10. Phase 8: Security-Haertung

> **Aufwand:** 1-2 Tage | **Impact:** Kritisch | **Risiko:** Niedrig

### 10.1 Sofort-Massnahmen (Blocker fuer Produktion)

| #   | Problem                            | Loesung                                 | Aufwand |
| --- | ---------------------------------- | --------------------------------------- | ------- |
| 1   | Telegram Bot Token in `~/.bashrc`  | In Docker Secret verschieben            | 30 Min  |
| 2   | Traefik BasicAuth = PLACEHOLDER    | `generate_htpasswd.sh` ausfuehren       | 10 Min  |
| 3   | n8n BasicAuth = PLACEHOLDER        | `generate_htpasswd.sh` ausfuehren       | 10 Min  |
| 4   | Passwort-Policy: 4 Zeichen Minimum | Auf 8+ erhoehen, Komplexitaet erzwingen | 1 Std   |
| 5   | JWT Expiry 24h                     | Auf 4h reduzieren                       | 15 Min  |

### 10.2 Mittelfristige Massnahmen

| #   | Problem                              | Loesung                                      |
| --- | ------------------------------------ | -------------------------------------------- |
| 6   | Kein Token-Refresh-Mechanismus       | Refresh-Token-Pattern implementieren         |
| 7   | `exec()` statt `execFile()` in Tools | Shell-Injection-Vektor schliessen            |
| 8   | LLM SQL-Blacklist statt Whitelist    | Auf Whitelist-Ansatz umstellen               |
| 9   | Cookie `secure: false`               | Conditional: `secure: true` wenn HTTPS aktiv |

---

## 11. Soll-Zustand: Zielarchitektur

### Verzeichnisstruktur (komplett)

```
arasul-jet/
  apps/
    dashboard-frontend/
      src/
        features/           # 9 Feature-Module
        components/          # Shared UI
        hooks/               # Shared Hooks (inkl. useApi)
        contexts/            # 3 Contexts
        config/
        utils/
      Dockerfile
      package.json
    dashboard-backend/
      src/
        routes/              # 6 Einzelroutes + 6 Gruppen
        controllers/         # Request/Response-Logik
        services/            # Business-Logik (gruppiert)
        repositories/        # SQL-Queries (zentralisiert)
        middleware/           # 5 Middleware
        utils/               # Utilities
        tools/               # LLM Function Calling
        config/
      Dockerfile
      package.json

  services/
    postgres/               # DB + 41 Migrationen
    llm-service/            # Ollama Management
    embedding-service/      # Sentence Transformers
    document-indexer/       # RAG Pipeline
    metrics-collector/      # System-Metriken
    self-healing-agent/     # Autonome Wiederherstellung
    n8n/                    # Workflow-Engine
    telegram-bot/           # Python Telegram Bot
    shared-python/          # Python Shared Lib

  packages/
    shared/                 # JS Shared zwischen FE/BE

  compose/
    compose.core.yaml
    compose.ai.yaml
    compose.app.yaml
    compose.monitoring.yaml
    compose.external.yaml

  config/
    traefik/
    loki/
    promtail/
    apparmor/
    secrets/                # Docker Secrets (git-ignored)

  scripts/
    setup/
    security/
    test/
    deploy/
    backup/
    validate/
    util/

  docs/
    getting-started.md
    architecture.md
    api-reference.md
    design-system.md
    database-schema.md
    deployment.md
    troubleshooting.md
    environment-variables.md
    adr/
    archive/

  docker-compose.yml        # Nur include-Direktiven
  README.md
  CLAUDE.md
  CHANGELOG.md
  VERSION
  Makefile
  package.json              # Workspaces Root
```

### Metriken-Vergleich

| Metrik                        | IST          | SOLL                           | Verbesserung   |
| ----------------------------- | ------------ | ------------------------------ | -------------- |
| docker-compose.yml            | 1.084 Zeilen | ~30 Zeilen + 5 Dateien je ~200 | -97% pro Datei |
| Groesste Datei                | 1.645 Zeilen | ~400 Zeilen                    | -75%           |
| Frontend Flat-Components      | 29           | 0 (feature-basiert)            | Struktur       |
| Backend Route-Dateien (flach) | 35           | 6 + 6 Gruppen                  | Uebersicht     |
| SQL in Route-Dateien          | 189+ Queries | 0 (-> Repositories)            | Trennung       |
| Dokumentations-Dateien        | 94           | ~15 + Archiv                   | -84%           |
| Root-Planungsdateien          | 9            | 0                              | Sauber         |
| Scripts (flach)               | 41           | 7 Kategorien                   | Struktur       |
| Telegram-Service-Dateien      | 13           | 6                              | -54%           |
| useState in ExcelEditor       | 40           | 1 (useReducer)                 | Lesbarkeit     |
| Duplikate API-Calls           | 364          | ~50 (via useApi)               | -86%           |

---

## 12. Migrations-Reihenfolge

Die Phasen koennen teilweise parallel bearbeitet werden. Hier die empfohlene Reihenfolge:

```
Woche 1-2:  Phase 1 (Quick Wins) + Phase 8 (Security)
            |-- docker-compose aufteilen
            |-- Plans aufraumen
            |-- Unused deps entfernen
            |-- Security-Blocker fixen

Woche 2-3:  Phase 2 (Strukturelle Vereinfachung)
            |-- Monorepo-Verzeichnisse umorganisieren
            |-- Scripts kategorisieren
            |-- npm Workspaces einrichten

Woche 3-5:  Phase 3 (Frontend) + Phase 4 (Backend) parallel
            |-- Feature-Ordner erstellen
            |-- God-Components aufteilen
            |-- useApi() Hook
            |-- Repository-Layer
            |-- Telegram konsolidieren
            |-- Route-Gruppen

Woche 5-6:  Phase 6 (Docs) + Phase 7 (Tests)
            |-- Dokumentation konsolidieren
            |-- getting-started.md schreiben
            |-- Test-Co-Location
            |-- Quality-Gate-Migration

Woche 6-7:  Phase 5 (Infrastruktur)
            |-- Node 20 Upgrade
            |-- Docker Secrets
            |-- Backup-Dockerfile
```

### Abhaengigkeiten

```
Phase 1 (Quick Wins) ─┐
Phase 8 (Security)  ───┤
                       ├──> Phase 2 (Struktur) ──> Phase 3 (Frontend)
                       │                       ──> Phase 4 (Backend)
                       │                                    │
                       │                                    v
                       └──> Phase 6 (Docs) ────────> Phase 7 (Tests)
                       └──> Phase 5 (Infra)
```

---

## 13. Entscheidungsprotokoll (ADRs)

Jede groessere Entscheidung wird als Architecture Decision Record dokumentiert:

### ADR-001: Feature-basierte Frontend-Struktur

**Kontext:** 29 Komponenten flach in `components/`, schwer navigierbar.
**Entscheidung:** Feature-Ordner (`features/chat/`, `features/documents/`, etc.)
**Konsequenz:** Imports aendern sich, aber IDE-Refactoring kann das automatisieren.

### ADR-002: Repository-Pattern fuer Datenbankzugriff

**Kontext:** 189+ SQL-Queries verstreut in 35 Route-Dateien.
**Entscheidung:** Zentralisierte Repository-Dateien pro Domaene.
**Konsequenz:** Kein SQL-Wissen in Routes noetig, einfacher testbar.

### ADR-003: Kein ORM, weiterhin Raw SQL

**Kontext:** Raw SQL gibt volle Kontrolle und minimalen Overhead.
**Entscheidung:** Beibehalten, aber durch Repository-Layer kapseln.
**Konsequenz:** Entwickler muessen SQL koennen, aber nur in Repository-Dateien.

### ADR-004: Docker Compose Include statt Monolith

**Kontext:** 1.084-Zeilen-Datei ist unwartbar.
**Entscheidung:** `include`-Direktive mit 5 Teil-Dateien nach Layer.
**Konsequenz:** Jede Datei ist eigenstaendig verstehbar.

### ADR-005: Telegram-Services konsolidieren

**Kontext:** 13 Dateien, 5.950+ Zeilen fuer ein Feature.
**Entscheidung:** Auf 6 Dateien reduzieren durch logisches Zusammenlegen.
**Konsequenz:** Weniger Dateien, aber groessere (trotzdem <800 Zeilen).

### ADR-006: JavaScript beibehalten

**Kontext:** TypeScript wuerde Type-Safety bringen, aber hohen Migrationsaufwand.
**Entscheidung:** JavaScript mit JSDoc-Typen wo noetig.
**Konsequenz:** Niedrigere Einstiegshuerde, aber weniger IDE-Unterstuetzung.

---

## Zusammenfassung

Dieser Plan transformiert das Arasul-Repo von einem **funktional gewachsenen Monolithen** zu einer **klar strukturierten, lesbaren Codebase**:

- **Wo arbeite ich?** `apps/` (Frontend/Backend) vs `services/` (Infrastruktur) - sofort klar
- **Wo finde ich Feature X?** `features/chat/` - alles an einem Ort
- **Wo ist die SQL?** `repositories/` - nirgendwo sonst
- **Wie starte ich?** `make start` + `docs/getting-started.md` - 30 Minuten
- **Was kann ich weglassen?** Docker Profiles - nur starten was man braucht
- **Was hat sich geaendert?** ADRs dokumentieren jede Entscheidung

Die Kernfunktionalitaet bleibt zu 100% erhalten. Kein Feature wird entfernt. Die Vereinfachung ist rein strukturell und organisatorisch.
