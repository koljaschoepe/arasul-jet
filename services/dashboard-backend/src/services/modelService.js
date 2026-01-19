/**
 * LLM Model Service
 * Manages model catalog, installation, activation, and smart queue batching
 * for Jetson AGX Orin with single-model-in-RAM constraint
 *
 * Supports Dependency Injection for testing:
 *   const { createModelService } = require('./modelService');
 *   const testService = createModelService({ database: mockDb, logger: mockLogger });
 */

// Service URLs - read from environment
const LLM_SERVICE_HOST = process.env.LLM_SERVICE_HOST || 'llm-service';
const LLM_SERVICE_PORT = process.env.LLM_SERVICE_PORT || '11434';
const LLM_MANAGEMENT_PORT = process.env.LLM_SERVICE_MANAGEMENT_PORT || '11436';

const LLM_SERVICE_URL = `http://${LLM_SERVICE_HOST}:${LLM_SERVICE_PORT}`;
const LLM_MANAGEMENT_URL = `http://${LLM_SERVICE_HOST}:${LLM_MANAGEMENT_PORT}`;

// Configuration
const DEFAULT_KEEP_ALIVE = parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300');
const MODEL_SWITCH_COOLDOWN = parseInt(process.env.MODEL_SWITCH_COOLDOWN_SECONDS || '5') * 1000;

/**
 * Factory function to create ModelService with injected dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.database - Database module (default: require('../database'))
 * @param {Object} deps.logger - Logger module (default: require('../utils/logger'))
 * @param {Object} deps.axios - Axios instance (default: require('axios'))
 * @returns {ModelService} Service instance
 */
function createModelService(deps = {}) {
    const {
        database = require('../database'),
        logger = require('../utils/logger'),
        axios = require('axios')
    } = deps;

    // In-memory state (per-instance for testability)
    let lastSwitchTime = 0;
    let switchInProgress = false;

    class ModelService {
        /**
         * Get curated model catalog with installation status
         */
        async getCatalog() {
            const result = await database.query(`
                SELECT
                    c.*,
                    i.status as install_status,
                    i.download_progress,
                    i.is_default,
                    i.last_used_at,
                    i.usage_count,
                    i.downloaded_at,
                    i.error_message as install_error
                FROM llm_model_catalog c
                LEFT JOIN llm_installed_models i ON c.id = i.id
                ORDER BY c.performance_tier ASC, c.ram_required_gb ASC
            `);
            return result.rows;
        }

        /**
         * Get installed models only
         */
        async getInstalledModels() {
            const result = await database.query(`
                SELECT
                    i.*,
                    c.name,
                    c.description,
                    c.ram_required_gb,
                    c.category,
                    c.capabilities,
                    c.recommended_for,
                    c.performance_tier
                FROM llm_installed_models i
                JOIN llm_model_catalog c ON i.id = c.id
                WHERE i.status = 'available'
                ORDER BY i.is_default DESC, i.last_used_at DESC NULLS LAST
            `);
            return result.rows;
        }

        /**
         * Get currently loaded model from Ollama
         */
        async getLoadedModel() {
            try {
                const response = await axios.get(`${LLM_SERVICE_URL}/api/ps`, { timeout: 5000 });
                const models = response.data.models || [];

                if (models.length === 0) {
                    return null;
                }

                const loadedModel = models[0];
                return {
                    model_id: loadedModel.name,
                    ram_usage_mb: Math.round((loadedModel.size_vram || loadedModel.size || 0) / 1024 / 1024),
                    expires_at: loadedModel.expires_at,
                    loaded_at: new Date().toISOString()
                };
            } catch (err) {
                logger.error(`Error getting loaded model: ${err.message}`);
                return null;
            }
        }

        /**
         * Download a model with progress callback
         * @param {string} modelId - Model ID to download
         * @param {function} progressCallback - Callback for progress updates (progress, status)
         */
        async downloadModel(modelId, progressCallback = null) {
            // Verify model is in catalog
            const catalogResult = await database.query(
                'SELECT * FROM llm_model_catalog WHERE id = $1',
                [modelId]
            );
            if (catalogResult.rows.length === 0) {
                throw new Error(`Model ${modelId} not found in catalog`);
            }

            // Create or update installed model record
            await database.query(`
                INSERT INTO llm_installed_models (id, status, download_progress)
                VALUES ($1, 'downloading', 0)
                ON CONFLICT (id) DO UPDATE SET
                    status = 'downloading',
                    download_progress = 0,
                    error_message = NULL
            `, [modelId]);

            logger.info(`Starting download of model ${modelId}`);

            try {
                // Start pull with streaming
                const response = await axios({
                    method: 'post',
                    url: `${LLM_SERVICE_URL}/api/pull`,
                    data: { name: modelId, stream: true },
                    responseType: 'stream',
                    timeout: 3600000 // 1 hour for large models
                });

                return new Promise((resolve, reject) => {
                    let lastProgress = 0;
                    let buffer = '';

                    response.data.on('data', async (chunk) => {
                        buffer += chunk.toString();
                        const lines = buffer.split('\n');
                        buffer = lines.pop(); // Keep incomplete line in buffer

                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try {
                                const data = JSON.parse(line);

                                // Calculate progress
                                if (data.total && data.completed) {
                                    const progress = Math.round((data.completed / data.total) * 100);
                                    if (progress !== lastProgress) {
                                        lastProgress = progress;
                                        await database.query(
                                            'UPDATE llm_installed_models SET download_progress = $1 WHERE id = $2',
                                            [progress, modelId]
                                        );
                                        if (progressCallback) {
                                            progressCallback(progress, data.status || 'downloading');
                                        }
                                    }
                                }

                                // Handle status updates
                                if (data.status) {
                                    logger.debug(`Model ${modelId} download status: ${data.status}`);
                                    if (progressCallback) {
                                        progressCallback(lastProgress, data.status);
                                    }
                                }

                                // Download completed
                                if (data.status === 'success' || (data.status && data.status.includes('success'))) {
                                    await database.query(`
                                        UPDATE llm_installed_models
                                        SET status = 'available',
                                            download_progress = 100,
                                            downloaded_at = NOW(),
                                            error_message = NULL
                                        WHERE id = $1
                                    `, [modelId]);
                                    logger.info(`Model ${modelId} downloaded successfully`);
                                }
                            } catch (parseError) {
                                // Ignore JSON parse errors for partial lines
                            }
                        }
                    });

                    response.data.on('end', async () => {
                        // Ensure final state is set
                        const finalResult = await database.query(
                            'SELECT status FROM llm_installed_models WHERE id = $1',
                            [modelId]
                        );
                        if (finalResult.rows.length > 0 && finalResult.rows[0].status === 'downloading') {
                            // If still downloading, set to available (download completed without explicit success message)
                            await database.query(`
                                UPDATE llm_installed_models
                                SET status = 'available', download_progress = 100, downloaded_at = NOW()
                                WHERE id = $1
                            `, [modelId]);
                        }
                        resolve({ success: true, modelId });
                    });

                    response.data.on('error', async (err) => {
                        logger.error(`Model ${modelId} download error: ${err.message}`);
                        await database.query(
                            'UPDATE llm_installed_models SET status = $1, error_message = $2 WHERE id = $3',
                            ['error', err.message, modelId]
                        );
                        reject(err);
                    });
                });

            } catch (err) {
                logger.error(`Model ${modelId} download failed: ${err.message}`);
                await database.query(
                    'UPDATE llm_installed_models SET status = $1, error_message = $2 WHERE id = $3',
                    ['error', err.message, modelId]
                );
                throw err;
            }
        }

        /**
         * Delete a model
         */
        async deleteModel(modelId) {
            // Check if it's the currently loaded model
            const loaded = await this.getLoadedModel();
            if (loaded && loaded.model_id === modelId) {
                // Unload first
                await this.unloadModel(modelId);
            }

            try {
                // Delete from Ollama
                await axios.delete(`${LLM_SERVICE_URL}/api/delete`, {
                    data: { name: modelId },
                    timeout: 30000
                });
            } catch (err) {
                // Ignore if model doesn't exist in Ollama
                if (!err.message.includes('not found')) {
                    logger.warn(`Error deleting model from Ollama: ${err.message}`);
                }
            }

            // Remove from installed models
            await database.query('DELETE FROM llm_installed_models WHERE id = $1', [modelId]);

            logger.info(`Model ${modelId} deleted`);
            return { success: true, modelId };
        }

        /**
         * Set default model (used for new chats when no model specified)
         */
        async setDefaultModel(modelId) {
            await database.transaction(async (client) => {
                // Clear existing default
                await client.query('UPDATE llm_installed_models SET is_default = false WHERE is_default = true');
                // Set new default
                await client.query(
                    'UPDATE llm_installed_models SET is_default = true WHERE id = $1',
                    [modelId]
                );
            });
            logger.info(`Default model set to ${modelId}`);
            return { success: true, defaultModel: modelId };
        }

        /**
         * Get default model ID
         */
        async getDefaultModel() {
            const result = await database.query(
                'SELECT id FROM llm_installed_models WHERE is_default = true LIMIT 1'
            );
            if (result.rows.length > 0) {
                return result.rows[0].id;
            }
            // Fallback to env variable
            return process.env.LLM_MODEL || 'qwen3:14b-q8';
        }

        /**
         * Activate/Load a model into RAM
         * @param {string} modelId - Model to load
         * @param {string} triggeredBy - Who triggered the switch ('user', 'queue', 'workflow')
         */
        async activateModel(modelId, triggeredBy = 'user') {
            // Cooldown check
            const now = Date.now();
            if (now - lastSwitchTime < MODEL_SWITCH_COOLDOWN) {
                const waitTime = MODEL_SWITCH_COOLDOWN - (now - lastSwitchTime);
                logger.debug(`Model switch cooldown active, waiting ${waitTime}ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            // Prevent concurrent switches
            if (switchInProgress) {
                logger.warn('Model switch already in progress, waiting...');
                while (switchInProgress) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            switchInProgress = true;
            const startTime = Date.now();

            try {
                // Get currently loaded model
                const currentLoaded = await this.getLoadedModel();
                const fromModel = currentLoaded?.model_id;

                // If same model is already loaded, just return
                if (fromModel === modelId) {
                    logger.debug(`Model ${modelId} already loaded`);
                    return { success: true, alreadyLoaded: true, model: modelId };
                }

                logger.info(`Switching model: ${fromModel || 'none'} -> ${modelId}`);

                // Unload current model if different
                if (fromModel) {
                    await this.unloadModel(fromModel);
                }

                // Load new model by making a minimal request
                // This triggers Ollama to load the model into RAM
                // Large models (30-70B) can take 10+ minutes on Jetson AGX Orin
                logger.info(`Loading model ${modelId} into RAM (this may take several minutes)...`);
                await axios.post(`${LLM_SERVICE_URL}/api/generate`, {
                    model: modelId,
                    prompt: 'hello',
                    stream: false,
                    keep_alive: DEFAULT_KEEP_ALIVE,
                    options: {
                        num_predict: 1 // Minimal generation
                    }
                }, {
                    timeout: 900000 // 15 min timeout for loading very large models (70B+)
                });

                const switchDuration = Date.now() - startTime;
                lastSwitchTime = Date.now();

                // Record the switch in database
                await database.query(`
                    SELECT record_model_switch($1, $2, $3, $4, $5)
                `, [fromModel, modelId, switchDuration, triggeredBy, 'activated']);

                // Update last used
                await database.query(
                    'UPDATE llm_installed_models SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1',
                    [modelId]
                );

                logger.info(`Model ${modelId} activated in ${switchDuration}ms`);
                return {
                    success: true,
                    switchDuration,
                    fromModel,
                    toModel: modelId
                };

            } finally {
                switchInProgress = false;
            }
        }

        /**
         * Unload a model from RAM
         */
        async unloadModel(modelId) {
            try {
                await axios.post(`${LLM_SERVICE_URL}/api/generate`, {
                    model: modelId,
                    prompt: '',
                    stream: false,
                    keep_alive: 0 // 0 = unload immediately
                }, { timeout: 10000 });

                logger.info(`Model ${modelId} unloaded`);
                return { success: true };
            } catch (err) {
                logger.warn(`Error unloading model ${modelId}: ${err.message}`);
                return { success: false, error: err.message };
            }
        }

        /**
         * Get model status summary (for dashboard)
         */
        async getStatus() {
            const [loaded, installedResult, queueByModelResult, switchStatsResult] = await Promise.all([
                this.getLoadedModel(),
                database.query('SELECT COUNT(*) as count FROM llm_installed_models WHERE status = $1', ['available']),
                database.query('SELECT * FROM get_queue_status_by_model()'),
                database.query(`
                    SELECT
                        COUNT(*) as total_switches,
                        AVG(switch_duration_ms)::INTEGER as avg_switch_ms,
                        MAX(switched_at) as last_switch
                    FROM llm_model_switches
                    WHERE switched_at > NOW() - INTERVAL '1 hour'
                `)
            ]);

            return {
                loaded_model: loaded,
                installed_count: parseInt(installedResult.rows[0].count),
                queue_by_model: queueByModelResult.rows,
                switch_stats: switchStatsResult.rows[0] || {},
                switch_in_progress: switchInProgress,
                timestamp: new Date().toISOString()
            };
        }

        /**
         * Get the next job using smart model batching
         * @param {string} currentModel - Currently loaded model
         * @returns {Object} Next job with switch information
         */
        async getNextBatchedJob(currentModel) {
            const result = await database.query(
                'SELECT * FROM get_next_batched_job($1)',
                [currentModel]
            );

            if (result.rows.length === 0 || !result.rows[0].job_id) {
                return null;
            }

            return result.rows[0];
        }

        /**
         * Check if model is installed
         */
        async isModelInstalled(modelId) {
            const result = await database.query(
                'SELECT id FROM llm_installed_models WHERE id = $1 AND status = $2',
                [modelId, 'available']
            );
            return result.rows.length > 0;
        }

        /**
         * Sync installed models with Ollama
         * Updates database based on what's actually in Ollama
         */
        async syncWithOllama() {
            try {
                const response = await axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 10000 });
                const ollamaModels = (response.data.models || []).map(m => m.name);

                logger.debug(`Ollama has ${ollamaModels.length} models installed`);

                // For each Ollama model, ensure it's in installed_models if it's in catalog
                for (const modelId of ollamaModels) {
                    const catalogResult = await database.query(
                        'SELECT id FROM llm_model_catalog WHERE id = $1',
                        [modelId]
                    );

                    if (catalogResult.rows.length > 0) {
                        await database.query(`
                            INSERT INTO llm_installed_models (id, status, download_progress, downloaded_at)
                            VALUES ($1, 'available', 100, NOW())
                            ON CONFLICT (id) DO UPDATE SET
                                status = 'available',
                                download_progress = 100
                            WHERE llm_installed_models.status != 'available'
                        `, [modelId]);
                    }
                }

                // Mark models as error if they're not in Ollama but marked as available
                await database.query(`
                    UPDATE llm_installed_models
                    SET status = 'error', error_message = 'Model not found in Ollama'
                    WHERE status = 'available'
                    AND id NOT IN (SELECT unnest($1::text[]))
                `, [ollamaModels]);

                return { success: true, ollamaModels };
            } catch (err) {
                logger.error(`Error syncing with Ollama: ${err.message}`);
                return { success: false, error: err.message };
            }
        }

        /**
         * Get model info from catalog
         */
        async getModelInfo(modelId) {
            const result = await database.query(`
                SELECT
                    c.*,
                    i.status as install_status,
                    i.download_progress,
                    i.is_default,
                    i.last_used_at,
                    i.usage_count
                FROM llm_model_catalog c
                LEFT JOIN llm_installed_models i ON c.id = i.id
                WHERE c.id = $1
            `, [modelId]);

            return result.rows[0] || null;
        }

        /**
         * Resolve model ID for a request
         * Returns explicit model, or default if not specified
         */
        async resolveModel(requestedModel) {
            if (requestedModel) {
                return requestedModel;
            }
            return await this.getDefaultModel();
        }

        /**
         * Reset internal state for testing
         * Only available in test environment
         */
        _resetForTesting() {
            if (process.env.NODE_ENV !== 'test') {
                throw new Error('_resetForTesting is only available in test environment');
            }
            lastSwitchTime = 0;
            switchInProgress = false;
        }

        /**
         * Get switch state for testing
         */
        _getSwitchState() {
            return { lastSwitchTime, switchInProgress };
        }
    }

    return new ModelService();
}

// Create default singleton instance with real dependencies
const defaultInstance = createModelService();

// Export singleton for production use, factory for testing
module.exports = defaultInstance;
module.exports.createModelService = createModelService;
