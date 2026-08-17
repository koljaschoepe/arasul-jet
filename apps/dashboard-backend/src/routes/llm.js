/**
 * LLM API routes
 * Proxies requests to the LLM service (Ollama) via Queue System
 * Supports background streaming with tab-switch resilience
 * Only ONE stream at a time to prevent GPU memory overload
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { llmLimiter } = require('../middleware/rateLimit');
const llmJobService = require('../services/llm/llmJobService');
const llmQueueService = require('../services/llm/llmQueueService');
const engineGateway = require('../services/llm/engineGateway');
const database = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { PrioritizeJobBody, ChatBody } = require('../schemas/llm');
const { NotFoundError } = require('../utils/errors');
const { initSSE, trackConnection } = require('../utils/sseHelper');

/**
 * POST /api/llm/chat - Start a chat completion with Queue support
 * Job is added to queue and processed sequentially
 * Supports model selection and workflow model sequences
 */
router.post(
  '/chat',
  requireAuth,
  llmLimiter,
  validateBody(ChatBody),
  asyncHandler(async (req, res) => {
    const {
      messages,
      temperature,
      max_tokens,
      stream,
      thinking,
      conversation_id,
      model, // Optional: explicit model to use
      model_sequence, // Optional: for workflows, e.g. ['qwen3:7b', 'qwen3:32b']
      priority, // Optional: 0=normal, 1=high
      images, // Optional: base64-encoded images for vision models
      agent, // Optional: Agent-Modus (Werkzeugschleife im Chat)
      datei_modus, // Optional: Antwort ausdrücklich als Datei speichern
      ablage_ziel, // Optional: relativer Ziel-Ordner in der Projektablage
      space_ids, // Optional: Ordner-Fokus für die Agent-Wissenssuche
    } = req.body;
    const enableThinking = thinking !== false;

    // P8.2: route-level try/catch removed. ECONNREFUSED → ServiceUnavailableError
    // mapping is handled centrally by middleware/errorHandler.js. Inner
    // try/catch around res.write (streaming subscribe) is retained because
    // SSE error handling is post-headers-sent and must not throw.
    {
      // Validate images if provided (must be array of base64 strings, max 5)
      let validatedImages = null;
      if (images && Array.isArray(images) && images.length > 0) {
        validatedImages = images
          .filter(img => typeof img === 'string' && img.length > 0)
          .map(img => {
            // Strip data URI prefix if present (e.g. "data:image/png;base64,...")
            const base64Match = img.match(/^data:image\/[^;]+;base64,(.+)$/);
            return base64Match ? base64Match[1] : img;
          });
        if (validatedImages.length === 0) {
          validatedImages = null;
        }
      }

      // Add job to queue with model options
      const {
        jobId,
        messageId,
        queuePosition,
        model: resolvedModel,
      } = await llmQueueService.enqueue(
        conversation_id,
        'chat',
        {
          messages,
          temperature,
          max_tokens,
          thinking: enableThinking,
          images: validatedImages,
          agent: agent === true,
          datei_modus: datei_modus === true,
          ablage_ziel: ablage_ziel || null,
          space_ids: Array.isArray(space_ids) && space_ids.length > 0 ? space_ids : null,
        },
        { model, modelSequence: model_sequence, priority: priority || 0 }
      );

      logger.info(
        `[QUEUE] Job ${jobId} enqueued for model ${resolvedModel} at position ${queuePosition}`
      );

      // If streaming is requested (default: true)
      if (stream !== false) {
        initSSE(res);

        // Send job info with queue position and model
        res.write(
          `data: ${JSON.stringify({
            type: 'job_started',
            jobId,
            messageId,
            queuePosition,
            model: resolvedModel,
            status: queuePosition > 1 ? 'queued' : 'pending',
          })}\n\n`
        );

        // Track client connection state
        const connection = trackConnection(res);
        let unsubscribe = null;

        connection.onClose(() => {
          logger.debug(`[JOB ${jobId}] Client disconnected, job continues in background`);
          if (unsubscribe) {
            unsubscribe();
          }
        });

        // Subscribe to job updates and forward to client
        unsubscribe = llmQueueService.subscribeToJob(jobId, event => {
          if (!connection.isConnected()) {
            return;
          }

          try {
            res.write(`data: ${JSON.stringify(event)}\n\n`);

            if (event.done) {
              res.end();
              unsubscribe();
            }
          } catch (err) {
            logger.debug(`[JOB ${jobId}] Write error: ${err.message}`);
          }
        });
      } else {
        // Non-streaming: return job ID immediately
        res.json({
          jobId,
          messageId,
          queuePosition,
          model: resolvedModel,
          status: queuePosition > 1 ? 'queued' : 'pending',
          timestamp: new Date().toISOString(),
        });
      }
    }
  })
);

/**
 * GET /api/llm/queue - Get global queue status
 */
router.get(
  '/queue',
  requireAuth,
  asyncHandler(async (req, res) => {
    const queueStatus = await llmQueueService.getQueueStatus();
    res.json(queueStatus);
  })
);

/**
 * GET /api/llm/queue/metrics - Get detailed queue metrics (for monitoring)
 */
router.get(
  '/queue/metrics',
  requireAuth,
  asyncHandler(async (req, res) => {
    const metrics = await llmQueueService.getQueueMetrics();
    res.json(metrics);
  })
);

/**
 * POST /api/llm/queue/prioritize - Prioritize a job
 */
router.post(
  '/queue/prioritize',
  requireAuth,
  validateBody(PrioritizeJobBody),
  asyncHandler(async (req, res) => {
    const { job_id } = req.body;
    await llmQueueService.prioritizeJob(job_id);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/llm/jobs/:jobId - Get job status and current content
 */
router.get(
  '/jobs/:jobId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const job = await llmJobService.getJob(req.params.jobId);

    if (!job || job.user_id !== req.user.id) {
      throw new NotFoundError('Job not found');
    }

    res.json({
      ...job,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/llm/jobs/:jobId/stream - Reconnect to an active job's stream
 */
router.get(
  '/jobs/:jobId/stream',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const job = await llmJobService.getJob(jobId);
    logger.debug(
      `[RECONNECT ${jobId}] Job status: ${job?.status}, content length: ${job?.content?.length || 0}`
    );

    if (!job || job.user_id !== req.user.id) {
      throw new NotFoundError('Job not found');
    }

    // Echte Warteposition (1 = als Nächstes dran) statt der globalen
    // queue_position-Sequenz — die ist nur internes Ordnungskriterium.
    let wartePosition = null;
    if (job.status === 'pending' && job.queue_position != null) {
      const vorGelagert = await database.query(
        `SELECT COUNT(*) AS cnt FROM llm_jobs
         WHERE status = 'pending' AND queue_position <= $1`,
        [job.queue_position]
      );
      wartePosition = parseInt(vorGelagert.rows[0].cnt) || 1;
    }

    initSSE(res);

    // Send current content immediately
    logger.debug(
      `[RECONNECT ${jobId}] Sending content: "${(job.content || '').substring(0, 50)}..."`
    );
    res.write(
      `data: ${JSON.stringify({
        type: 'reconnect',
        content: job.content || '',
        thinking: job.thinking || '',
        sources: job.sources,
        matchedSpaces: job.matched_spaces,
        status: job.status,
        queuePosition: wartePosition,
      })}\n\n`
    );

    // If job is completed or errored, end immediately
    if (job.status === 'completed') {
      res.write(`data: ${JSON.stringify({ done: true, status: 'completed' })}\n\n`);
      return res.end();
    }

    if (job.status === 'error' || job.status === 'cancelled') {
      res.write(
        `data: ${JSON.stringify({
          done: true,
          status: job.status,
          error: job.error_message,
        })}\n\n`
      );
      return res.end();
    }

    // For pending jobs in queue, show queue position
    if (job.status === 'pending') {
      res.write(
        `data: ${JSON.stringify({
          type: 'queued',
          queuePosition: wartePosition,
          status: 'pending',
        })}\n\n`
      );
    }

    // Track client connection and job completion to prevent race conditions
    const connection = trackConnection(res);
    let jobDone = false;
    let unsubscribe = null;
    let pollInterval = null;

    /** Helper to clear poll/timeout */
    const clearPoll = () => {
      if (pollInterval) {
        if (pollInterval.clear) {
          pollInterval.clear();
        } else {
          clearInterval(pollInterval);
        }
        pollInterval = null;
      }
    };

    /** Shared cleanup: stop poll, unsubscribe, end response */
    const finishStream = () => {
      if (jobDone) {
        return;
      }
      jobDone = true;
      clearPoll();
      if (unsubscribe) {
        unsubscribe();
      }
      try {
        res.end();
      } catch {
        /* already ended */
      }
    };

    connection.onClose(() => {
      logger.debug(`[RECONNECT ${jobId}] Client disconnected`);
      clearPoll();
      if (unsubscribe) {
        unsubscribe();
      }
    });

    // Subscribe to job updates
    unsubscribe = llmQueueService.subscribeToJob(jobId, event => {
      if (jobDone || !connection.isConnected()) {
        return;
      }

      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);

        if (event.done) {
          finishStream();
        }
      } catch (err) {
        logger.debug(`[RECONNECT ${jobId}] Write error: ${err.message}`);
      }
    });

    // Safety timeout: check if job completed while we weren't subscribed
    // (replaces 200ms polling - subscriber notifications are real-time)
    if (job.status === 'streaming' || job.status === 'pending') {
      const safetyTimeout = setTimeout(async () => {
        if (jobDone || !connection.isConnected()) {
          return;
        }

        try {
          const currentJob = await llmJobService.getJob(jobId);
          if (!currentJob) {
            res.write(
              `data: ${JSON.stringify({ done: true, status: 'error', error: 'Job not found' })}\n\n`
            );
            finishStream();
            return;
          }

          if (currentJob.status === 'completed') {
            res.write(
              `data: ${JSON.stringify({
                type: 'update',
                content: currentJob.content || '',
                thinking: currentJob.thinking || '',
                sources: currentJob.sources,
                matchedSpaces: currentJob.matched_spaces,
                done: true,
                status: 'completed',
              })}\n\n`
            );
            finishStream();
          } else if (currentJob.status === 'error' || currentJob.status === 'cancelled') {
            res.write(
              `data: ${JSON.stringify({
                done: true,
                status: currentJob.status,
                error: currentJob.error_message,
              })}\n\n`
            );
            finishStream();
          }
        } catch (err) {
          logger.error(`Safety timeout check error for job ${jobId}: ${err.message}`);
        }
      }, 60000); // Single check after 60s

      // Store timeout ref for cleanup
      pollInterval = { clear: () => clearTimeout(safetyTimeout) };
    }
  })
);

/**
 * DELETE /api/llm/jobs/:jobId - Cancel a job
 */
router.delete(
  '/jobs/:jobId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const job = await llmJobService.getJob(req.params.jobId);

    if (!job || job.user_id !== req.user.id) {
      throw new NotFoundError('Job not found');
    }

    await llmQueueService.cancelJob(req.params.jobId);

    res.json({
      success: true,
      jobId: req.params.jobId,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/llm/jobs - Get all active jobs (optional: filter by conversation)
 */
router.get(
  '/jobs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { conversation_id } = req.query;

    let jobs;
    if (conversation_id) {
      jobs = await llmJobService.getActiveJobsForConversation(parseInt(conversation_id));
    } else {
      jobs = await llmJobService.getAllActiveJobs();
    }

    res.json({
      jobs,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/llm/models - Get available LLM models
 *
 * Eine engine-bewusste Sicht (Plan 021, Schritt 2): das Gateway löst die aktive
 * Engine nach Hardware/Override auf und liefert die Modelle des passenden
 * Backends. Auf dem Orin ist das Ollama — Verhalten unverändert.
 */
router.get(
  '/models',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { engine, source, profileId } = engineGateway.getEngineInfo();
    const models = await engineGateway.listModels({ engine });

    res.json({
      models,
      engine,
      engineSource: source,
      profileId,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
