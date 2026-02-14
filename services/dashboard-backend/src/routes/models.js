/**
 * LLM Models API Routes
 * Dynamic model management for Jetson AGX Orin
 *
 * Endpoints:
 * - GET  /api/models/catalog     - Get curated model catalog
 * - GET  /api/models/installed   - Get installed models
 * - GET  /api/models/status      - Get current status (loaded, queue)
 * - GET  /api/models/loaded      - Get currently loaded model
 * - POST /api/models/download    - Download model with SSE progress
 * - DELETE /api/models/:modelId  - Delete a model
 * - POST /api/models/:modelId/activate   - Load model into RAM
 * - POST /api/models/:modelId/deactivate - Unload model from RAM
 * - POST /api/models/default     - Set default model
 * - GET  /api/models/default     - Get default model
 * - POST /api/models/sync        - Sync with Ollama
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const modelService = require('../services/modelService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { cacheService, cacheMiddleware } = require('../services/cacheService');

// Cache keys
const CACHE_KEYS = {
    CATALOG: 'models:catalog',
    INSTALLED: 'models:installed',
    STATUS: 'models:status',
    DEFAULT: 'models:default'
};

// Cache TTLs (in milliseconds)
const CACHE_TTLS = {
    CATALOG: 30000,    // 30 seconds - changes rarely
    INSTALLED: 15000,  // 15 seconds
    STATUS: 5000,      // 5 seconds - changes more frequently
    DEFAULT: 60000     // 60 seconds - changes rarely
};

/**
 * GET /api/models/catalog
 * Get curated model catalog with installation status
 * Cached for 30 seconds to reduce database load
 */
router.get('/catalog', requireAuth, cacheMiddleware(CACHE_KEYS.CATALOG, CACHE_TTLS.CATALOG), asyncHandler(async (req, res) => {
    logger.debug(`[Models] Catalog request - Host: ${req.headers.host}, Origin: ${req.headers.origin || 'same-origin'}, IP: ${req.ip}`);

    const catalog = await modelService.getCatalog();

    logger.debug(`[Models] Catalog response - total: ${catalog.length} models`);
    res.json({
        models: catalog,
        total: catalog.length,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/models/installed
 * Get installed models only
 * Cached for 15 seconds
 */
router.get('/installed', requireAuth, cacheMiddleware(CACHE_KEYS.INSTALLED, CACHE_TTLS.INSTALLED), asyncHandler(async (req, res) => {
    const models = await modelService.getInstalledModels();
    res.json({
        models,
        total: models.length,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/models/status
 * Get current model status (loaded model, queue stats)
 * Cached for 5 seconds (short TTL as status can change)
 */
router.get('/status', requireAuth, cacheMiddleware(CACHE_KEYS.STATUS, CACHE_TTLS.STATUS), asyncHandler(async (req, res) => {
    logger.debug(`[Models] Status request - Host: ${req.headers.host}, Origin: ${req.headers.origin || 'same-origin'}, IP: ${req.ip}`);

    const status = await modelService.getStatus();

    logger.debug(`[Models] Status response - loaded_model: ${status.loaded_model ? status.loaded_model.model_id : 'null'}`);
    res.json(status);
}));

/**
 * GET /api/models/loaded
 * Get currently loaded model
 */
router.get('/loaded', requireAuth, asyncHandler(async (req, res) => {
    const loaded = await modelService.getLoadedModel();
    res.json({
        loaded_model: loaded,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/models/download
 * Download a model with SSE progress streaming
 * Note: Inner try-catch retained for SSE streaming error handling
 */
router.post('/download', requireAuth, asyncHandler(async (req, res) => {
    const { model_id } = req.body;

    if (!model_id) {
        throw new ValidationError('model_id ist erforderlich');
    }

    // Check if model exists in catalog
    const modelInfo = await modelService.getModelInfo(model_id);
    if (!modelInfo) {
        throw new NotFoundError(`Modell ${model_id} nicht im Katalog gefunden`);
    }

    // Set up SSE for progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial event
    res.write(`data: ${JSON.stringify({ status: 'starting', model_id, progress: 0 })}\n\n`);

    try {
        await modelService.downloadModel(model_id, (progress, status) => {
            res.write(`data: ${JSON.stringify({ progress, status, model_id })}\n\n`);
        });

        // Invalidate model caches after successful download
        cacheService.invalidatePattern('models:*');

        res.write(`data: ${JSON.stringify({ done: true, success: true, model_id })}\n\n`);
        res.end();

    } catch (error) {
        logger.error(`Error downloading model ${model_id}: ${error.message}`);
        res.write(`data: ${JSON.stringify({ error: error.message, done: true, model_id })}\n\n`);
        res.end();
    }
}));

/**
 * DELETE /api/models/:modelId
 * Delete a model
 */
router.delete('/:modelId', requireAuth, asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const result = await modelService.deleteModel(modelId);

    // Invalidate model caches after deletion
    cacheService.invalidatePattern('models:*');

    res.json({
        ...result,
        message: `Modell ${modelId} wurde geloescht`
    });
}));

/**
 * POST /api/models/:modelId/activate
 * Load a model into RAM
 * Supports SSE streaming for progress updates via ?stream=true
 */
router.post('/:modelId/activate', requireAuth, asyncHandler(async (req, res) => {
    const { modelId } = req.params;
    const useStream = req.query.stream === 'true';

    // Check if model is installed
    const isInstalled = await modelService.isModelInstalled(modelId);
    if (!isInstalled) {
        if (useStream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.write(`data: ${JSON.stringify({ error: `Modell ${modelId} ist nicht installiert`, done: true })}\n\n`);
            return res.end();
        }
        throw new NotFoundError(`Modell ${modelId} ist nicht installiert`);
    }

    // P3-001: SSE streaming for activation progress
    if (useStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // Get model info for estimated time
        const modelInfo = await modelService.getModelInfo(modelId);
        const estimatedSeconds = (modelInfo?.ram_required_gb || 10) * 3; // ~3s per GB

        // Send initial status
        res.write(`data: ${JSON.stringify({
            status: 'starting',
            progress: 0,
            message: 'Modell wird vorbereitet...',
            estimatedSeconds
        })}\n\n`);

        // Simulate progress updates while activation runs
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress = Math.min(progress + 5, 95);
            const messages = [
                'Modell wird vorbereitet...',
                'Lade Modell-Gewichte...',
                'Initialisiere GPU-Speicher...',
                'Optimiere für Inferenz...',
                'Fast fertig...'
            ];
            const messageIndex = Math.floor(progress / 20);
            res.write(`data: ${JSON.stringify({
                status: 'loading',
                progress,
                message: messages[Math.min(messageIndex, messages.length - 1)]
            })}\n\n`);
        }, estimatedSeconds * 50); // Update every ~5% of estimated time

        try {
            const result = await modelService.activateModel(modelId, 'user');
            clearInterval(progressInterval);

            // Invalidate status cache after activation
            cacheService.invalidate(CACHE_KEYS.STATUS);

            res.write(`data: ${JSON.stringify({
                status: 'complete',
                progress: 100,
                message: result.alreadyLoaded
                    ? `Modell ${modelId} war bereits geladen`
                    : `Modell ${modelId} erfolgreich aktiviert`,
                ...result,
                done: true
            })}\n\n`);
            res.end();
        } catch (err) {
            clearInterval(progressInterval);
            logger.error(`Error activating model ${modelId}: ${err.message}`);
            res.write(`data: ${JSON.stringify({
                status: 'error',
                error: err.message,
                done: true
            })}\n\n`);
            res.end();
        }
    } else {
        // Non-streaming (original behavior)
        const result = await modelService.activateModel(modelId, 'user');

        // Invalidate status cache after activation
        cacheService.invalidate(CACHE_KEYS.STATUS);

        res.json({
            ...result,
            message: result.alreadyLoaded
                ? `Modell ${modelId} ist bereits geladen`
                : `Modell ${modelId} wurde aktiviert`
        });
    }
}));

/**
 * POST /api/models/:modelId/deactivate
 * Unload a model from RAM
 */
router.post('/:modelId/deactivate', requireAuth, asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const result = await modelService.unloadModel(modelId);

    // Invalidate status cache after deactivation
    cacheService.invalidate(CACHE_KEYS.STATUS);

    res.json({
        ...result,
        message: `Modell ${modelId} wurde entladen`
    });
}));

/**
 * POST /api/models/default
 * Set default model for new chats
 */
router.post('/default', requireAuth, asyncHandler(async (req, res) => {
    const { model_id } = req.body;

    if (!model_id) {
        throw new ValidationError('model_id ist erforderlich');
    }

    // Check if model is installed
    const isInstalled = await modelService.isModelInstalled(model_id);
    if (!isInstalled) {
        throw new NotFoundError(`Modell ${model_id} ist nicht installiert`);
    }

    const result = await modelService.setDefaultModel(model_id);

    // Invalidate default model cache
    cacheService.invalidate(CACHE_KEYS.DEFAULT);

    res.json({
        ...result,
        message: `${model_id} ist jetzt das Standard-Modell`
    });
}));

/**
 * GET /api/models/default
 * Get default model
 * Cached for 60 seconds (changes rarely)
 */
router.get('/default', requireAuth, cacheMiddleware(CACHE_KEYS.DEFAULT, CACHE_TTLS.DEFAULT), asyncHandler(async (req, res) => {
    const defaultModel = await modelService.getDefaultModel();
    res.json({
        default_model: defaultModel,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/models/sync
 * Sync installed models with Ollama
 */
router.post('/sync', requireAuth, asyncHandler(async (req, res) => {
    const result = await modelService.syncWithOllama();

    // Invalidate all model caches after sync
    cacheService.invalidatePattern('models:*');

    res.json({
        ...result,
        message: 'Modell-Synchronisation abgeschlossen'
    });
}));

/**
 * GET /api/models/:modelId
 * Get info for a specific model
 */
router.get('/:modelId', requireAuth, asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const model = await modelService.getModelInfo(modelId);
    if (!model) {
        throw new NotFoundError(`Modell ${modelId} nicht gefunden`);
    }
    res.json(model);
}));

module.exports = router;
