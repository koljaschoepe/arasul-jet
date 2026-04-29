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
const { circuitBreakers } = require('../../utils/retry');

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

    // Initial sync — also demotes orphaned 'downloading' rows to 'paused'
    // when bytes are present, so the resume step below can pick them up.
    await this.performSync();

    // Phase 0: auto-resume any downloads that were interrupted by a crash,
    // restart, or network blip. Runs in background; does not block startup.
    this.resumePausedDownloads().catch(err =>
      logger.error(`[OllamaReadiness] Initial resume sweep failed: ${err.message}`)
    );

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
   * Auto-resume all 'paused' downloads.
   *
   * Triggered:
   *   1. Once at startup, after the initial sync.
   *   2. After every periodic sync (in case a sync just demoted a row).
   *
   * Pulls are fired sequentially with a small stagger so we don't hammer
   * Ollama; each one runs to completion in the background. The atomic claim
   * inside downloadModel makes it idempotent — if a resume is already in
   * flight, a duplicate trigger is a no-op.
   */
  async resumePausedDownloads() {
    if (!this.modelService) {
      return { resumed: 0, skipped: 0 };
    }
    let rows;
    try {
      rows = await this.modelService.listResumableDownloads();
    } catch (err) {
      logger.error(`[OllamaReadiness] listResumableDownloads failed: ${err.message}`);
      return { resumed: 0, skipped: 0, error: err.message };
    }
    if (!rows.length) {
      return { resumed: 0, skipped: 0 };
    }

    logger.info(`[OllamaReadiness] Found ${rows.length} paused download(s) — auto-resuming...`);
    let resumed = 0;
    let skipped = 0;
    for (const row of rows) {
      logger.info(
        `[OllamaReadiness] Resuming ${row.id} from ${row.bytes_completed || 0} bytes (attempt ${row.attempt_count || 0})`
      );
      try {
        // Fire-and-forget: large pulls run for hours and must not block.
        // Errors propagate to the row itself (status='paused' or 'error').
        this.modelService
          .downloadModel(row.id, null, { triggeredBy: 'auto-resume' })
          .then(() => logger.info(`[OllamaReadiness] Resume of ${row.id} completed`))
          .catch(err => logger.warn(`[OllamaReadiness] Resume of ${row.id} ended: ${err.message}`));
        resumed++;
      } catch (err) {
        logger.warn(`[OllamaReadiness] Could not start resume of ${row.id}: ${err.message}`);
        skipped++;
      }
      // 1s stagger between starts so Ollama doesn't see a burst.
      await new Promise(r => {
        setTimeout(r, 1000);
      });
    }
    return { resumed, skipped };
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
      const syncResult = await this.performSync();
      // If the sync just demoted any 'downloading' rows to 'paused', kick off
      // a resume sweep. Quick check via the cleanedUp counts avoids needless
      // DB queries when nothing changed.
      const cleanedUp = syncResult?.cleanedUp;
      if (cleanedUp && (cleanedUp.paused || 0) > 0) {
        this.resumePausedDownloads().catch(err =>
          logger.warn(`[OllamaReadiness] Resume sweep after periodic sync failed: ${err.message}`)
        );
      }
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
      if (isLoaded) {
        return true;
      }

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
   * Check if Ollama is ready (cached flag from initialization / sync).
   */
  isReady() {
    return isOllamaReady;
  }

  /**
   * Fast probe to check whether Ollama is reachable RIGHT NOW.
   *
   * Used by the /chat enqueue path to fail fast (≈2s) instead of letting
   * the queue wait the full 11-min model-load timeout when Ollama is dead.
   *
   * Returns `{ ready, latencyMs, error? }`. Mutates the cached `isOllamaReady`
   * flag based on the probe result so other consumers see fresh state.
   */
  async quickCheck(timeoutMs = 2000) {
    // Phase 6.3: Wrap the probe in the central circuit breaker. After 3
    // consecutive Ollama failures the breaker opens for 30s — quickCheck
    // returns instantly with `error: 'circuit-open'` instead of paying the
    // 2s timeout per request and hammering a known-down Ollama. The breaker
    // state is exposed via /api/health?detail=true.
    const startTime = Date.now();
    const breaker = circuitBreakers.get('ollama');
    try {
      const response = await breaker.execute(() =>
        axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: timeoutMs })
      );
      const latencyMs = Date.now() - startTime;
      if (response.status === 200) {
        if (!isOllamaReady) {
          // Recovered from a previous failure — log once so the operator
          // knows the box is back online.
          logger.info('[OllamaReadiness] quickCheck recovered Ollama');
        }
        isOllamaReady = true;
        return { ready: true, latencyMs };
      }
      isOllamaReady = false;
      return { ready: false, latencyMs, error: `unexpected status ${response.status}` };
    } catch (err) {
      isOllamaReady = false;
      // Surface circuit-open as a distinct, non-noisy error (no axios stack)
      if (err && err.code === 'CIRCUIT_OPEN') {
        return {
          ready: false,
          latencyMs: Date.now() - startTime,
          error: 'circuit-open',
        };
      }
      return {
        ready: false,
        latencyMs: Date.now() - startTime,
        error: err.code || err.message || 'unknown',
      };
    }
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
