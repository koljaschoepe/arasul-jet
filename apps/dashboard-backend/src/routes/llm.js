/**
 * LLM API routes
 * Proxies requests to the LLM service (Ollama) via Queue System
 * Supports background streaming with tab-switch resilience
 * Only ONE stream at a time to prevent GPU memory overload
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { llmLimiter } = require('../middleware/rateLimit');
const llmJobService = require('../services/llm/llmJobService');
const llmQueueService = require('../services/llm/llmQueueService');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError, ServiceUnavailableError } = require('../utils/errors');
const { initSSE, trackConnection } = require('../utils/sseHelper');
const services = require('../config/services');

const LLM_SERVICE_URL = services.llm.url;

/**
 * POST /api/llm/chat - Start a chat completion with Queue support
 * Job is added to queue and processed sequentially
 * Supports model selection and workflow model sequences
 */
router.post(
  '/chat',
  requireAuth,
  llmLimiter,
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
    } = req.body;
    const enableThinking = thinking !== false;

    if (!messages || !Array.isArray(messages)) {
      throw new ValidationError('Messages array is required');
    }

    if (!conversation_id) {
      throw new ValidationError('conversation_id is required for chat streaming');
    }

    try {
      // Add job to queue with model options
      const {
        jobId,
        messageId,
        queuePosition,
        model: resolvedModel,
      } = await llmQueueService.enqueue(
        conversation_id,
        'chat',
        { messages, temperature, max_tokens, thinking: enableThinking },
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
    } catch (error) {
      logger.error(`Error in /api/llm/chat: ${error.message}`);

      if (error.code === 'ECONNREFUSED') {
        throw new ServiceUnavailableError('LLM service is not available');
      }
      throw error;
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
  asyncHandler(async (req, res) => {
    const { job_id } = req.body;

    if (!job_id) {
      throw new ValidationError('job_id is required');
    }

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

    if (!job) {
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

    if (!job) {
      throw new NotFoundError('Job not found');
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
        queuePosition: job.queue_position,
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
          queuePosition: job.queue_position,
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

    if (!job) {
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
 */
router.get(
  '/models',
  requireAuth,
  asyncHandler(async (req, res) => {
    let response;
    try {
      response = await axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 5000 });
    } catch (error) {
      throw new ServiceUnavailableError('Failed to get LLM models');
    }

    res.json({
      models: response.data.models || [],
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
