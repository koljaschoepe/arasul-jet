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

/**
 * GET /api/models/catalog
 * Get curated model catalog with installation status
 */
router.get('/catalog', requireAuth, asyncHandler(async (req, res) => {
    // Debug logging for localhost vs. external access investigation
    logger.info(`[Models] Catalog request - Host: ${req.headers.host}, Origin: ${req.headers.origin || 'same-origin'}, IP: ${req.ip}`);

    const catalog = await modelService.getCatalog();

    logger.info(`[Models] Catalog response - total: ${catalog.length} models`);
    res.json({
        models: catalog,
        total: catalog.length,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/models/installed
 * Get installed models only
 */
router.get('/installed', requireAuth, asyncHandler(async (req, res) => {
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
 */
router.get('/status', requireAuth, asyncHandler(async (req, res) => {
    // Debug logging for localhost vs. external access investigation
    logger.info(`[Models] Status request - Host: ${req.headers.host}, Origin: ${req.headers.origin || 'same-origin'}, IP: ${req.ip}`);

    const status = await modelService.getStatus();

    logger.info(`[Models] Status response - loaded_model: ${status.loaded_model ? status.loaded_model.model_id : 'null'}`);
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
 * Note: Uses manual try-catch for SSE streaming (not asyncHandler)
 */
router.post('/download', requireAuth, async (req, res) => {
    const { model_id } = req.body;

    if (!model_id) {
        return res.status(400).json({ error: 'model_id ist erforderlich' });
    }

    // Check if model exists in catalog
    const modelInfo = await modelService.getModelInfo(model_id);
    if (!modelInfo) {
        return res.status(404).json({ error: `Modell ${model_id} nicht im Katalog gefunden` });
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

        res.write(`data: ${JSON.stringify({ done: true, success: true, model_id })}\n\n`);
        res.end();

    } catch (error) {
        logger.error(`Error downloading model ${model_id}: ${error.message}`);
        res.write(`data: ${JSON.stringify({ error: error.message, done: true, model_id })}\n\n`);
        res.end();
    }
});

/**
 * DELETE /api/models/:modelId
 * Delete a model
 */
router.delete('/:modelId', requireAuth, asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const result = await modelService.deleteModel(modelId);
    res.json({
        ...result,
        message: `Modell ${modelId} wurde geloescht`
    });
}));

/**
 * POST /api/models/:modelId/activate
 * Load a model into RAM
 */
router.post('/:modelId/activate', requireAuth, asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    // Check if model is installed
    const isInstalled = await modelService.isModelInstalled(modelId);
    if (!isInstalled) {
        throw new NotFoundError(`Modell ${modelId} ist nicht installiert`);
    }

    const result = await modelService.activateModel(modelId, 'user');
    res.json({
        ...result,
        message: result.alreadyLoaded
            ? `Modell ${modelId} ist bereits geladen`
            : `Modell ${modelId} wurde aktiviert`
    });
}));

/**
 * POST /api/models/:modelId/deactivate
 * Unload a model from RAM
 */
router.post('/:modelId/deactivate', requireAuth, asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const result = await modelService.unloadModel(modelId);
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
    res.json({
        ...result,
        message: `${model_id} ist jetzt das Standard-Modell`
    });
}));

/**
 * GET /api/models/default
 * Get default model
 */
router.get('/default', requireAuth, asyncHandler(async (req, res) => {
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
