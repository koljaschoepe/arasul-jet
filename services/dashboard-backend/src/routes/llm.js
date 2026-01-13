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
const llmJobService = require('../services/llmJobService');
const llmQueueService = require('../services/llmQueueService');

const LLM_SERVICE_URL = `http://${process.env.LLM_SERVICE_HOST || 'llm-service'}:${process.env.LLM_SERVICE_PORT || '11434'}`;

/**
 * POST /api/llm/chat - Start a chat completion with Queue support
 * Job is added to queue and processed sequentially
 * Supports model selection and workflow model sequences
 */
router.post('/chat', requireAuth, llmLimiter, async (req, res) => {
    const {
        messages,
        temperature,
        max_tokens,
        stream,
        thinking,
        conversation_id,
        model,           // Optional: explicit model to use
        model_sequence,  // Optional: for workflows, e.g. ['qwen3:7b', 'qwen3:32b']
        priority         // Optional: 0=normal, 1=high
    } = req.body;
    const enableThinking = thinking !== false;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({
            error: 'Messages array is required',
            timestamp: new Date().toISOString()
        });
    }

    if (!conversation_id) {
        return res.status(400).json({
            error: 'conversation_id is required for chat streaming',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Add job to queue with model options
        const { jobId, messageId, queuePosition, model: resolvedModel } = await llmQueueService.enqueue(
            conversation_id,
            'chat',
            { messages, temperature, max_tokens, thinking: enableThinking },
            { model, modelSequence: model_sequence, priority: priority || 0 }
        );

        logger.info(`[QUEUE] Job ${jobId} enqueued for model ${resolvedModel} at position ${queuePosition}`);

        // If streaming is requested (default: true)
        if (stream !== false) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            // Send job info with queue position and model
            res.write(`data: ${JSON.stringify({
                type: 'job_started',
                jobId,
                messageId,
                queuePosition,
                model: resolvedModel,
                status: queuePosition > 1 ? 'queued' : 'pending'
            })}\n\n`);

            // Track client connection state
            let clientConnected = true;
            let unsubscribe = null;

            // PHASE1-FIX: Single close handler to prevent race conditions and memory leaks
            res.on('close', () => {
                clientConnected = false;
                logger.debug(`[JOB ${jobId}] Client disconnected, job continues in background`);
                if (unsubscribe) {
                    unsubscribe();
                }
            });

            // Subscribe to job updates and forward to client
            unsubscribe = llmQueueService.subscribeToJob(jobId, (event) => {
                if (!clientConnected) return;

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
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        logger.error(`Error in /api/llm/chat: ${error.message}`);

        if (error.code === 'ECONNREFUSED') {
            res.status(503).json({
                error: 'LLM service is not available',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                error: 'Failed to enqueue chat job',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
});

/**
 * GET /api/llm/queue - Get global queue status
 */
router.get('/queue', requireAuth, async (req, res) => {
    try {
        const queueStatus = await llmQueueService.getQueueStatus();
        res.json(queueStatus);
    } catch (error) {
        logger.error(`Error getting queue status: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get queue status',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/llm/queue/prioritize - Prioritize a job
 */
router.post('/queue/prioritize', requireAuth, async (req, res) => {
    try {
        const { job_id } = req.body;

        if (!job_id) {
            return res.status(400).json({
                error: 'job_id is required',
                timestamp: new Date().toISOString()
            });
        }

        await llmQueueService.prioritizeJob(job_id);

        res.json({
            success: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error prioritizing job: ${error.message}`);
        res.status(500).json({
            error: 'Failed to prioritize job',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/llm/jobs/:jobId - Get job status and current content
 */
router.get('/jobs/:jobId', requireAuth, async (req, res) => {
    try {
        const job = await llmJobService.getJob(req.params.jobId);

        if (!job) {
            return res.status(404).json({
                error: 'Job not found',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            ...job,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error getting job ${req.params.jobId}: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get job status',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/llm/jobs/:jobId/stream - Reconnect to an active job's stream
 */
router.get('/jobs/:jobId/stream', requireAuth, async (req, res) => {
    const { jobId } = req.params;

    try {
        const job = await llmJobService.getJob(jobId);
        // PHASE3-FIX: Migrated from console.log to logger
        logger.debug(`[RECONNECT ${jobId}] Job status: ${job?.status}, content length: ${job?.content?.length || 0}`);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // Send current content immediately
        // PHASE3-FIX: Migrated from console.log to logger
        logger.debug(`[RECONNECT ${jobId}] Sending content: "${(job.content || '').substring(0, 50)}..."`);
        res.write(`data: ${JSON.stringify({
            type: 'reconnect',
            content: job.content || '',
            thinking: job.thinking || '',
            sources: job.sources,
            status: job.status,
            queuePosition: job.queue_position
        })}\n\n`);

        // If job is completed or errored, end immediately
        if (job.status === 'completed') {
            res.write(`data: ${JSON.stringify({ done: true, status: 'completed' })}\n\n`);
            return res.end();
        }

        if (job.status === 'error' || job.status === 'cancelled') {
            res.write(`data: ${JSON.stringify({
                done: true,
                status: job.status,
                error: job.error_message
            })}\n\n`);
            return res.end();
        }

        // For pending jobs in queue, show queue position
        if (job.status === 'pending') {
            res.write(`data: ${JSON.stringify({
                type: 'queued',
                queuePosition: job.queue_position,
                status: 'pending'
            })}\n\n`);
        }

        // PHASE1-FIX: Track client connection and manage cleanup in single handler
        let clientConnected = true;
        let unsubscribe = null;
        let pollInterval = null;

        // Single close handler for all cleanup
        res.on('close', () => {
            clientConnected = false;
            if (pollInterval) {
                clearInterval(pollInterval);
            }
            if (unsubscribe) {
                unsubscribe();
            }
        });

        // Subscribe to job updates
        unsubscribe = llmQueueService.subscribeToJob(jobId, (event) => {
            if (!clientConnected) {
                return;
            }

            try {
                res.write(`data: ${JSON.stringify(event)}\n\n`);

                if (event.done) {
                    res.end();
                }
            } catch (err) {
                logger.debug(`[RECONNECT ${jobId}] Write error: ${err.message}`);
            }
        });

        // Also poll for updates (for jobs already streaming before subscribe)
        if (job.status === 'streaming' || job.status === 'pending') {
            let lastContent = job.content || '';
            let lastThinking = job.thinking || '';

            pollInterval = setInterval(async () => {
                if (!clientConnected) {
                    clearInterval(pollInterval);
                    return;
                }

                try {
                    const currentJob = await llmJobService.getJob(jobId);

                    if (!currentJob) {
                        res.write(`data: ${JSON.stringify({ done: true, status: 'error', error: 'Job not found' })}\n\n`);
                        clearInterval(pollInterval);
                        res.end();
                        return;
                    }

                    if (currentJob.status === 'completed') {
                        res.write(`data: ${JSON.stringify({
                            type: 'update',
                            content: currentJob.content || '',
                            thinking: currentJob.thinking || '',
                            done: true,
                            status: 'completed'
                        })}\n\n`);
                        clearInterval(pollInterval);
                        res.end();
                        return;
                    }

                    if (currentJob.status === 'error' || currentJob.status === 'cancelled') {
                        res.write(`data: ${JSON.stringify({
                            done: true,
                            status: currentJob.status,
                            error: currentJob.error_message
                        })}\n\n`);
                        clearInterval(pollInterval);
                        res.end();
                        return;
                    }

                    // Send incremental update if content changed
                    const newContent = currentJob.content || '';
                    const newThinking = currentJob.thinking || '';

                    if (newContent !== lastContent || newThinking !== lastThinking) {
                        res.write(`data: ${JSON.stringify({
                            type: 'update',
                            content: newContent,
                            thinking: newThinking,
                            status: currentJob.status,
                            queuePosition: currentJob.queue_position
                        })}\n\n`);
                        lastContent = newContent;
                        lastThinking = newThinking;
                    }

                } catch (pollError) {
                    logger.error(`Poll error for job ${jobId}: ${pollError.message}`);
                }

            }, 200); // Poll every 200ms
        }

    } catch (error) {
        logger.error(`Error reconnecting to job stream ${jobId}: ${error.message}`);
        res.status(500).json({ error: 'Failed to reconnect to job' });
    }
});

/**
 * DELETE /api/llm/jobs/:jobId - Cancel a job
 */
router.delete('/jobs/:jobId', requireAuth, async (req, res) => {
    try {
        const job = await llmJobService.getJob(req.params.jobId);

        if (!job) {
            return res.status(404).json({
                error: 'Job not found',
                timestamp: new Date().toISOString()
            });
        }

        await llmQueueService.cancelJob(req.params.jobId);

        res.json({
            success: true,
            jobId: req.params.jobId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error cancelling job ${req.params.jobId}: ${error.message}`);
        res.status(500).json({
            error: 'Failed to cancel job',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/llm/jobs - Get all active jobs (optional: filter by conversation)
 */
router.get('/jobs', requireAuth, async (req, res) => {
    try {
        const { conversation_id } = req.query;

        let jobs;
        if (conversation_id) {
            jobs = await llmJobService.getActiveJobsForConversation(parseInt(conversation_id));
        } else {
            jobs = await llmJobService.getAllActiveJobs();
        }

        res.json({
            jobs,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error getting jobs: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get jobs',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/llm/models - Get available LLM models
 */
router.get('/models', requireAuth, async (req, res) => {
    try {
        const response = await axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 5000 });

        res.json({
            models: response.data.models || [],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/llm/models: ${error.message}`);
        res.status(503).json({
            error: 'Failed to get LLM models',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
