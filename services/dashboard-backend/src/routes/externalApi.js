/**
 * External API Routes
 * Dedicated endpoints for external apps (n8n, workflows, automations)
 * Uses API key authentication instead of JWT
 *
 * Base path: /api/v1/external
 *
 * Features:
 * - API key authentication
 * - Rate limiting per key
 * - Full queue integration
 * - Non-streaming mode for easier integration
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { requireApiKey, requireEndpoint, generateApiKey } = require('../middleware/apiKeyAuth');
const { requireAuth } = require('../middleware/auth');
const llmQueueService = require('../services/llmQueueService');
const llmJobService = require('../services/llmJobService');
const modelService = require('../services/modelService');

/**
 * POST /api/v1/external/llm/chat - LLM chat via queue (for n8n, automations)
 *
 * Request body:
 * {
 *   "prompt": "Your question here",
 *   "model": "qwen3:14b-q8",     // Optional, uses default if omitted
 *   "temperature": 0.7,          // Optional
 *   "max_tokens": 2048,          // Optional
 *   "thinking": false,           // Optional, disabled by default for integrations
 *   "wait_for_result": true      // Optional, waits for completion (default: true)
 *   "timeout_seconds": 300       // Optional, max wait time (default: 300)
 * }
 *
 * Response (wait_for_result=true):
 * {
 *   "success": true,
 *   "response": "AI generated text...",
 *   "model": "qwen3:14b-q8",
 *   "job_id": "uuid",
 *   "processing_time_ms": 1234
 * }
 *
 * Response (wait_for_result=false):
 * {
 *   "success": true,
 *   "job_id": "uuid",
 *   "queue_position": 1,
 *   "status": "pending"
 * }
 */
router.post('/llm/chat', requireApiKey, requireEndpoint('llm:chat'), async (req, res) => {
    const startTime = Date.now();

    const {
        prompt,
        model,
        temperature = 0.7,
        max_tokens = 2048,
        thinking = false,
        wait_for_result = true,
        timeout_seconds = 300
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({
            error: 'prompt is required and must be a string',
            timestamp: new Date().toISOString()
        });
    }

    try {
        // Create a temporary conversation for this request
        // (External API requests don't have a conversation context)
        const conversationResult = await require('../database').query(`
            INSERT INTO chat_conversations (title, user_id, created_at)
            VALUES ($1, 1, NOW())
            RETURNING id
        `, [`External API: ${req.apiKey.name} - ${new Date().toISOString()}`]);

        const conversationId = conversationResult.rows[0].id;

        // Convert simple prompt to messages format
        const messages = [{ role: 'user', content: prompt }];

        // Enqueue the job
        const { jobId, messageId, queuePosition, model: resolvedModel } = await llmQueueService.enqueue(
            conversationId,
            'chat',
            { messages, temperature, max_tokens, thinking },
            { model, priority: 0 }
        );

        logger.info(`[External API] Job ${jobId} enqueued by ${req.apiKey.name} (model: ${resolvedModel})`);

        if (!wait_for_result) {
            // Return immediately with job info
            return res.json({
                success: true,
                job_id: jobId,
                message_id: messageId,
                queue_position: queuePosition,
                model: resolvedModel,
                status: 'pending',
                timestamp: new Date().toISOString()
            });
        }

        // Wait for result with timeout
        const timeoutMs = Math.min(timeout_seconds * 1000, 600000); // Max 10 minutes

        const result = await waitForJobCompletion(jobId, timeoutMs);

        const processingTime = Date.now() - startTime;

        if (result.error) {
            return res.status(500).json({
                success: false,
                error: result.error,
                job_id: jobId,
                processing_time_ms: processingTime,
                timestamp: new Date().toISOString()
            });
        }

        return res.json({
            success: true,
            response: result.content,
            thinking: result.thinking || null,
            model: resolvedModel,
            job_id: jobId,
            processing_time_ms: processingTime,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`[External API] Error in /llm/chat: ${error.message}`);
        return res.status(500).json({
            error: 'Failed to process request',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/v1/external/llm/job/:jobId - Get job status
 */
router.get('/llm/job/:jobId', requireApiKey, requireEndpoint('llm:status'), async (req, res) => {
    try {
        const job = await llmJobService.getJob(req.params.jobId);

        if (!job) {
            return res.status(404).json({
                error: 'Job not found',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            job_id: job.id,
            status: job.status,
            queue_position: job.queue_position,
            content: job.content,
            thinking: job.thinking,
            error: job.error_message,
            created_at: job.queued_at,
            started_at: job.started_at,
            completed_at: job.completed_at,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`[External API] Error getting job: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get job status',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/v1/external/llm/queue - Get queue status
 */
router.get('/llm/queue', requireApiKey, requireEndpoint('llm:status'), async (req, res) => {
    try {
        const queueStatus = await llmQueueService.getQueueStatus();
        const loadedModel = await modelService.getLoadedModel();

        res.json({
            success: true,
            loaded_model: loadedModel?.model_id || null,
            queue_length: queueStatus.pending_count,
            processing: queueStatus.processing ? {
                job_id: queueStatus.processing.id,
                started_at: queueStatus.processing.started_at
            } : null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`[External API] Error getting queue status: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get queue status',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/v1/external/models - Get available models
 */
router.get('/models', requireApiKey, requireEndpoint('llm:status'), async (req, res) => {
    try {
        const installed = await modelService.getInstalledModels();
        const defaultModel = await modelService.getDefaultModel();

        res.json({
            success: true,
            models: installed.map(m => ({
                id: m.id,
                name: m.name,
                category: m.category,
                ram_required_gb: m.ram_required_gb,
                is_default: m.id === defaultModel
            })),
            default_model: defaultModel,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`[External API] Error getting models: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get models',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/v1/external/api-keys - Create new API key (requires JWT auth)
 */
router.post('/api-keys', requireAuth, async (req, res) => {
    const { name, description, rate_limit_per_minute, allowed_endpoints, expires_at } = req.body;

    if (!name) {
        return res.status(400).json({
            error: 'name is required',
            timestamp: new Date().toISOString()
        });
    }

    try {
        const result = await generateApiKey(name, description || '', req.user.id, {
            rateLimitPerMinute: rate_limit_per_minute || 60,
            allowedEndpoints: allowed_endpoints || ['llm:chat', 'llm:status'],
            expiresAt: expires_at || null
        });

        res.json({
            success: true,
            api_key: result.key,  // Only shown once!
            key_prefix: result.keyPrefix,
            key_id: result.keyId,
            message: 'Store this API key securely - it will not be shown again!',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`[External API] Error creating API key: ${error.message}`);
        res.status(500).json({
            error: 'Failed to create API key',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/v1/external/api-keys - List API keys (requires JWT auth)
 */
router.get('/api-keys', requireAuth, async (req, res) => {
    try {
        const result = await require('../database').query(`
            SELECT id, key_prefix, name, description, created_at, last_used_at,
                   expires_at, is_active, rate_limit_per_minute, allowed_endpoints
            FROM api_keys
            WHERE created_by = $1
            ORDER BY created_at DESC
        `, [req.user.id]);

        res.json({
            success: true,
            api_keys: result.rows.map(k => ({
                id: k.id,
                key_prefix: k.key_prefix,
                name: k.name,
                description: k.description,
                created_at: k.created_at,
                last_used_at: k.last_used_at,
                expires_at: k.expires_at,
                is_active: k.is_active,
                rate_limit_per_minute: k.rate_limit_per_minute,
                allowed_endpoints: k.allowed_endpoints
            })),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`[External API] Error listing API keys: ${error.message}`);
        res.status(500).json({
            error: 'Failed to list API keys',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * DELETE /api/v1/external/api-keys/:keyId - Revoke API key (requires JWT auth)
 */
router.delete('/api-keys/:keyId', requireAuth, async (req, res) => {
    try {
        const result = await require('../database').query(`
            UPDATE api_keys
            SET is_active = false
            WHERE id = $1 AND created_by = $2
            RETURNING key_prefix
        `, [req.params.keyId, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'API key not found',
                timestamp: new Date().toISOString()
            });
        }

        logger.info(`[External API] API key ${result.rows[0].key_prefix}*** revoked by user ${req.user.id}`);

        res.json({
            success: true,
            message: 'API key revoked',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`[External API] Error revoking API key: ${error.message}`);
        res.status(500).json({
            error: 'Failed to revoke API key',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Helper: Wait for job completion with timeout
 */
async function waitForJobCompletion(jobId, timeoutMs) {
    const pollInterval = 500; // 500ms
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const job = await llmJobService.getJob(jobId);

        if (!job) {
            return { error: 'Job not found' };
        }

        if (job.status === 'completed') {
            return {
                content: job.content,
                thinking: job.thinking
            };
        }

        if (job.status === 'error') {
            return { error: job.error_message || 'Job failed' };
        }

        if (job.status === 'cancelled') {
            return { error: 'Job was cancelled' };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return { error: 'Job timed out' };
}

module.exports = router;
