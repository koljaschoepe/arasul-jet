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

/**
 * GET /api/models/catalog
 * Get curated model catalog with installation status
 */
router.get('/catalog', requireAuth, async (req, res) => {
    try {
        // Debug logging for localhost vs. external access investigation
        logger.info(`[Models] Catalog request - Host: ${req.headers.host}, Origin: ${req.headers.origin || 'same-origin'}, IP: ${req.ip}`);

        const catalog = await modelService.getCatalog();

        logger.info(`[Models] Catalog response - total: ${catalog.length} models`);
        res.json({
            models: catalog,
            total: catalog.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`[Models] Error getting catalog: ${error.message}`);
        res.status(500).json({ error: 'Fehler beim Laden des Modell-Katalogs' });
    }
});

/**
 * GET /api/models/installed
 * Get installed models only
 */
router.get('/installed', requireAuth, async (req, res) => {
    try {
        const models = await modelService.getInstalledModels();
        res.json({
            models,
            total: models.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error getting installed models: ${error.message}`);
        res.status(500).json({ error: 'Fehler beim Laden der installierten Modelle' });
    }
});

/**
 * GET /api/models/status
 * Get current model status (loaded model, queue stats)
 */
router.get('/status', requireAuth, async (req, res) => {
    try {
        // Debug logging for localhost vs. external access investigation
        logger.info(`[Models] Status request - Host: ${req.headers.host}, Origin: ${req.headers.origin || 'same-origin'}, IP: ${req.ip}`);

        const status = await modelService.getStatus();

        logger.info(`[Models] Status response - loaded_model: ${status.loaded_model ? status.loaded_model.model_id : 'null'}`);
        res.json(status);
    } catch (error) {
        logger.error(`[Models] Error getting status: ${error.message}`);
        res.status(500).json({ error: 'Fehler beim Laden des Modell-Status' });
    }
});

/**
 * GET /api/models/loaded
 * Get currently loaded model
 */
router.get('/loaded', requireAuth, async (req, res) => {
    try {
        const loaded = await modelService.getLoadedModel();
        res.json({
            loaded_model: loaded,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error getting loaded model: ${error.message}`);
        res.status(500).json({ error: 'Fehler beim Abrufen des geladenen Modells' });
    }
});

/**
 * POST /api/models/download
 * Download a model with SSE progress streaming
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
router.delete('/:modelId', requireAuth, async (req, res) => {
    const { modelId } = req.params;

    try {
        const result = await modelService.deleteModel(modelId);
        res.json({
            ...result,
            message: `Modell ${modelId} wurde geloescht`
        });
    } catch (error) {
        logger.error(`Error deleting model ${modelId}: ${error.message}`);
        res.status(500).json({ error: 'Fehler beim Loeschen des Modells' });
    }
});

/**
 * POST /api/models/:modelId/activate
 * Load a model into RAM
 */
router.post('/:modelId/activate', requireAuth, async (req, res) => {
    const { modelId } = req.params;

    // Check if model is installed
    const isInstalled = await modelService.isModelInstalled(modelId);
    if (!isInstalled) {
        return res.status(404).json({
            error: `Modell ${modelId} ist nicht installiert`
        });
    }

    try {
        const result = await modelService.activateModel(modelId, 'user');
        res.json({
            ...result,
            message: result.alreadyLoaded
                ? `Modell ${modelId} ist bereits geladen`
                : `Modell ${modelId} wurde aktiviert`
        });
    } catch (error) {
        logger.error(`Error activating model ${modelId}: ${error.message}`);
        res.status(500).json({ error: 'Fehler beim Aktivieren des Modells' });
    }
});

/**
 * POST /api/models/:modelId/deactivate
 * Unload a model from RAM
 */
router.post('/:modelId/deactivate', requireAuth, async (req, res) => {
    const { modelId } = req.params;

    try {
        const result = await modelService.unloadModel(modelId);
        res.json({
            ...result,
            message: `Modell ${modelId} wurde entladen`
        });
    } catch (error) {
        logger.error(`Error deactivating model ${modelId}: ${error.message}`);
        res.status(500).json({ error: 'Fehler beim Entladen des Modells' });
    }
});

/**
 * POST /api/models/default
 * Set default model for new chats
 */
router.post('/default', requireAuth, async (req, res) => {
    const { model_id } = req.body;

    if (!model_id) {
        return res.status(400).json({ error: 'model_id ist erforderlich' });
    }

    // Check if model is installed
    const isInstalled = await modelService.isModelInstalled(model_id);
    if (!isInstalled) {
        return res.status(404).json({
            error: `Modell ${model_id} ist nicht installiert`
        });
    }

    try {
        const result = await modelService.setDefaultModel(model_id);
        res.json({
            ...result,
            message: `${model_id} ist jetzt das Standard-Modell`
        });
    } catch (error) {
        logger.error(`Error setting default model: ${error.message}`);
        res.status(500).json({ error: 'Fehler beim Setzen des Standard-Modells' });
    }
});

/**
 * GET /api/models/default
 * Get default model
 */
router.get('/default', requireAuth, async (req, res) => {
    try {
        const defaultModel = await modelService.getDefaultModel();
        res.json({
            default_model: defaultModel,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error getting default model: ${error.message}`);
        res.status(500).json({ error: 'Fehler beim Abrufen des Standard-Modells' });
    }
});

/**
 * POST /api/models/sync
 * Sync installed models with Ollama
 */
router.post('/sync', requireAuth, async (req, res) => {
    try {
        const result = await modelService.syncWithOllama();
        res.json({
            ...result,
            message: 'Modell-Synchronisation abgeschlossen'
        });
    } catch (error) {
        logger.error(`Error syncing models: ${error.message}`);
        res.status(500).json({ error: 'Fehler bei der Modell-Synchronisation' });
    }
});

/**
 * GET /api/models/:modelId
 * Get info for a specific model
 */
router.get('/:modelId', requireAuth, async (req, res) => {
    const { modelId } = req.params;

    try {
        const model = await modelService.getModelInfo(modelId);
        if (!model) {
            return res.status(404).json({ error: `Modell ${modelId} nicht gefunden` });
        }
        res.json(model);
    } catch (error) {
        logger.error(`Error getting model info: ${error.message}`);
        res.status(500).json({ error: 'Fehler beim Laden der Modell-Information' });
    }
});

module.exports = router;
