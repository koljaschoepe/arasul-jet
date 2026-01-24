# KI-System Optimierungsplan: Model Store & AI Chat

**Erstellt:** 2026-01-24
**Autor:** Claude Code
**Status:** Draft - Zur Genehmigung

---

## Executive Summary

Nach umfassender Analyse des KI Modelle Stores und AI Chats wurden **15 Verbesserungsbereiche** identifiziert. Diese sind priorisiert nach:
- **P1 (Kritisch):** Verhindert Datenverlust oder System-Deadlocks
- **P2 (Hoch):** Verbessert Zuverlässigkeit erheblich
- **P3 (Mittel):** UX-Verbesserungen und Edge-Case-Handling
- **P4 (Niedrig):** Nice-to-have Optimierungen

---

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React 18)                          │
│  ModelStore.js          ChatMulti.js                            │
│  - Katalog & Downloads  - Chat UI                               │
│  - Aktivierung          - Think/RAG Modes                       │
│  - Standard-Modell      - Model Selection                       │
└──────────────┬──────────────────┬──────────────────┬────────────┘
               │                  │                  │
    ┌──────────▼──────────┐  ┌────▼──────────┐  ┌───▼────────────┐
    │ /api/models/*       │  │ /api/llm/*    │  │ /api/rag/*     │
    │ Model Management    │  │ Chat Queue    │  │ RAG Query      │
    └────────────┬────────┘  └────┬──────────┘  └───┬────────────┘
                 │                 │                 │
    ┌────────────▼─────────────────▼─────────────────▼─────────────┐
    │                 Dashboard Backend                            │
    │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
    │  │ modelService.js │  │llmQueueService.js│  │llmJobService │ │
    │  └────────┬────────┘  └────────┬────────┘  └──────────────┘ │
    └───────────┼─────────────────────┼────────────────────────────┘
                │                     │
    ┌───────────▼─────────────────────▼────────────────────────────┐
    │  Ollama (LLM Service)    │    Qdrant (Vector DB)            │
    └──────────────────────────┴───────────────────────────────────┘
```

---

## Identifizierte Probleme & Lösungen

### P1-001: Disk Space Check vor Download

**Problem:**
Aktuell wird ein Model-Download gestartet ohne zu prüfen, ob genügend Speicherplatz vorhanden ist. Bei großen Modellen (40GB+) kann dies zu einem unvollständigen Download und korruptem Zustand führen.

**Betroffene Dateien:**
- `services/dashboard-backend/src/services/modelService.js:120-298`
- `services/dashboard-backend/src/routes/models.js:89-124`

**Lösung:**
```javascript
// In modelService.js - downloadModel()
async downloadModel(modelId, progressCallback = null) {
    // NEU: Disk Space Check
    const modelInfo = await this.getModelInfo(modelId);
    const requiredSpace = modelInfo.size_bytes * 1.5; // 50% Buffer

    const diskInfo = await this.getDiskSpace();
    if (diskInfo.free < requiredSpace) {
        throw new Error(`Nicht genügend Speicherplatz. Benötigt: ${formatBytes(requiredSpace)}, Verfügbar: ${formatBytes(diskInfo.free)}`);
    }
    // ... rest of download logic
}

async getDiskSpace() {
    // Use 'df' command for Docker container
    const { stdout } = await execAsync("df -B1 /data | tail -1 | awk '{print $4}'");
    return { free: parseInt(stdout.trim()) };
}
```

**Aufwand:** 2h | **Risiko:** Niedrig

---

### P1-002: Inaktivitäts-Timeout für Streaming Jobs

**Problem:**
Wenn Ollama während eines Streams hängt (z.B. GPU-Fehler), bleibt der Job im Status `streaming` hängen. Der Queue-Service wartet unendlich und blockiert alle weiteren Anfragen.

**Betroffene Dateien:**
- `services/dashboard-backend/src/services/llmQueueService.js:555-577`

**Status:** ✅ BEREITS IMPLEMENTIERT (TIMEOUT-001)
- 2-Minuten Inaktivitäts-Timeout vorhanden
- Job wird automatisch abgebrochen bei Inaktivität
- Benachrichtigung an Subscribers erfolgt

**Empfehlung:** Timeout erhöhen auf 5 Minuten für sehr große Modelle (70B+)

---

### P1-003: Stream-End ohne Done-Signal

**Problem:**
Wenn Ollama den Stream ohne `done: true` Signal schließt, bleibt der Job im Streaming-Status hängen.

**Betroffene Dateien:**
- `services/dashboard-backend/src/services/llmQueueService.js:690-715`

**Status:** ✅ BEREITS IMPLEMENTIERT (QUEUE-001)
- `response.data.on('end')` Handler vorhanden
- Automatische Job-Completion wenn Stream endet
- Verhindert permanenten Deadlock

---

### P2-001: Think Mode Kompatibilität pro Modell

**Problem:**
Nicht alle Modelle unterstützen `<think>...</think>` Tags. Wenn ein Modell Think-Mode nicht unterstützt, werden die Tags als normaler Text ausgegeben.

**Betroffene Dateien:**
- `services/dashboard-backend/src/services/llmQueueService.js:388-441`
- `services/postgres/init/011_llm_models_schema.sql`
- `services/dashboard-frontend/src/components/ChatMulti.js`

**Lösung:**
```sql
-- Migration: 029_add_thinking_support.sql
ALTER TABLE llm_model_catalog
ADD COLUMN IF NOT EXISTS supports_thinking BOOLEAN DEFAULT false;

-- Bekannte Modelle mit Think-Support
UPDATE llm_model_catalog SET supports_thinking = true
WHERE id IN ('qwen3:7b-q8', 'qwen3:14b-q8', 'qwen3:32b-q4');
```

```javascript
// Frontend: ChatMulti.js - Warnung anzeigen
{useThinking && selectedModelSupportsThinking === false && (
    <div className="thinking-warning">
        <FiAlertCircle />
        Dieses Modell unterstützt Think-Mode möglicherweise nicht optimal.
    </div>
)}
```

```javascript
// Backend: llmQueueService.js
async processChatJob(job) {
    const { thinking } = job.request_data;

    // Check model capability
    const modelInfo = await modelService.getModelInfo(job.requested_model);
    const enableThinking = thinking && modelInfo?.supports_thinking !== false;
    // ...
}
```

**Aufwand:** 3h | **Risiko:** Niedrig

---

### P2-002: Model-Validierung nach Download

**Problem:**
Nach einem erfolgreichen Download wird nicht geprüft, ob das Modell tatsächlich in Ollama verfügbar ist und korrekt funktioniert.

**Betroffene Dateien:**
- `services/dashboard-backend/src/services/modelService.js:230-260`

**Lösung:**
```javascript
// In modelService.js - nach erfolgreichem Download
response.data.on('end', async () => {
    // Verify model is actually available
    const isAvailable = await this.validateModelAvailability(modelId);

    if (!isAvailable.available) {
        await database.query(
            `UPDATE llm_installed_models
             SET status = 'error', error_message = $1
             WHERE id = $2`,
            ['Download erfolgreich, aber Modell nicht in Ollama verfügbar. Bitte neu herunterladen.', modelId]
        );
        reject(new Error('Model verification failed'));
        return;
    }

    // Test with minimal prompt
    try {
        await axios.post(`${LLM_SERVICE_URL}/api/generate`, {
            model: ollamaName,
            prompt: 'Hi',
            stream: false,
            options: { num_predict: 1 }
        }, { timeout: 300000 });
    } catch (testError) {
        await database.query(
            `UPDATE llm_installed_models
             SET status = 'error', error_message = $1
             WHERE id = $2`,
            ['Modell kann nicht geladen werden. GPU-Speicher möglicherweise nicht ausreichend.', modelId]
        );
        reject(new Error('Model load test failed'));
        return;
    }

    // Success!
    await database.query(`UPDATE llm_installed_models SET status = 'available' ...`);
});
```

**Aufwand:** 2h | **Risiko:** Mittel (könnte Ladezeit erhöhen)

---

### P2-003: RAG-optimierte Modelle empfehlen

**Problem:**
Benutzer können jedes Modell für RAG-Anfragen verwenden, aber einige Modelle sind besser für RAG geeignet als andere (z.B. Qwen3-14B vs DeepSeek-Coder).

**Betroffene Dateien:**
- `services/dashboard-frontend/src/components/ChatMulti.js:1553-1632`
- `services/postgres/init/011_llm_models_schema.sql`

**Lösung:**
```sql
-- Bereits vorhanden: recommended_for JSONB column
-- Models mit 'rag' in recommended_for sind RAG-optimiert:
-- qwen3:7b-q8, qwen3:14b-q8, qwen3:32b-q4
```

```javascript
// ChatMulti.js - Model Dropdown mit Hinweis
{useRAG && !model.recommended_for?.includes('rag') && (
    <span className="model-hint" title="Dieses Modell ist nicht für RAG optimiert">
        <FiInfo style={{ color: '#F59E0B' }} />
    </span>
)}
```

**Aufwand:** 1h | **Risiko:** Niedrig

---

### P2-004: Queue Position Race Condition

**Problem:**
Bei Burst-Traffic (mehrere gleichzeitige Anfragen) können Race Conditions bei der Queue-Position-Vergabe auftreten.

**Betroffene Dateien:**
- `services/dashboard-backend/src/services/llmQueueService.js:148-196`
- `services/postgres/init/006_llm_jobs_schema.sql`

**Status:** ✅ TEILWEISE GELÖST
- `get_next_queue_position()` Funktion verwendet `FOR UPDATE SKIP LOCKED`
- Burst-Traffic Konfiguration vorhanden (BURST_WINDOW_MS)

**Empfehlung:** Zusätzliche Mutex-Logik in Node.js:
```javascript
const queueMutex = new Mutex();

async enqueue(...) {
    const release = await queueMutex.acquire();
    try {
        // Position berechnen und Job erstellen
    } finally {
        release();
    }
}
```

**Aufwand:** 2h | **Risiko:** Mittel

---

### P2-005: RAM-Verfügbarkeits-Check vor Modell-Aktivierung

**Problem:**
Vor dem Laden eines Modells in den RAM wird nicht geprüft, ob genügend GPU-Speicher verfügbar ist.

**Betroffene Dateien:**
- `services/dashboard-backend/src/services/modelService.js:413-513`

**Lösung:**
```javascript
// In modelService.js - activateModel()
async activateModel(modelId, triggeredBy = 'user') {
    // NEU: RAM Check
    const modelInfo = await this.getModelInfo(modelId);
    const requiredRam = modelInfo.ram_required_gb * 1024; // in MB

    const gpuInfo = await this.getGpuMemory();

    if (gpuInfo.free_mb < requiredRam * 1.1) { // 10% Buffer
        throw new Error(
            `Nicht genügend GPU-Speicher. Benötigt: ${modelInfo.ram_required_gb}GB, ` +
            `Verfügbar: ${(gpuInfo.free_mb / 1024).toFixed(1)}GB. ` +
            `Bitte erst das aktuelle Modell entladen.`
        );
    }
    // ... rest of activation
}

async getGpuMemory() {
    try {
        const { stdout } = await execAsync(
            "nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits"
        );
        return { free_mb: parseInt(stdout.trim()) };
    } catch {
        return { free_mb: 64000 }; // Fallback for Jetson
    }
}
```

**Aufwand:** 2h | **Risiko:** Niedrig

---

### P2-006: Model Switch Retry-Logik

**Problem:**
Wenn ein Model-Switch fehlschlägt (z.B. temporärer Timeout), wird der Job sofort als Fehler markiert, ohne Retry.

**Betroffene Dateien:**
- `services/dashboard-backend/src/services/llmQueueService.js:306-340`

**Lösung:**
```javascript
// In processNext() - Model Switch mit Retry
const MAX_SWITCH_RETRIES = 2;
let switchAttempt = 0;

while (switchAttempt < MAX_SWITCH_RETRIES) {
    try {
        await modelService.activateModel(requested_model, 'queue');
        this.emit('model:switched', { model: requested_model });
        break; // Success
    } catch (switchError) {
        switchAttempt++;

        if (switchAttempt < MAX_SWITCH_RETRIES) {
            logger.warn(`Model switch attempt ${switchAttempt} failed, retrying in 5s...`);
            await new Promise(r => setTimeout(r, 5000));
        } else {
            // Final failure - error the job
            await llmJobService.errorJob(jobId, userMessage);
            this.notifySubscribers(jobId, { error: userMessage, done: true });
            // ...
        }
    }
}
```

**Aufwand:** 1h | **Risiko:** Niedrig

---

### P3-001: Modell-Aktivierungs-Fortschritt anzeigen

**Problem:**
Das Laden großer Modelle (70B) kann 5-10 Minuten dauern. Der Benutzer sieht nur einen Spinner ohne Fortschrittsanzeige.

**Betroffene Dateien:**
- `services/dashboard-frontend/src/components/ModelStore.js:133-180`
- `services/dashboard-backend/src/routes/models.js:144-160`

**Lösung:**
```javascript
// Backend: SSE Endpoint für Aktivierungs-Fortschritt
router.post('/:modelId/activate', requireAuth, async (req, res) => {
    if (req.query.stream === 'true') {
        res.setHeader('Content-Type', 'text/event-stream');

        // Simulate progress based on model size
        const modelInfo = await modelService.getModelInfo(modelId);
        const estimatedTime = modelInfo.ram_required_gb * 10; // ~10s per GB

        let progress = 0;
        const interval = setInterval(() => {
            progress = Math.min(progress + 5, 95);
            res.write(`data: ${JSON.stringify({ progress, status: 'loading' })}\n\n`);
        }, estimatedTime * 50);

        try {
            await modelService.activateModel(modelId, 'user');
            clearInterval(interval);
            res.write(`data: ${JSON.stringify({ progress: 100, status: 'complete' })}\n\n`);
            res.end();
        } catch (err) {
            clearInterval(interval);
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
        }
    } else {
        // Non-streaming (existing behavior)
    }
});
```

**Aufwand:** 3h | **Risiko:** Niedrig

---

### P3-002: Think Mode UI Verbesserung

**Problem:**
Der Think-Block wird während des Streamings angezeigt und dann automatisch collapsed. Der Übergang ist abrupt.

**Betroffene Dateien:**
- `services/dashboard-frontend/src/components/ChatMulti.js:1363-1379`
- `services/dashboard-frontend/src/chatmulti.css`

**Lösung:**
```css
/* chatmulti.css - Smooth transition */
.thinking-block {
    max-height: 500px;
    transition: max-height 0.5s ease-out, opacity 0.3s ease-out;
}

.thinking-block.collapsed {
    max-height: 40px;
    overflow: hidden;
}

.thinking-block.collapsing {
    max-height: 40px;
    opacity: 0.8;
}
```

```javascript
// ChatMulti.js - Delayed collapse with animation
if (data.type === 'thinking_end') {
    // Add collapsing class for animation
    setMessages(prev => {
        const updated = [...prev];
        if (updated[assistantMessageIndex]) {
            updated[assistantMessageIndex] = {
                ...updated[assistantMessageIndex],
                thinkingCollapsing: true
            };
        }
        return updated;
    });

    // After animation, actually collapse
    setTimeout(() => {
        setMessages(prev => {
            const updated = [...prev];
            if (updated[assistantMessageIndex]) {
                updated[assistantMessageIndex] = {
                    ...updated[assistantMessageIndex],
                    thinkingCollapsing: false,
                    thinkingCollapsed: true
                };
            }
            return updated;
        });
    }, 500);
}
```

**Aufwand:** 2h | **Risiko:** Niedrig

---

### P3-003: RAG Space Matching Feedback

**Problem:**
Beim Auto-Routing werden die gematchten Spaces nicht deutlich genug im UI angezeigt.

**Betroffene Dateien:**
- `services/dashboard-frontend/src/components/ChatMulti.js:857-879`
- `services/dashboard-frontend/src/chatmulti.css`

**Status:** ✅ TEILWEISE IMPLEMENTIERT
- `matched_spaces` Event wird empfangen und gespeichert
- Spaces werden in der Nachricht gespeichert

**Empfehlung:** Bessere UI-Darstellung:
```javascript
// Nach dem RAG-Response, zeige Matched Spaces an
{message.matchedSpaces && message.matchedSpaces.length > 0 && (
    <div className="matched-spaces">
        <span className="matched-label">Durchsuchte Bereiche:</span>
        {message.matchedSpaces.map(space => (
            <span key={space.id} className="matched-space-chip">
                <FiFolder style={{ color: space.color }} />
                {space.name}
                <span className="space-score">{(space.score * 100).toFixed(0)}%</span>
            </span>
        ))}
    </div>
)}
```

**Aufwand:** 2h | **Risiko:** Niedrig

---

### P3-004: Automatische Modell-Synchronisation

**Problem:**
Wenn Modelle manuell aus Ollama entfernt werden (z.B. über CLI), ist die DB nicht mehr synchron.

**Betroffene Dateien:**
- `services/dashboard-backend/src/services/modelService.js:644-718`
- `services/dashboard-backend/src/index.js`

**Lösung:**
```javascript
// In index.js - Periodische Sync
setInterval(async () => {
    try {
        await modelService.syncWithOllama();
    } catch (err) {
        logger.error('Auto-sync failed:', err.message);
    }
}, 5 * 60 * 1000); // Alle 5 Minuten

// Auch bei Backend-Start
modelService.syncWithOllama().then(() => {
    logger.info('Initial Ollama sync completed');
});
```

**Aufwand:** 30min | **Risiko:** Niedrig

---

### P3-005: Error-Handling bei Modell nicht im Registry

**Problem:**
Wenn ein Modell nicht in der Ollama-Registry gefunden wird, ist die Fehlermeldung technisch und unklar.

**Betroffene Dateien:**
- `services/dashboard-backend/src/services/modelService.js:276-297`

**Status:** ✅ BEREITS IMPLEMENTIERT
- User-friendly Fehlermeldungen vorhanden
- `Model "${ollamaName}" nicht in Ollama Registry gefunden`
- `LLM-Service nicht erreichbar`
- `Download-Timeout`
- `Nicht genügend Speicherplatz`

---

### P4-001: Model Download Parallel zu anderen Operationen

**Problem:**
Während ein Modell heruntergeladen wird, kann der Benutzer keine anderen Modelle aktivieren.

**Betroffene Dateien:**
- `services/dashboard-frontend/src/contexts/DownloadContext.js`

**Status:** ✅ BEREITS IMPLEMENTIERT
- Downloads laufen im DownloadContext (global)
- Aktivierung anderer Modelle ist möglich
- Navigation weg von ModelStore unterbricht Download nicht

---

### P4-002: Model Performance Metriken

**Problem:**
Es gibt keine Metriken zur tatsächlichen Performance der Modelle (Tokens/s, Latenz).

**Lösung:**
```javascript
// In llmQueueService.js - streamFromOllama()
let tokenCount = 0;
const streamStartTime = Date.now();

// Bei jedem Token
tokenCount++;

// Bei Completion
const totalTime = (Date.now() - streamStartTime) / 1000;
const tokensPerSecond = tokenCount / totalTime;

// Speichern für Analytics
await database.query(`
    INSERT INTO model_performance_metrics
    (model_id, tokens_generated, duration_seconds, tokens_per_second)
    VALUES ($1, $2, $3, $4)
`, [catalogModelId, tokenCount, totalTime, tokensPerSecond]);
```

**Aufwand:** 3h | **Risiko:** Niedrig

---

### P4-003: Favorite Models Feature

**Problem:**
Benutzer müssen jedes Mal das Dropdown öffnen, um ihr bevorzugtes Modell auszuwählen.

**Lösung:**
- Sternchen-Icon neben Modell im Dropdown
- Favoriten werden oben in der Liste angezeigt
- localStorage für Persistenz

**Aufwand:** 2h | **Risiko:** Niedrig

---

## Zusammenfassung der Prioritäten

| ID | Beschreibung | Priorität | Aufwand | Status |
|----|--------------|-----------|---------|--------|
| P1-001 | Disk Space Check vor Download | P1 | 2h | TODO |
| P1-002 | Inaktivitäts-Timeout | P1 | - | ✅ Implementiert |
| P1-003 | Stream-End ohne Done | P1 | - | ✅ Implementiert |
| P2-001 | Think Mode pro Modell | P2 | 3h | TODO |
| P2-002 | Model-Validierung nach Download | P2 | 2h | TODO |
| P2-003 | RAG-Modell Empfehlungen | P2 | 1h | TODO |
| P2-004 | Queue Race Condition | P2 | 2h | TEILWEISE |
| P2-005 | RAM-Check vor Aktivierung | P2 | 2h | TODO |
| P2-006 | Model Switch Retry | P2 | 1h | TODO |
| P3-001 | Aktivierungs-Fortschritt | P3 | 3h | TODO |
| P3-002 | Think Mode UI Animation | P3 | 2h | TODO |
| P3-003 | RAG Space Matching UI | P3 | 2h | TEILWEISE |
| P3-004 | Auto-Sync mit Ollama | P3 | 30min | TODO |
| P3-005 | Bessere Error-Meldungen | P3 | - | ✅ Implementiert |
| P4-001 | Parallele Downloads | P4 | - | ✅ Implementiert |
| P4-002 | Performance Metriken | P4 | 3h | TODO |
| P4-003 | Favorite Models | P4 | 2h | TODO |

---

## Empfohlene Implementierungsreihenfolge

### Phase 1: Kritische Fixes (1-2 Tage)
1. P1-001: Disk Space Check
2. P2-005: RAM-Check vor Aktivierung
3. P2-006: Model Switch Retry

### Phase 2: Zuverlässigkeit (2-3 Tage)
1. P2-001: Think Mode Kompatibilität
2. P2-002: Model-Validierung
3. P2-003: RAG-Modell Empfehlungen
4. P3-004: Auto-Sync mit Ollama

### Phase 3: UX Verbesserungen (2-3 Tage)
1. P3-001: Aktivierungs-Fortschritt
2. P3-002: Think Mode UI Animation
3. P3-003: RAG Space Matching UI

### Phase 4: Nice-to-have (Optional)
1. P4-002: Performance Metriken
2. P4-003: Favorite Models

---

## Test-Matrix

| Szenario | Think Mode | RAG Mode | Erwartetes Verhalten |
|----------|------------|----------|----------------------|
| Qwen3:7b + Think ON | ✅ | ❌ | Think-Block angezeigt |
| Qwen3:7b + Think OFF | ❌ | ❌ | Kein Think-Block |
| Qwen3:14b + RAG + Think | ✅ | ✅ | Sources + Think angezeigt |
| DeepSeek-Coder + Think | ⚠️ | ❌ | Warnung anzeigen |
| Llama3.1:70b + Think | ⚠️ | ❌ | Warnung + lange Ladezeit |
| Modell nicht in Ollama | - | - | Klare Fehlermeldung |
| Download bei vollem Disk | - | - | Fehler VOR Download |
| Modellwechsel während Stream | - | - | Vorherige Anfrage wird fertig |

---

## Appendix: Relevante Dateien

```
services/dashboard-frontend/
├── src/components/
│   ├── ChatMulti.js         # 1669 Zeilen - Chat UI
│   └── ModelStore.js        # 530 Zeilen - Model Management
├── src/contexts/
│   └── DownloadContext.js   # Global Download State

services/dashboard-backend/
├── src/routes/
│   ├── llm.js               # 431 Zeilen - Chat Queue API
│   ├── rag.js               # 623 Zeilen - RAG Query API
│   └── models.js            # 239 Zeilen - Model Management API
├── src/services/
│   ├── modelService.js      # 781 Zeilen - Model Logic
│   ├── llmQueueService.js   # 983 Zeilen - Queue Processing
│   └── llmJobService.js     # ~300 Zeilen - Job Persistence

services/postgres/init/
├── 006_llm_jobs_schema.sql  # Job Queue Schema
└── 011_llm_models_schema.sql # Model Catalog + Batching Functions
```

---

## Genehmigung

- [ ] Plan geprüft von: _______________
- [ ] Genehmigt zur Implementierung: _______________
- [ ] Prioritäten bestätigt: _______________
