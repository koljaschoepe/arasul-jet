/**
 * LLM Ollama Stream — native http streaming from Ollama, OOM recovery,
 * content batching, and job completion signalling.
 * Extracted from llmJobProcessor.js.
 */

/* eslint-disable no-promise-executor-return */

const http = require('http');

// OOM error patterns from Ollama/CUDA
const OOM_PATTERNS = [
  'out of memory',
  'oom',
  'cuda error',
  'cuda_error_out_of_memory',
  'failed to allocate',
  'insufficient memory',
  'nicht genügend speicher',
];

/**
 * Check if an error message indicates a GPU OOM condition
 */
function isOomError(message) {
  const lower = (message || '').toLowerCase();
  return OOM_PATTERNS.some(p => lower.includes(p));
}

/**
 * Attempt GPU OOM recovery via llm-service /api/gpu/recover endpoint.
 * Returns { recovered, free_mb } or null on failure.
 */
async function attemptOomRecovery(logger) {
  const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || 'http://llm-service:11436';
  try {
    logger.warn('[OOM-RECOVERY] Triggering GPU memory recovery via llm-service...');
    const response = await fetch(`${LLM_SERVICE_URL}/api/gpu/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const result = await response.json();
      logger.info(
        `[OOM-RECOVERY] Success — freed ${result.freed_mb}MB, ` +
          `${result.free_mb}MB now available, can_retry: ${result.can_retry}`
      );
      return result;
    }
    logger.error(`[OOM-RECOVERY] llm-service returned ${response.status}`);
    return null;
  } catch (err) {
    logger.error(`[OOM-RECOVERY] Failed to contact llm-service: ${err.message}`);
    return null;
  }
}

// Content batching configuration — balanced latency vs CPU overhead
const BATCH_INTERVAL_MS = 150;
const BATCH_SIZE_CHARS = 200;

// Shared HTTP agent for Ollama connections (keep-alive + connection pooling)
const ollamaAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: 600000,
});

async function streamFromOllama(
  ctx,
  jobId,
  prompt,
  enableThinking,
  temperature,
  maxTokens,
  model = null,
  systemPrompt = '',
  numCtx = null,
  images = null
) {
  const { database, logger, llmJobService, modelService } = ctx.deps;
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
        // A flush is already running - queue for next flush (atomic swap, no concat)
        // RACE-FIX: Use atomic swap instead of concatenation to prevent data duplication
        if (flushQueued) {
          flushQueued = {
            content: flushQueued.content + contentToFlush,
            thinking: flushQueued.thinking + thinkingToFlush,
          };
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
    // RACE-FIX: Iterative loop instead of recursive calls to prevent stack overflow
    // and ensure queued flushes are processed in order without deep promise chains
    let currentContent = content;
    let currentThinking = thinking;
    try {
      while (true) {
        // QUEUE-002: Retry logic for DB errors (2 attempts with backoff)
        const maxRetries = 2;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await llmJobService.updateJobContent(
              jobId,
              currentContent || null,
              currentThinking || null
            );
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

        // Check for queued flush (atomic swap)
        if (flushQueued) {
          const next = flushQueued;
          flushQueued = null;
          currentContent = next.content;
          currentThinking = next.thinking;
          // Continue loop to process queued flush
        } else {
          break; // No more queued flushes
        }
      }
    } catch (err) {
      logger.error(`Flush error for job ${jobId}: ${err.message}`);
    } finally {
      flushInProgress = false;
    }
  };

  // LEAK-001 / LLM-01: Track response stream AND timers for cleanup
  let responseStream = null;
  let streamHeartbeat = null;
  let inactivityTimer = null;

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

    // Dynamic keep-alive from lifecycle service
    let keepAlive;
    try {
      const modelLifecycleService = require('./modelLifecycleService');
      const lifecycle = await modelLifecycleService.getCurrentKeepAlive();
      keepAlive = lifecycle.keepAliveSeconds;
    } catch {
      keepAlive = parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300');
    }

    const ollamaPayload = {
      model: ollamaName,
      prompt: prompt,
      stream: true,
      think: enableThinking,
      keep_alive: keepAlive,
      options: ollamaOptions,
    };

    // Add images for vision models (Ollama expects array of base64 strings)
    if (images && images.length > 0) {
      ollamaPayload.images = images;
      logger.info(`[JOB ${jobId}] Sending ${images.length} image(s) to Ollama vision model`);
    }

    // Add system prompt if provided (for company context injection)
    if (systemPrompt) {
      ollamaPayload.system = systemPrompt;
    }

    // Use native http.request instead of axios for streaming to avoid buffering issues
    // RETRY-FIX: Retry transient failures (ECONNREFUSED, 500, 503) with exponential backoff
    const ollamaUrl = new URL(`${LLM_SERVICE_URL}/api/generate`);
    const MAX_OLLAMA_RETRIES = 3;
    for (let ollamaAttempt = 1; ollamaAttempt <= MAX_OLLAMA_RETRIES; ollamaAttempt++) {
      try {
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
              if (res.statusCode >= 500) {
                reject(new Error(`Ollama returned HTTP ${res.statusCode}`));
                return;
              }
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
        break; // Success, exit retry loop
      } catch (ollamaErr) {
        const isRetryable =
          ollamaErr.message.includes('ECONNREFUSED') ||
          ollamaErr.message.includes('HTTP 500') ||
          ollamaErr.message.includes('HTTP 502') ||
          ollamaErr.message.includes('HTTP 503') ||
          ollamaErr.message.includes('ECONNRESET');
        if (isRetryable && ollamaAttempt < MAX_OLLAMA_RETRIES) {
          const delay = ollamaAttempt * 2000; // 2s, 4s
          logger.warn(
            `[JOB ${jobId}] Ollama connection attempt ${ollamaAttempt}/${MAX_OLLAMA_RETRIES} failed: ${ollamaErr.message}, retrying in ${delay}ms`
          );
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw ollamaErr;
        }
      }
    } // end retry loop
    let buffer = '';
    let inThinkBlock = false;
    let thinkingEndEmitted = false; // STREAM-002 FIX: Guard against double thinking_end emission

    // LEAK-001: Helper to clean up stream listeners and destroy stream.
    // streamHeartbeat/inactivityTimer live in outer scope so finally can reach them.
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

    // TIMEOUT-001: Inactivity timeout (10 minutes)
    // If no data received for this period, abort the stream to prevent deadlock
    // 10min: think mode on Jetson can pause 2-3min between blocks, large models need more headroom
    const INACTIVITY_TIMEOUT_MS = parseInt(process.env.LLM_INACTIVITY_TIMEOUT_MS, 10) || 600000; // 10 minutes

    const resetInactivityTimer = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
      }
      inactivityTimer = setTimeout(async () => {
        try {
          logger.warn(
            `[QUEUE] Job ${jobId} stream timed out due to inactivity (${INACTIVITY_TIMEOUT_MS / 1000}s)`
          );
          abortController.abort();
          cleanupStream();
          await flushToDatabase(true);
          await llmJobService.errorJob(jobId, 'Stream timed out due to inactivity');
          service.notifySubscribers(jobId, {
            error: 'Stream timed out due to inactivity',
            done: true,
          });
          onJobComplete(ctx, jobId);
        } catch (err) {
          logger.error(
            `[QUEUE] Inactivity timeout handler failed for job ${jobId}: ${err.message}`
          );
        }
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
    await new Promise((resolveStream, _rejectStream) => {
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
                service.notifySubscribersBatched(jobId, { type: 'thinking', token: data.thinking });
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
                service.notifySubscribersBatched(jobId, { type: 'response', token: data.response });
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
                let persistenceSuccess = false;
                try {
                  persistenceSuccess = await llmJobService.completeJob(jobId);
                } catch (completeErr) {
                  logger.error(
                    `[JOB ${jobId}] completeJob failed after stream done ` +
                      `(tokens: ${tokenCount}, duration: ${totalDuration}ms): ${completeErr.message}`
                  );
                  // Retry once more after 2 seconds
                  try {
                    await new Promise(r => setTimeout(r, 2000));
                    persistenceSuccess = await llmJobService.completeJob(jobId);
                    logger.info(`[JOB ${jobId}] completeJob retry in processor succeeded`);
                  } catch (retryErr) {
                    logger.error(
                      `[JOB ${jobId}] completeJob processor retry also failed: ${retryErr.message}`
                    );
                  }
                }

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
                  persisted: persistenceSuccess,
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

          // STREAM-002 FIX: Emit thinking_end on error if mid-think (guarded)
          if (inThinkBlock && !thinkingEndEmitted) {
            inThinkBlock = false;
            thinkingEndEmitted = true;
            service.notifySubscribers(jobId, { type: 'thinking_end' });
          }

          logger.error(`[QUEUE] Stream error for job ${jobId}: ${error.message}`);

          // GPU OOM detection — trigger recovery to free memory for subsequent jobs
          if (isOomError(error.message)) {
            logger.warn(`[QUEUE] OOM detected for job ${jobId}, triggering GPU recovery`);
            service.notifySubscribers(jobId, {
              type: 'error',
              error: 'GPU-Speicher voll — Modelle werden entladen. Bitte erneut versuchen.',
              done: true,
            });
            await flushToDatabase(true);
            await llmJobService.errorJob(jobId, `OOM: ${error.message}`);
            // Fire-and-forget recovery so next job has memory
            attemptOomRecovery(logger).catch(() => {});
          } else {
            await flushToDatabase(true);
            await llmJobService.errorJob(jobId, error.message);
            service.notifySubscribers(jobId, { error: error.message, done: true });
          }

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

          // STREAM-002 FIX: If stream ends mid-thinking, emit thinking_end (guarded against double emission)
          if (inThinkBlock && !thinkingEndEmitted) {
            inThinkBlock = false;
            thinkingEndEmitted = true;
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

    // GPU OOM detection — trigger recovery for subsequent jobs
    if (isOomError(error.message)) {
      logger.warn(`[QUEUE] OOM detected in stream setup for job ${jobId}, triggering GPU recovery`);
      await llmJobService.errorJob(jobId, `OOM: ${error.message}`);
      service.notifySubscribers(jobId, {
        type: 'error',
        error: 'GPU-Speicher voll — Modelle werden entladen. Bitte erneut versuchen.',
        done: true,
      });
      attemptOomRecovery(logger).catch(() => {});
    } else {
      await llmJobService.errorJob(jobId, error.message);
      service.notifySubscribers(jobId, { error: error.message, done: true });
    }

    onJobComplete(ctx, jobId);
  } finally {
    // LEAK-001 + LLM-01: Always clean up stream AND both timers, even if the
    // outer catch threw before any handler could call cleanupStream.
    if (streamHeartbeat) {
      clearInterval(streamHeartbeat);
      streamHeartbeat = null;
    }
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
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
  streamFromOllama,
  onJobComplete,
  isOomError,
  attemptOomRecovery,
  destroyOllamaAgent: () => ollamaAgent.destroy(),
};
