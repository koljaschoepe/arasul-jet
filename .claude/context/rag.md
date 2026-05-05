# RAG Pipeline — Context

> Conventions for code under `apps/dashboard-backend/src/services/rag/`, the
> `/api/rag/*` routes, and the `document-indexer` service.

## Pipeline at a glance

```
query
  ↓ getEmbedding()                  → embedding-service (BGE-M3)
  ↓ routeToSpaces()                 → narrows to ≤3 knowledge spaces
  ↓ hybridSearch()                  → Qdrant: dense + BM25 sparse + RRF fusion
  ↓ rerankResults()                 → 2-stage: FlashRank → BGE reranker
  ↓ graphEnrichment() (optional)    → knowledge-graph traversal
  ↓ buildContext() + LLM            → llmQueueService for sequential GPU access
  ↓ stream answer + sources via SSE
```

Core code lives in `services/rag/ragCore.js` and is reused by routes
**and** the Telegram bot. Don't duplicate pipeline logic in routes.

## Toggles (env-driven, all default-on)

| Var                      | Default | Effect when off          |
| ------------------------ | ------- | ------------------------ |
| `RAG_HYBRID_SEARCH`      | on      | Dense-only Qdrant search |
| `RAG_ENABLE_RERANKING`   | on      | Skip both rerank stages  |
| `RAG_ENABLE_GRAPH`       | on      | Skip KG enrichment       |
| `MODEL_BATCHING_ENABLED` | on      | One-job-at-a-time only   |

Tuning constants (also env-driven, see `ragCore.js`):
`RAG_TIMEOUT_*` (sparse 5 s, search 15 s, rerank 120 s, entity 5 s, fallback 10 s),
`SPACE_ROUTING_THRESHOLD` (0.4), `SPACE_ROUTING_MAX_SPACES` (3),
`RAG_RELEVANCE_THRESHOLD` (0.01), `RAG_VECTOR_SCORE_THRESHOLD` (0.005),
`RAG_GRAPH_MAX_ENTITIES` (3), `RAG_GRAPH_TRAVERSAL_DEPTH` (2).

## Errors a RAG handler must handle

| Code (machine)        | When                                | Where to throw                   |
| --------------------- | ----------------------------------- | -------------------------------- |
| `EMBEDDING_DOWN`      | embedding-service unreachable / 5xx | `getEmbedding()` (typed)         |
| `OLLAMA_DOWN`         | LLM service circuit-breaker open    | quickCheck before `enqueue()`    |
| `QDRANT_DOWN`         | Qdrant unreachable                  | `hybridSearch()`                 |
| `SERVICE_UNAVAILABLE` | catch-all 503                       | `errors.ServiceUnavailableError` |

The frontend dispatches on `err.code` — never use a free-text message to
signal which dependency failed.

## Hard rules

- **Single LLM stream**: every RAG completion goes through
  `llmQueueService.enqueue()`. Never call `axios.post(LLM_URL/api/generate)`
  directly from a RAG handler.
- **No raw Qdrant calls outside `ragCore.js`**: route handlers hand off to
  `hybridSearch()`, `rerankResults()`, etc.
- **Sources are first-class**: every chat message persisted via the
  RAG path must have `sources: [...]` populated (see `messages.sources` JSONB).
- **Cancel-safe**: routes pass an `AbortSignal` into the queue and Qdrant.
  Don't write a handler that can't be cancelled mid-stream.
- **Retention**: `rag_query_log` is auto-trimmed (Migration 076) — don't
  add ad-hoc retention on top.

## Indexer side (`services/document-indexer/`)

The indexer is the producer, the RAG pipeline the consumer. Indexer
guarantees:

- Every document has a stable `content_hash` (Mig 052) — duplicates are
  rejected at upload, not at index time.
- A watchdog reconciles `processing → failed` after retry exhaustion
  (Phase 4.8, Migration runs every 5 min via `recover_stuck_processing`).
- Parent/child chunks (Mig 039): retrieval returns child chunks for
  precision, the LLM gets parent chunks for context. `parent_chunk_id`
  on `document_chunks` is the link.

## When you change RAG

| Change                  | Also touch                                        |
| ----------------------- | ------------------------------------------------- |
| New search/rerank stage | `ragCore.js` + a new `RAG_*` env var (default-on) |
| Schema change           | `services/postgres/init/0XX_*.sql` + this file    |
| New error code          | `utils/errors.js` + `docs/api/API_ERRORS.md`      |
| Pipeline timing         | `ragMetrics.js` (see `recordTiming(...)`)         |
