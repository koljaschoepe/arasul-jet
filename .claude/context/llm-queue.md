# LLM Queue & Streaming — Context

> Conventions for code that talks to the LLM service. The Jetson runs **one
> LLM stream at a time** to keep GPU memory predictable. The queue enforces
> that. Routes do not bypass it.

## Code map

```
services/llm/
  llmQueueService.js   FIFO + priority queue. EventEmitter. Single-stream guard.
  llmJobService.js     CRUD on llm_jobs (the persistent backing table).
  llmJobProcessor.js   processChatJob(): Bilder, Modellwahl, Uebergabe an den Strom.
  llmOllamaStream.js   The actual SSE pump from Ollama → DB → subscribers.
  AsyncMutex.js        Used for the enqueue critical section.
  ollamaReadiness.js   quickCheck() — circuit-breaker-aware health probe.
  modelService.js      Model catalog + capability lookups.
  modelLifecycleService.js Resident-model eviction + hot-swap.
  systemPromptBuilder.js   System prompt assembly (Firmenprofil + Basis-Prompt).
  queryComplexityAnalyzer.js  Classifier for routing simple/complex queries.
```

## The contract

```javascript
const { jobId, queuePosition } = await llmQueueService.enqueue(
  userId, // Besitzer des Auftrags: der Ersteller des API-Schluessels
  jobType, // 'chat'
  requestData, // { prompt, model, images?, ... }
  { priority: 0, maxWaitSeconds: 120 }
);

// Subscribe to the job's stream — the external API and the OpenAI shim do the same
const subscription = llmQueueService.subscribe(jobId, ssePusher);
req.on('close', () => subscription.unsubscribe());
```

## Hard rules

- **Never POST to `/api/generate` or `/api/chat` on the Ollama side directly
  from a route or service.** Always go through `llmQueueService.enqueue()`.
  This includes the flows and the OpenAI-compat shim.
- **Quick-check first**: call `ollamaReadiness.quickCheck()` (or rely on
  the circuit-breaker via `circuitBreakers.get('ollama')`) before enqueuing
  long jobs. If it returns "down", throw `ServiceUnavailableError('Ollama')`
  with `code: 'OLLAMA_DOWN'`. Don't queue jobs that will never run.
- **Queue cap**: `LLM_MAX_QUEUE_SIZE` (default 20). When full, return
  `RateLimitError` with the German user-facing message defined in
  `llmQueueService.js` line 215.
- **Subscribe, don't poll**: the queue is an `EventEmitter` and pushes
  job events. Routes use `subscribe(jobId, push)` + SSE; UI listens to
  the SSE channel. Don't add `setInterval` polling.
- **Cancel cleanly**: when the client disconnects, the route must call the
  subscription's `unsubscribe()`. The processor checks the subscriber count
  and stops the underlying axios stream when it hits zero.
- **Persist before stream**: every job becomes a row in `llm_jobs`
  (see Mig 006/008, owner since 165) before the queue starts pumping tokens.
  The job row is the source of truth; `cleanup_old_llm_jobs()` removes it an
  hour after it ends.

## SSE — the platform pattern

```javascript
const { initSSE, trackConnection } = require('../utils/sseHelper');

router.get(
  '/stream/:jobId',
  requireAuth,
  asyncHandler(async (req, res) => {
    initSSE(res);
    const cleanup = trackConnection(req, res);
    const sub = llmQueueService.subscribe(req.params.jobId, frame =>
      res.write(`data: ${JSON.stringify(frame)}\n\n`)
    );
    req.on('close', () => {
      sub.unsubscribe();
      cleanup();
    });
  })
);
```

The error handler is a no-op once headers are sent — flush a `data: {error: …}`
frame yourself before closing if something goes wrong mid-stream.

## Tuning constants

| Var                      | Default | Notes                          |
| ------------------------ | ------- | ------------------------------ |
| `LLM_MAX_QUEUE_SIZE`     | 20      | Hard cap; further enqueues 429 |
| `MODEL_MAX_WAIT_SECONDS` | 120     | Per-job patience for hot-swap  |
| `MODEL_BATCHING_ENABLED` | true    | Group same-model jobs          |
| `MAX_JOB_SUBSCRIBERS`    | 500     | Per job — defends EventEmitter |

## When you change LLM/queue code

- New `jobType` → also touch `llmJobProcessor.js` and the API doc.
- New job-state transition → update Mig 006/008 view if affected, plus
  `llm_jobs.status` enum if you added a value.
- A new model capability → add to `modelService.js` + Mig `0XX_*.sql` for
  the catalog row — never hard-code in a route.
