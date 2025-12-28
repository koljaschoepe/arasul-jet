/**
 * LLM API routes
 * Proxies requests to the LLM service (Ollama)
 * Supports background streaming with tab-switch resilience
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { llmLimiter } = require('../middleware/rateLimit');
const llmJobService = require('../services/llmJobService');

const LLM_SERVICE_URL = `http://${process.env.LLM_SERVICE_HOST || 'llm-service'}:${process.env.LLM_SERVICE_PORT || '11434'}`;

// Content batching configuration
const BATCH_INTERVAL_MS = 500;
const BATCH_SIZE_CHARS = 100;

/**
 * POST /api/llm/chat - Start a chat completion with background job support
 * Returns job ID and streams via SSE if client connected
 */
router.post('/chat', requireAuth, llmLimiter, async (req, res) => {
    const { messages, temperature, max_tokens, stream, thinking, conversation_id } = req.body;
    const enableThinking = thinking !== false;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({
            error: 'Messages array is required',
            timestamp: new Date().toISOString()
        });
    }

    // conversation_id is required for job-based streaming
    if (!conversation_id) {
        return res.status(400).json({
            error: 'conversation_id is required for chat streaming',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Create job in database
        const { jobId, messageId } = await llmJobService.createJob(
            conversation_id,
            'chat',
            { messages, temperature, max_tokens, thinking: enableThinking }
        );

        // If streaming is requested (default: true)
        if (stream !== false) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            // Send job info first
            res.write(`data: ${JSON.stringify({ type: 'job_started', jobId, messageId })}\n\n`);

            // Track client connection status
            let clientConnected = true;
            res.on('close', () => {
                clientConnected = false;
                logger.info(`Client disconnected from job ${jobId}, continuing in background`);
            });

            // Start streaming from Ollama
            await streamFromOllama(
                jobId,
                messages,
                enableThinking,
                temperature,
                max_tokens,
                res,
                () => clientConnected
            );
        } else {
            // Non-streaming: return job ID, process in background
            res.json({
                jobId,
                messageId,
                status: 'streaming',
                timestamp: new Date().toISOString()
            });

            // Process in background (don't await)
            processJobInBackground(jobId, messages, enableThinking, temperature, max_tokens);
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
                error: 'Failed to start chat job',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
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

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // Send current content immediately
        res.write(`data: ${JSON.stringify({
            type: 'reconnect',
            content: job.content || '',
            thinking: job.thinking || '',
            sources: job.sources,
            status: job.status
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

        // For active jobs, poll for updates
        let clientConnected = true;
        let lastContent = job.content || '';
        let lastThinking = job.thinking || '';

        res.on('close', () => {
            clientConnected = false;
        });

        const pollInterval = setInterval(async () => {
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
                    // Send final content
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
                        status: currentJob.status
                    })}\n\n`);
                    lastContent = newContent;
                    lastThinking = newThinking;
                }

            } catch (pollError) {
                logger.error(`Poll error for job ${jobId}: ${pollError.message}`);
            }

        }, 200); // Poll every 200ms for updates

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

        await llmJobService.cancelJob(req.params.jobId);

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

/**
 * Stream from Ollama and persist to database
 */
async function streamFromOllama(jobId, messages, enableThinking, temperature, maxTokens, res, isClientConnected) {
    // Build prompt with thinking control
    const thinkingPrefix = enableThinking ? '' : '/no_think\n';
    const prompt = thinkingPrefix + messages.map(m => `${m.role}: ${m.content}`).join('\n');

    // Batching state
    let contentBuffer = '';
    let thinkingBuffer = '';
    let lastDbWrite = Date.now();

    const flushToDatabase = async (force = false) => {
        const now = Date.now();
        const shouldFlush = force ||
            (now - lastDbWrite > BATCH_INTERVAL_MS) ||
            (contentBuffer.length >= BATCH_SIZE_CHARS) ||
            (thinkingBuffer.length >= BATCH_SIZE_CHARS);

        if (shouldFlush && (contentBuffer || thinkingBuffer)) {
            try {
                await llmJobService.updateJobContent(jobId, contentBuffer || null, thinkingBuffer || null);
                contentBuffer = '';
                thinkingBuffer = '';
                lastDbWrite = now;
            } catch (dbError) {
                logger.error(`Failed to flush content to DB for job ${jobId}: ${dbError.message}`);
            }
        }
    };

    try {
        const abortController = new AbortController();
        llmJobService.registerStream(jobId, abortController);

        const response = await axios({
            method: 'post',
            url: `${LLM_SERVICE_URL}/api/generate`,
            data: {
                model: process.env.LLM_MODEL || 'qwen3:14b-q8',
                prompt: prompt,
                stream: true,
                keep_alive: parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300'),
                options: {
                    temperature: temperature || 0.7,
                    num_predict: maxTokens || 32768
                }
            },
            responseType: 'stream',
            timeout: 600000,
            signal: abortController.signal
        });

        let buffer = '';
        let inThinkBlock = false;

        response.data.on('data', async (chunk) => {
            buffer += chunk.toString();

            // Process complete JSON lines (NDJSON format)
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const data = JSON.parse(line);

                    if (data.response) {
                        const token = data.response;

                        // Process thinking blocks
                        if (!enableThinking) {
                            // When thinking is disabled: filter out <think> blocks
                            if (token.includes('<think>')) {
                                inThinkBlock = true;
                                const parts = token.split('<think>');
                                if (parts[0]) {
                                    contentBuffer += parts[0];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'response', token: parts[0] })}\n\n`);
                                    }
                                }
                                continue;
                            }
                            if (token.includes('</think>')) {
                                inThinkBlock = false;
                                const parts = token.split('</think>');
                                if (parts[1]) {
                                    contentBuffer += parts[1];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'response', token: parts[1] })}\n\n`);
                                    }
                                }
                                continue;
                            }
                            if (inThinkBlock) continue;

                            contentBuffer += token;
                            if (isClientConnected()) {
                                res.write(`data: ${JSON.stringify({ type: 'response', token })}\n\n`);
                            }
                        } else {
                            // With thinking enabled: full processing with think blocks
                            if (token.includes('<think>')) {
                                inThinkBlock = true;
                                const parts = token.split('<think>');
                                if (parts[0]) {
                                    contentBuffer += parts[0];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'response', token: parts[0] })}\n\n`);
                                    }
                                }
                                if (parts[1]) {
                                    thinkingBuffer += parts[1];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'thinking', token: parts[1] })}\n\n`);
                                    }
                                }
                            } else if (token.includes('</think>')) {
                                inThinkBlock = false;
                                const parts = token.split('</think>');
                                if (parts[0]) {
                                    thinkingBuffer += parts[0];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'thinking', token: parts[0] })}\n\n`);
                                    }
                                }
                                if (isClientConnected()) {
                                    res.write(`data: ${JSON.stringify({ type: 'thinking_end' })}\n\n`);
                                }
                                if (parts[1]) {
                                    contentBuffer += parts[1];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'response', token: parts[1] })}\n\n`);
                                    }
                                }
                            } else if (inThinkBlock) {
                                thinkingBuffer += token;
                                if (isClientConnected()) {
                                    res.write(`data: ${JSON.stringify({ type: 'thinking', token })}\n\n`);
                                }
                            } else {
                                contentBuffer += token;
                                if (isClientConnected()) {
                                    res.write(`data: ${JSON.stringify({ type: 'response', token })}\n\n`);
                                }
                            }
                        }

                        // Periodic flush to database
                        await flushToDatabase();
                    }

                    if (data.done) {
                        // Final flush
                        await flushToDatabase(true);
                        await llmJobService.completeJob(jobId);

                        if (isClientConnected()) {
                            res.write(`data: ${JSON.stringify({
                                done: true,
                                model: data.model,
                                jobId,
                                timestamp: new Date().toISOString()
                            })}\n\n`);
                            res.end();
                        }
                    }
                } catch (parseError) {
                    // Ignore parse errors for incomplete JSON
                }
            }
        });

        response.data.on('error', async (error) => {
            logger.error(`Stream error for job ${jobId}: ${error.message}`);
            await flushToDatabase(true);
            await llmJobService.errorJob(jobId, error.message);

            if (isClientConnected()) {
                res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
                res.end();
            }
        });

        response.data.on('end', async () => {
            // Handle case where stream ends without done signal
            if (contentBuffer || thinkingBuffer) {
                await flushToDatabase(true);
            }
        });

    } catch (error) {
        logger.error(`Error streaming from Ollama for job ${jobId}: ${error.message}`);
        await llmJobService.errorJob(jobId, error.message);

        if (isClientConnected()) {
            res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
            res.end();
        }
    }
}

/**
 * Process job in background (non-streaming client response)
 */
async function processJobInBackground(jobId, messages, enableThinking, temperature, maxTokens) {
    const dummyRes = {
        write: () => {},
        end: () => {}
    };

    await streamFromOllama(
        jobId,
        messages,
        enableThinking,
        temperature,
        maxTokens,
        dummyRes,
        () => false // Client never connected
    );
}

module.exports = router;
