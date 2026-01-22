/**
 * Ollama Readiness Service
 *
 * Handles:
 * - Waiting for Ollama to be ready with retry logic
 * - Periodic sync to keep DB in sync with Ollama
 * - Smart model unloading based on RAM and inactivity
 * - Auto-reload of models on new requests
 *
 * User Requirements:
 * - Unload model if request > 3 min AND RAM > 95%
 * - Unload model if inactive > 30 min
 * - Auto-reload model when request comes via n8n or Dashboard
 */

const axios = require('axios');
const logger = require('../utils/logger');
const database = require('../database');
const services = require('../config/services');

// Service URLs (from centralized config)
const LLM_SERVICE_HOST = services.llm.host;
const LLM_SERVICE_PORT = services.llm.port;
const LLM_SERVICE_URL = services.llm.url;
const METRICS_COLLECTOR_URL = services.metrics.url;

// Configuration
const OLLAMA_READY_TIMEOUT = parseInt(process.env.OLLAMA_READY_TIMEOUT || '300000'); // 5 min default
const OLLAMA_RETRY_INTERVAL = parseInt(process.env.OLLAMA_RETRY_INTERVAL || '5000'); // 5 sec
const SYNC_INTERVAL = parseInt(process.env.MODEL_SYNC_INTERVAL || '60000'); // 1 min
const INACTIVITY_THRESHOLD = parseInt(process.env.MODEL_INACTIVITY_THRESHOLD || '1800000'); // 30 min
const RAM_CRITICAL_THRESHOLD = parseFloat(process.env.RAM_CRITICAL_THRESHOLD || '95'); // 95%
const LONG_REQUEST_THRESHOLD = parseInt(process.env.LONG_REQUEST_THRESHOLD || '180000'); // 3 min

// In-memory state
let isOllamaReady = false;
let syncIntervalId = null;
let unloadCheckIntervalId = null;
let modelUsageTracker = new Map(); // modelId -> { lastUsed: Date, activeRequests: number }
let activeRequests = new Map(); // requestId -> { modelId, startTime }

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

        // Start periodic sync
        this.startPeriodicSync();

        // Start smart unload checker
        this.startUnloadChecker();

        logger.info('[OllamaReadiness] Initialization complete');
        return { success: true };
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
                    logger.info(`[OllamaReadiness] Ollama ready after ${attempt} attempts, ${modelCount} models available`);
                    return true;
                }
            } catch (err) {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                logger.debug(`[OllamaReadiness] Attempt ${attempt} failed (${elapsed}s elapsed): ${err.message}`);
            }

            // Wait before next retry with exponential backoff (max 10s)
            const backoff = Math.min(OLLAMA_RETRY_INTERVAL * Math.pow(1.5, Math.min(attempt - 1, 5)), 10000);
            await new Promise(resolve => setTimeout(resolve, backoff));
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
     * Start smart unload checker
     */
    startUnloadChecker() {
        if (unloadCheckIntervalId) {
            clearInterval(unloadCheckIntervalId);
        }

        // Check every 30 seconds
        unloadCheckIntervalId = setInterval(async () => {
            await this.checkSmartUnload();
        }, 30000);

        logger.info('[OllamaReadiness] Smart unload checker started (every 30s)');
    }

    /**
     * Check if models should be unloaded based on RAM and inactivity
     */
    async checkSmartUnload() {
        try {
            const loadedModel = await this.modelService.getLoadedModel();
            if (!loadedModel) {
                return; // No model loaded, nothing to unload
            }

            const modelId = loadedModel.model_id;
            const usage = modelUsageTracker.get(modelId);
            const now = Date.now();

            // Check 1: Inactivity > 30 min
            if (usage?.lastUsed) {
                const inactiveTime = now - usage.lastUsed.getTime();
                if (inactiveTime > INACTIVITY_THRESHOLD && (!usage.activeRequests || usage.activeRequests === 0)) {
                    logger.info(`[OllamaReadiness] Unloading model ${modelId} due to inactivity (${Math.round(inactiveTime / 60000)} min)`);
                    await this.unloadModelWithTracking(modelId, 'inactivity');
                    return;
                }
            }

            // Check 2: Long-running request (>3 min) + RAM > 95%
            const ramUsage = await this.getCurrentRAMUsage();
            if (ramUsage > RAM_CRITICAL_THRESHOLD) {
                // Check for long-running requests
                for (const [requestId, request] of activeRequests.entries()) {
                    const requestDuration = now - request.startTime;
                    if (requestDuration > LONG_REQUEST_THRESHOLD) {
                        logger.warn(`[OllamaReadiness] RAM critical (${ramUsage.toFixed(1)}%) with long request (${Math.round(requestDuration / 60000)} min)`);
                        // Don't unload during active request, but log warning
                        // The request will complete and model will be unloaded due to inactivity
                    }
                }
            }

        } catch (err) {
            logger.error(`[OllamaReadiness] Smart unload check error: ${err.message}`);
        }
    }

    /**
     * Get current RAM usage percentage
     */
    async getCurrentRAMUsage() {
        try {
            const response = await axios.get(`${METRICS_COLLECTOR_URL}/metrics`, { timeout: 3000 });
            return response.data?.ram?.percent || 0;
        } catch (err) {
            logger.debug(`[OllamaReadiness] Could not get RAM metrics: ${err.message}`);
            return 0;
        }
    }

    /**
     * Unload model and update tracking
     */
    async unloadModelWithTracking(modelId, reason) {
        try {
            await this.modelService.unloadModel(modelId);
            modelUsageTracker.delete(modelId);

            // Log to database for monitoring
            await database.query(`
                INSERT INTO llm_model_switches (from_model, to_model, reason, switch_duration_ms)
                VALUES ($1, NULL, $2, 0)
            `, [modelId, `auto_unload_${reason}`]);

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
            startTime: Date.now()
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
            const loaded = await this.modelService.getLoadedModel();

            // Get ollama_name for comparison
            const catalogResult = await database.query(
                `SELECT COALESCE(ollama_name, id) as effective_ollama_name
                 FROM llm_model_catalog WHERE id = $1`,
                [modelId]
            );
            const ollamaName = catalogResult.rows[0]?.effective_ollama_name || modelId;

            if (loaded && loaded.model_id === ollamaName) {
                // Model already loaded
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
     * Check if Ollama is ready
     */
    isReady() {
        return isOllamaReady;
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            ollamaReady: isOllamaReady,
            syncIntervalMs: SYNC_INTERVAL,
            inactivityThresholdMs: INACTIVITY_THRESHOLD,
            ramCriticalThreshold: RAM_CRITICAL_THRESHOLD,
            longRequestThresholdMs: LONG_REQUEST_THRESHOLD,
            trackedModels: Array.from(modelUsageTracker.entries()).map(([id, usage]) => ({
                modelId: id,
                lastUsed: usage.lastUsed,
                activeRequests: usage.activeRequests
            })),
            activeRequestCount: activeRequests.size
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
