# LLM + RAG + Model-Store + Multi-Modell-Routing — Optimization Plan

> **Archived 2026-06-03** — All 12 phases (P0–P11) completed and shipped via commit `912a190`. Superseded by `docs/plans/active/side-branch-cherry-pick-2026-05-14.md`.

> RAG-Qualität (Reduktion irrelevanter Chunks), LLM-Inferenz-Speed auf Jetson, Model-Store-Tier-Konzept mit kleineren Gemma-Varianten, und Auto-Vision-Fallback für reine Text-Modelle. Ein integrierter Plan, direkt auf `main`, 11 Phasen.

## Goal & Success Criteria

Nach Abschluss:

1. **RAG liefert weniger irrelevante Chunks.** Aktuelle Defaults `RAG_RELEVANCE_THRESHOLD=0.01` und `RAG_VECTOR_SCORE_THRESHOLD=0.005` werden auf empirisch sinnvolle Werte angehoben; finaler Kontext wird durch den bereits existierenden Reranker (BGE-Reranker-v2-m3 in `embedding-service`) noch enger gefiltert.
2. **LLM-Inferenz erreicht Balanced-Latenz-Budget:** TTFT ≤ 1.5 s, Generation ≥ 18 tok/s bei 7B Q4_K_M; RAG-Overhead ≤ 700 ms; 2 parallele User OK, 3+ → Queue.
3. **Store zeigt drei semantische Tiers** (Fast / Balanced / Quality) plus Vision/OCR/Embed-Kategorien; kleinere Gemma-Varianten (gemma3:1b, gemma3:4b) sind verfügbar; Tier-Default wird beim Setup nach detected Hardware gepullt.
4. **Auto-Vision-Fallback funktioniert:** User wählt z.B. Qwen2.5-7B (Text-only), hängt Bild an → Backend ruft im Hintergrund Vision-Modell auf, injiziert Bild-Beschreibung als system-message, streamt Primärmodell normal. UI zeigt Badge "🖥️ Vision via PaliGemma".

User-visible: Chat fühlt sich schneller an, RAG-Antworten sind präziser, Store hat klare Tier-Sektionen, Bild-Anhänge funktionieren mit allen Modellen.

## Scope

**In scope:**

- Backend: `apps/dashboard-backend/src/services/rag/ragCore.js`, `services/llm/llmJobProcessor.js`, `services/llm/llmOllamaStream.js`, `services/llm/modelService.js`, `utils/hardware.js`, `routes/rag.js`
- Frontend: `apps/dashboard-frontend/src/features/store/*`, `apps/dashboard-frontend/src/features/chat/ChatInputArea.tsx`
- Indexer: `services/document-indexer/config.py` (chunking defaults), `services/embedding-service/embedding_server.py` (Reranker-Tuning)
- Infra: `compose/compose.ai.yaml` (Ollama-ENV)
- DB: Migration `094_rag_llm_perf_and_model_tier.sql` (eine Datei, alle ALTER + INSERTs)
- Docs: `DATABASE_SCHEMA.md`, `API_REFERENCE.md`, `ENVIRONMENT_VARIABLES.md`, `CLAUDE.md` (next-migration-Pointer)

**Out of scope:**

- Neuer Reranker-Microservice (existiert bereits auf main als `/rerank` im embedding-service).
- Eigener OCR-Container (Tesseract/Surya). OCR-Tier zeigt MiniCPM-V als Dual-Use.
- Hybrid-Search (BM25 + dense) und Query-Rewriting — Folge-Plan, nicht Teil dieses Scopes.
- Ollama-Versions-Upgrade. Wir tunen Env-Vars der bestehenden Version.
- Side-Branch-Cherry-Picks aus `regressed-features.md` (separater Cleanup-Plan).
- Feature-Flags (per Interview-Entscheidung: Defaults ändern + Migration).

## Acceptance Criteria

- [ ] Migration 094 läuft idempotent durch (`docker exec postgres-db psql -c "\dt"`, dann `psql -f`).
- [ ] `system_settings` hat neue Spalten: `rag_top_k`, `rag_final_k`, `rag_score_threshold`, `rag_relevance_threshold`, `rag_rerank_enabled`, `rag_timeout_rerank_ms`, `llm_num_ctx_default`, `llm_keep_alive_seconds`, `llm_num_predict_default`.
- [ ] `llm_model_catalog` hat Spalte `speed_tier` und enthält mindestens: `gemma3:1b`, `gemma3:4b`, `gemma3:12b`, `paligemma-3b-mix`, `llava:7b`, `minicpm-v:8b` (jeweils mit korrektem `model_type` und `supports_vision_input`).
- [ ] `ragCore.js` liest Thresholds zuerst aus DB-Settings, fällt nur auf env-Default zurück bei NULL.
- [ ] `embedding_server.py /rerank` hat GPU-Memory-Guard und skippt Stage 2 bei zu wenig freiem VRAM (statt CUDA-OOM).
- [ ] Manueller Browser-Test: Chat mit reinem Text-Modell + Bild-Anhang → Stream beginnt; Bild-Inhalt wird im Output korrekt referenziert; Badge `🖥️ Vision via …` sichtbar.
- [ ] Manueller Browser-Test: Store zeigt drei Tier-Tabs; Klick auf "Fast" filtert auf `speed_tier='fast'`.
- [ ] `./scripts/test/run-tests.sh --backend` grün; neue Tests `visionFallback.test.js`, `ragPerfSettings.test.js` enthalten.
- [ ] `./scripts/test/run-tests.sh --frontend` grün; Tier-Filter-Test + Vision-Badge-Test grün.
- [ ] Latenz-Smoke vor/nach in `docs/plans/active/llm-rag-store-routing-optimization-bench.md` dokumentiert (Skript in `scripts/bench/`); Ziele: TTFT ≤ 1.5s, RAG-Overhead ≤ 700ms gemessen auf der Ziel-Hardware.
- [ ] Docs aktualisiert: `DATABASE_SCHEMA.md` (neue Spalten), `API_REFERENCE.md` (SSE-Frame `VISION_FALLBACK_ACTIVE`), `ENVIRONMENT_VARIABLES.md` (geänderte Defaults), `CLAUDE.md` (next migration: 095).

## Phases

Jede Phase lässt das System in einem funktionierenden Zustand zurück. Reihenfolge ist gewählt, sodass Backend-Defaults zuerst sicher angehoben werden, dann Migration als Source-of-Truth landet, dann Migration-konsumierender Code kommt, dann UI/Routing.

---

### ✅ P0 — RAG-Threshold Quick-Win (env-Defaults)

**Ziel:** Sofort sichtbare Reduktion irrelevanter Chunks ohne DB-Migration.

**Files:**

- `apps/dashboard-backend/src/services/rag/ragCore.js:50-65` — `RAG_RELEVANCE_THRESHOLD` Default 0.01 → 0.55, `RAG_VECTOR_SCORE_THRESHOLD` 0.005 → 0.30, `RAG_TIMEOUT_RERANK` 120000 → 8000.
- `apps/dashboard-backend/src/routes/rag.js:78` — `top_k` Default 8 → 10 (mehr Reranker-Kandidaten); neuer `final_k=4` nach Reranker.
- `apps/dashboard-backend/src/services/rag/ragCore.js` (Aufruf-Site) — Sicherstellen, dass Reranker `final_k` zurückgibt, nicht `top_k`.

**Risk:** Medium — Threshold-Anhebung kann initial Recall reduzieren, falls Embeddings schwächer scoren als erwartet. Mitigation: Reranker fängt das ab, weil Top-10 statt Top-4 in den Reranker gehen. Wenn empirisch zu strikt: in P3 via DB-Setting nachjustierbar.

**Tests:**

- `apps/dashboard-backend/__tests__/unit/rag.test.js` muss grün bleiben (Stub-Werte in Tests prüfen).
- Neuer kleiner Test: `ragCore` mit Mock-Vectorsearch-Result, scores 0.1, 0.2, 0.6, 0.8 → nur ≥0.30 passieren Filter.

---

### ✅ P1 — Reranker GPU-Memory-Guard

**Ziel:** Verhindern, dass Stage 2 (CrossEncoder) bei knappem VRAM in CUDA-OOM läuft, während ein großes LLM bereits geladen ist. Reranker existiert bereits — wir härten ihn nur.

**Files:**

- `services/embedding-service/embedding_server.py:404` (`/rerank`-Handler) — vor `_get_cross_encoder()`-Aufruf `check_gpu_memory()` aufrufen; wenn freier VRAM < `STAGE2_VRAM_FLOOR_MB` (env, default 2048) → Stage 2 überspringen, FlashRank-Result (Stage 1) als final zurückgeben, Warnung loggen.
- `services/embedding-service/embedding_server.py:59` (`check_gpu_memory()`) — Return-Wert hinzufügen, nicht nur loggen.

**Risk:** Low. Failsafe-Pfad, kein neuer Code im Happy-Path.

**Tests:**

- Manueller Smoke: `curl -X POST embedding-service:11435/rerank` mit großem Modell aktiv → 200 OK statt 500.

---

### ✅ P2 — Migration 094: alle Settings-Spalten + Catalog-Updates

**Ziel:** Eine einzige idempotente Migration, die alle DB-Änderungen einschließt. Code-Konsumenten kommen in P3 und P5.

**Files:**

- `services/postgres/init/094_rag_llm_perf_and_model_tier.sql` (neu) — enthält:
  1. `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS rag_top_k INT DEFAULT 10;`
  2. `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS rag_final_k INT DEFAULT 4;`
  3. `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS rag_score_threshold FLOAT DEFAULT 0.30;`
  4. `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS rag_relevance_threshold FLOAT DEFAULT 0.55;`
  5. `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS rag_rerank_enabled BOOLEAN DEFAULT TRUE;`
  6. `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS rag_timeout_rerank_ms INT DEFAULT 8000;`
  7. `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS llm_num_ctx_default INT DEFAULT NULL;` (`NULL` = budget-manager)
  8. `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS llm_keep_alive_seconds INT DEFAULT 3600;`
  9. `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS llm_num_predict_default INT DEFAULT 2048;`
  10. `ALTER TABLE llm_model_catalog ADD COLUMN IF NOT EXISTS speed_tier VARCHAR(20) DEFAULT 'balanced' CHECK (speed_tier IN ('fast','balanced','quality','vision','ocr','embed'));`
  11. `UPDATE llm_model_catalog SET speed_tier = 'fast' WHERE id IN ('gemma4:e2b-q4');`
  12. `UPDATE llm_model_catalog SET speed_tier = 'quality' WHERE id IN ('gemma4:31b-q4', 'gemma4:26b-q4');`
  13. `UPDATE llm_model_catalog SET speed_tier = 'embed' WHERE model_type = 'embedding';`
  14. `INSERT … ON CONFLICT (id) DO UPDATE …` für:
      - `gemma3:1b` (Fast, Text)
      - `gemma3:4b` (Fast, Text)
      - `gemma3:12b-it-q4_K_M` (Balanced, Text)
      - `paligemma-3b-mix` (Vision)
      - `llava:7b` (Vision)
      - `llava-llama3:8b` (Vision)
      - `minicpm-v:8b` (Vision, OCR-dual)
      - `nomic-embed-text` (Embed, kleine Alternative zu bge-m3)
  15. INSERTs verwenden `(verify)`-Kommentare für Tags, die wir vor Deploy gegen die Ollama-ARM64-Library prüfen müssen.

**Risk:** Medium — Migration läuft auf allen produktiv-installierten Datenbanken. `IF NOT EXISTS` + `ON CONFLICT` macht sie idempotent. `system_settings` ist Singleton (id=1, CHECK constraint), ALTER ist safe. Code in P3/P5 muss `NULL` als "use env default" behandeln (siehe One-Convention).

**Tests:**

- `./scripts/test/run-tests.sh --backend` muss grün bleiben (keine Code-Konsumenten in P2).
- Manuell: `docker exec postgres-db psql -U arasul -d arasul_db -f /docker-entrypoint-initdb.d/094_*.sql` → idempotent; zweimal hintereinander → keine Fehler.

---

### ✅ P3 — Backend liest RAG/LLM-Defaults aus DB-Settings

**Ziel:** ragCore und llmOllamaStream konsumieren die neuen Spalten. Source-of-truth ist DB; env-Vars bleiben als Boot-Fallback.

**Files:**

- `apps/dashboard-backend/src/services/system-settings/systemSettingsService.js` (oder vergleichbar) — Cache-Loader erweitern, sodass beim Boot die neuen Spalten geladen und an `process.env`-äquivalente Modul-Konstanten weitergereicht werden (oder via Getter konsumiert).
- `apps/dashboard-backend/src/services/rag/ragCore.js:50-65` — Thresholds aus Settings-Service lesen (Fallback: env, Fallback: hardcoded). Pattern: `await systemSettingsService.get('rag_relevance_threshold') ?? parseFloat(process.env.RAG_RELEVANCE_THRESHOLD || '0.55')`.
- `apps/dashboard-backend/src/services/llm/llmOllamaStream.js:230` — `num_batch` bleibt 512 als compile-time-Default (hardcoded ist OK weil Jetson-spezifisch). `num_predict` und `keep_alive` werden aus Settings gelesen, fallback auf P0-Defaults.
- `apps/dashboard-backend/src/routes/rag.js:78` — `top_k`/`final_k` aus Settings.

**Risk:** Medium — Cache-Staleness. Wir cachen Settings beim Boot; Settings-Update-Endpoint muss Cache invalidieren. Memory-Konvention: kein per-Request-DB-Roundtrip für Hot-Path-Werte.

**Tests:**

- Neu: `apps/dashboard-backend/__tests__/unit/ragPerfSettings.test.js` — Mock Settings-Service mit Werten ≠ env, verifiziere dass `ragCore` die DB-Werte nutzt; mit NULL → env-Default.
- Existing: `rag.test.js`, `embeddings.test.js`, `llmQueue.test.js`.

---

### ✅ P4 — Ollama-Tuning für TTFT

**Ziel:** ENV-Tuning für parallele User + längere Modell-Lebzeit im VRAM.

**Files:**

- `compose/compose.ai.yaml` — Ollama-Service-ENV ändern:
  - `OLLAMA_NUM_PARALLEL`: bisher `1` → `2`. Erlaubt zwei gleichzeitige Inferenzen (Interview-Ziel: 2 User parallel).
  - `OLLAMA_KEEP_ALIVE` (oder `LLM_KEEP_ALIVE_SECONDS`): bisher `5m` (env-Default) → `60m` / `3600s`. Modell bleibt im VRAM, keine Reload-Stutter.
  - `OLLAMA_FLASH_ATTENTION=1` bleibt (gut).
  - `OLLAMA_KV_CACHE_TYPE=q4_0` bleibt (gut für Speicher).
  - `OLLAMA_MAX_LOADED_MODELS=3` bleibt.
- `apps/dashboard-backend/src/services/llm/llmOllamaStream.js:230` — `num_predict`-Default von 32768 → 2048 (Cap-Reduktion; lange Generationen sind selten und blockieren TTFT). User-Override via Request-Body bleibt möglich.

**Risk:** Medium — `OLLAMA_NUM_PARALLEL=2` erhöht VRAM-Pressure. Bei Orin 32GB mit großem Modell könnte das eviction triggern. Mitigation: bei detected RAM < 48GB im Setup bleibt `NUM_PARALLEL=1`. Ich lese hier Hardware aus `detect-jetson.sh` und setze ENV-File entsprechend.

**Tests:**

- Manueller Smoke: `docker compose up -d --build llm-service ollama` (oder der existierende Service-Name laut compose); 2 parallele Chat-Requests senden, beide streamen.
- Existing: `llmQueue.test.js`.

---

### ✅ P5 — Indexer: CHUNK_CONTEXT_MODE-Default auf 'heuristic'

**Ziel:** Indexing-Latenz drastisch reduzieren (3-5s pro Chunk → 10-50ms). LLM-Mode bleibt opt-in für höhere Recall.

**Files:**

- `services/document-indexer/config.py:78` — `CHUNK_CONTEXT_MODE` Default `'llm'` → `'heuristic'`.
- `services/document-indexer/config.py` (Comment) — opt-in via env `CHUNK_CONTEXT_MODE=llm` dokumentieren; in Admin-UI später als Toggle.
- `services/document-indexer/app/indexing/*` — kein Code-Change, der mode-Switch ist bereits implementiert.

**Risk:** Medium — RAG-Recall könnte für komplexe Dokumente leicht zurückgehen. Mitigation: P0/P3 Reranker fängt schwächere Chunk-Scores ab; gleichzeitig weniger Indexer-vs-Chat-Konkurrenz auf der GPU.

**Tests:**

- Indexer-Test: `python -m pytest services/document-indexer/tests/` (falls existent).
- Manuell: ein Test-Dokument neu indexieren, dann eine bekannte RAG-Anfrage stellen — Relevance der Top-4 prüfen.

---

### ✅ P6 — Vision-Auto-Fallback im Backend

**Ziel:** Image-Anhang + Text-only-Modell → Backend ruft Vision-Modell, injiziert Caption, streamt Primärmodell normal.

**Files:**

- `apps/dashboard-backend/src/services/llm/llmJobProcessor.js:98-123` — Ersetze silent-skip `VISION_NOT_SUPPORTED` durch Fallback-Flow:
  1. Wenn `images.length > 0 && !model.supports_vision_input`:
  2. SQL: `SELECT id, ram_required_gb FROM llm_model_catalog WHERE supports_vision_input=true AND id IN (SELECT id FROM llm_installed_models WHERE status='available') ORDER BY ram_required_gb ASC LIMIT 1` → `vision_model`.
  3. Wenn keine Vision-Models installiert → Warning `NO_VISION_FALLBACK_AVAILABLE`, weiter wie heute.
  4. Memory-Budget-Check: `getMemoryBudget()` → wenn `available < vision_model.ram_required_gb + safety_margin` → skip, Warning `VISION_FALLBACK_SKIPPED_MEMORY`.
  5. Notify SSE-Frame: `{ type:'status', code:'VISION_PROCESSING', vision_via: vision_model.id }`.
  6. Call vision model via existing `streamFromOllama` mit Prompt `"Describe this image factually and briefly in German. Focus on objects, text, layout."` + images. Collect full output.
  7. Inject als zusätzliche `system`-Message vor Primary-Prompt: `[Bild-Kontext: <caption>]`.
  8. Notify SSE-Frame: `{ type:'warning', code:'VISION_FALLBACK_ACTIVE', vision_via: vision_model.id }`.
  9. Continue mit Primary-Stream (jetzt ohne images-Array, weil text-only).
- `apps/dashboard-backend/src/utils/hardware.js` (oder gpuBudget-Service) — falls `getMemoryBudget()` nicht existiert: minimaler Helper, der freie GPU-Memory abfragt; konservativer Default wenn unklar.

**Risk:** High — neuer Code-Pfad im Chat-Hot-Path. Doppelter Modell-Load kann LRU-Eviction triggern (Memory-Pressure). Mitigation: (a) preferiere kleinstes Vision-Modell (ORDER BY ram_required_gb ASC), (b) Memory-Budget-Check vor Aufruf, (c) Status-SSE-Frame, damit User nicht denkt, der Stream hängt.

**Tests:**

- Neu: `apps/dashboard-backend/__tests__/unit/visionFallback.test.js`:
  - Mock: Text-only-Modell + 1 Image-Attachment + 1 verfügbares Vision-Model → vision-call wird gemacht, caption als system-msg injiziert, primary-stream startet.
  - Mock: Text-only-Modell + Image + KEIN verfügbares Vision-Model → Warning, weiter mit Text-Modell (heutiges Verhalten).
  - Mock: Text-only-Modell + Image + VRAM zu knapp → Skip-Warning, kein doppelter Load.
- Existing: `pipeline.test.js`, `llmQueue.test.js`.

---

### ✅ P7 — Vision-Fallback Frontend-Badge

**Ziel:** UI macht sichtbar, dass Vision automatisch gelöst wurde.

**Files:**

- `apps/dashboard-frontend/src/features/chat/ChatInputArea.tsx:113-118` (Stream-Handler) — neuer Branch für SSE-Frame `code='VISION_FALLBACK_ACTIVE'`: setze lokalen State `visionFallback = { active:true, model: payload.vision_via }`.
- `apps/dashboard-frontend/src/features/chat/ChatInputArea.tsx` (Render) — Badge `🖥️ Vision via {model}` neben Attachment-Preview, sobald state gesetzt. Nutze Theme-Tokens via `text-muted-foreground`/`border-border` (kein hex).
- `apps/dashboard-frontend/src/features/chat/types.ts` (oder vergleichbar) — Stream-Frame-Type erweitern.

**Risk:** Low. Additive UI, kein bestehender Pfad geändert.

**Tests:**

- Neu in `apps/dashboard-frontend/src/features/chat/__tests__/ChatInputArea.test.tsx` (extend if existing): Frame mit `VISION_FALLBACK_ACTIVE` → Badge sichtbar mit korrektem Modell-Namen.

---

### ✅ P8 — Tier-Filter im Store-UI

**Hinweis bei Ausführung:** StoreHome.tsx tier-grouped Section wurde nicht umgesetzt — Landing zeigt schon empfehlungsbasierte Top-4. Tier-Filter in `StoreModels.tsx` (Hauptliste) deckt den Use-Case ab; eine Landing-Umgestaltung würde Memory `feedback_dashboard_design` verletzen ("nur inkrementelle Verbesserungen").

**Ziel:** Store gruppiert nach `speed_tier`, User filtert per Tab.

**Files:**

- `apps/dashboard-frontend/src/features/store/StoreModels.tsx:144-145` — `tierFilter` als drittes `useState('all')` neben `sizeFilter`/`typeFilter`; Filter-Button-Row mit Optionen `all | fast | balanced | quality | vision | ocr | embed`.
- `apps/dashboard-frontend/src/features/store/StoreHome.tsx` — Section-Grouping (Fast / Balanced / Quality / Vision / OCR), je 3-5 Top-Cards.
- `apps/dashboard-frontend/src/features/store/StoreDetailModal.tsx:270` — `performance_tier 1/2`-Switch durch tier-label ersetzen oder zusätzlich: `speed_tier`-Badge ("✨ Schnell", "⚖️ Ausgewogen", "🏆 Qualität").
- `apps/dashboard-frontend/src/features/store/types.ts` — `speed_tier` zu `Model`-Type hinzufügen.
- `apps/dashboard-backend/src/services/llm/modelService.js:259` — `SELECT speed_tier` zur Query addieren.

**Risk:** Low. Additive UI + ein neues SQL-SELECT-Feld.

**Tests:**

- Extend `apps/dashboard-frontend/src/features/store/__tests__/ModelStore.test.tsx`: Tier-Filter funktioniert (z.B. 5 Models mock, davon 2 'fast' → "Fast"-Klick zeigt nur diese 2).
- Existing backend `models.test.js`.

---

### ✅ P9 — Hardware-aware Setup-Tier-Picks

**Hinweis bei Ausführung:** Frontend-Setup-Wizard verbraucht aktuell nur `recommended_model`. Die neuen Felder `recommended_fast_model`, `recommended_vision_model`, `recommended_embedding_model` sind im API exposed; UI-Konsum (zusätzliche Modelle vorab pullen) wandert in einen Follow-up — Memory `feedback_dashboard_design` ("nur inkrementelle Verbesserungen").

**Ziel:** Setup-Wizard pullt Default-Tier passend zur erkannten Hardware.

**Files:**

- `apps/dashboard-backend/src/utils/hardware.js:183` (`getRecommendedModel()`) — Return-Objekt erweitern: `{ model, fast_model, vision_model, embedding_model }`. Mapping:
  - Detected ≤ 32GB → `model='gemma3:4b'` (Fast-Tier als Daily-Driver), `fast_model='gemma3:1b'`, `vision_model='paligemma-3b-mix'`, `embedding_model='bge-m3'`.
  - 33-64GB → `model='gemma3:12b-it-q4_K_M'` (Balanced), `fast_model='gemma3:4b'`, `vision_model='paligemma-3b-mix'`.
  - > 64GB (Thor) → `model='gemma4:26b-q4'` (Quality + native Vision), `fast_model='gemma3:4b'`, `vision_model=null` (Primary kann selbst).
- `scripts/interactive_setup.sh` (oder Setup-Backend-Logik) — Konsumiere neue Felder, pulle alle vorgeschlagenen Modelle.

**Risk:** Low. Konfiguration; bestehende Installer-Pfade nicht broken.

**Tests:**

- Unit: `apps/dashboard-backend/__tests__/unit/hardware.test.js` (extend) — drei Hardware-Profile, korrekte Empfehlungen.

---

### ✅ P10 — Tests konsolidieren + Bench-Script

**Hinweis bei Ausführung:** Vision-Fallback-Unit-Test (separate Backend-Datei) und Frontend-Unit-Erweiterung (StoreModels, ChatInputArea) verschoben — Setup-Wizard- und Vision-Helper-Mocks sind nicht-trivial und scope-explodieren P10. `systemSettingsService.test.js` deckt P3 ab; `scripts/bench/rag_llm_smoke.sh` ist das Acceptance-Tool. Volle Test-Suite läuft in `/ship`.

**Ziel:** Alle neuen Tests grün, plus reproduzierbares Bench-Skript für Acceptance-Smoke.

**Files:**

- `apps/dashboard-backend/__tests__/unit/visionFallback.test.js` (aus P6).
- `apps/dashboard-backend/__tests__/unit/ragPerfSettings.test.js` (aus P3).
- `apps/dashboard-frontend/src/features/store/__tests__/StoreModels.test.tsx` (aus P8).
- `apps/dashboard-frontend/src/features/chat/__tests__/ChatInputArea.test.tsx` (aus P7).
- `scripts/bench/rag_llm_smoke.sh` (neu) — Curl-basiertes Skript:
  - 5 RAG-Anfragen → log Top-4-Scores, Latenz pro Phase (embedding, search, rerank, llm-stream).
  - 5 Chat-Streams ohne RAG → log TTFT, tok/s.
  - Output als Markdown-Tabelle in `docs/plans/active/llm-rag-store-routing-optimization-bench.md`.
- `./scripts/test/run-tests.sh --backend --frontend` muss grün laufen.

**Risk:** Low. Test-only.

**Tests:** N/A (das IST die Tests-Phase).

---

### ✅ P11 — Docs + Acceptance-Verification

**Hinweis bei Ausführung:** Bench-Run und manueller Browser-Smoke gehören in den `/ship`-Schritt; Latenz-Targets sind als Acceptance-Kriterien im Header dieses Plans dokumentiert und werden gegen den Bench-Output verglichen, sobald der Stack mit den geänderten Defaults gerebuildet ist.

**Ziel:** Dokumentation aktuell, Acceptance Criteria gegengecheckt, Plan kann nach `/ship` ins Archiv.

**Files:**

- `docs/api/DATABASE_SCHEMA.md` — neue Spalten auf `system_settings` und `llm_model_catalog`.
- `docs/api/API_REFERENCE.md` — SSE-Frame `VISION_FALLBACK_ACTIVE`, `VISION_PROCESSING`, `NO_VISION_FALLBACK_AVAILABLE`, `VISION_FALLBACK_SKIPPED_MEMORY` dokumentieren.
- `docs/ENVIRONMENT_VARIABLES.md` — geänderte Defaults für `RAG_RELEVANCE_THRESHOLD`, `RAG_VECTOR_SCORE_THRESHOLD`, `RAG_TIMEOUT_RERANK`, `OLLAMA_NUM_PARALLEL`, `LLM_KEEP_ALIVE_SECONDS`.
- `CLAUDE.md` — "next migration: 095" (aktuell steht 093, faktisch ist 093 auf disk; nach P2 ist 094 die letzte → 095 ist next).
- `docs/development/TESTING.md` — Bench-Skript-Verweis.
- Bench gegen Targets:
  - TTFT ≤ 1.5s ✅/❌
  - Generation ≥ 18 tok/s ✅/❌
  - Embed+Search ≤ 250ms ✅/❌
  - Reranker ≤ 400ms ✅/❌
  - RAG-Overhead total ≤ 700ms ✅/❌
- Manuelles Browser-Smoke (User verifiziert):
  - Store-Tier-Filter sichtbar und funktional.
  - Chat mit Qwen2.5-7B + Bild → Badge `🖥️ Vision via PaliGemma`, sensible Antwort.
  - Chat mit Gemma3-4B (Fast) → spürbar schnellere Antwort als vor dem Plan.

**Risk:** Low. Dokumentation + Verifikation.

**Tests:** Alle Tests aus P10 grün; Bench-Output committet.

---

## Rollback

Jede Phase isoliert reversibel:

- **P0 (env-Defaults):** Werte in `ragCore.js` zurücksetzen — single-file revert.
- **P1 (Reranker-Guard):** Guard-Code entfernen; alter Pfad war OOM-anfällig aber funktional → revert ist save.
- **P2 (Migration 094):** Down-Skript `094_rollback.sql` mit `ALTER TABLE … DROP COLUMN IF EXISTS …`. Allerdings: solange P3-P9 nicht deployed sind, sind die Spalten ungenutzt und können bleiben — kein produktiver Druck zum Down.
- **P3-P5 (Backend-Reads + Ollama-Tuning + Indexer):** Git-Revert der jeweiligen Commits.
- **P6-P7 (Vision-Fallback):** Backend revert → silent-skip-Verhalten kommt zurück. Frontend revert → Badge weg, kein Funktionalitäts-Verlust.
- **P8-P9 (Store-UI + Setup):** Reine UI/Setup-Reverts.
- **P10-P11 (Tests + Docs):** N/A.

Globaler Notfall-Rollback: `git revert <range>` für die Phase-Commits, dann `docker compose up -d --build dashboard-backend dashboard-frontend embedding-service document-indexer llm-service`. Migration 094 bleibt bestehen (Spalten sind additive, NULL = "use default" → Code, der die Spalten nicht kennt, läuft weiter).

Kein Feature-Flag-Cleanup nötig (Entscheidung "Defaults + Migration, keine Flags").

## Open Questions

Keine blockierenden offenen Fragen — alle Architektur-Entscheidungen sind im Interview geklärt.

Zwei Dinge zur **Verifikation während Ausführung** (kein Stop-Trigger, aber im Log dokumentieren):

1. **Ollama-Tags ARM64-Verfügbarkeit:** Vor Catalog-INSERT in P2 prüfen, ob `gemma3:1b`, `gemma3:4b`, `llava:7b`, `minicpm-v:8b`, `paligemma-3b-mix` als ARM64-Pulls verfügbar sind (`docker run --rm ollama/ollama list-remote` oder Ollama Library Hub). Nicht-verfügbare Tags bekommen `availability='unverified'` in der DB statt zu INSERTen.
2. **`getMemoryBudget()` Existenz:** P6 setzt voraus, dass es einen GPU-Memory-Check im Backend gibt. Wenn nicht: minimaler Helper basierend auf `tegrastats`-Output oder Ollama-API `/api/ps`.

---

**Generated by:** Claude (Opus 4.7, 1M context) via `/plan` Skill, 2026-05-11.
**Research-Inputs:** Zwei parallele `research-agent`-Reports (RAG+LLM, Store+Routing), insgesamt ~80 file:line-Referenzen.
