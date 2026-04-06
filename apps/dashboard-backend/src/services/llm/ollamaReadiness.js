/**
 * Ollama Readiness Service
 *
 * Handles:
 * - Waiting for Ollama to be ready with retry logic
 * - Periodic sync to keep DB in sync with Ollama
 * - Adaptive model unloading via modelLifecycleService
 * - Auto-reload of models on new requests
 * - Multi-model tracking (multiple models can be loaded)
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const database = require('../../database');
const services = require('../../config/services');
const modelLifecycleService = require('./modelLifecycleService');

// Service URLs (from centralized config)
const LLM_SERVICE_URL = services.llm.url;
const METRICS_COLLECTOR_URL = services.metrics.url;

// Configuration
const OLLAMA_READY_TIMEOUT = parseInt(process.env.OLLAMA_READY_TIMEOUT || '300000'); // 5 min default
const OLLAMA_RETRY_INTERVAL = parseInt(process.env.OLLAMA_RETRY_INTERVAL || '5000'); // 5 sec
const SYNC_INTERVAL = parseInt(process.env.MODEL_SYNC_INTERVAL || '300000'); // 5 min

// In-memory state
let isOllamaReady = false;
let syncIntervalId = null;
let unloadCheckIntervalId = null;
const modelUsageTracker = new Map(); // modelId -> { lastUsed: Date, activeRequests: number }
const activeRequests = new Map(); // requestId -> { modelId, startTime }

class OllamaReadinessService {
  constructor() {
    this.modelService = null; // Will be set on initialize
  }

  /**
   * Initialize the service - waits for Ollama, then starts periodic tasks
   * @param {Object} options
   * @param {Object} options.modelService - Reference to modelService
   */
  async initialize(options = {}) {
    this.modelService = options.modelService || require('./modelService');

    logger.info('[OllamaReadiness] Starting initialization...');

    // Wait for Ollama to be ready
    await this.waitForOllama();

    // Initial sync
    await this.performSync();

    // Preload default model (respects lifecycle phases)
    await this.preloadDefaultModel();

    // Start periodic sync
    this.startPeriodicSync();

    // Start adaptive unload checker
    this.startUnloadChecker();

    logger.info('[OllamaReadiness] Initialization complete');
    return { success: true };
  }

  /**
   * Preload default model into GPU memory on startup.
   * Respects lifecycle phases: skips preload during idle (e.g. night reboot).
   */
  async preloadDefaultModel() {
    try {
      const defaultModel = await this.modelService.getDefaultModel();
      if (!defaultModel) {
        logger.info('[OllamaReadiness] No default model set, skipping preload');
        return;
      }

      // Check if lifecycle says we should skip preload
      const shouldPreload = await modelLifecycleService.shouldPreloadOnStartup();
      if (!shouldPreload) {
        logger.info(
          '[OllamaReadiness] Skipping preload — lifecycle phase is idle (will load on first request)'
        );
        return;
      }

      // Resolve ollama name from catalog
      let ollamaName = defaultModel;
      try {
        const result = await database.query(
          `SELECT COALESCE(ollama_name, id) as name FROM llm_model_catalog WHERE id = $1`,
          [defaultModel]
        );
        if (result.rows.length > 0) {
          ollamaName = result.rows[0].name;
        }
      } catch (e) {
        /* use defaultModel as-is */
      }

      // Get dynamic keep-alive from lifecycle service
      const { keepAliveSeconds } = await modelLifecycleService.getCurrentKeepAlive();

      logger.info(
        `[OllamaReadiness] Preloading default model: ${ollamaName} (keep_alive: ${keepAliveSeconds}s)`
      );

      await axios.post(
        `${LLM_SERVICE_URL}/api/generate`,
        {
          model: ollamaName,
          prompt: 'hello',
          stream: false,
          keep_alive: keepAliveSeconds,
          options: { num_predict: 1 },
        },
        { timeout: 300000 }
      );

      // Track model as loaded
      modelUsageTracker.set(ollamaName, { lastUsed: new Date(), activeRequests: 0 });

      logger.info(`[OllamaReadiness] Default model preloaded successfully: ${ollamaName}`);
    } catch (err) {
      logger.warn(`[OllamaReadiness] Model preload failed (non-critical): ${err.message}`);
    }
  }

  /**
   * Wait for Ollama to be ready with retry logic
   */
  async waitForOllama() {
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < OLLAMA_READY_TIMEOUT) {
      attempt++;
      try {
        const response = await axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 5000 });

        if (response.status === 200) {
          isOllamaReady = true;
          const modelCount = (response.data.models || []).length;
          logger.info(
            `[OllamaReadiness] Ollama ready after ${attempt} attempts, ${modelCount} models available`
          );
          return true;
        }
      } catch (err) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        logger.debug(
          `[OllamaReadiness] Attempt ${attempt} failed (${elapsed}s elapsed): ${err.message}`
        );
      }

      // Wait before next retry with exponential backoff (max 10s)
      const backoff = Math.min(
        OLLAMA_RETRY_INTERVAL * Math.pow(1.5, Math.min(attempt - 1, 5)),
        10000
      );
      await new Promise(resolve => {
        setTimeout(resolve, backoff);
      });
    }

    logger.warn(`[OllamaReadiness] Ollama not ready after ${OLLAMA_READY_TIMEOUT}ms timeout`);
    isOllamaReady = false;
    return false;
  }

  /**
   * Perform sync with Ollama
   */
  async performSync() {
    if (!this.modelService) {
      logger.warn('[OllamaReadiness] ModelService not available for sync');
      return { success: false, error: 'ModelService not initialized' };
    }

    try {
      const result = await this.modelService.syncWithOllama();
      if (result.success) {
        logger.debug(`[OllamaReadiness] Sync complete: ${result.ollamaModels?.length || 0} models`);
      }
      return result;
    } catch (err) {
      logger.error(`[OllamaReadiness] Sync error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync() {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
    }

    syncIntervalId = setInterval(async () => {
      await this.performSync();
    }, SYNC_INTERVAL);

    logger.info(`[OllamaReadiness] Periodic sync started (every ${SYNC_INTERVAL / 1000}s)`);
  }

  /**
   * Start adaptive unload checker (delegates to modelLifecycleService)
   */
  startUnloadChecker() {
    if (unloadCheckIntervalId) {
      clearInterval(unloadCheckIntervalId);
    }

    // Check every 30 seconds
    unloadCheckIntervalId = setInterval(async () => {
      await this.checkSmartUnload();
    }, 30000);

    logger.info('[OllamaReadiness] Adaptive unload checker started (every 30s)');
  }

  /**
   * Delegate unload checks to modelLifecycleService
   */
  async checkSmartUnload() {
    await modelLifecycleService.checkAndUnload({
      getLoadedModels: () => this._getLoadedModelsFromOllama(),
      modelUsageTracker,
      unloadModel: (modelId, reason) => this.unloadModelWithTracking(modelId, reason),
    });
  }

  /**
   * Get all currently loaded models from Ollama /api/ps
   */
  async _getLoadedModelsFromOllama() {
    try {
      const response = await axios.get(`${LLM_SERVICE_URL}/api/ps`, { timeout: 5000 });
      return response.data?.models || [];
    } catch (err) {
      logger.debug(`[OllamaReadiness] Could not query loaded models: ${err.message}`);
      return [];
    }
  }

  /**
   * Unload model and update tracking
   */
  async unloadModelWithTracking(modelId, reason) {
    try {
      await this.modelService.unloadModel(modelId);
      modelUsageTracker.delete(modelId);

      // Log to database for monitoring (to_model = 'unloaded' since column is NOT NULL)
      await database.query(
        `INSERT INTO llm_model_switches (from_model, to_model, reason, switch_duration_ms)
         VALUES ($1, $2, $3, 0)`,
        [modelId, 'unloaded', `auto_unload_${reason}`]
      );

      logger.info(`[OllamaReadiness] Model ${modelId} unloaded (reason: ${reason})`);
    } catch (err) {
      logger.error(`[OllamaReadiness] Failed to unload model ${modelId}: ${err.message}`);
    }
  }

  /**
   * Track model usage (called when a request starts)
   * @param {string} requestId - Unique request identifier
   * @param {string} modelId - Model being used
   */
  trackRequestStart(requestId, modelId) {
    activeRequests.set(requestId, {
      modelId,
      startTime: Date.now(),
    });

    const usage = modelUsageTracker.get(modelId) || { lastUsed: new Date(), activeRequests: 0 };
    usage.activeRequests = (usage.activeRequests || 0) + 1;
    usage.lastUsed = new Date();
    modelUsageTracker.set(modelId, usage);

    logger.debug(`[OllamaReadiness] Request ${requestId} started for model ${modelId}`);
  }

  /**
   * Track model usage (called when a request ends)
   * @param {string} requestId - Unique request identifier
   */
  trackRequestEnd(requestId) {
    const request = activeRequests.get(requestId);
    if (request) {
      const usage = modelUsageTracker.get(request.modelId);
      if (usage) {
        usage.activeRequests = Math.max(0, (usage.activeRequests || 1) - 1);
        usage.lastUsed = new Date();
        modelUsageTracker.set(request.modelId, usage);
      }
      activeRequests.delete(requestId);

      const duration = Date.now() - request.startTime;
      logger.debug(`[OllamaReadiness] Request ${requestId} ended (${duration}ms)`);
    }
  }

  /**
   * Ensure model is loaded before request (auto-reload)
   * @param {string} modelId - Model to ensure is loaded
   * @returns {Promise<boolean>} - True if model is ready
   */
  async ensureModelLoaded(modelId) {
    if (!this.modelService) {
      logger.error('[OllamaReadiness] ModelService not initialized');
      return false;
    }

    try {
      const loadedModels = await this._getLoadedModelsFromOllama();

      // Get ollama_name for comparison
      const catalogResult = await database.query(
        `SELECT COALESCE(ollama_name, id) as effective_ollama_name
         FROM llm_model_catalog WHERE id = $1`,
        [modelId]
      );
      const ollamaName = catalogResult.rows[0]?.effective_ollama_name || modelId;

      // Check if model is among loaded models
      const isLoaded = loadedModels.some(m => (m.name || m.model) === ollamaName);
      if (isLoaded) {return true;}

      // Auto-reload the model
      logger.info(`[OllamaReadiness] Auto-loading model ${modelId} for incoming request`);
      const result = await this.modelService.activateModel(modelId, 'auto_reload');
      return result.success;
    } catch (err) {
      logger.error(`[OllamaReadiness] Failed to ensure model ${modelId} is loaded: ${err.message}`);
      return false;
    }
  }

  /**
   * Get the usage tracker map (for lifecycle service and API)
   */
  getModelUsageTracker() {
    return modelUsageTracker;
  }

  /**
   * Check if Ollama is ready
   */
  isReady() {
    return isOllamaReady;
  }

  /**
   * Get current status
   */
  async getStatus() {
    const lifecycleStatus = await modelLifecycleService.getLifecycleStatus();

    return {
      ollamaReady: isOllamaReady,
      syncIntervalMs: SYNC_INTERVAL,
      lifecycle: lifecycleStatus,
      trackedModels: Array.from(modelUsageTracker.entries()).map(([id, usage]) => ({
        modelId: id,
        lastUsed: usage.lastUsed,
        activeRequests: usage.activeRequests,
      })),
      activeRequestCount: activeRequests.size,
    };
  }

  /**
   * Shutdown the service
   */
  shutdown() {
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
    if (unloadCheckIntervalId) {
      clearInterval(unloadCheckIntervalId);
      unloadCheckIntervalId = null;
    }
    logger.info('[OllamaReadiness] Service shutdown');
  }
}

// Create singleton instance
const instance = new OllamaReadinessService();

module.exports = instance;
