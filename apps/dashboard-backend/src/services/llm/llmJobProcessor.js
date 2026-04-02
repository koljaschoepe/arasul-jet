/**
 * LLM Job Processor
 * Handles the actual processing of chat and RAG jobs, including Ollama streaming.
 *
 * Extracted from llmQueueService.js to reduce file size.
 * All functions receive a `ctx` object with dependencies and service references.
 */

const http = require('http');

// Content batching configuration — low latency for livestream feel
const BATCH_INTERVAL_MS = 50;
const BATCH_SIZE_CHARS = 20;

// Shared HTTP agent for Ollama connections (keep-alive + connection pooling)
const ollamaAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: 600000,
});

/**
 * Process a chat job
 * @param {Object} ctx - Context with dependencies
 * @param {Object} job - The job record from database
 */
async function processChatJob(ctx, job) {
  const { database, logger, llmJobService, modelService } = ctx.deps;
  const service = ctx.service;

  const { id: jobId, request_data: requestData, requested_model } = job;
  const { messages, temperature, max_tokens, thinking } = requestData;

  // P2-001: Check if model supports thinking mode
  let modelSupportsThinking = true; // Default to true for backwards compatibility
  if (requested_model) {
    try {
      const capResult = await database.query(
        `SELECT supports_thinking FROM llm_model_catalog WHERE id = $1`,
        [requested_model]
      );
      if (capResult.rows.length > 0 && capResult.rows[0].supports_thinking !== null) {
        modelSupportsThinking = capResult.rows[0].supports_thinking;
      }
    } catch (capErr) {
      logger.debug(`Could not check model capabilities: ${capErr.message}`);
    }
  }

  // Smart Think Mode: auto-disable for trivial/simple queries to save GPU time
  const { classifyQueryComplexity } = require('./queryComplexityAnalyzer');
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const complexity = classifyQueryComplexity(lastUserMsg);

  let enableThinking = thinking !== false && modelSupportsThinking;
  if (enableThinking && (complexity.level === 'trivial' || complexity.level === 'simple')) {
    enableThinking = false;
    logger.info(`[JOB ${jobId}] Think auto-disabled: ${complexity.level} (${complexity.reason})`);
  }

  // Notify if thinking was requested but model doesn't support it
  if (thinking !== false && !modelSupportsThinking) {
    logger.info(
      `[JOB ${jobId}] Think mode requested but model ${requested_model} doesn't support it - disabled`
    );
    service.notifySubscribers(jobId, {
      type: 'warning',
      message: `Modell "${requested_model}" unterstützt Think-Mode nicht optimal. Thinking deaktiviert.`,
      code: 'THINKING_NOT_SUPPORTED',
    });
  }

  // Build layered system prompt (global base + AI profile + company context + project prompt)
  // Skip tools section for trivial/simple queries to reduce prefill overhead
  const includeTools = complexity.level !== 'trivial' && complexity.level !== 'simple';
  const { buildSystemPrompt } = require('./systemPromptBuilder');
  const systemPrompt = await buildSystemPrompt(database, job.conversation_id, { includeTools });

  // Context Management: Build optimized prompt within token budget
  const contextBudgetManager = require('../context/contextBudgetManager');
  const optimized = await contextBudgetManager.buildOptimizedPrompt({
    messages,
    systemPrompt,
    model: requested_model,
    conversationId: job.conversation_id,
    userId: null,
  });

  logger.info(`[JOB ${jobId}] Context budget: ${JSON.stringify(optimized.tokenBreakdown)}`);

  // Send context debug info to frontend
  service.notifySubscribers(jobId, {
    type: 'context_info',
    tokenBreakdown: optimized.tokenBreakdown,
  });

  // Notify frontend about compaction if it happened
  if (optimized.compactionResult) {
    service.notifySubscribers(jobId, {
      type: 'compaction',
      tokensBefore: optimized.compactionResult.tokensBefore,
      tokensAfter: optimized.compactionResult.tokensAfter,
      messagesCompacted: optimized.tokenBreakdown.messagesDropped,
    });
  }

  const prompt = optimized.prompt;

  await streamFromOllama(
    ctx,
    jobId,
    prompt,
    enableThinking,
    temperature,
    max_tokens,
    requested_model,
    optimized.systemPrompt,
    optimized.numCtx
  );
}

/**
 * Process a RAG job with German citation-aware prompt
 * @param {Object} ctx - Context with dependencies
 * @param {Object} job - The job record from database
 */
async function processRAGJob(ctx, job) {
  const { database, logger, llmJobService, modelService } = ctx.deps;
  const service = ctx.service;

  const { id: jobId, request_data: requestData, requested_model } = job;
  const { query, context, thinking, sources, noRelevantDocs } = requestData;
  const enableThinking = thinking !== false;

  // German system prompt with citation rules (RAG 4.0: dual-mode)
  const ragRules = noRelevantDocs
    ? `Regeln:
1. Es wurden keine ausreichend relevanten Dokumente in der Wissensbasis gefunden.
2. Du kannst die Frage aus deinem eigenen Wissen beantworten.
3. Beginne deine Antwort mit dem Hinweis: "Hinweis: Keine relevanten Dokumente in der Wissensbasis gefunden. Die folgende Antwort basiert auf allgemeinem Wissen."
4. Wenn Unternehmenskontext verfuegbar ist, beziehe diesen mit ein.
5. Strukturiere laengere Antworten mit Absaetzen oder Aufzaehlungen.
6. Antworte auf Deutsch, es sei denn die Frage ist auf Englisch gestellt.`
    : `Regeln:
1. Antworte AUSSCHLIESSLICH auf Basis der bereitgestellten Dokumente.
2. Wenn die Antwort nicht in den Dokumenten zu finden ist, sage das klar und deutlich.
3. Zitiere deine Quellen mit [1], [2] etc. - die Nummern entsprechen den Dokumenten unten.
4. Verwende Fachbegriffe aus den Dokumenten.
5. Strukturiere laengere Antworten mit Absaetzen oder Aufzaehlungen.
6. Antworte auf Deutsch, es sei denn die Frage ist auf Englisch gestellt.`;

  const ragSystemPrompt = `Du bist ein professioneller Wissensassistent fuer ein Unternehmen.

${ragRules}`;

  // Context Management: Truncate RAG context to fit within token budget
  const { estimateTokens, truncateToTokens } = require('../core/tokenService');
  const modelContextService = require('../context/modelContextService');
  const budget = await modelContextService.getTokenBudget(requested_model);

  let truncatedContext = context;
  const ragTokens = estimateTokens(context);
  if (ragTokens > budget.maxRagTokens) {
    logger.warn(
      `[JOB ${jobId}] RAG context exceeds budget: ${ragTokens} > ${budget.maxRagTokens} tokens, truncating`
    );
    truncatedContext = truncateToTokens(context, budget.maxRagTokens);
  }

  // Build optimized prompt with truncated RAG context
  const contextBudgetManager = require('../context/contextBudgetManager');
  const optimized = await contextBudgetManager.buildOptimizedPrompt({
    messages: [{ role: 'user', content: query }],
    systemPrompt: ragSystemPrompt,
    model: requested_model,
    conversationId: job.conversation_id,
    ragContext: truncatedContext,
    userId: null,
  });

  logger.info(`[JOB ${jobId}] RAG context budget: ${JSON.stringify(optimized.tokenBreakdown)}`);

  // Send context debug info to frontend
  service.notifySubscribers(jobId, {
    type: 'context_info',
    tokenBreakdown: optimized.tokenBreakdown,
  });

  const prompt = `${ragSystemPrompt}\n\n${truncatedContext}\n\nFrage: ${query}`;

  // Store sources in job (don't notify - rag.js already sent sources event)
  if (sources) {
    await llmJobService.updateJobContent(jobId, null, null, sources);
  }

  await streamFromOllama(
    ctx,
    jobId,
    prompt,
    enableThinking,
    0.7,
    32768,
    requested_model,
    '',
    optimized.numCtx
  );
}

/**
 * Stream from Ollama and persist to database
 * @param {Object} ctx - Context with dependencies
 * @param {string} jobId - Job UUID
 * @param {string} prompt - User prompt/messages
 * @param {boolean} enableThinking - Whether thinking mode is enabled
 * @param {number} temperature - Temperature setting
 * @param {number} maxTokens - Max tokens to generate
 * @param {string|null} model - Model to use (null = default)
 * @param {string} systemPrompt - Optional system prompt (e.g., company context)
 * @param {number|null} numCtx - Context window size (from budget manager)
 */
async function streamFromOllama(
  ctx,
  jobId,
  prompt,
  enableThinking,
  temperature,
  maxTokens,
  model = null,
  systemPrompt = '',
  numCtx = null
) {
  const { database, logger, llmJobService, modelService, axios, getOllamaReadiness } = ctx.deps;
  const { LLM_SERVICE_URL } = ctx.config;
  const service = ctx.service;

  // Use specified model or resolve default (model should already be validated in enqueue)
  const catalogModelId = model || (await modelService.getDefaultModel());

  if (!catalogModelId) {
    throw new Error('Kein LLM-Model verfügbar. Bitte laden Sie ein Model im Model Store herunter.');
  }

  // Resolve ollama_name from catalog (catalog ID -> Ollama registry name)
  let ollamaName = catalogModelId;
  try {
    const catalogResult = await database.query(
      `SELECT COALESCE(ollama_name, id) as effective_ollama_name
                 FROM llm_model_catalog WHERE id = $1`,
      [catalogModelId]
    );
    if (catalogResult.rows.length > 0) {
      ollamaName = catalogResult.rows[0].effective_ollama_name;
    }
  } catch (err) {
    logger.warn(`Could not resolve ollama_name for ${catalogModelId}, using as-is: ${err.message}`);
  }

  let contentBuffer = '';
  let thinkingBuffer = '';
  let lastDbWrite = Date.now();

  // Serialize database writes without unbounded promise chains
  let flushInProgress = false;
  let flushQueued = null; // { content, thinking } - next flush to run after current completes
  let lastFlushResult = Promise.resolve();

  const flushToDatabase = (force = false) => {
    const now = Date.now();
    const shouldFlush =
      force ||
      now - lastDbWrite > BATCH_INTERVAL_MS ||
      contentBuffer.length >= BATCH_SIZE_CHARS ||
      thinkingBuffer.length >= BATCH_SIZE_CHARS;

    if (shouldFlush && (contentBuffer || thinkingBuffer)) {
      const contentToFlush = contentBuffer;
      const thinkingToFlush = thinkingBuffer;
      contentBuffer = '';
      thinkingBuffer = '';
      lastDbWrite = now;

      if (flushInProgress) {
        // A flush is already running - merge into next queued flush
        if (flushQueued) {
          flushQueued.content += contentToFlush;
          flushQueued.thinking += thinkingToFlush;
        } else {
          flushQueued = { content: contentToFlush, thinking: thinkingToFlush };
        }
      } else {
        // No flush running - start one
        lastFlushResult = runFlush(contentToFlush, thinkingToFlush);
      }
    }

    return lastFlushResult;
  };

  const runFlush = async (content, thinking) => {
    flushInProgress = true;
    try {
      // QUEUE-002: Retry logic for DB errors (2 attempts with backoff)
      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await llmJobService.updateJobContent(jobId, content || null, thinking || null);
          break; // Success, exit retry loop
        } catch (dbError) {
          if (attempt < maxRetries) {
            logger.warn(
              `DB write attempt ${attempt} failed for job ${jobId}, retrying in ${attempt * 100}ms: ${dbError.message}`
            );
            await new Promise(r => {
              setTimeout(r, attempt * 100);
            });
          } else {
            logger.error(
              `Failed to flush content to DB for job ${jobId} after ${maxRetries} attempts: ${dbError.message}`
            );
          }
        }
      }
    } catch (err) {
      logger.error(`Flush error for job ${jobId}: ${err.message}`);
    } finally {
      flushInProgress = false;
      // Process queued flush if any
      if (flushQueued) {
        const next = flushQueued;
        flushQueued = null;
        lastFlushResult = runFlush(next.content, next.thinking);
      }
    }
  };

  // LEAK-001: Track response stream for cleanup
  let responseStream = null;

  try {
    const abortController = new AbortController();
    llmJobService.registerStream(jobId, abortController);

    // P4-002: Performance metrics tracking
    const streamStartTime = Date.now();
    let firstTokenTime = null;
    let tokenCount = 0;

    logger.info(
      `[QUEUE] Starting Ollama stream for job ${jobId} with model ${catalogModelId} (Ollama: ${ollamaName})${systemPrompt ? ' [with system prompt]' : ''}`
    );

    // Build Ollama payload
    const ollamaOptions = {
      temperature: temperature || 0.7,
      num_predict: maxTokens || 32768,
      num_batch: 512, // Optimal for Jetson Orin's 2048 CUDA cores
    };

    // Context Management: Set num_ctx from budget manager
    if (numCtx) {
      ollamaOptions.num_ctx = numCtx;
    }

    const ollamaPayload = {
      model: ollamaName,
      prompt: prompt,
      stream: true,
      think: enableThinking,
      keep_alive: parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300'),
      options: ollamaOptions,
    };

    // Add system prompt if provided (for company context injection)
    if (systemPrompt) {
      ollamaPayload.system = systemPrompt;
    }

    // Use native http.request instead of axios for streaming to avoid buffering issues
    const ollamaUrl = new URL(`${LLM_SERVICE_URL}/api/generate`);
    responseStream = await new Promise((resolve, reject) => {
      const payload = JSON.stringify(ollamaPayload);
      const req = http.request(
        {
          hostname: ollamaUrl.hostname,
          port: ollamaUrl.port,
          path: ollamaUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          agent: ollamaAgent,
          timeout: 600000,
        },
        res => {
          if (res.statusCode !== 200) {
            reject(new Error(`Ollama returned HTTP ${res.statusCode}`));
            return;
          }
          // Pause immediately to prevent data loss before handlers are registered
          res.pause();
          resolve(res);
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Ollama request timeout'));
      });
      // Support abort via AbortController
      abortController.signal.addEventListener('abort', () => req.destroy());
      req.write(payload);
      req.end();
    });
    let buffer = '';
    let inThinkBlock = false;

    // LEAK-001: Helper to clean up stream listeners and destroy stream
    let streamHeartbeat = null; // Forward declaration for cleanup
    const cleanupStream = () => {
      if (streamHeartbeat) {
        clearInterval(streamHeartbeat);
        streamHeartbeat = null;
      }
      if (responseStream) {
        responseStream.removeAllListeners();
        if (!responseStream.destroyed) {
          responseStream.destroy();
        }
        responseStream = null;
      }
    };

    // TIMEOUT-001: Inactivity timeout (5 minutes)
    // If no data received for 5 minutes, abort the stream to prevent deadlock
    // Increased from 2min to 5min: think mode on Jetson can pause 2-3min between blocks
    const INACTIVITY_TIMEOUT_MS = 300000; // 5 minutes
    let inactivityTimer = null;

    const resetInactivityTimer = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }
      inactivityTimer = setTimeout(async () => {
        logger.warn(
          `[QUEUE] Job ${jobId} stream timed out due to inactivity (${INACTIVITY_TIMEOUT_MS / 1000}s)`
        );
        abortController.abort();
        await flushToDatabase(true);
        await llmJobService.errorJob(jobId, 'Stream timed out due to inactivity');
        service.notifySubscribers(jobId, {
          error: 'Stream timed out due to inactivity',
          done: true,
        });
        onJobComplete(ctx, jobId);
      }, INACTIVITY_TIMEOUT_MS);
    };

    const clearInactivityTimer = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    };

    // Start the inactivity timer
    resetInactivityTimer();

    // Streaming heartbeat: send periodic events to prevent frontend timeout during long think pauses
    const HEARTBEAT_INTERVAL_MS = 20000; // 20s heartbeat
    streamHeartbeat = setInterval(() => {
      service.notifySubscribers(jobId, {
        type: 'heartbeat',
        status: 'generating',
      });
    }, HEARTBEAT_INTERVAL_MS);

    // CRITICAL: Wrap stream consumption in a Promise so the try block stays alive.
    // Without this, the finally block runs immediately after resume() and destroys
    // the stream before any data events can fire — the root cause of the timeout bug.
    await new Promise((resolveStream, rejectStream) => {
      responseStream.on('data', async chunk => {
        try {
          // Reset inactivity timer on each chunk
          resetInactivityTimer();
          buffer += chunk.toString();

          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }

            try {
              const data = JSON.parse(line);

              // Native Ollama thinking: separate `thinking` and `response` fields
              if (data.thinking) {
                if (firstTokenTime === null) {
                  firstTokenTime = Date.now();
                }
                tokenCount++;
                if (!inThinkBlock) {
                  inThinkBlock = true;
                }
                thinkingBuffer += data.thinking;
                service.notifySubscribers(jobId, { type: 'thinking', token: data.thinking });
                flushToDatabase();
              }

              if (data.response) {
                if (firstTokenTime === null) {
                  firstTokenTime = Date.now();
                }
                tokenCount++;
                if (inThinkBlock) {
                  inThinkBlock = false;
                  service.notifySubscribers(jobId, { type: 'thinking_end' });
                }
                contentBuffer += data.response;
                service.notifySubscribers(jobId, { type: 'response', token: data.response });
                flushToDatabase();
              }

              if (data.done) {
                const streamEndTime = Date.now();
                const totalDuration = streamEndTime - streamStartTime;
                const ttft = firstTokenTime ? firstTokenTime - streamStartTime : null;
                const tokensPerSecond =
                  totalDuration > 0 ? ((tokenCount * 1000) / totalDuration).toFixed(2) : 0;

                // Context Management: Capture Ollama token metadata
                const promptTokens = data.prompt_eval_count || null;
                const completionTokens = data.eval_count || null;

                logger.info(
                  `[QUEUE] Job ${jobId} stream complete - ${tokenCount} tokens in ${totalDuration}ms (${tokensPerSecond} tok/s)` +
                    (promptTokens
                      ? ` [prompt: ${promptTokens}, completion: ${completionTokens}]`
                      : '')
                );
                clearInactivityTimer();
                cleanupStream(); // LEAK-001: Remove listeners and destroy stream
                await flushToDatabase(true);
                await llmJobService.completeJob(jobId);

                // Context Management: Store token counts and context window in llm_jobs
                if (promptTokens || completionTokens || numCtx) {
                  try {
                    await database.query(
                      `UPDATE llm_jobs SET prompt_tokens = $1, completion_tokens = $2, context_window_used = $3 WHERE id = $4`,
                      [promptTokens, completionTokens, numCtx, jobId]
                    );
                  } catch (tokenErr) {
                    logger.debug(`[QUEUE] Failed to store token counts: ${tokenErr.message}`);
                  }
                }

                // P4-002: Record performance metrics
                try {
                  // Get job type from database
                  const jobResult = await database.query(
                    `SELECT job_type FROM llm_jobs WHERE id = $1`,
                    [jobId]
                  );
                  const jobType = jobResult.rows[0]?.job_type || 'chat';

                  await database.query(
                    `SELECT record_model_performance($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                      catalogModelId,
                      jobId,
                      jobType,
                      tokenCount,
                      totalDuration,
                      ttft,
                      enableThinking,
                      prompt.length,
                    ]
                  );
                } catch (metricsError) {
                  logger.warn(
                    `[QUEUE] Failed to record performance metrics: ${metricsError.message}`
                  );
                }

                service.notifySubscribers(jobId, {
                  done: true,
                  model: data.model || catalogModelId || 'unknown',
                  jobId,
                  timestamp: new Date().toISOString(),
                  // P4-002: Include performance stats in response
                  performance: {
                    tokens: tokenCount,
                    duration_ms: totalDuration,
                    tokens_per_second: parseFloat(tokensPerSecond),
                    ttft_ms: ttft,
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                  },
                });

                onJobComplete(ctx, jobId);
                resolveStream(); // Signal that stream processing is complete
              }
            } catch (parseError) {
              // Ignore parse errors for incomplete JSON
            }
          }
        } catch (err) {
          logger.error(`Stream data handler error for job ${jobId}: ${err.message}`);
        }
      });

      responseStream.on('error', async error => {
        try {
          clearInactivityTimer();
          cleanupStream(); // LEAK-001: Remove listeners and destroy stream

          // STREAM-002: Emit thinking_end on error if mid-think
          if (inThinkBlock) {
            inThinkBlock = false;
            service.notifySubscribers(jobId, { type: 'thinking_end' });
          }

          logger.error(`[QUEUE] Stream error for job ${jobId}: ${error.message}`);
          await flushToDatabase(true);
          await llmJobService.errorJob(jobId, error.message);

          service.notifySubscribers(jobId, { error: error.message, done: true });
          onJobComplete(ctx, jobId);
          resolveStream(); // Resolve (not reject) — error handling is done above
        } catch (err) {
          logger.error(`Stream error handler error for job ${jobId}: ${err.message}`);
          onJobComplete(ctx, jobId);
          resolveStream();
        }
      });

      responseStream.on('end', async () => {
        try {
          clearInactivityTimer();
          cleanupStream(); // LEAK-001: Remove listeners and destroy stream

          // STREAM-002: If stream ends mid-thinking, emit thinking_end so frontend exits thinking state
          if (inThinkBlock) {
            inThinkBlock = false;
            service.notifySubscribers(jobId, { type: 'thinking_end' });
            logger.warn(`[QUEUE] Job ${jobId} stream ended mid-think block - emitted thinking_end`);
          }

          if (contentBuffer || thinkingBuffer) {
            await flushToDatabase(true);
          }

          // CRITICAL FIX (QUEUE-001): Complete job if stream ended without done signal
          // This prevents permanent deadlock when Ollama closes stream unexpectedly
          try {
            const job = await llmJobService.getJob(jobId);
            if (job && job.status === 'streaming') {
              logger.warn(`[QUEUE] Job ${jobId} stream ended without done signal - completing`);
              await llmJobService.completeJob(jobId);
              service.notifySubscribers(jobId, {
                done: true,
                model: catalogModelId || 'unknown',
                jobId,
                timestamp: new Date().toISOString(),
              });
              onJobComplete(ctx, jobId);
            }
          } catch (endError) {
            logger.error(`[QUEUE] Error in end handler for job ${jobId}: ${endError.message}`);
            onJobComplete(ctx, jobId); // Prevent permanent deadlock
          }
          resolveStream();
        } catch (err) {
          logger.error(`Stream end handler error for job ${jobId}: ${err.message}`);
          onJobComplete(ctx, jobId);
          resolveStream();
        }
      });

      // Resume stream after ALL handlers (data, error, end) are registered
      // This is critical: if Ollama responds very fast, data may already be buffered
      // in the readable stream. Without pause/resume, the data events would be lost.
      responseStream.resume();
    });
  } catch (error) {
    logger.error(`[QUEUE] Error streaming for job ${jobId}: ${error.message}`);
    await llmJobService.errorJob(jobId, error.message);

    service.notifySubscribers(jobId, { error: error.message, done: true });
    onJobComplete(ctx, jobId);
  } finally {
    // LEAK-001: Always ensure stream is cleaned up, even if catch handler throws
    if (responseStream) {
      responseStream.removeAllListeners();
      if (!responseStream.destroyed) {
        responseStream.destroy();
      }
      responseStream = null;
    }
  }
}

/**
 * Called when a job completes (success, error, or cancel)
 * @param {Object} ctx - Context with dependencies
 * @param {string} jobId - Job UUID
 */
function onJobComplete(ctx, jobId) {
  const { getOllamaReadiness } = ctx.deps;
  const service = ctx.service;

  if (service.processingJobId === jobId) {
    service.processingJobId = null;

    // Track request end for smart unloading
    const ollamaReadiness = getOllamaReadiness();
    if (ollamaReadiness) {
      ollamaReadiness.trackRequestEnd(jobId);
    }

    // Clean up subscribers AND timestamps
    service.jobSubscribers.delete(jobId);
    service.jobSubscriberTimestamps.delete(jobId);

    // Emit queue update
    service.emit('queue:update');

    // Process next job
    setImmediate(() => service.processNext());
  }
}

module.exports = {
  processChatJob,
  processRAGJob,
  streamFromOllama,
  onJobComplete,
  // LEAK-001: Export for cleanup on shutdown
  destroyOllamaAgent: () => ollamaAgent.destroy(),
};
