/**
 * LLM Job Processor
 * Handles the actual processing of chat and RAG jobs, including Ollama streaming.
 *
 * Extracted from llmQueueService.js to reduce file size.
 * All functions receive a `ctx` object with dependencies and service references.
 */

const http = require('http');

// Content batching configuration
const BATCH_INTERVAL_MS = 500;
const BATCH_SIZE_CHARS = 100;

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

  // Enable thinking only if requested AND model supports it
  const enableThinking = thinking !== false && modelSupportsThinking;

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
  const { buildSystemPrompt } = require('./systemPromptBuilder');
  const systemPrompt = await buildSystemPrompt(database, job.conversation_id);

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

  // Build prompt with thinking prefix
  const thinkingPrefix = enableThinking ? '' : '/no_think\n';
  const prompt = thinkingPrefix + optimized.prompt;

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
  const thinkingInstruction = enableThinking ? '' : '/no_think\n';
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

  const ragSystemPrompt = `${thinkingInstruction}Du bist ein professioneller Wissensassistent fuer ein Unternehmen.

${ragRules}`;

  // Context Management: Build optimized prompt with RAG context
  const contextBudgetManager = require('../context/contextBudgetManager');
  const optimized = await contextBudgetManager.buildOptimizedPrompt({
    messages: [{ role: 'user', content: query }],
    systemPrompt: ragSystemPrompt,
    model: requested_model,
    conversationId: job.conversation_id,
    ragContext: context,
    userId: null,
  });

  logger.info(`[JOB ${jobId}] RAG context budget: ${JSON.stringify(optimized.tokenBreakdown)}`);

  // Send context debug info to frontend
  service.notifySubscribers(jobId, {
    type: 'context_info',
    tokenBreakdown: optimized.tokenBreakdown,
  });

  const prompt = `${ragSystemPrompt}\n\n${context}\n\nFrage: ${query}`;

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

  // Promise queue to serialize database writes
  let flushPromise = Promise.resolve();

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

      flushPromise = flushPromise.then(async () => {
        // QUEUE-002: Retry logic for DB errors (2 attempts with backoff)
        const maxRetries = 2;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await llmJobService.updateJobContent(
              jobId,
              contentToFlush || null,
              thinkingToFlush || null
            );
            return; // Success, exit retry loop
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
      });
    }

    return flushPromise;
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
    };

    // Context Management: Set num_ctx from budget manager
    if (numCtx) {
      ollamaOptions.num_ctx = numCtx;
    }

    const ollamaPayload = {
      model: ollamaName,
      prompt: prompt,
      stream: true,
      keep_alive: parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300'),
      options: ollamaOptions,
    };

    // Add system prompt if provided (for company context injection)
    if (systemPrompt) {
      ollamaPayload.system = systemPrompt;
    }

    const response = await axios({
      method: 'post',
      url: `${LLM_SERVICE_URL}/api/generate`,
      data: ollamaPayload,
      responseType: 'stream',
      timeout: 600000,
      signal: abortController.signal,
      httpAgent: ollamaAgent,
    });

    responseStream = response.data;
    let buffer = '';
    let inThinkBlock = false;

    // LEAK-001: Helper to clean up stream listeners and destroy stream
    const cleanupStream = () => {
      if (responseStream) {
        responseStream.removeAllListeners();
        if (!responseStream.destroyed) {
          responseStream.destroy();
        }
        responseStream = null;
      }
    };

    // TIMEOUT-001: Inactivity timeout (2 minutes)
    // If no data received for 2 minutes, abort the stream to prevent deadlock
    const INACTIVITY_TIMEOUT_MS = 120000; // 2 minutes
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

    responseStream.on('data', async chunk => {
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

          if (data.response) {
            const token = data.response;

            // P4-002: Track first token time and count
            if (firstTokenTime === null) {
              firstTokenTime = Date.now();
            }
            tokenCount++;

            // Process thinking blocks
            if (!enableThinking) {
              if (token.includes('<think>')) {
                inThinkBlock = true;
                const parts = token.split('<think>');
                if (parts[0]) {
                  contentBuffer += parts[0];
                  service.notifySubscribers(jobId, { type: 'response', token: parts[0] });
                }
                continue;
              }
              if (token.includes('</think>')) {
                inThinkBlock = false;
                const parts = token.split('</think>');
                if (parts[1]) {
                  contentBuffer += parts[1];
                  service.notifySubscribers(jobId, { type: 'response', token: parts[1] });
                }
                continue;
              }
              if (inThinkBlock) {
                continue;
              }

              contentBuffer += token;
              service.notifySubscribers(jobId, { type: 'response', token });
            } else {
              if (token.includes('<think>')) {
                inThinkBlock = true;
                const parts = token.split('<think>');
                if (parts[0]) {
                  contentBuffer += parts[0];
                  service.notifySubscribers(jobId, { type: 'response', token: parts[0] });
                }
                if (parts[1]) {
                  thinkingBuffer += parts[1];
                  service.notifySubscribers(jobId, { type: 'thinking', token: parts[1] });
                }
              } else if (token.includes('</think>')) {
                inThinkBlock = false;
                const parts = token.split('</think>');
                if (parts[0]) {
                  thinkingBuffer += parts[0];
                  service.notifySubscribers(jobId, { type: 'thinking', token: parts[0] });
                }
                service.notifySubscribers(jobId, { type: 'thinking_end' });
                if (parts[1]) {
                  contentBuffer += parts[1];
                  service.notifySubscribers(jobId, { type: 'response', token: parts[1] });
                }
              } else if (inThinkBlock) {
                thinkingBuffer += token;
                service.notifySubscribers(jobId, { type: 'thinking', token });
              } else {
                contentBuffer += token;
                service.notifySubscribers(jobId, { type: 'response', token });
              }
            }

            await flushToDatabase();
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
                (promptTokens ? ` [prompt: ${promptTokens}, completion: ${completionTokens}]` : '')
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
              logger.warn(`[QUEUE] Failed to record performance metrics: ${metricsError.message}`);
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
          }
        } catch (parseError) {
          // Ignore parse errors for incomplete JSON
        }
      }
    });

    responseStream.on('error', async error => {
      clearInactivityTimer();
      cleanupStream(); // LEAK-001: Remove listeners and destroy stream
      logger.error(`[QUEUE] Stream error for job ${jobId}: ${error.message}`);
      await flushToDatabase(true);
      await llmJobService.errorJob(jobId, error.message);

      service.notifySubscribers(jobId, { error: error.message, done: true });
      onJobComplete(ctx, jobId);
    });

    responseStream.on('end', async () => {
      clearInactivityTimer();
      cleanupStream(); // LEAK-001: Remove listeners and destroy stream
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
    });
  } catch (error) {
    // LEAK-001: Ensure stream is cleaned up on connection errors
    if (responseStream) {
      responseStream.removeAllListeners();
      if (!responseStream.destroyed) {
        responseStream.destroy();
      }
      responseStream = null;
    }
    logger.error(`[QUEUE] Error streaming for job ${jobId}: ${error.message}`);
    await llmJobService.errorJob(jobId, error.message);

    service.notifySubscribers(jobId, { error: error.message, done: true });
    onJobComplete(ctx, jobId);
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
    service.isProcessing = false;
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
