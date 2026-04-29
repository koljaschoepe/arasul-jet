# LLM / RAG / n8n Hardening Plan

> **Status:** Vorschlag (April 2026) · **Audit-Basis:** 14 parallele Sub-Agent-Audits über Frontend, Backend, DB, Realtime, Security, Tests.
> **Ziel:** Die LLM-/RAG-/Store-/n8n-Pfade auf den Stand bringen, der für **kommerzielle Auslieferung** und **5 Jahre autonomen Betrieb** auf Jetson Orin (64GB) und Thor (128GB) nötig ist.
> **User-Entscheidungen:** Auto-Resume bei Boot · Live-Markdown-Doku mit Download · Warn-but-allow bei Hardware-Limits · Phasen-Plan in Datei.

---

## Executive Summary

Die Plattform ist strukturell solide (TanStack Query, asyncHandler, Custom-Errors, SSE-Streaming, BGE-M3-RAG, Hybrid-Search, Auto-Sync mit Ollama). Drei Klassen kritischer Schwächen blockieren aber Production-Readiness:

| Klasse                        | Beispiel                                                                                                                                 | Konsequenz                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Download-Persistenz**       | Schema speichert nur `progress %`, nicht Bytes; bei Container-Restart wird `'downloading'` zu `'error'`; Resume ist nicht implementiert. | 80GB-Modelldownload nach 14h verloren — User muss von vorn anfangen.                             |
| **State-Konsistenz Frontend** | Store, Chat, Dashboard nutzen drei separate TanStack-Query-Keys für „aktives Modell".                                                    | User aktiviert in Store → Dashboard zeigt 5 Sekunden lang Stale-Modell. Race in parallelen Tabs. |
| **Ollama-Ausfall-Toleranz**   | Backend prüft Ollama-Health nicht vor `enqueue()`; User wartet 11 Min Timeout statt 2 Sek Fehler.                                        | Bei jeder Ollama-Hänge = stundenlanges User-Confusion.                                           |

Daneben: **n8n-Doku** ist statisch (hardcoded Modell-Namen, kein Live-Bezug, kein Markdown-Download), **Hardware-Awareness** im Store fehlt komplett (Hook existiert, wird aber nirgends aufgerufen), **Prompt-Logging** in `rag_query_log` ist DSGVO-Risiko, und **JWT in WS-Query-Params** landet in Browser-History.

Der Plan ist in **8 Phasen** gegliedert, jeweils mit P0/P1/P2-Items, konkreten `file:line`-Refs, Akzeptanzkriterien und Test-Strategie. Phasen 0–4 sind harte Pflicht vor Auslieferung; 5–7 erhöhen Robustheit & Compliance.

---

## Phase 0 — Download-Persistenz & Crash-Recovery (P0, BLOCKER) ✅ Umgesetzt 2026-04-26

**Warum jetzt:** Der einzige Bug, der **Datenverlust in Stunden** verursacht. Mit 80GB-Modellen + 15h-Downloads + Edge-Hardware (Stromausfall, Watchdog-Restart, OOM) ist Resume nicht optional.

**Status (Stand 2026-04-26):** Alle Subitems umgesetzt, Tests grün, Backend in Production gerebuiltet.

- Migration `083_model_download_progress.sql` live in PG
- `modelDownloadHelpers.streamModelDownload` persistiert `bytes_completed` alle 2s
- `modelService.downloadModel` mit atomarem Claim (TOCTOU-frei) + Resume-Detection
- `modelSyncHelpers.cleanupStaleDownloads` demoted Orphans zu `paused` statt `error`
- `ollamaReadiness.resumePausedDownloads` läuft beim Boot + nach jedem Sync
- `DELETE /api/models/:modelId/download` als expliziter Cancel-Reset-Endpoint
- Frontend `DownloadContext` mit `paused`-Phase, `purgeDownload()`, `resumeDownload()`
- `DownloadProgress` zeigt Bytes / Speed / ETA + Pause/Resume/Purge-Buttons
- Tests: 10/10 in `modelDownloadRecovery.test.js`, 19/19 Regression in `models.test.js`

### 0.1 Migration `083_model_download_progress.sql`

**Files to touch:**

- `services/postgres/init/083_model_download_progress.sql` (neu)
- `services/postgres/init/011_llm_models_schema.sql` (Referenz, **nicht ändern**)

**SQL:**

```sql
ALTER TABLE llm_installed_models
  ADD COLUMN bytes_total       BIGINT,
  ADD COLUMN bytes_completed   BIGINT     DEFAULT 0,
  ADD COLUMN download_started_at  TIMESTAMPTZ,
  ADD COLUMN last_activity_at  TIMESTAMPTZ,
  ADD COLUMN attempt_count     INTEGER    DEFAULT 0,
  ADD COLUMN last_error_code   VARCHAR(50),
  ADD COLUMN download_speed_bps BIGINT;

-- Status-Erweiterung: 'paused' für Crash-Recovery
ALTER TABLE llm_installed_models DROP CONSTRAINT IF EXISTS llm_installed_models_status_check;
ALTER TABLE llm_installed_models ADD CONSTRAINT llm_installed_models_status_check
  CHECK (status IN ('downloading', 'paused', 'available', 'error'));

-- Index für Stale-Detection beim Boot
CREATE INDEX idx_llm_downloads_recovery ON llm_installed_models(status, last_activity_at)
  WHERE status IN ('downloading', 'paused');

-- FK-Hardening (war P1 in Audit 13)
ALTER TABLE llm_jobs
  ADD CONSTRAINT fk_llm_jobs_model
  FOREIGN KEY (requested_model) REFERENCES llm_installed_models(id) ON DELETE SET NULL;
```

**Akzeptanz:** Migration läuft idempotent, keine Bestandsdaten verloren, alte Spalte `download_progress` (Prozent) bleibt für Backward-Compat parallel zu `bytes_completed`.

### 0.2 Backend: Atomarer Claim + Resume

**Files:**

- `apps/dashboard-backend/src/services/llm/modelService.js:476-486` — TOCTOU-Race fixen
- `apps/dashboard-backend/src/services/llm/modelDownloadHelpers.js:240-266` — Bytes-basierter Progress + Persistierung
- `apps/dashboard-backend/src/routes/ai/models.js:476` — `WHERE status <> 'downloading'` entfernen, durch atomic claim ersetzen

**Pattern:**

```javascript
// Statt: ON CONFLICT DO UPDATE WHERE status <> 'downloading'
// Atomar: SELECT FOR UPDATE → entscheiden → UPDATE in selber TX
await db.transaction(async client => {
  const row = await client.query(
    `SELECT status, bytes_completed FROM llm_installed_models
     WHERE id = $1 FOR UPDATE`,
    [modelId]
  );
  if (row.rows[0]?.status === 'downloading') {
    return { action: 'already_downloading', progress: row.rows[0].bytes_completed };
  }
  // sonst: claim für eigenen Pull, übernehme bytes_completed bei Resume
  await client.query(
    `UPDATE llm_installed_models
    SET status='downloading', download_started_at = COALESCE(download_started_at, NOW()),
        last_activity_at = NOW(), attempt_count = attempt_count + 1
    WHERE id = $1`,
    [modelId]
  );
});
```

**Während Pull:** Jeden Stream-Chunk → `bytes_completed += chunk.length`, `last_activity_at = NOW()` (debounced auf alle 2s, sonst DB-Last zu hoch).

### 0.3 Boot-Recovery in `ollamaReadiness.initialize()`

**File:** `apps/dashboard-backend/src/services/llm/ollamaReadiness.js`

**Logik (neu, ersetzt `cleanupStaleDownloads`):**

1. Beim Backend-Start: alle Rows mit `status IN ('downloading', 'paused')` laden.
2. Ollama-API `GET /api/tags` fragen — Modell schon komplett da? → `status='available'`, `bytes_completed=bytes_total`.
3. Sonst: `status='paused'` (NICHT `'error'`!), `attempt_count` belassen.
4. Async: für jedes `paused` Modell den Pull resumen (`ollama pull` ist nativ resumable, lokale Blob-Cache wird wiederverwendet).
5. Bei `attempt_count > 5`: dann erst `'error'`.

**Akzeptanz:** Kill `dashboard-backend` mit `docker kill` mid-download → reboot → Pull läuft automatisch mit Bytes-Progress weiter.

### 0.4 Frontend: Resume-fähige Anzeige

**Files:**

- `apps/dashboard-frontend/src/contexts/DownloadContext.tsx:282-290, 369-387` — Inactivity-Timeout NICHT auf `'error'` setzen, sondern auf `'paused'`
- `apps/dashboard-frontend/src/features/store/components/DownloadProgress.tsx:33-78` — `bytes_completed/bytes_total` + ETA + Speed anzeigen statt nur %
- `apps/dashboard-frontend/src/features/store/components/StoreModels.tsx:471` — Bei `paused` zeigen: „⏸ Pausiert bei 28.4/80 GB · [▶ Fortsetzen]" (auch wenn Auto-Resume läuft, User-Reassurance)

**Akzeptanz:** Bei Browser-Reload während Download bleibt Bytes-Position erhalten; bei Backend-Restart sehen alle offenen Tabs nahtlos den weiterlaufenden Progress.

### 0.5 Cancel = explizit, nicht Cleanup

**Files:**

- `apps/dashboard-frontend/src/contexts/DownloadContext.tsx:407-416` — `cancelDownload` muss `DELETE /api/models/:id/download` rufen, nicht nur lokal abort.
- `apps/dashboard-backend/src/routes/ai/models.js` (neu) — `DELETE /:modelId/download` → `status='paused'` (oder `'available'` wenn User auch Disk freigeben will via `?purge=true` → `ollama rm`).

**Test (neu):** `unit/modelDownloadRecovery.test.js` — simuliert Crash, Resume, Cancel, Re-Pull.

---

## Phase 1 — State-Konsistenz Frontend (P0) ✅ Umgesetzt 2026-04-27

**Status:** Alle Subitems live; Frontend rebuilt + container healthy.

- `apps/dashboard-frontend/src/hooks/queries/modelKeys.ts` — Single Source of Truth für alle Modell-Queries (catalog/status/installed/loaded/default/memoryBudget/capabilities)
- `useChatModels`, `useModelStatus` und Store-Queries laufen über dieselben Cache-Keys; setQueryData/invalidate propagieren überall
- `useChatModels.loadedQuery` hat jetzt 5 s Polling — Chat-Header sieht Backend-Entladungen
- `useModelStatus` ist auf TanStack umgestellt (kein eigener useState/visibility-Loop mehr); shared cache mit Store + Chat
- Neuer Hook `useModelState()` (`hooks/queries/useModelState.ts`) für „is this model loaded / installed / default"-Antworten ohne dreifache Lookups
- Optimistic Delete in `useDeleteModelMutation` mit Rollback
- Delete-Confirmation in `StoreHome` (war bisher nur in `StoreModels`)
- `ActivationContext.cancelActivation` setzt jetzt `activationRef = null` + `abortRef = null` (Memory-Leak-Risiko)

### 1.1 Single Source of Truth für Modell-Status

**Problem (Audits 1+2):** `useChatModels.ts`, `useModelStatus.ts`, `storeKeys.modelsStatus()` sind drei separate Query-Keys. User aktiviert in Store → Dashboard sieht es 5–10 s später (oder gar nicht, weil Chat nicht polled).

**Files:**

- `apps/dashboard-frontend/src/hooks/queries/modelKeys.ts` (neu) — zentrale Key-Factory:
  ```typescript
  export const modelKeys = {
    all: ['models'] as const,
    catalog: () => [...modelKeys.all, 'catalog'] as const,
    installed: () => [...modelKeys.all, 'installed'] as const,
    status: () => [...modelKeys.all, 'status'] as const,
    default: () => [...modelKeys.all, 'default'] as const,
    memoryBudget: () => [...modelKeys.all, 'memory-budget'] as const,
  };
  ```
- `apps/dashboard-frontend/src/features/store/hooks/queryKeys.ts` — `storeKeys.modelsStatus()` etc. **entfernen**, durch `modelKeys.status()` ersetzen.
- `apps/dashboard-frontend/src/features/dashboard/hooks/useModelStatus.ts:9` — `modelKeys.memoryBudget()` verwenden.
- `apps/dashboard-frontend/src/contexts/chat/useChatModels.ts:86-101` — Loaded-Query mit `refetchInterval: 5_000`, Key = `modelKeys.status()`.

**Akzeptanz:** Drei Tabs (Store, Dashboard, Chat) zeigen innerhalb derselben TanStack-Cache-Roundtrip dasselbe aktive Modell. Mutation → eine `invalidateQueries({queryKey: modelKeys.all})` reicht überall.

### 1.2 State-Begriffe konsolidieren

Das Audit 2 zeigt: „active" bedeutet 3 Dinge.

**Naming-Vereinheitlichung (TypeScript-Interface):**

```typescript
// in src/types/models.ts
type ModelState = {
  installed: boolean; // lokal vorhanden
  loaded: boolean; // gerade in Ollama-RAM
  isDefault: boolean; // System-Default für neue Chats
  selectedForChat?: string; // pro-Chat User-Wahl (Chat-Context only)
};
```

Alle Stellen, die heute `active`/`isLoaded`/`activeModelId` mischen, auf diese Felder migrieren.

### 1.3 Optimistic Updates harmonisieren

**Files:**

- `apps/dashboard-frontend/src/features/store/hooks/mutations.ts:40-45` — `useDeleteModelMutation` hat **keinen** optimistic Update → ergänzen.
- `apps/dashboard-frontend/src/features/store/hooks/mutations.ts:70` — `useSetDefaultModelMutation` invalidet nur `storeKeys` → nach Konsolidierung (1.1) automatisch fixed.
- `apps/dashboard-frontend/src/contexts/ActivationContext.tsx:206-209` — `cancelActivation` setzt `activatingRef=false`, aber `activationRef` bleibt → Memory-Leak-Risiko.

### 1.4 Delete-Confirmation überall erzwingen

**File:** `apps/dashboard-frontend/src/features/store/components/StoreHome.tsx:186` — `useConfirm` Dialog ergänzen wie in `StoreModels.tsx:179-187`. Aktuell kann User aus Modal direkt löschen ohne Bestätigung.

---

## Phase 2 — Hardware-Awareness im Store (P0/P1) ✅ Umgesetzt 2026-04-27

**Status:** Alle Subitems live; Backend + Frontend gerebuildet, healthy.

- `useHardwareCompatibility(model)` Hook + `HardwareCompatibilityBadge` und `HardwareCompatibilityWarning` (`features/store/components/HardwareCompatibilityBadge.tsx`); Badges in StoreModels + StoreHome, Warning-Box im StoreDetailModal
- Pre-Download-Confirm im Modal: bei `tight`/`too_big` → Confirm-Dialog vor `onDownload`
- `StorageBar` (`features/store/components/StorageBar.tsx`) im Store-Header zeigt Live-Disk-Usage (Tone OK/Warn/Critical) via `/api/metrics/live`, polling 10s
- `getPowerMode()` in `apps/dashboard-backend/src/utils/hardware.js` (best-effort `nvpmodel -q`); `/api/system/info` exposed `power_mode`; `ModelStatusBar` zeigt `⚡ MAXN`-Badge bzw. amber bei 30W/15W mit Tooltip + `nvpmodel -m 0`-Hinweis
- `useEvictionWatcher` (`hooks/useEvictionWatcher.ts`) diff't `loadedModels` aus dem shared `memoryBudget`-Cache und feuert Toast wenn ein Modell verschwunden ist; mountet einmal in AppShell als `<EvictionWatcher />`

### 2.1 Pre-Download/Activation Guards im UI sichtbar (P0)

**Problem:** Der Hook `canLoadModel()` existiert in `useModelStatus.ts:254-256`, wird aber **nirgendwo aufgerufen**. User klickt Download für ein 70B-Modell auf einem 32GB-Orin und merkt erst nach 5h, dass es nicht passt.

**Files:**

- `apps/dashboard-frontend/src/features/store/components/StoreModels.tsx` — pro Modell-Karte `canLoadModel(model)` aufrufen → Badge:
  - `green` „Passt" — `available > required * 1.2`
  - `amber` „Knapp" — `available > required` aber Buffer < 20%
  - `red` „Reicht nicht" — `available < required`
- `apps/dashboard-frontend/src/features/store/components/StoreDetailModal.tsx:247` — Warnungs-Section ergänzen (siehe User-Mockup in Phase 0): „Benötigt ~42GB · du hast 51GB frei · Risiko: OOM bei Last · [Abbrechen] [Trotzdem laden]".
- Backend-Endpoint bereits da: `GET /api/models/memory-budget` (`apps/dashboard-backend/src/routes/ai/models.js:152`).

**Akzeptanz:** Klick auf Download bei nicht-passendem Modell öffnet Modal; harter Block ist nicht erwünscht (User-Entscheidung Phase 0).

### 2.2 Live-Disk-Anzeige im Frontend (P1)

**Files:**

- `apps/dashboard-frontend/src/features/store/components/` (neu: `StorageBar.tsx`) — Disk-Widget oben in Store: „Modelle: 142 GB · Frei: 88 GB" mit Progressbar.
- Datenquelle: `GET /api/metrics/live` (`apps/dashboard-backend/src/routes/system/metrics.js:20`) hat schon Disk-Daten — nicht prominent gezeigt.
- Vor jedem Download: zusätzliche Modal-Zeile „Nach Download: 88GB → 46GB frei".

### 2.3 Power-Mode-Detection (P1)

**Problem:** Jetson hat MAXN/30W/15W-Modi; im 15W-Mode sind LLM-Empfehlungen anders. Aktuell komplett ignoriert.

**Files:**

- `scripts/setup/detect-jetson.sh` — `nvpmodel -q` parsen, Power-Mode in Profil schreiben.
- `apps/dashboard-backend/src/utils/hardware.js` — `getPowerMode()` Funktion ergänzen (liest `/etc/nvpmodel.conf` oder `nvpmodel -q`).
- `apps/dashboard-backend/src/routes/system/system.js:140-181` — `/api/system/info` ergänzt `power_mode: 'maxn'|'30w'|'15w'|'unknown'`.
- Frontend: `ModelStatusBar.tsx` — kleiner Badge oben rechts „⚡ MAXN" (klickbar → Settings).
- Bei `15w`: alle Modelle > 4B grayed out im Store mit Hover „Power-Mode-Limit, schalte auf MAXN um".

### 2.4 LRU-Eviction transparent machen (P1)

**File:** `apps/dashboard-backend/src/services/llm/modelService.js:128-140` — Bei Eviction → SSE-Event auf zentralen Channel, Frontend zeigt Toast „Gemma-31B wurde entladen, weil Llama-70B aktiviert wurde".

---

## Phase 3 — n8n-Integration als eigener Settings-Tab (P0/P1)

### 3.1 Settings-Tab `n8n` (P0)

**Problem (Audits 5+14):** `N8nIntegrationGuide.tsx` (546 Zeilen, 4 Sub-Tabs) ist als Akkordeon in „Allgemein" eingebettet — überlädt General, ist statisch, kein Markdown-Download.

**Files:**

- `apps/dashboard-frontend/src/features/settings/Settings.tsx:42-85` — neuer Tab:
  ```typescript
  { id: 'n8n', label: 'n8n Integration', icon: <Zap className="size-5" />,
    description: 'Workflow-Integration und API-Zugriff' }
  ```

  - `case 'n8n': return <ComponentErrorBoundary…><N8nIntegrationSettings/>…`
- `apps/dashboard-frontend/src/features/settings/components/GeneralSettings.tsx:159` — `<N8nIntegrationGuide />` entfernen.
- Datei umbenennen: `N8nIntegrationGuide.tsx` → `N8nIntegrationSettings.tsx`, Inhalt komplett neu (siehe 3.2).

### 3.2 Live-Daten + Markdown-Download (P0)

**Neue Komponenten-Struktur:**

```
N8nIntegrationSettings.tsx
├── LiveStatusCard       (zeigt aktives Modell, Endpoint, API-Key-Prefix)
├── QuickStartGuide      (Markdown gerendert, Schritt-für-Schritt)
├── EndpointReference    (alle nutzbaren Endpoints als Tabelle)
└── DownloadButton       (📥 Markdown herunterladen)
```

**Live-Daten-Hook (neu):** `apps/dashboard-frontend/src/features/settings/hooks/useN8nIntegrationData.ts`

```typescript
export function useN8nIntegrationData() {
  const status = useQuery({ queryKey: modelKeys.status(), … });
  const queue  = useQuery({ queryKey: ['llm','queue'], queryFn: () => api.get('/v1/external/llm/queue') });
  const myKeys = useQuery({ queryKey: ['api-keys'], queryFn: () => api.get('/v1/external/api-keys') });
  const endpoints = computeEndpoints({ host: window.location.hostname });
  return { activeModel: status.data?.loaded?.[0], endpoints, latestKeyPrefix: myKeys.data?.[0]?.key_prefix };
}
```

**Markdown-Template** (Source of Truth, beides für Anzeige + Download):

- `apps/dashboard-frontend/src/features/settings/n8n-template.md.ts` — exportiert eine Funktion `renderN8nDoc(data) → string`.
- Sections: Quick-Start · Auth (API-Key holen) · Chat-Endpoint mit cURL/n8n-HTTP-Node-Konfig · Embedding · OCR · Document-Extract-Structured · OpenAI-Compat-Section (siehe 3.3) · Troubleshooting.
- Live-Substitutions: `{{activeModel}}`, `{{baseUrl}}`, `{{apiKeyExample}}`, `{{embeddingDim}}`.

**Anzeige:** `react-markdown` rendert das Template; gleicher String → `Blob` → Download als `arasul-n8n-integration-{{date}}.md`.

**Akzeptanz:** Datei ist sofort in ChatGPT/Claude paste-bar und enthält alle nötigen Live-Werte.

### 3.3 OpenAI-Compat-Layer im Backend (P0)

**Problem (Audit 8):** n8n's „OpenAI Chat Model"-Node erwartet `/v1/chat/completions`. Aktuell muss n8n die proprietäre `/api/v1/external/llm/chat` nutzen.

**Files:**

- `apps/dashboard-backend/src/routes/external/openai-compat.js` (neu) — drei Endpoints:
  - `POST /v1/chat/completions` → intern `llmQueueService.enqueue` + Response im OpenAI-Format
  - `POST /v1/embeddings` → intern `embeddingService` + OpenAI-Format
  - `GET /v1/models` → installierte Modelle im OpenAI-Format
- `apps/dashboard-backend/src/middleware/apiKeyAuth.js` — `allowedEndpoints` um `'openai:chat'`, `'openai:embeddings'` erweitern.
- `apps/dashboard-backend/src/routes/index.js` — Mount unter Base `/v1` (separat von `/api/v1/external`).

**Streaming:** `stream: true` Param → SSE im OpenAI-Delta-Format `{choices: [{delta: {content: "..."}}]}`.

**Akzeptanz:** n8n's Standard-OpenAI-Node mit `Base URL = http://dashboard-backend:3001/v1` und `API Key = aras_…` funktioniert ohne Custom-Code.

### 3.4 OpenAPI-Spec generieren (P1)

**File:** `apps/dashboard-backend/src/routes/external/_spec.js` (neu) — `GET /api/v1/external/_spec` → OpenAPI 3.1 JSON.

- n8n kann via „HTTP Request"-Node-Import auto-discovern.
- Build-Schritt (optional): `swagger-jsdoc` aus JSDoc-Annotations.

---

## Phase 4 — Chat & RAG Robustheit (P0/P1)

### 4.1 Ollama Health-Check vor Enqueue (P0)

**File:** `apps/dashboard-backend/src/routes/llm.js:30-50`

**Pattern:**

```javascript
router.post(
  '/chat',
  requireAuth,
  asyncHandler(async (req, res) => {
    const health = await ollamaReadiness.quickCheck(); // 2s timeout
    if (!health.ready) {
      throw new ServiceUnavailableError('LLM-Service nicht bereit', { code: 'OLLAMA_UNAVAILABLE' });
    }
    // ... bisherige Logik
  })
);
```

**Akzeptanz:** Bei totem Ollama → 2 s zur sauberen Fehlermeldung statt 11 min Timeout.

### 4.2 Cancel-Race-Fix (P0)

**File:** `apps/dashboard-frontend/src/features/chat/components/ChatInputArea.tsx:347-349`

- `cancelJob` muss `await` sein, nicht fire-and-forget.
- Frontend-Mutex: keine neue `sendMessage` während alte Cancel noch nicht ACK'd.

### 4.3 Token-Batching per-Chat (P1)

**File:** `apps/dashboard-frontend/src/hooks/useTokenBatching.ts`

- Aktuell: globale Batch-Queue → bei schnellem Chat-Switch landen Tokens von Chat A in Chat B.
- Fix: Map<chatId, BatchQueue>. Bei Unmount eines Chats → zugehörige Queue flushen + droppen.

### 4.4 Context-Window-Counter + Auto-Pruning (P1)

**Files:**

- `apps/dashboard-frontend/src/contexts/chat/useChatStreaming.ts:393` — `max_tokens=32768` ist hardcoded.
- Token-Counter (clientseitig grob, via tiktoken-WASM oder einfache `text.length/4` Heuristik) → wenn `> 0.8 * model.context_size`: Warnung-Banner „Konversation wird zu lang, alte Nachrichten werden ausgeblendet".
- Backend: `apps/dashboard-backend/src/routes/llm.js` — Auto-Pruning wenn Server-Estimation > Context-Window: älteste User/Assistant-Paare droppen, System-Prompt + letzte 4 Pairs behalten.

### 4.5 SSE Auto-Reconnect (P1)

**File:** `apps/dashboard-frontend/src/contexts/chat/useChatStreaming.ts`

- Heute: Reconnect nur via `reconnectToJob` bei Tab-Reactivation.
- Fix: SSE-Reader kapselt in Wrapper mit `onError → exponential backoff retry (5x, 1s/2s/4s/8s/16s)`.
- Backend muss Stream-Checkpoints persistieren (siehe 4.6).

### 4.6 Chat-Stream-Persistence (P1)

**Files:**

- `apps/dashboard-backend/src/services/llm/llmJobService.js` — pro Token-Burst: `UPDATE llm_jobs SET content=$1, last_seq=$2 WHERE id=$3` (debounced 500 ms).
- Reconnect: `GET /api/llm/jobs/:id/stream?since_seq=N` → Server sendet alles ab `seq > N`.

**Akzeptanz:** Browser-Reload mid-stream → bei Reconnect kommen die Tokens ab Abbruchpunkt weiter, kein Verlust.

### 4.7 RAG: Embedding-Fehler = Exception, nicht Silent (P0)

**File:** `apps/dashboard-backend/src/services/rag/ragCore.js:191`

- Heute: `additionalEmbeddingsRaw || []` schluckt Embedding-Service-Fehler → RAG läuft mit leeren Quellen → LLM halluziniert.
- Fix: `throw new ServiceUnavailableError('Embedding-Service nicht erreichbar', { code: 'EMBEDDING_DOWN' })`. Frontend zeigt: „RAG ist gerade nicht verfügbar, Antwort ohne Knowledge".

### 4.8 RAG: Indexer-Zombie-State (P1)

**Files:**

- `services/document-indexer/database.py` — `recover_stuck_processing()` läuft nur beim Start.
- Fix: zusätzlich periodischer Watchdog (alle 5 min): Docs in `processing` älter als 30 min → `pending` mit `attempt_count++`. Bei `attempt_count > 3` → `failed` mit Detail-Error.
- Frontend: `apps/dashboard-frontend/src/features/documents/` zeigt für `failed`-Docs einen „🔁 Re-Index"-Button.

### 4.9 RAG: Re-Index bei Embedding-Modell-Wechsel (P1)

**Problem:** Wenn `EMBEDDING_MODEL` ENV gewechselt wird, sind alte Vektoren falsch. Aktuell: kein automatischer Trigger.

**Files:**

- `services/document-indexer/api_server.py` — beim Boot: vergleiche `EMBEDDING_MODEL` ENV mit `embedding_model_used` in `documents` Tabelle (neue Spalte).
- Bei Mismatch: warne im Log, biete `POST /reindex-all?from_model=X&to_model=Y`.
- Frontend: Settings-Tab „RAG / Knowledge" → Banner „Embedding-Modell hat sich geändert. 1240 Dokumente müssen neu indiziert werden. [Re-Index starten]".

---

## Phase 5 — Security & Compliance (P0/P1)

### 5.1 JWT-Auth aus Query-Params raus (P1, Defense-in-Depth)

**Files:**

- `apps/dashboard-backend/src/index.js:596-607` — WS-Auth via Cookie statt Query-Param.
- `apps/dashboard-frontend/src/contexts/chat/useChatStreaming.ts:143` — kein `?token=` in URL.

**Pattern:** Login setzt HttpOnly+Secure+SameSite=Strict Cookie `arasul_session`. WS-Server liest aus `req.headers.cookie`.

### 5.2 Prompt-Logging DSGVO-konform (P0)

**Files:**

- `apps/dashboard-backend/src/services/rag/ragMetrics.js` — `logRagQuery()`: nicht `query_text` speichern, nur Hash + Länge + Sprache + Latenz.
- `services/postgres/init/084_rag_log_privacy.sql` (neu) — `rag_query_log.query_text` → nullable, Migration löscht Bestand älter 7 Tage, fügt `query_hash VARCHAR(64), query_length INTEGER, query_language VARCHAR(8)` hinzu.
- Cron-Job (existiert in `audit_logs` Tabelle, Pattern übernehmen): TTL 24h für `rag_query_log`.

### 5.3 API-Key Rate-Limit pro Key (P1)

**File:** `apps/dashboard-backend/src/middleware/apiKeyAuth.js:14-16, 126-147`

- Map-Key heute: `keyPrefix` → bei Multi-Key auf gleicher IP umgehbar.
- Fix: Map-Key = `apiKeyId`. Persistierung in PG (Tabelle `api_key_rate_window(key_id, window_start, count)`) damit Restart nicht Limits resettet.

### 5.4 `allowedEndpoints: ['*']` ablehnen (P1)

**File:** `apps/dashboard-backend/src/routes/external/externalApi.js:289`

- Beim Key-Create: Validation `if (allowed_endpoints.includes('*')) throw ValidationError('Wildcard nicht erlaubt')`.
- Bestehende Wildcard-Keys: Migration `085_revoke_wildcard_keys.sql` markiert sie als `requires_review`.

### 5.5 Model-Name + Query-Length Validation (P1)

**Files:**

- `apps/dashboard-backend/src/services/llm/modelService.js` — Regex `/^[a-z0-9][a-z0-9:._/-]*[a-z0-9]$/i` für `pull`/`activate`/`delete` Model-Namen.
- `apps/dashboard-backend/src/routes/rag.js:70` und `apps/dashboard-backend/src/routes/llm.js:30-50` — `query.length > 8000` → `ValidationError`.

### 5.6 Datenschutzerklärung + Recht auf Löschung (P0 für DSGVO)

**Files:**

- `apps/dashboard-frontend/src/pages/Privacy.tsx` (neu) — `/datenschutz` Route.
- `apps/dashboard-backend/src/routes/admin/gdpr.js` (existiert!) — Endpoint ergänzen: `DELETE /api/admin/gdpr/me` → löscht `chat_messages`, `rag_query_log` (User-Hash), `audit_logs` für eigene `user_id`.

### 5.7 Container-Volume Hardening (P2)

**File:** `compose/compose.ai.yaml:66-71`

- `arasul-llm-models`-Volume aktuell read-write für Ollama-Container — wenn Ollama compromised, kann Modelle ersetzen.
- Optional: Snapshots via systemd-Timer + immutable Marker.

---

## Phase 6 — Observability & Self-Healing (P0/P1)

### 6.1 Winston File-Transport mit Rotation (P0)

**Problem:** Logs nur Console → bei Restart weg.

**File:** `apps/dashboard-backend/src/utils/logger.js`

- `winston-daily-rotate-file` als zusätzlicher Transport.
- Pfad: `/app/logs/backend-%DATE%.log`, 14d Retention, 50MB max.
- Volume in `compose/compose.app.yaml` mounten.

### 6.2 Service-spezifische Error-Klassen (P1)

**File:** `apps/dashboard-backend/src/utils/errors.js:15-104`

- Ergänzen: `OllamaUnavailableError`, `EmbeddingFailedError`, `QdrantUnavailableError`, `OOMError`, `DiskFullError`, `ModelNotLoadedError` — alle mit `code`-Property.
- Routes: bestehende `ServiceUnavailableError`-Aufrufe migrieren.

### 6.3 Circuit Breaker für externe Calls (P1)

**Datei (neu):** `apps/dashboard-backend/src/utils/circuitBreaker.js`

- Pattern: nach 5 Fehlern in 30 s → Circuit `open` für 60 s, returnt sofort `503 ServiceUnavailableError`.
- Apply: Ollama-Client, Qdrant-Client, Embedding-Client.

### 6.4 Error-Localization-Layer (P0)

**Problem:** Backend gibt `"Service temporarily unavailable"` (Englisch) → Frontend rendert Englisch an deutschen User.

**Pattern:**

- Backend: Error → JSON `{ code: 'OLLAMA_UNAVAILABLE', message: 'fallback EN', detail: {...} }`.
- Frontend: `apps/dashboard-frontend/src/lib/errorMessages.ts` (neu) — `translateError(code, locale='de')` mit Map. Toast/ErrorBoundary nutzt das.

### 6.5 Retry-Interceptor (P1)

**File:** `apps/dashboard-backend/src/services/` (neu: `httpClient.js`)

- Axios-Wrapper mit Retry: 2 Attempts, exponential 200 ms / 800 ms, jitter ±25%, nur für idempotente GETs (oder explizit retryable POSTs wie embedding).

### 6.6 Health/Readiness Endpoints (P1)

**Files:**

- `apps/dashboard-backend/src/routes/system/health.js` — `/api/health` (alive) + `/api/readiness` (alle Deps OK: PG, Ollama, Qdrant, MinIO).
- `compose/compose.app.yaml` — Docker `healthcheck` darauf umstellen.

---

## Phase 7 — Testing (P0/P1)

Coverage-Lücken aus Audit 14:

### 7.1 P0-Tests (vor Auslieferung)

| Test-Datei                                   | Was wird getestet                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `unit/modelDownloadRecovery.test.js`         | Crash mid-pull → Boot-Recovery → Resume bytes-akkurat                       |
| `unit/streamingCancellation.test.js`         | SSE Client-Disconnect → Server cleanup, kein RAM-Leak                       |
| `unit/hardwareGuards.test.js`                | RAM/Disk-Pre-Checks vor Download/Activate                                   |
| `unit/ollamaDownGracefulDegradation.test.js` | `GET /models/catalog` ohne Ollama → 200 mit Cache, Health-Endpoints korrekt |
| `unit/openaiCompat.test.js`                  | `/v1/chat/completions`, `/v1/embeddings`, `/v1/models` Format-Konformität   |
| `integration/n8nFullFlow.test.js`            | n8n-Container HTTP-Node → API-Key-Auth → LLM-Chat → OpenAI-Format-Response  |

### 7.2 P1-Tests

- Frontend: `Store.integration.test.tsx` mit MSW — Cache-Konsistenz Store/Dashboard, optimistic Delete + Rollback.
- `unit/embeddingExceptionPropagation.test.js` — RAG-Query bei totem Embedding-Service.
- `unit/rateLimitPerKey.test.js` — 2 API-Keys auf 1 IP → unabhängige Limits.

---

## Reihenfolge & Aufwand-Schätzung

| Phase                             | Aufwand (Solo-Dev) | Block für Auslieferung?                |
| --------------------------------- | ------------------ | -------------------------------------- |
| **0 — Download-Persistenz**       | 3–4 Tage           | **Ja**                                 |
| **1 — State-Konsistenz Frontend** | 2 Tage             | **Ja**                                 |
| **2 — Hardware-Awareness**        | 2 Tage             | **Ja** (UX-kritisch)                   |
| **3 — n8n-Integration**           | 3 Tage             | **Ja**                                 |
| **4 — Chat/RAG-Robustheit**       | 4–5 Tage           | **Ja** (4.1, 4.2, 4.7); Rest soft      |
| **5 — Security/DSGVO**            | 2–3 Tage           | **Ja** (5.2, 5.6 für DSGVO); Rest soft |
| **6 — Observability**             | 2 Tage             | **Ja** (6.1, 6.4); Rest soft           |
| **7 — Tests**                     | 3 Tage             | Parallel zu allen Phasen               |

**Gesamt P0-Pfad:** ~17–20 Tage Solo-Dev-Arbeit zur Auslieferung als kommerzielles Produkt.

---

## Was wir explizit NICHT machen (out of scope)

- Multi-Tenancy / Workspaces — Plattform ist Single-Box-Appliance.
- OpenAI-Compat für alle Endpoints (nur Chat/Embedding/Models).
- mTLS zwischen Containern (Phase 5.7 nur als optionales Item).
- Knowledge-Graph-Visualisierung (Audit 4 schlug es vor — ist nice-to-have, kein Blocker).
- Chunk-Strategie konfigurierbar im UI (Audit 4 — Power-User-Feature).
- Web/Mobile-Layout-Optimierungen über das hinaus, was 2.x ohnehin ändert.

---

## Anhang: Findings nach Severity (Volltext-Index)

### P0 (alle vor Auslieferung beheben)

1. **Download persistiert nicht in Bytes** — `services/postgres/init/011_llm_models_schema.sql:42-43`, `services/llm/modelDownloadHelpers.js:240-266` → Phase 0
2. **Re-Download nach Crash blockiert** — `services/llm/modelService.js:483` → Phase 0.2
3. **TOCTOU Race in Download-Claim** — `services/llm/modelService.js:476-486` → Phase 0.2
4. **Inactivity-Timeout setzt status='error' statt 'paused'** — `contexts/DownloadContext.tsx:282-290` → Phase 0.4
5. **Cache-Isolation Store ↔ Dashboard ↔ Chat** — `features/store/hooks/queryKeys.ts`, `contexts/chat/useChatModels.ts:86-101` → Phase 1.1
6. **canLoadModel() nirgends aufgerufen** — `hooks/useModelStatus.ts:254-256` → Phase 2.1
7. **Ollama-Health nicht vor Enqueue geprüft** — `routes/llm.js:30-50` → Phase 4.1
8. **Cancel-Race auf Folge-Chat** — `features/chat/components/ChatInputArea.tsx:347-349` → Phase 4.2
9. **Embedding-Fehler silent in RAG** — `services/rag/ragCore.js:191` → Phase 4.7
10. **n8n-Doku statisch in falscher Section** — `features/settings/components/N8nIntegrationGuide.tsx`, `GeneralSettings.tsx:159` → Phase 3.1/3.2
11. **OpenAI-Compat-Endpoints fehlen** — kein `/v1/chat/completions` → Phase 3.3
12. **Prompt-Logging in DB ohne TTL** — `services/rag/ragMetrics.js`, `init/076_*.sql` → Phase 5.2
13. **Datenschutzerklärung + GDPR-Delete fehlen** — `routes/admin/gdpr.js` (existiert), kein Frontend → Phase 5.6
14. **Logs nicht persistent** — `utils/logger.js` → Phase 6.1
15. **Error-Messages auf Englisch beim deutschen User** — `middleware/errorHandler.js:60,83,90` → Phase 6.4

### P1 (vor 1. Major-Release)

16. **State-Drift bei externem `ollama pull`** — `services/llm/modelSyncHelpers.js:63-92` → Phase 0.3
17. **Delete während Activate Race** — `services/llm/modelService.js:610-677` vs `:763-850` → Phase 0
18. **Request-Counter-Leak (modell wird nie unloaded)** — `services/llm/ollamaReadiness.js:293-307` → Phase 6
19. **Memory-Eviction Cascade-Unload-Bug** — `services/llm/modelService.js:128-140` → Phase 2.4
20. **JWT in WS-Query-Param** — `index.js:596-607`, `useChatStreaming.ts:143` → Phase 5.1
21. **API-Key Rate-Limit pro IP statt pro Key** — `middleware/apiKeyAuth.js:126-147` → Phase 5.3
22. **`allowedEndpoints: ['*']` möglich** — `middleware/apiKeyAuth.js:215`, `routes/external/externalApi.js:289` → Phase 5.4
23. **Model-Name + Query-Length nicht validiert** — `routes/rag.js:70`, `routes/llm.js` → Phase 5.5
24. **Token-Batching global** — `hooks/useTokenBatching.ts` → Phase 4.3
25. **Context-Window 32K hardcoded, kein Pruning** — `contexts/chat/useChatStreaming.ts:393` → Phase 4.4
26. **SSE Auto-Reconnect nicht implementiert** — `contexts/chat/useChatStreaming.ts` → Phase 4.5
27. **Chat-Stream-Persistence fehlt** — Job-Table `last_seq` → Phase 4.6
28. **Indexer-Zombie-State bei OOM** — `services/document-indexer/database.py` → Phase 4.8
29. **Re-Index bei Embedding-Modell-Wechsel manuell** — `services/document-indexer/api_server.py` → Phase 4.9
30. **Disk-Live-Anzeige fehlt im Frontend** → Phase 2.2
31. **Power-Mode (MAXN/30W/15W) ignoriert** — `scripts/setup/detect-jetson.sh`, `utils/hardware.js` → Phase 2.3
32. **LRU-Eviction stumm** — `services/llm/modelService.js:128-140` → Phase 2.4
33. **Service-spezifische Error-Klassen fehlen** — `utils/errors.js:15-104` → Phase 6.2
34. **Circuit Breaker fehlt** → Phase 6.3
35. **Retry-Interceptor fehlt für externe Calls** → Phase 6.5
36. **/api/health + /api/readiness fehlen** → Phase 6.6
37. **Delete-Confirmation in StoreHome fehlt** — `features/store/components/StoreHome.tsx:186` → Phase 1.4
38. **FK fehlt: `llm_jobs.requested_model` → `llm_installed_models`** — Phase 0.1
39. **Indexes fehlen** (`chat_messages(conversation_id, role)`, `documents(space_id, status)`, etc.) — separate Migration in Phase 0.1

### P2 (Tech-Debt / Quality-of-Life)

- Search im Store fehlt (Hook `useStoreSearchQuery` existiert, ungenutzt)
- Optimistic-Delete in Store-Mutations
- Multi-Tab WS-Coordination (BroadcastChannel)
- Chunking-Strategie nicht UI-konfigurierbar
- Knowledge-Graph nicht im UI sichtbar
- Toast-System nicht standardisiert (heute: ad-hoc)
- Request-ID nicht in Logger-Context
- Container-zu-Container TLS / Volume-Hardening
- `chat_messages.token_count` Spalte für Token-Accounting
- CSS-Variablen-Konsistenz in `DownloadProgress.tsx` / `ActivationButton.tsx`
- Retry/Backoff-Jitter-Spread für „Thundering Herd"-Schutz

---

**Source-Audits:** 14 Sub-Agent-Reports vom 2026-04-26, archiviert in der Konversation, die diesen Plan generiert hat.
