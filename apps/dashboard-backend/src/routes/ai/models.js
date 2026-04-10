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
 * - GET  /api/models/recommended  - Get recommended model for device profile
 * - POST /api/models/default     - Set default model
 * - GET  /api/models/default     - Get default model
 * - POST /api/models/sync        - Sync with Ollama
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const modelService = require('../../services/llm/modelService');
const logger = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const { initSSE, trackConnection } = require('../../utils/sseHelper');
const { cacheService, cacheMiddleware } = require('../../services/core/cacheService');
const { getLlmRamGB } = require('../../utils/hardware');

// Cache keys
const CACHE_KEYS = {
  CATALOG: 'models:catalog',
  INSTALLED: 'models:installed',
  STATUS: 'models:status',
  DEFAULT: 'models:default',
};

// Cache TTLs (in milliseconds)
const CACHE_TTLS = {
  CATALOG: 30000, // 30 seconds - changes rarely
  INSTALLED: 15000, // 15 seconds
  STATUS: 5000, // 5 seconds - changes more frequently
  DEFAULT: 60000, // 60 seconds - changes rarely
};

/**
 * GET /api/models/catalog
 * Get curated model catalog with installation status
 * Cached for 30 seconds to reduce database load
 */
router.get(
  '/catalog',
  requireAuth,
  cacheMiddleware(CACHE_KEYS.CATALOG, CACHE_TTLS.CATALOG),
  asyncHandler(async (req, res) => {
    logger.debug(
      `[Models] Catalog request - Host: ${req.headers.host}, Origin: ${req.headers.origin || 'same-origin'}, IP: ${req.ip}`
    );

    const catalog = await modelService.getCatalog();

    logger.debug(`[Models] Catalog response - total: ${catalog.length} models`);
    res.json({
      models: catalog,
      total: catalog.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/models/installed
 * Get installed models only
 * Cached for 15 seconds
 */
router.get(
  '/installed',
  requireAuth,
  cacheMiddleware(CACHE_KEYS.INSTALLED, CACHE_TTLS.INSTALLED),
  asyncHandler(async (req, res) => {
    const models = await modelService.getInstalledModels();
    res.json({
      models,
      total: models.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/models/status
 * Get current model status (loaded model, queue stats)
 * Cached for 5 seconds (short TTL as status can change)
 */
router.get(
  '/status',
  requireAuth,
  cacheMiddleware(CACHE_KEYS.STATUS, CACHE_TTLS.STATUS),
  asyncHandler(async (req, res) => {
    logger.debug(
      `[Models] Status request - Host: ${req.headers.host}, Origin: ${req.headers.origin || 'same-origin'}, IP: ${req.ip}`
    );

    const status = await modelService.getStatus();

    logger.debug(
      `[Models] Status response - loaded_model: ${status.loaded_model ? status.loaded_model.model_id : 'null'}`
    );
    res.json(status);
  })
);

/**
 * GET /api/models/loaded
 * Get all currently loaded models (multi-model support)
 */
router.get(
  '/loaded',
  requireAuth,
  asyncHandler(async (req, res) => {
    const loadedModels = await modelService.getLoadedModels();
    // Backwards-compatible: also include single loaded_model for existing consumers
    res.json({
      loaded_model: loadedModels.length > 0 ? loadedModels[0] : null,
      loaded_models: loadedModels,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/models/lifecycle
 * Get adaptive lifecycle status (phase, keep-alive, usage profile)
 */
router.get(
  '/lifecycle',
  requireAuth,
  asyncHandler(async (req, res) => {
    const modelLifecycleService = require('../../services/llm/modelLifecycleService');
    const status = await modelLifecycleService.getLifecycleStatus();
    res.json(status);
  })
);

/**
 * GET /api/models/memory-budget
 * Get memory budget status (total, used, available, loaded models)
 */
router.get(
  '/memory-budget',
  requireAuth,
  asyncHandler(async (req, res) => {
    const budget = await modelService.getMemoryBudget();
    res.json(budget);
  })
);

/**
 * POST /api/models/:modelId/load
 * Load a model into RAM (LLM) or start container (OCR)
 */
router.post(
  '/:modelId/load',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;
    const database = require('../../database');

    // Check model type
    const typeResult = await database.query(
      'SELECT model_type FROM llm_model_catalog WHERE id = $1',
      [modelId]
    );

    if (typeResult.rows.length === 0) {
      throw new NotFoundError(`Modell "${modelId}" nicht im Katalog gefunden`);
    }

    if (typeResult.rows[0].model_type === 'ocr') {
      // OCR: Start Docker container
      const containerService = require('../../services/app/containerService');
      const appId = modelId.split(':')[0];
      const result = await containerService.startApp(appId);
      cacheService.invalidate(CACHE_KEYS.STATUS);
      cacheService.invalidate(CACHE_KEYS.INSTALLED);
      res.json({ message: `OCR-Modell ${modelId} wird gestartet`, ...result });
    } else {
      // LLM: Load into VRAM via Ollama
      const result = await modelService.activateModel(modelId, 'user');
      cacheService.invalidate(CACHE_KEYS.STATUS);
      res.json(result);
    }
  })
);

/**
 * POST /api/models/:modelId/unload
 * Unload model from RAM (LLM) or stop container (OCR)
 */
router.post(
  '/:modelId/unload',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;
    const database = require('../../database');

    // Check model type
    const typeResult = await database.query(
      'SELECT model_type, COALESCE(ollama_name, id) as ollama_name, name FROM llm_model_catalog WHERE id = $1',
      [modelId]
    );

    if (typeResult.rows.length === 0) {
      throw new NotFoundError(`Modell "${modelId}" nicht im Katalog gefunden`);
    }

    if (typeResult.rows[0].model_type === 'ocr') {
      // OCR: Stop Docker container
      const containerService = require('../../services/app/containerService');
      const appId = modelId.split(':')[0];
      const result = await containerService.stopApp(appId);
      cacheService.invalidate(CACHE_KEYS.STATUS);
      cacheService.invalidate(CACHE_KEYS.INSTALLED);
      res.json({ message: `OCR-Modell ${modelId} wurde gestoppt`, ...result, model: modelId });
    } else {
      // LLM: Unload from VRAM via Ollama
      const ollamaName = typeResult.rows[0].ollama_name;
      const result = await modelService.unloadModel(ollamaName);
      cacheService.invalidate(CACHE_KEYS.STATUS);
      cacheService.invalidate(CACHE_KEYS.INSTALLED);
      res.json({ ...result, model: modelId });
    }
  })
);

/**
 * POST /api/models/download
 * Download a model with SSE progress streaming
 * Note: Inner try-catch retained for SSE streaming error handling
 *
 * Fixes applied:
 * - DL-001: Heartbeat every 10s to keep connection alive during slow manifest fetches
 * - DL-002: Duplicate download check - returns current progress if already downloading
 * - DL-003: Client disconnect detection to abort server-side download
 */
router.post(
  '/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { model_id } = req.body;

    if (!model_id) {
      throw new ValidationError('model_id ist erforderlich');
    }

    if (typeof model_id !== 'string' || model_id.length > 200 || /[/\\;|&`$(){}]/.test(model_id)) {
      throw new ValidationError(
        'Ungültige model_id (max 200 Zeichen, keine Pfad- oder Shell-Metazeichen)'
      );
    }

    // Check if model exists in catalog
    const modelInfo = await modelService.getModelInfo(model_id);
    if (!modelInfo) {
      throw new NotFoundError(`Modell ${model_id} nicht im Katalog gefunden`);
    }

    // DL-002: Check if model is already downloading or installed
    if (modelInfo.install_status === 'downloading') {
      // Already downloading - return current progress via SSE and close
      initSSE(res);
      res.write(
        `data: ${JSON.stringify({
          status: 'already_downloading',
          model_id,
          progress: modelInfo.download_progress || 0,
          message: 'Download läuft bereits',
        })}\n\n`
      );
      res.end();
      return;
    }

    if (modelInfo.install_status === 'available') {
      initSSE(res);
      res.write(
        `data: ${JSON.stringify({
          status: 'already_installed',
          model_id,
          progress: 100,
          done: true,
          success: true,
          message: 'Modell ist bereits installiert',
        })}\n\n`
      );
      res.end();
      return;
    }

    // RAM validation: warn if model size exceeds LLM RAM allocation
    if (modelInfo.size_bytes) {
      const modelSizeGB = modelInfo.size_bytes / (1024 * 1024 * 1024);
      const llmRamGB = getLlmRamGB();

      if (!isNaN(llmRamGB) && modelSizeGB > llmRamGB) {
        initSSE(res);
        res.write(
          `data: ${JSON.stringify({
            status: 'ram_warning',
            model_id,
            modelSizeGB: Math.round(modelSizeGB),
            llmRamGB,
            message: `Modell benötigt ~${Math.round(modelSizeGB)}GB RAM, aber nur ${llmRamGB}GB für LLM verfügbar. Das Modell kann möglicherweise nicht geladen werden.`,
            proceed: true,
          })}\n\n`
        );
      }
    }

    // Set up SSE for progress
    initSSE(res);

    // DL-003: Track client connection + abort controller for cancellation
    const connection = trackConnection(res);
    const abortController = new AbortController();

    // Abort Ollama pull when client disconnects
    connection.onClose(() => {
      logger.info(`[Download] Client disconnected during ${model_id} download - aborting pull`);
      abortController.abort();
    });

    // Send initial event
    res.write(`data: ${JSON.stringify({ status: 'starting', model_id, progress: 0 })}\n\n`);

    // DL-001: Heartbeat to keep connection alive during slow Ollama manifest fetches
    const heartbeatInterval = setInterval(() => {
      if (connection.isConnected()) {
        try {
          res.write(`:heartbeat\n\n`);
        } catch {
          // connection lost - trackConnection handles state
        }
      }
    }, 10000);

    try {
      await modelService.downloadModel(
        model_id,
        (progress, status) => {
          if (connection.isConnected()) {
            try {
              res.write(`data: ${JSON.stringify({ progress, status, model_id })}\n\n`);
            } catch {
              // connection lost - trackConnection handles state
            }
          }
        },
        { signal: abortController.signal }
      );

      // Invalidate model caches after successful download
      cacheService.invalidatePattern('models:*');

      if (connection.isConnected()) {
        res.write(`data: ${JSON.stringify({ done: true, success: true, model_id })}\n\n`);
      }
    } catch (error) {
      const isAborted =
        error.name === 'AbortError' ||
        error.name === 'CanceledError' ||
        abortController.signal.aborted;
      if (isAborted) {
        logger.info(`[Download] Model ${model_id} download aborted (client disconnected)`);
      } else {
        logger.error(`Error downloading model ${model_id}: ${error.message}`);
      }
      if (connection.isConnected()) {
        res.write(
          `data: ${JSON.stringify({ error: isAborted ? 'Download abgebrochen' : error.message, done: true, model_id })}\n\n`
        );
      }
    } finally {
      clearInterval(heartbeatInterval);
      if (connection.isConnected()) {
        res.end();
      }
    }
  })
);

/**
 * DELETE /api/models/:modelId
 * Delete a model
 */
router.delete(
  '/:modelId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const result = await modelService.deleteModel(modelId);

    // Invalidate model caches after deletion
    cacheService.invalidatePattern('models:*');

    res.json({
      ...result,
      message: `Modell ${modelId} wurde geloescht`,
    });
  })
);

/**
 * POST /api/models/:modelId/activate
 * Load a model into RAM
 * Supports SSE streaming for progress updates via ?stream=true
 */
router.post(
  '/:modelId/activate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;
    const useStream = req.query.stream === 'true';

    // Check if model is installed
    const isInstalled = await modelService.isModelInstalled(modelId);
    if (!isInstalled) {
      if (useStream) {
        initSSE(res);
        res.write(
          `data: ${JSON.stringify({ error: `Modell ${modelId} ist nicht installiert`, done: true })}\n\n`
        );
        return res.end();
      }
      throw new NotFoundError(`Modell ${modelId} ist nicht installiert`);
    }

    // P3-001: SSE streaming for activation progress
    if (useStream) {
      initSSE(res);

      // Get model info for estimated time
      const modelInfo = await modelService.getModelInfo(modelId);
      const estimatedSeconds = (modelInfo?.ram_required_gb || 10) * 3; // ~3s per GB

      // Send initial status
      res.write(
        `data: ${JSON.stringify({
          status: 'starting',
          progress: 0,
          message: 'Modell wird vorbereitet...',
          estimatedSeconds,
        })}\n\n`
      );

      // UX-FIX: Send honest indeterminate progress with heartbeat instead of fake percentages.
      // Real Ollama loading time is unpredictable — fake progress misleads users.
      let elapsedSeconds = 0;
      const progressInterval = setInterval(() => {
        elapsedSeconds++;
        const messages = [
          'Modell wird vorbereitet...',
          'Lade Modell-Gewichte in GPU-Speicher...',
          'Initialisiere GPU-Speicher...',
          'Optimiere für Inferenz...',
        ];
        const messageIndex = Math.min(
          Math.floor(elapsedSeconds / Math.max(estimatedSeconds / 4, 3)),
          messages.length - 1
        );
        res.write(
          `data: ${JSON.stringify({
            status: 'loading',
            progress: -1,
            indeterminate: true,
            elapsed: elapsedSeconds,
            estimatedSeconds,
            message: messages[messageIndex],
          })}\n\n`
        );
      }, 1000); // Heartbeat every second

      try {
        const result = await modelService.activateModel(modelId, 'user');
        clearInterval(progressInterval);

        // Invalidate status cache after activation
        cacheService.invalidate(CACHE_KEYS.STATUS);

        res.write(
          `data: ${JSON.stringify({
            status: 'complete',
            progress: 100,
            message: result.alreadyLoaded
              ? `Modell ${modelId} war bereits geladen`
              : `Modell ${modelId} erfolgreich aktiviert`,
            ...result,
            done: true,
          })}\n\n`
        );
        res.end();
      } catch (err) {
        clearInterval(progressInterval);
        logger.error(`Error activating model ${modelId}: ${err.message}`);
        res.write(
          `data: ${JSON.stringify({
            status: 'error',
            error: err.message,
            done: true,
          })}\n\n`
        );
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
          : `Modell ${modelId} wurde aktiviert`,
      });
    }
  })
);

/**
 * POST /api/models/:modelId/deactivate
 * Unload a model from RAM
 */
router.post(
  '/:modelId/deactivate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const result = await modelService.unloadModel(modelId);

    // Invalidate status cache after deactivation
    cacheService.invalidate(CACHE_KEYS.STATUS);

    res.json({
      ...result,
      message: `Modell ${modelId} wurde entladen`,
    });
  })
);

/**
 * GET /api/models/recommended
 * Get recommended model for this device based on hardware profile
 * Used by Setup Wizard to pre-select the optimal model
 */
router.get(
  '/recommended',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { getRecommendedModel } = require('../../utils/hardware');
    const recommendation = await getRecommendedModel();

    res.json({
      recommended_model: recommendation.model,
      recommended_models: recommendation.models,
      device_profile: recommendation.profile,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/models/default
 * Set default model for new chats
 */
router.post(
  '/default',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { model_id } = req.body;

    if (!model_id) {
      throw new ValidationError('model_id ist erforderlich');
    }

    if (typeof model_id !== 'string' || model_id.length > 200 || /[/\\;|&`$(){}]/.test(model_id)) {
      throw new ValidationError(
        'Ungültige model_id (max 200 Zeichen, keine Pfad- oder Shell-Metazeichen)'
      );
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
      message: `${model_id} ist jetzt das Standard-Modell`,
    });
  })
);

/**
 * GET /api/models/default
 * Get default model
 * Cached for 60 seconds (changes rarely)
 */
router.get(
  '/default',
  requireAuth,
  cacheMiddleware(CACHE_KEYS.DEFAULT, CACHE_TTLS.DEFAULT),
  asyncHandler(async (req, res) => {
    const defaultModel = await modelService.getDefaultModel();
    res.json({
      default_model: defaultModel,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/models/sync
 * Sync installed models with Ollama
 */
router.post(
  '/sync',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await modelService.syncWithOllama();

    // Invalidate all model caches after sync
    cacheService.invalidatePattern('models:*');

    res.json({
      ...result,
      message: 'Modell-Synchronisation abgeschlossen',
    });
  })
);

/**
 * GET /api/models/:modelId
 * Get info for a specific model
 */
router.get(
  '/:modelId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const model = await modelService.getModelInfo(modelId);
    if (!model) {
      throw new NotFoundError(`Modell ${modelId} nicht gefunden`);
    }
    res.json(model);
  })
);

module.exports = router;
