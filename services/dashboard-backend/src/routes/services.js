/**
 * Services API routes
 * Handles service status and information
 */

const express = require('express');
const router = express.Router();
const dockerService = require('../services/docker');
const logger = require('../utils/logger');
const axios = require('axios');

// GET /api/services
router.get('/', async (req, res) => {
    try {
        const services = await dockerService.getAllServicesStatus();

        // Get GPU load from LLM service if available
        let llmGpuLoad = 0;
        try {
            const llmResponse = await axios.get(
                `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}/api/tags`,
                { timeout: 2000 }
            );
            // GPU load would be available from NVML or the service itself
            llmGpuLoad = 0.0; // Placeholder - would need NVML integration
        } catch (e) {
            logger.debug('Could not get LLM GPU load');
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

    } catch (error) {
        logger.error(`Error in /api/services: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get services status',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/services/ai
router.get('/ai', async (req, res) => {
    try {
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
                logger.debug('GPU stats retrieved successfully');
            }
        } catch (e) {
            logger.warn(`Could not get GPU stats from Metrics Collector: ${e.message}`);
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
        } catch (e) {
            logger.debug('Could not get detailed LLM info');
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
        } catch (e) {
            logger.debug('Could not get detailed embedding info');
        }

        res.json({
            llm: llmDetails,
            embeddings: embeddingDetails,
            gpu_available: gpuStats !== null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/services/ai: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get AI services info',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/services/llm/models - List available LLM models
router.get('/llm/models', async (req, res) => {
    try {
        const llmServiceUrl = `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}`;

        // Get list of models from Ollama
        const response = await axios.get(`${llmServiceUrl}/api/tags`, {
            timeout: 5000
        });

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

    } catch (error) {
        logger.error(`Error in /api/services/llm/models: ${error.message}`);

        // If service is unreachable, return appropriate error
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return res.status(503).json({
                error: 'LLM service is not available',
                timestamp: new Date().toISOString()
            });
        }

        res.status(500).json({
            error: 'Failed to retrieve LLM models',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/services/llm/models/:name - Get detailed information about a specific model
router.get('/llm/models/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const llmServiceUrl = `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}`;

        // Get detailed model info from Ollama
        const response = await axios.post(`${llmServiceUrl}/api/show`, {
            name: name
        }, {
            timeout: 5000
        });

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

    } catch (error) {
        logger.error(`Error in /api/services/llm/models/:name: ${error.message}`);

        // If model not found
        if (error.response && error.response.status === 404) {
            return res.status(404).json({
                error: `Model '${req.params.name}' not found`,
                timestamp: new Date().toISOString()
            });
        }

        // If service is unreachable
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return res.status(503).json({
                error: 'LLM service is not available',
                timestamp: new Date().toISOString()
            });
        }

        res.status(500).json({
            error: 'Failed to retrieve model information',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/services/llm/models/pull - Pull/download a new model
router.post('/llm/models/pull', async (req, res) => {
    try {
        const { model_name } = req.body;

        if (!model_name) {
            return res.status(400).json({
                error: 'Model name is required',
                timestamp: new Date().toISOString()
            });
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
        }).then(pullResponse => {
            logger.info(`Model pull completed: ${model_name}`);
        }).catch(error => {
            logger.error(`Model pull failed: ${model_name} - ${error.message}`);
        });

    } catch (error) {
        logger.error(`Error in /api/services/llm/models/pull: ${error.message}`);
        res.status(500).json({
            error: 'Failed to start model pull',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// DELETE /api/services/llm/models/:name - Delete a model
router.delete('/llm/models/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const llmServiceUrl = `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}`;

        logger.info(`Deleting model: ${name}`);

        // HIGH-002 FIX: Use correct Ollama API format
        // Ollama expects DELETE /api/delete with JSON body: { "name": "model-name" }
        await axios.delete(`${llmServiceUrl}/api/delete`, {
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ name: name }),
            timeout: 10000
        });

        logger.info(`Model deleted successfully: ${name}`);

        res.json({
            status: 'success',
            message: `Model '${name}' deleted successfully`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in DELETE /api/services/llm/models/:name: ${error.message}`);

        // If model not found
        if (error.response && error.response.status === 404) {
            return res.status(404).json({
                error: `Model '${req.params.name}' not found`,
                timestamp: new Date().toISOString()
            });
        }

        // If service is unreachable
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return res.status(503).json({
                error: 'LLM service is not available',
                timestamp: new Date().toISOString()
            });
        }

        res.status(500).json({
            error: 'Failed to delete model',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/services/embedding/info - Get embedding service information
router.get('/embedding/info', async (req, res) => {
    try {
        const embeddingServiceUrl = `http://${process.env.EMBEDDING_SERVICE_HOST}:${process.env.EMBEDDING_SERVICE_PORT}`;

        // Get embedding service info
        const response = await axios.get(`${embeddingServiceUrl}/info`, {
            timeout: 3000
        });

        res.json({
            ...response.data,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/services/embedding/info: ${error.message}`);

        // If service is unreachable
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return res.status(503).json({
                error: 'Embedding service is not available',
                timestamp: new Date().toISOString()
            });
        }

        res.status(500).json({
            error: 'Failed to retrieve embedding service information',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
