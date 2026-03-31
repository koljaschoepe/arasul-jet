# LLM Chat Optimization Plan

Comprehensive plan for optimizing the Arasul Platform LLM chat system.
Hardware: NVIDIA Jetson AGX Orin 64GB (unified memory, CUDA 12.6).

---

## Phase 1: Critical Fixes (DONE)

Fixes already applied in this session:

| Fix                                         | File                         | Impact                                                  |
| ------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| Add `qwen3.context_length` key              | `modelContextService.js:75`  | Prevents model thrashing (ROOT CAUSE of stream cutoffs) |
| Set `OLLAMA_CONTEXT_LENGTH=32768`           | `compose.ai.yaml`            | Global fixed context prevents runner restarts           |
| Increase `LLM_KEEP_ALIVE_SECONDS` 300->3600 | `compose.ai.yaml`            | Eliminates cold starts within 1 hour                    |
| Remove `await` from `flushToDatabase()`     | `llmJobProcessor.js:489`     | Unblocks token delivery from DB I/O                     |
| Emit `thinking_end` on stream end/error     | `llmJobProcessor.js:585+574` | Frontend exits thinking state on abort                  |
| Reduce frontend batch interval 30ms->16ms   | `useTokenBatching.ts:43`     | Tokens appear 1 frame faster                            |
| SSE heartbeat during model loading          | `llmQueueService.js`         | Prevents 90s frontend timeout                           |
| RAG relevance thresholds calibrated         | `ragCore.js`                 | Documents found with BGE-reranker scores                |
| RAG context truncation                      | `llmJobProcessor.js:150-162` | Prevents prompt overflow / OOM                          |
| Embedding FP16 mode                         | `compose.ai.yaml`            | 8GB -> 3.7GB RAM savings                                |
| spaCy lazy loading                          | `entity_extractor.py`        | 1.7GB -> 473MB at idle                                  |

**Expected improvement**: Stream cutoffs eliminated, ~60% faster perceived response.

---

## Phase 2: Ollama Tuning (Next)

### 2.1 KV Cache Optimization

- Current: `OLLAMA_KV_CACHE_TYPE=q8_0` (good)
- Consider: `q4_0` for qwen3:32b to allow larger context with less VRAM
- Trade-off: Minimal quality loss, ~40% less KV cache memory

### 2.2 Default Model Strategy

- **Daily use**: qwen3:14b-q8 (10.7 tok/s, 16GB VRAM, Q8 quality)
- **Complex tasks**: qwen3:32b-q4 (6.7 tok/s, 22GB VRAM)
- **Quick answers**: qwen3:8b (fastest, 8GB VRAM)
- Recommendation: Set qwen3:14b-q8 as default, offer 32b as "Deep Analysis" mode

### 2.3 Parallel Request Optimization

- Current: `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`
- Keep as-is: Jetson's 64GB shared memory can't afford 2 models loaded
- Future: If switching to smaller models, NUM_PARALLEL=2 could work

### 2.4 Model Preloading

- After backend starts, issue a dummy `/api/generate` with `num_predict: 1` to preload the default model
- Eliminates first-request cold start (30-50s)

---

## Phase 3: Streaming Pipeline Optimization

### 3.1 SSE Flush Optimization

- Add `res.flush()` after each `res.write()` in SSE handlers (rag.js, chat endpoint)
- Ensures tokens reach the client immediately even with reverse proxies (Traefik)
- Add `X-Accel-Buffering: no` header for nginx/Traefik pass-through

### 3.2 Frontend Token Rendering

- Current: Full ReactMarkdown re-parse on every batch flush
- Optimization: Split content into "finalized paragraphs" (re-rendered once) + "active line" (fast text append)
- Use `requestAnimationFrame` instead of `setTimeout` for more consistent frame timing

### 3.3 Backend DB Write Optimization

- Current: `BATCH_INTERVAL_MS=500`, `BATCH_SIZE_CHARS=100`
- The `flushToDatabase()` is now fire-and-forget (Phase 1 fix)
- Consider increasing `BATCH_INTERVAL_MS` to 2000 since it no longer blocks tokens
- Reduces DB write frequency by 4x with zero impact on UX

### 3.4 Thinking Mode Optimization

- Qwen3 generates 99% thinking tokens for simple queries
- Add `/no_think` prefix for RAG queries when `thinking=false` (already done)
- Consider auto-disabling thinking for short queries (<20 words) to save 5-15s
- Show thinking tokens with reduced opacity to differentiate from response

---

## Phase 4: RAG Pipeline Speed

### 4.1 Embedding Cache

- Cache query embeddings for repeated/similar queries (LRU, 100 entries)
- Skip re-embedding for identical queries within 5 minutes

### 4.2 Parallel Pipeline Stages

- Already parallelized: embedding + company context + spell check
- Already parallelized: hybrid search + graph enrichment
- Further: Pre-warm Qdrant collection on backend startup

### 4.3 Reranking Speed

- BGE-reranker is the bottleneck (~2-5s for 20 results)
- Limit initial retrieval to top_k \* 2 instead of flooding the reranker
- Consider FlashRank-only mode for sub-second reranking (slight quality trade-off)

### 4.4 Query Optimizer

- Multi-Query and HyDE are currently DISABLED (zero latency cost)
- Keep disabled until streaming is stable, then evaluate incrementally
- Decompound is active (<100ms) and valuable for German compound words

---

## Phase 5: Frontend UX Improvements

### 5.1 Progressive Loading States

- Show "Quellen gefunden..." immediately when sources arrive
- Show spinning indicator between `thinking_end` and first response token
- Show estimated time based on model's historical performance (from `llm_performance_metrics`)

### 5.2 Token Counter Display

- Show live token count and tok/s during streaming
- Show total tokens and latency after completion

### 5.3 Model Switching UX

- During model switch, show "Modell wird geladen..." with progress bar
- Show estimated load time based on model size
- Allow cancellation of model switch

---

## Phase 6: Infrastructure (Long-term)

### 6.1 Traefik SSE Configuration

- Ensure `traefik.http.middlewares.sse.headers.customresponseheaders.X-Accel-Buffering=no`
- Increase `traefik.http.middlewares.sse.headers.customresponseheaders.Cache-Control=no-cache`

### 6.2 Memory Monitoring

- Track per-container memory usage over time
- Alert when total usage exceeds 55GB (leave 9GB headroom)
- Auto-unload model if memory pressure detected

### 6.3 Performance Dashboard

- Visualize tok/s, TTFT, and latency per model from `llm_performance_metrics`
- Track RAG pipeline stage durations
- Historical comparison after each optimization

---

## Priority Order

1. **Phase 1** - DONE (this session)
2. **Phase 2.4** - Model preloading (quick win, eliminates cold start)
3. **Phase 3.1** - SSE flush (quick win, immediate token delivery)
4. **Phase 2.2** - Default model to qwen3:14b-q8 (60% faster daily use)
5. **Phase 3.3** - DB batch interval increase (reduces backend load)
6. **Phase 4.1** - Embedding cache (faster repeat queries)
7. **Phase 5.1** - Progressive loading states (better perceived speed)
8. **Phase 3.2** - Frontend token rendering (complex, high reward)
9. **Phase 4.3** - Reranking optimization (moderate effort)
10. **Phase 6** - Infrastructure (when needed)

---

## Benchmarks to Track

| Metric                        | Current    | Target                      |
| ----------------------------- | ---------- | --------------------------- |
| Time to First Token (TTFT)    | 10-50s     | 2-5s (warm)                 |
| Token generation (14b-q8)     | 10.7 tok/s | 10.7 tok/s (hardware limit) |
| Token generation (32b-q4)     | 6.7 tok/s  | 6.7 tok/s (hardware limit)  |
| RAG pipeline (search->rerank) | 3-8s       | 1-3s                        |
| Model cold start              | 30-50s     | 0s (preloaded)              |
| Frontend token display delay  | ~50ms      | ~16ms                       |
| Model switch time             | 40-60s     | Eliminated (fixed ctx)      |
