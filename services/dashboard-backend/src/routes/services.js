/**
 * Services API routes
 * Handles service status and information
 */

const express = require('express');
const router = express.Router();
const dockerService = require('../services/docker');
const logger = require('../utils/logger');
const axios = require('axios');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError, ForbiddenError, RateLimitError, ServiceUnavailableError } = require('../utils/errors');

// Allowed services whitelist - only Arasul services can be restarted
const ALLOWED_SERVICES = [
    'postgres-db',
    'minio',
    'qdrant',
    'metrics-collector',
    'llm-service',
    'embedding-service',
    'document-indexer',
    'reverse-proxy',
    'dashboard-backend',
    'dashboard-frontend',
    'n8n',
    'self-healing-agent',
    'backup-service'
];

// Rate limiting: Track last restart per service (in-memory, resets on service restart)
const lastRestartTimes = new Map();

// GET /api/services
router.get('/', asyncHandler(async (req, res) => {
    const services = await dockerService.getAllServicesStatus();

    // Get GPU load from LLM service if available
    let llmGpuLoad = 0;
    try {
        await axios.get(
            `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}/api/tags`,
            { timeout: 2000 }
        );
        // GPU load would be available from NVML or the service itself
        llmGpuLoad = 0.0; // Placeholder - would need NVML integration
    } catch {
        // LLM GPU load not available
    }

    res.json({
        llm: {
            status: services.llm?.status || 'unknown',
            gpu_load: llmGpuLoad
        },
        embeddings: {
            status: services.embeddings?.status || 'unknown',
            load: 0.0 // Placeholder
        },
        n8n: {
            status: services.n8n?.status || 'unknown'
        },
        minio: {
            status: services.minio?.status || 'unknown'
        },
        postgres: {
            status: services.postgres?.status || 'unknown'
        },
        timestamp: new Date().toISOString()
    });
}));

// GET /api/services/ai
router.get('/ai', asyncHandler(async (req, res) => {
    const services = await dockerService.getAllServicesStatus();

    // Get GPU stats from Metrics Collector
    let gpuStats = null;
    try {
        const metricsCollectorUrl = `http://${process.env.METRICS_COLLECTOR_HOST || 'metrics-collector'}:9100`;
        const gpuResponse = await axios.get(`${metricsCollectorUrl}/api/gpu`, {
            timeout: 3000
        });

        if (gpuResponse.data && gpuResponse.data.available) {
            gpuStats = gpuResponse.data.gpu;
        }
    } catch {
        // GPU stats not available
    }

    // Try to get more detailed info from LLM service
    let llmDetails = {
        status: services.llm?.status || 'unknown',
        gpu_load: gpuStats ? gpuStats.utilization : 0.0,
        model_loaded: false,
        last_token_speed: 0,
        gpu: gpuStats ? {
            name: gpuStats.name,
            temperature: gpuStats.temperature,
            utilization: gpuStats.utilization,
            memory_used_mb: gpuStats.memory?.used_mb || 0,
            memory_total_mb: gpuStats.memory?.total_mb || 0,
            memory_percent: gpuStats.memory?.percent || 0,
            power_draw_w: gpuStats.power?.draw_w || 0,
            health: gpuStats.health || 'unknown',
            error: gpuStats.error || 'none',
            error_message: gpuStats.error_message
        } : null
    };

    try {
        const llmResponse = await axios.get(
            `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}/api/tags`,
            { timeout: 2000 }
        );
        llmDetails.model_loaded = llmResponse.data?.models?.length > 0;
    } catch {
        // LLM details not available
    }

    // Try to get embedding service details
    let embeddingDetails = {
        status: services.embeddings?.status || 'unknown',
        load: 0.0,
        model_loaded: false
    };

    try {
        await axios.get(
            `http://${process.env.EMBEDDING_SERVICE_HOST}:${process.env.EMBEDDING_SERVICE_PORT}/health`,
            { timeout: 2000 }
        );
        embeddingDetails.model_loaded = true;
    } catch {
        // Embedding details not available
    }

    res.json({
        llm: llmDetails,
        embeddings: embeddingDetails,
        gpu_available: gpuStats !== null,
        timestamp: new Date().toISOString()
    });
}));

// GET /api/services/llm/models - List available LLM models
router.get('/llm/models', asyncHandler(async (req, res) => {
    const llmServiceUrl = `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}`;

    let response;
    try {
        response = await axios.get(`${llmServiceUrl}/api/tags`, {
            timeout: 5000
        });
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            throw new ServiceUnavailableError('LLM service is not available');
        }
        throw error;
    }

    const models = response.data?.models || [];

    // Format model information
    const formattedModels = models.map(model => ({
        name: model.name,
        size: model.size,
        size_gb: model.size ? (model.size / (1024 * 1024 * 1024)).toFixed(2) : null,
        modified: model.modified_at,
        digest: model.digest,
        details: model.details || {}
    }));

    res.json({
        models: formattedModels,
        count: formattedModels.length,
        timestamp: new Date().toISOString()
    });
}));

// GET /api/services/llm/models/:name - Get detailed information about a specific model
router.get('/llm/models/:name', asyncHandler(async (req, res) => {
    const { name } = req.params;
    const llmServiceUrl = `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}`;

    let response;
    try {
        response = await axios.post(`${llmServiceUrl}/api/show`, {
            name: name
        }, {
            timeout: 5000
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            throw new NotFoundError(`Model '${name}' not found`);
        }
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            throw new ServiceUnavailableError('LLM service is not available');
        }
        throw error;
    }

    const modelInfo = response.data;

    res.json({
        name: name,
        modelfile: modelInfo.modelfile || null,
        parameters: modelInfo.parameters || null,
        template: modelInfo.template || null,
        details: modelInfo.details || {},
        modified_at: modelInfo.modified_at || null,
        timestamp: new Date().toISOString()
    });
}));

// POST /api/services/llm/models/pull - Pull/download a new model
router.post('/llm/models/pull', asyncHandler(async (req, res) => {
    const { model_name } = req.body;

    if (!model_name) {
        throw new ValidationError('Model name is required');
    }

    const llmServiceUrl = `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}`;

    logger.info(`Starting model pull: ${model_name}`);

    // Start model pull (this can take a long time, so we return immediately)
    res.json({
        status: 'started',
        model: model_name,
        message: 'Model download started. This may take several minutes depending on model size.',
        timestamp: new Date().toISOString()
    });

    // Pull model asynchronously
    axios.post(`${llmServiceUrl}/api/pull`, {
        name: model_name,
        stream: false
    }, {
        timeout: 3600000 // 1 hour timeout for large models
    }).then(() => {
        logger.info(`Model pull completed: ${model_name}`);
    }).catch(error => {
        logger.error(`Model pull failed: ${model_name} - ${error.message}`);
    });
}));

// DELETE /api/services/llm/models/:name - Delete a model
router.delete('/llm/models/:name', asyncHandler(async (req, res) => {
    const { name } = req.params;
    const llmServiceUrl = `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}`;

    logger.info(`Deleting model: ${name}`);

    try {
        // HIGH-002 FIX: Use correct Ollama API format
        // Ollama expects DELETE /api/delete with JSON body: { "name": "model-name" }
        await axios.delete(`${llmServiceUrl}/api/delete`, {
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ name: name }),
            timeout: 10000
        });
    } catch (error) {
        if (error.response && error.response.status === 404) {
            throw new NotFoundError(`Model '${name}' not found`);
        }
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            throw new ServiceUnavailableError('LLM service is not available');
        }
        throw error;
    }

    logger.info(`Model deleted successfully: ${name}`);

    res.json({
        status: 'success',
        message: `Model '${name}' deleted successfully`,
        timestamp: new Date().toISOString()
    });
}));

// GET /api/services/embedding/info - Get embedding service information
router.get('/embedding/info', asyncHandler(async (req, res) => {
    const embeddingServiceUrl = `http://${process.env.EMBEDDING_SERVICE_HOST}:${process.env.EMBEDDING_SERVICE_PORT}`;

    let response;
    try {
        response = await axios.get(`${embeddingServiceUrl}/info`, {
            timeout: 3000
        });
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            throw new ServiceUnavailableError('Embedding service is not available');
        }
        throw error;
    }

    res.json({
        ...response.data,
        timestamp: new Date().toISOString()
    });
}));

// GET /api/services/all - Get all services with detailed status
router.get('/all', requireAuth, asyncHandler(async (req, res) => {
    const statuses = await dockerService.getAllServicesStatus();

    // Transform to array format with more details
    const services = Object.entries(statuses).map(([key, value]) => ({
        id: key,
        name: value.containerName || key,
        status: value.status,
        health: value.health,
        state: value.state,
        canRestart: ALLOWED_SERVICES.includes(value.containerName || key)
    }));

    res.json({
        services,
        timestamp: new Date().toISOString()
    });
}));

// POST /api/services/restart/:serviceName - Restart a specific service
router.post('/restart/:serviceName', requireAuth, asyncHandler(async (req, res) => {
    const { serviceName } = req.params;
    const userId = req.user?.id;
    const username = req.user?.username || 'unknown';

    // Helper to log restart events to database
    const logRestartEvent = async (success, errorMsg = null, duration = null) => {
        try {
            await db.query(
                `INSERT INTO self_healing_events
                 (event_type, service_name, action_taken, details, success, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [
                    'manual_restart',
                    serviceName,
                    'container_restart',
                    JSON.stringify({
                        initiated_by: username,
                        user_id: userId,
                        ...(duration && { duration_ms: duration }),
                        ...(errorMsg && { error: errorMsg }),
                        source: 'dashboard_api'
                    }),
                    success
                ]
            );
        } catch (dbError) {
            logger.error(`Failed to log restart event to database: ${dbError.message}`);
        }
    };

    // Validate service name against whitelist
    if (!ALLOWED_SERVICES.includes(serviceName)) {
        logger.warn(`Restart attempt for unauthorized service: ${serviceName} by user ${username}`);
        throw new ForbiddenError(`Service '${serviceName}' is not in the allowed services list`);
    }

    // Rate limiting: Max 1 restart per service per 60 seconds
    const now = Date.now();
    const lastRestart = lastRestartTimes.get(serviceName) || 0;
    const cooldownMs = 60000; // 60 seconds

    if (now - lastRestart < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - (now - lastRestart)) / 1000);
        logger.warn(`Rate limit hit for service restart: ${serviceName} by user ${username}`);
        throw new RateLimitError(`Please wait ${remainingSeconds} seconds before restarting this service again`);
    }

    // Log the restart attempt
    logger.info(`Service restart initiated: ${serviceName} by user ${username} (ID: ${userId})`);

    // Perform the restart with timeout
    const startTime = Date.now();
    let success;
    try {
        success = await Promise.race([
            dockerService.restartContainer(serviceName),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Restart timeout')), 30000)
            )
        ]);
    } catch (error) {
        const errorMsg = error.message === 'Restart timeout'
            ? 'Service restart timed out after 30 seconds'
            : `Error restarting service: ${error.message}`;
        await logRestartEvent(false, error.message);
        throw new ServiceUnavailableError(errorMsg);
    }

    const duration = Date.now() - startTime;

    if (success) {
        // Update rate limit tracker
        lastRestartTimes.set(serviceName, now);
        await logRestartEvent(true, null, duration);
        logger.info(`Service restart successful: ${serviceName} (took ${duration}ms)`);

        res.json({
            success: true,
            message: `Service '${serviceName}' restarted successfully`,
            service: serviceName,
            duration_ms: duration,
            timestamp: new Date().toISOString()
        });
    } else {
        await logRestartEvent(false, 'Restart returned false');
        logger.error(`Service restart failed: ${serviceName}`);
        throw new ServiceUnavailableError(`Failed to restart service '${serviceName}'`);
    }
}));

module.exports = router;
