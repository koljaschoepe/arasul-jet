/**
 * LLM Model Service
 * Manages model catalog, installation, activation, and smart queue batching
 * for Jetson AGX Orin with multi-model memory budget
 *
 * Supports Dependency Injection for testing:
 *   const { createModelService } = require('./modelService');
 *   const testService = createModelService({ database: mockDb, logger: mockLogger });
 */

const services = require('../../config/services');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const execFileAsync = promisify(execFile);
const readFileAsync = promisify(fs.readFile);

// Service URLs (from centralized config)
const LLM_SERVICE_HOST = services.llm.host;
const LLM_SERVICE_PORT = services.llm.port;
const LLM_MANAGEMENT_PORT = services.llm.managementPort;

const LLM_SERVICE_URL = services.llm.url;
const LLM_MANAGEMENT_URL = services.llm.managementUrl;

// Configuration
const DEFAULT_KEEP_ALIVE = parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300');
const MODEL_SWITCH_COOLDOWN = parseInt(process.env.MODEL_SWITCH_COOLDOWN_SECONDS || '5') * 1000;

/**
 * Factory function to create ModelService with injected dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.database - Database module (default: require('../../database'))
 * @param {Object} deps.logger - Logger module (default: require('../../utils/logger'))
 * @param {Object} deps.axios - Axios instance (default: require('axios'))
 * @returns {ModelService} Service instance
 */
function createModelService(deps = {}) {
  const {
    database = require('../../database'),
    logger = require('../../utils/logger'),
    axios = require('axios'),
  } = deps;

  // In-memory state (per-instance for testability)
  let lastSwitchTime = 0;
  let switchLock = null; // Promise that resolves when current switch completes

  // Track model IDs with an active download in this process.
  // _cleanupStaleDownloads checks this set to avoid killing in-progress pulls.
  const activeDownloadIds = new Set();

  // Model availability cache (TTL-based)
  const MODEL_AVAILABILITY_TTL = 15 * 1000; // 15 seconds (aligned with frontend polling interval)
  const modelAvailabilityCache = new Map(); // modelId -> { available, expiresAt }

  // ============================================================================
  // Internal helper functions (extracted from large methods for readability)
  // ============================================================================

  /**
   * Check available disk space vs model size before download
   * @param {Object} service - ModelService instance (for getDiskSpace/formatBytes)
   * @param {number} modelSizeBytes - Size of the model in bytes
   */
  async function _validateDiskSpace(service, modelSizeBytes) {
    if (modelSizeBytes <= 0) {
      return;
    }
    const diskSpace = await service.getDiskSpace();
    const requiredSpace = Math.floor(modelSizeBytes * 1.5); // 50% buffer for extraction/temp files

    if (diskSpace.free < requiredSpace) {
      const errorMsg =
        `Nicht genügend Speicherplatz für Download. ` +
        `Benötigt: ${service.formatBytes(requiredSpace)}, ` +
        `Verfügbar: ${service.formatBytes(diskSpace.free)}. ` +
        `Bitte Speicherplatz freigeben oder ein kleineres Modell wählen.`;
      logger.error(`[DOWNLOAD] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    logger.info(
      `[DOWNLOAD] Disk space check passed: ${service.formatBytes(diskSpace.free)} available, ${service.formatBytes(requiredSpace)} required`
    );
  }

  /**
   * Stream model download from Ollama and handle progress/completion events
   * @param {string} modelId - Catalog model ID
   * @param {string} ollamaName - Ollama model name
   * @param {Object} response - Axios streaming response
   * @param {function|null} progressCallback - Optional progress callback
   * @returns {Promise<{success: boolean, modelId: string}>}
   */
  function _streamModelDownload(modelId, ollamaName, response, progressCallback) {
    return new Promise((resolve, reject) => {
      let lastProgress = 0;
      let buffer = '';
      let lastActivityTime = Date.now();
      const STALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes without progress = stalled

      // Stall detection: check every 60s if progress has stalled
      const stallCheckInterval = setInterval(async () => {
        if (Date.now() - lastActivityTime > STALL_TIMEOUT_MS) {
          clearInterval(stallCheckInterval);
          logger.error(`[DOWNLOAD] Model ${modelId} download stalled (no progress for 5min)`);
          response.data.destroy();
          await database.query(
            'UPDATE llm_installed_models SET status = $1, error_message = $2 WHERE id = $3',
            ['error', 'Download stagniert - bitte erneut versuchen', modelId]
          );
          reject(new Error('Download stagniert (keine Aktivität seit 5 Minuten)'));
        }
      }, 60000);

      response.data.on('data', async chunk => {
        lastActivityTime = Date.now();
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          try {
            const data = JSON.parse(line);
            let progress = lastProgress;

            // Handle Ollama error responses (e.g. version mismatch, model not found)
            if (data.error) {
              const errorMsg = data.error.includes('newer version')
                ? 'Ollama-Version zu alt für dieses Modell. Bitte Ollama aktualisieren.'
                : data.error.includes('not found')
                  ? `Modell "${ollamaName}" nicht in Ollama Registry gefunden.`
                  : data.error;
              logger.error(`[DOWNLOAD] Ollama error for ${modelId}: ${data.error}`);
              await database.query(
                `UPDATE llm_installed_models SET status = 'error', error_message = $1 WHERE id = $2`,
                [errorMsg, modelId]
              );
              if (progressCallback) {
                progressCallback(0, errorMsg);
              }
              clearInterval(stallCheckInterval);
              reject(new Error(errorMsg));
              return;
            }

            // Improved progress calculation based on status
            if (data.status) {
              const statusLower = data.status.toLowerCase();

              if (statusLower.includes('pulling manifest')) {
                // Manifest phase: 1%
                progress = 1;
              } else if (data.total && data.completed) {
                // Download phase: 2% to 95%
                progress = 2 + Math.round((data.completed / data.total) * 93);
              } else if (statusLower.includes('verifying')) {
                // Verifying phase: 96%
                progress = 96;
              } else if (statusLower.includes('writing')) {
                // Writing phase: 98%
                progress = 98;
              } else if (statusLower.includes('success')) {
                // Success: 100%
                progress = 100;
              }

              logger.debug(`Model ${modelId} download status: ${data.status} (${progress}%)`);
            }

            // Update progress if changed
            if (progress !== lastProgress) {
              lastProgress = progress;
              await _updateDownloadProgress(
                modelId,
                progress,
                data.status || 'downloading',
                progressCallback
              );
            }

            // Download completed
            if (data.status === 'success' || (data.status && data.status.includes('success'))) {
              await database.query(
                `
                  UPDATE llm_installed_models
                  SET status = 'available',
                      download_progress = 100,
                      downloaded_at = NOW(),
                      error_message = NULL
                  WHERE id = $1
                `,
                [modelId]
              );
              logger.info(`Model ${modelId} downloaded successfully`);
              modelAvailabilityCache.delete(modelId);

              // Auto-set as default if no default exists yet (atomic)
              await database.transaction(async client => {
                const hasDefault = await client.query(
                  'SELECT id FROM llm_installed_models WHERE is_default = true FOR UPDATE'
                );
                if (hasDefault.rows.length === 0) {
                  await client.query(
                    'UPDATE llm_installed_models SET is_default = true WHERE id = $1',
                    [modelId]
                  );
                  logger.info(`Auto-set ${modelId} as default model (first model downloaded)`);
                }
              });
            }
          } catch (parseError) {
            // Ignore JSON parse errors for partial lines
          }
        }
      });

      response.data.on('end', async () => {
        clearInterval(stallCheckInterval);
        // Ensure final state is set
        const finalResult = await database.query(
          'SELECT status FROM llm_installed_models WHERE id = $1',
          [modelId]
        );
        if (finalResult.rows.length > 0 && finalResult.rows[0].status === 'downloading') {
          // P2-002: Verify model is actually available in Ollama before marking as available
          const verified = await _verifyDownloadComplete(modelId, ollamaName);
          if (!verified) {
            reject(new Error('Model verification failed - model not found in Ollama'));
            return;
          }

          // Mark as available
          await database.query(
            `
              UPDATE llm_installed_models
              SET status = 'available', download_progress = 100, downloaded_at = NOW()
              WHERE id = $1
            `,
            [modelId]
          );
          modelAvailabilityCache.delete(modelId);

          // Auto-set as default if no default exists yet (atomic)
          await database.transaction(async client => {
            const hasDefault = await client.query(
              'SELECT id FROM llm_installed_models WHERE is_default = true FOR UPDATE'
            );
            if (hasDefault.rows.length === 0) {
              await client.query(
                'UPDATE llm_installed_models SET is_default = true WHERE id = $1',
                [modelId]
              );
              logger.info(`Auto-set ${modelId} as default model (first model downloaded)`);
            }
          });
        }
        resolve({ success: true, modelId });
      });

      response.data.on('error', async err => {
        clearInterval(stallCheckInterval);
        logger.error(`Model ${modelId} download error: ${err.message}`);
        await database.query(
          'UPDATE llm_installed_models SET status = $1, error_message = $2 WHERE id = $3',
          ['error', err.message, modelId]
        );
        reject(err);
      });
    });
  }

  /**
   * Update download progress in DB and notify callback
   * @param {string} modelId - Model ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} status - Status string from Ollama
   * @param {function|null} progressCallback - Optional callback
   */
  async function _updateDownloadProgress(modelId, progress, status, progressCallback) {
    await database.query('UPDATE llm_installed_models SET download_progress = $1 WHERE id = $2', [
      progress,
      modelId,
    ]);
    if (progressCallback) {
      progressCallback(progress, status);
    }
  }

  /**
   * Verify that a model is actually available in Ollama after download
   * Returns true if verified (or verification was skipped), false if model is missing
   * @param {string} modelId - Catalog model ID
   * @param {string} ollamaName - Ollama model name
   * @returns {Promise<boolean>}
   */
  async function _verifyDownloadComplete(modelId, ollamaName) {
    logger.info(`[DOWNLOAD] Verifying model ${modelId} (Ollama: ${ollamaName}) after download...`);

    try {
      const tagsResponse = await axios.get(`${LLM_SERVICE_URL}/api/tags`, {
        timeout: 10000,
      });
      const ollamaModels = (tagsResponse.data.models || []).map(m => m.name);

      if (!ollamaModels.includes(ollamaName)) {
        logger.error(`[DOWNLOAD] Model ${modelId} not found in Ollama after download!`);
        await database.query(
          `UPDATE llm_installed_models
           SET status = 'error', error_message = $1
           WHERE id = $2`,
          [
            'Download abgeschlossen, aber Modell nicht in Ollama verfügbar. Bitte erneut herunterladen.',
            modelId,
          ]
        );
        return false;
      }

      logger.info(`[DOWNLOAD] Model ${modelId} verified successfully in Ollama`);
      return true;
    } catch (verifyError) {
      logger.warn(
        `[DOWNLOAD] Could not verify model ${modelId}: ${verifyError.message}, will retry on next sync`
      );
      // Mark as available (download succeeded) but let next sync verify
      // This is safer than failing the download when Ollama is temporarily busy
      return true;
    }
  }

  /**
   * Check if enough VRAM/RAM is available to load a model
   * @param {Object} service - ModelService instance (for getGpuMemory/getLoadedModel)
   * @param {string} modelId - Catalog model ID
   * @param {number} requiredRamGb - Required RAM in GB
   */
  async function _checkMemoryRequirements(service, modelId, requiredRamGb) {
    if (requiredRamGb <= 0) {
      return;
    }

    // Static check: does model fit in configured LLM RAM allocation?
    // Fallback: if RAM_LIMIT_LLM is not set, detect total system memory and use 80%
    const envLimit = process.env.RAM_LIMIT_LLM;
    let llmRamGB;
    if (envLimit) {
      llmRamGB = parseInt(envLimit, 10);
    } else {
      const os = require('os');
      llmRamGB = Math.floor((os.totalmem() / 1024 ** 3) * 0.8);
      logger.debug(`[ACTIVATE] RAM_LIMIT_LLM not set — using ${llmRamGB}GB (80% of system RAM)`);
    }
    if (!isNaN(llmRamGB) && llmRamGB > 0 && requiredRamGb > llmRamGB) {
      const errorMsg =
        `Modell "${modelId}" benötigt ${requiredRamGb}GB RAM, ` +
        `aber nur ${llmRamGB}GB sind für LLM zugewiesen` +
        `${envLimit ? ' (RAM_LIMIT_LLM)' : ' (auto-detected)'}. ` +
        `Bitte ein kleineres Modell wählen.`;
      logger.error(`[ACTIVATE] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Multi-model budget check: use getMemoryBudget() for available space
    const budget = await service.getMemoryBudget();
    const requiredRamMb = requiredRamGb * 1024;

    if (budget.availableMb < requiredRamMb) {
      // Try LRU eviction: find least recently used loaded model
      const ollamaReadiness = require('./ollamaReadiness');
      const tracker = ollamaReadiness.getModelUsageTracker();
      const evictable = budget.loadedModels
        .filter(m => {
          const usage = tracker.get(m.ollamaName);
          return !usage?.activeRequests || usage.activeRequests === 0;
        })
        .sort((a, b) => {
          const usageA = tracker.get(a.ollamaName);
          const usageB = tracker.get(b.ollamaName);
          const timeA = usageA?.lastUsed?.getTime() || 0;
          const timeB = usageB?.lastUsed?.getTime() || 0;
          return timeA - timeB; // oldest first
        });

      // Evict LRU models until enough space or no more evictable
      let freedMb = 0;
      for (const model of evictable) {
        if (budget.availableMb + freedMb >= requiredRamMb) {
          break;
        }
        logger.info(
          `[ACTIVATE] Evicting LRU model ${model.ollamaName} (${model.ramMb}MB) to make room`
        );
        await service.unloadModel(model.ollamaName);
        tracker.delete(model.ollamaName);
        freedMb += model.ramMb;
      }

      if (budget.availableMb + freedMb < requiredRamMb) {
        const errorMsg =
          `Nicht genügend Speicher für Modell "${modelId}". ` +
          `Benötigt: ${requiredRamGb}GB, ` +
          `Verfügbar: ${((budget.availableMb + freedMb) / 1024).toFixed(1)}GB. ` +
          `Bitte erst ein geladenes Modell entladen.`;
        logger.error(`[ACTIVATE] ${errorMsg}`);
        throw new Error(errorMsg);
      }
    }

    logger.info(
      `[ACTIVATE] Memory budget check passed: ${(budget.availableMb / 1024).toFixed(1)}GB available, ${requiredRamGb}GB required`
    );
  }

  /**
   * Actually load the model in Ollama by sending a minimal generate request
   * @param {Object} service - ModelService instance (for unloadModel)
   * @param {string} modelId - Catalog model ID
   * @param {string} ollamaName - Ollama model name
   * @param {string|null} fromModel - Currently loaded model's Ollama name (or null)
   */
  async function _executeModelSwitch(service, modelId, ollamaName, fromModel) {
    logger.info(`Loading model: ${modelId} (Ollama: ${ollamaName})`);

    // Multi-model: do NOT automatically unload other models.
    // Memory budget check + LRU eviction in _checkMemoryRequirements handles this.

    // Get dynamic keep-alive from lifecycle service
    const modelLifecycleService = require('./modelLifecycleService');
    const { keepAliveSeconds } = await modelLifecycleService.getCurrentKeepAlive();

    // Load model by making a minimal request using ollamaName
    // This triggers Ollama to load the model into RAM
    // Large models (30-70B) can take 10+ minutes on Jetson AGX Orin
    logger.info(
      `Loading model ${modelId} (Ollama: ${ollamaName}) into RAM (keep_alive: ${keepAliveSeconds}s)...`
    );
    await axios.post(
      `${LLM_SERVICE_URL}/api/generate`,
      {
        model: ollamaName,
        prompt: 'hello',
        stream: false,
        keep_alive: keepAliveSeconds,
        options: {
          num_predict: 1, // Minimal generation
        },
      },
      {
        timeout: 900000, // 15 min timeout for loading very large models (70B+)
      }
    );
  }

  /**
   * Record the model switch in database and update usage stats
   * @param {string} modelId - New model ID
   * @param {string|null} fromModel - Previous model's Ollama name
   * @param {number} switchDuration - Duration of switch in ms
   * @param {string} triggeredBy - Who triggered the switch
   */
  async function _recordModelSwitch(modelId, fromModel, switchDuration, triggeredBy) {
    // Record the switch in database
    await database.query(
      `
        SELECT record_model_switch($1, $2, $3, $4, $5)
      `,
      [fromModel, modelId, switchDuration, triggeredBy, 'activated']
    );

    // Update last used
    await database.query(
      'UPDATE llm_installed_models SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1',
      [modelId]
    );
  }

  /**
   * Mark models as available that Ollama has (sync step 1)
   * @param {string[]} ollamaModels - List of model names from Ollama
   */
  async function _markAvailableModels(ollamaModels) {
    for (const ollamaModelName of ollamaModels) {
      const catalogResult = await database.query(
        `SELECT id FROM llm_model_catalog
         WHERE ollama_name = $1 OR id = $1`,
        [ollamaModelName]
      );

      if (catalogResult.rows.length > 0) {
        const catalogId = catalogResult.rows[0].id;
        const result = await database.query(
          `
            INSERT INTO llm_installed_models (id, status, download_progress, downloaded_at)
            VALUES ($1, 'available', 100, NOW())
            ON CONFLICT (id) DO UPDATE SET
                status = 'available',
                download_progress = 100,
                error_message = NULL
            WHERE llm_installed_models.status != 'available'
               OR llm_installed_models.download_progress != 100
               OR llm_installed_models.error_message IS NOT NULL
          `,
          [catalogId]
        );
        if (result.rowCount > 0) {
          logger.debug(`[SYNC] Model ${catalogId} marked as available`);
        }
      }
    }
  }

  /**
   * Mark models as error if they're listed as available in DB but missing from Ollama (sync step 2)
   * @param {string[]} ollamaModels - List of model names from Ollama
   */
  async function _markMissingModels(ollamaModels) {
    const catalogWithOllama = await database.query(`
      SELECT c.id, COALESCE(c.ollama_name, c.id) as effective_ollama_name
      FROM llm_model_catalog c
      JOIN llm_installed_models i ON c.id = i.id
      WHERE i.status = 'available'
    `);

    // Check both effective_ollama_name AND catalog id against Ollama models
    // This handles locally imported models (id matches) vs registry-pulled models (ollama_name matches)
    const missingIds = catalogWithOllama.rows
      .filter(
        row => !ollamaModels.includes(row.effective_ollama_name) && !ollamaModels.includes(row.id)
      )
      .map(row => row.id);

    if (missingIds.length > 0) {
      logger.warn(`[SYNC] Models missing from Ollama: ${missingIds.join(', ')}`);
      await database.query(
        `
          UPDATE llm_installed_models
          SET status = 'error',
              error_message = 'Modell nicht in Ollama gefunden - bitte erneut herunterladen'
          WHERE status = 'available'
          AND id = ANY($1::text[])
        `,
        [missingIds]
      );
    }
  }

  /**
   * Clean up downloads that got stuck - mark as available if in Ollama, error otherwise (sync step 3)
   * @param {string[]} ollamaModels - List of model names from Ollama
   * @returns {Promise<number>} Number of stale downloads cleaned up
   */
  async function _cleanupStaleDownloads(ollamaModels) {
    // DL-004: Only mark as stale if the model is NOT present in Ollama
    // (it may have finished downloading but the status wasn't updated).
    // Also check if the model IS in Ollama - if so, mark as available instead.
    const downloadingResult = await database.query(`
      SELECT i.id, COALESCE(c.ollama_name, c.id) as effective_ollama_name
      FROM llm_installed_models i
      LEFT JOIN llm_model_catalog c ON c.id = i.id
      WHERE i.status = 'downloading'
    `);

    let staleCount = 0;
    for (const row of downloadingResult.rows) {
      // Skip models with an active download in this process
      if (activeDownloadIds.has(row.id)) {
        logger.debug(`[SYNC] Skipping ${row.id} — active download in progress`);
        continue;
      }

      if (ollamaModels.includes(row.effective_ollama_name) || ollamaModels.includes(row.id)) {
        // Model is actually in Ollama - mark as available
        await database.query(
          `
            UPDATE llm_installed_models
            SET status = 'available', download_progress = 100, downloaded_at = NOW(), error_message = NULL
            WHERE id = $1
          `,
          [row.id]
        );
        logger.info(
          `[SYNC] Model ${row.id} was downloading but already in Ollama - marked available`
        );
      } else {
        // Model not in Ollama and stuck downloading - mark as error
        await database.query(
          `
            UPDATE llm_installed_models
            SET status = 'error',
                error_message = 'Download abgebrochen - bitte erneut versuchen'
            WHERE id = $1 AND status = 'downloading'
          `,
          [row.id]
        );
        staleCount++;
      }
    }
    const staleResult = { rows: downloadingResult.rows.slice(0, staleCount) };

    if (staleResult.rows.length > 0) {
      logger.warn(
        `[SYNC] Cleaned up ${staleResult.rows.length} stale downloads: ${staleResult.rows.map(r => r.id).join(', ')}`
      );
    }

    return staleResult.rows.length;
  }

  class ModelService {
    /**
     * Get curated model catalog with installation status
     */
    async getCatalog() {
      const result = await database.query(`
                SELECT
                    c.*,
                    COALESCE(c.ollama_name, c.id) as effective_ollama_name,
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
     * Get installed models only (LLMs + OCR with running status)
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
                    c.performance_tier,
                    c.model_type,
                    c.supports_thinking,
                    c.rag_optimized,
                    c.supports_vision_input,
                    COALESCE(c.ollama_name, c.id) as effective_ollama_name,
                    FALSE as is_running
                FROM llm_installed_models i
                JOIN llm_model_catalog c ON i.id = c.id
                WHERE i.status = 'available'
                ORDER BY i.is_default DESC, i.last_used_at DESC NULLS LAST
            `);

      // Also fetch OCR models with container running status
      const ocrResult = await database.query(`
                SELECT
                    c.id,
                    c.name,
                    c.description,
                    c.ram_required_gb,
                    c.category,
                    c.capabilities,
                    c.recommended_for,
                    c.performance_tier,
                    c.model_type,
                    c.size_bytes,
                    COALESCE(c.ollama_name, c.id) as effective_ollama_name,
                    'available' as status,
                    'available' as install_status,
                    COALESCE(a.status = 'running', FALSE) as is_running
                FROM llm_model_catalog c
                LEFT JOIN app_installations a ON a.app_id = SPLIT_PART(c.id, ':', 1)
                WHERE c.model_type = 'ocr'
                ORDER BY c.performance_tier ASC
            `);

      return [...result.rows, ...ocrResult.rows];
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
          loaded_at: new Date().toISOString(),
        };
      } catch (err) {
        logger.error(`Error getting loaded model: ${err.message}`);
        return null;
      }
    }

    /**
     * Get ALL currently loaded models from Ollama (multi-model support)
     * @returns {Array} Array of loaded model objects
     */
    async getLoadedModels() {
      try {
        const response = await axios.get(`${LLM_SERVICE_URL}/api/ps`, { timeout: 5000 });
        const models = response.data.models || [];

        return models.map(m => ({
          model_id: m.name,
          ram_usage_mb: Math.round((m.size_vram || m.size || 0) / 1024 / 1024),
          expires_at: m.expires_at,
        }));
      } catch (err) {
        logger.debug(`Error getting loaded models: ${err.message}`);
        return [];
      }
    }

    /**
     * Get memory budget status for loaded models.
     * Shows total budget, used, available, and per-model breakdown.
     */
    async getMemoryBudget() {
      const SAFETY_BUFFER_MB = parseInt(process.env.MODEL_MEMORY_SAFETY_BUFFER_MB || '2048');

      // Parse RAM_LIMIT_LLM (e.g. "32G" → 32768 MB)
      const envLimit = process.env.RAM_LIMIT_LLM || '32G';
      const limitMatch = envLimit.match(/^(\d+)([GM]?)$/i);
      let totalBudgetMb = 32768; // default 32G
      if (limitMatch) {
        const val = parseInt(limitMatch[1]);
        const unit = (limitMatch[2] || 'G').toUpperCase();
        totalBudgetMb = unit === 'G' ? val * 1024 : val;
      }

      const loadedModels = await this.getLoadedModels();
      const usedMb = loadedModels.reduce((sum, m) => sum + m.ram_usage_mb, 0);
      const availableMb = Math.max(0, totalBudgetMb - usedMb - SAFETY_BUFFER_MB);

      // Enrich with catalog info (name, id mapping)
      const enriched = [];
      for (const m of loadedModels) {
        let catalogId = m.model_id;
        let name = m.model_id;
        try {
          const result = await database.query(
            `SELECT c.id, c.name FROM llm_model_catalog c
             WHERE c.id = $1 OR COALESCE(c.ollama_name, c.id) = $1 LIMIT 1`,
            [m.model_id]
          );
          if (result.rows.length > 0) {
            catalogId = result.rows[0].id;
            name = result.rows[0].name;
          }
        } catch {
          /* use raw name */
        }

        enriched.push({
          id: catalogId,
          ollamaName: m.model_id,
          name,
          ramMb: m.ram_usage_mb,
          expiresAt: m.expires_at,
        });
      }

      return {
        totalBudgetMb,
        usedMb,
        availableMb,
        safetyBufferMb: SAFETY_BUFFER_MB,
        loadedModels: enriched,
        canLoadMore: availableMb > 0,
      };
    }

    /**
     * Evict least-recently-used models if MAX_STORED_MODELS limit is reached.
     * Deletes oldest unused models (by last_used_at) that are not the default model.
     * @param {string} excludeModelId - Model being installed (don't count it yet)
     */
    async evictModelsIfNeeded(excludeModelId) {
      const maxModels = parseInt(process.env.MAX_STORED_MODELS || '0');
      if (maxModels <= 0) {
        return;
      } // 0 = no limit

      const installedResult = await database.query(
        `SELECT i.id, i.last_used_at, i.is_default,
                COALESCE(c.ollama_name, c.id) as effective_ollama_name
         FROM llm_installed_models i
         JOIN llm_model_catalog c ON i.id = c.id
         WHERE i.status = 'available' AND i.id != $1
         ORDER BY i.is_default ASC, i.last_used_at ASC NULLS FIRST`,
        [excludeModelId]
      );

      const installed = installedResult.rows;
      // +1 because we're about to install a new model
      const modelsToRemove = installed.length + 1 - maxModels;

      if (modelsToRemove <= 0) {
        return;
      }

      // Remove oldest non-default models
      let removed = 0;
      for (const model of installed) {
        if (removed >= modelsToRemove) {
          break;
        }
        if (model.is_default) {
          continue;
        } // Never evict default model

        logger.info(
          `[LRU-EVICT] Removing model ${model.id} (last used: ${model.last_used_at || 'never'})`
        );
        try {
          await this.deleteModel(model.id);
          removed++;
        } catch (err) {
          logger.warn(`[LRU-EVICT] Failed to remove ${model.id}: ${err.message}`);
        }
      }

      if (removed > 0) {
        logger.info(`[LRU-EVICT] Removed ${removed} model(s) to stay within limit of ${maxModels}`);
      }
    }

    /**
     * Download a model with progress callback
     * @param {string} modelId - Model ID to download
     * @param {function} progressCallback - Callback for progress updates (progress, status)
     */
    async downloadModel(modelId, progressCallback = null, { signal } = {}) {
      // Verify model is in catalog and get ollama_name
      const catalogResult = await database.query(
        `SELECT *, COALESCE(ollama_name, id) as effective_ollama_name
                 FROM llm_model_catalog WHERE id = $1`,
        [modelId]
      );
      if (catalogResult.rows.length === 0) {
        throw new Error(`Model ${modelId} not found in catalog`);
      }

      const catalogModel = catalogResult.rows[0];

      // LRU eviction: remove oldest models if limit is reached
      await this.evictModelsIfNeeded(modelId);

      // Use effective_ollama_name for Ollama API calls
      const ollamaName = catalogModel.effective_ollama_name;

      // DL-002: Atomic claim — INSERT or UPDATE only if not already downloading
      // This eliminates the TOCTOU race between check and status set
      const claimResult = await database.query(
        `INSERT INTO llm_installed_models (id, status, download_progress)
         VALUES ($1, 'downloading', 0)
         ON CONFLICT (id) DO UPDATE SET
             status = 'downloading',
             download_progress = 0,
             error_message = NULL
         WHERE llm_installed_models.status <> 'downloading'
         RETURNING id`,
        [modelId]
      );

      if (claimResult.rows.length === 0) {
        logger.warn(`[DOWNLOAD] Model ${modelId} is already downloading, skipping`);
        throw new Error('Modell wird bereits heruntergeladen');
      }

      // Register as active AFTER successful claim so periodic sync can't mark it stale
      activeDownloadIds.add(modelId);

      logger.info(`Starting download of model ${modelId} (Ollama: ${ollamaName})`);

      const MAX_RETRIES = 3;
      const RETRY_CODES = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ESOCKETTIMEDOUT',
        'EPIPE',
        'EAI_AGAIN',
      ];

      try {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            // BH4: Validate disk space right before download to avoid TOCTOU race
            await _validateDiskSpace(this, catalogModel.size_bytes || 0);

            // BH4: Re-verify model isn't already downloading (another request may have started)
            const statusCheck = await database.query(
              'SELECT status FROM llm_installed_models WHERE id = $1',
              [modelId]
            );
            if (
              statusCheck.rows.length > 0 &&
              statusCheck.rows[0].status === 'downloading' &&
              attempt === 1
            ) {
              // On first attempt, we just set it to downloading above, so this is expected.
              // On retries, we should not hit this because we own the download.
            } else if (statusCheck.rows.length > 0 && statusCheck.rows[0].status === 'available') {
              logger.info(`[DOWNLOAD] Model ${modelId} is already available, skipping download`);
              return { success: true, modelId };
            }

            // Start pull with streaming - use ollamaName for the API call
            const response = await axios({
              method: 'post',
              url: `${LLM_SERVICE_URL}/api/pull`,
              data: { name: ollamaName, stream: true },
              responseType: 'stream',
              timeout: 7200000, // 2 hours for very large models (70B+ over slow connection)
              signal,
            });

            return await _streamModelDownload(modelId, ollamaName, response, progressCallback);
          } catch (err) {
            // Handle abort (client disconnect) - never retry
            const isAborted =
              err.name === 'AbortError' || err.name === 'CanceledError' || signal?.aborted;
            if (isAborted) {
              logger.info(`[DOWNLOAD] Model ${modelId} download aborted by client`);
              await database.query(
                'UPDATE llm_installed_models SET status = $1, error_message = $2 WHERE id = $3',
                ['error', 'Download abgebrochen - bitte erneut versuchen', modelId]
              );
              throw new Error('Download abgebrochen');
            }

            // Non-retryable errors (model not found, disk full)
            const isNotFound = err.response?.data?.error?.includes('not found');
            const isDiskFull = err.message?.includes('ENOSPC');
            const isRetryable =
              !isNotFound &&
              !isDiskFull &&
              (RETRY_CODES.includes(err.code) || err.message?.includes('stagniert'));

            if (isRetryable && attempt < MAX_RETRIES) {
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // 1s, 2s, 4s... max 30s
              logger.warn(
                `[DOWNLOAD] Model ${modelId} attempt ${attempt}/${MAX_RETRIES} failed (${err.code || err.message}), retrying in ${delay}ms...`
              );
              if (progressCallback) {
                progressCallback(0, `Verbindungsfehler - Versuch ${attempt + 1}/${MAX_RETRIES}...`);
              }
              // Reset download progress for retry
              await database.query(
                'UPDATE llm_installed_models SET download_progress = 0, error_message = NULL WHERE id = $1',
                [modelId]
              );
              await new Promise(r => {
                setTimeout(r, delay);
              });
              continue;
            }

            logger.error(
              `Model ${modelId} (Ollama: ${ollamaName}) download failed after ${attempt} attempt(s): ${err.message}`
            );

            // User-friendly error messages based on error type
            let errorMessage = err.message;

            if (isNotFound) {
              errorMessage = `Model "${ollamaName}" nicht in Ollama Registry gefunden. Bitte Modell-Konfiguration prüfen.`;
            } else if (err.code === 'ECONNREFUSED') {
              errorMessage = 'LLM-Service nicht erreichbar. Bitte Systemstatus prüfen.';
            } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
              errorMessage = 'Download-Timeout nach mehreren Versuchen. Bitte erneut versuchen.';
            } else if (isDiskFull) {
              errorMessage = 'Nicht genügend Speicherplatz für den Download.';
            }

            await database.query(
              'UPDATE llm_installed_models SET status = $1, error_message = $2 WHERE id = $3',
              ['error', errorMessage, modelId]
            );
            throw new Error(errorMessage);
          }
        }
      } finally {
        activeDownloadIds.delete(modelId);
      }
    }

    /**
     * Delete a model
     */
    async deleteModel(modelId) {
      // Acquire switchLock to prevent race with concurrent activateModel
      if (switchLock) {
        logger.info(`[DELETE] Waiting for in-progress model switch to complete...`);
        try {
          await switchLock;
        } catch {
          // Previous switch failed, we can proceed
        }
      }

      let releaseLock;
      switchLock = new Promise(resolve => {
        releaseLock = resolve;
      });

      try {
        // Prevent deletion of default model
        const defaultCheck = await database.query(
          'SELECT is_default FROM llm_installed_models WHERE id = $1',
          [modelId]
        );
        if (defaultCheck.rows[0]?.is_default) {
          throw new Error('Cannot delete the default model. Set another model as default first.');
        }

        // Prevent deletion while model is being downloaded
        if (activeDownloadIds.has(modelId)) {
          throw new Error('Cannot delete a model while it is being downloaded.');
        }

        // Get ollama_name from catalog
        const catalogResult = await database.query(
          `SELECT COALESCE(ollama_name, id) as effective_ollama_name
                   FROM llm_model_catalog WHERE id = $1`,
          [modelId]
        );
        const ollamaName = catalogResult.rows[0]?.effective_ollama_name || modelId;

        // Check if it's the currently loaded model
        const loaded = await this.getLoadedModel();
        if (loaded && loaded.model_id === ollamaName) {
          // Unload first
          await this.unloadModel(ollamaName);
        }

        try {
          // Delete from Ollama using ollamaName
          await axios.delete(`${LLM_SERVICE_URL}/api/delete`, {
            data: { name: ollamaName },
            timeout: 30000,
          });
        } catch (err) {
          // Ignore if model doesn't exist in Ollama
          if (!err.message.includes('not found')) {
            logger.warn(`Error deleting model from Ollama: ${err.message}`);
          }
        }

        // Remove from installed models
        await database.query('DELETE FROM llm_installed_models WHERE id = $1', [modelId]);
        modelAvailabilityCache.delete(modelId);

        logger.info(`Model ${modelId} (Ollama: ${ollamaName}) deleted`);
        return { success: true, modelId };
      } finally {
        switchLock = null;
        releaseLock();
      }
    }

    /**
     * Set default model (used for new chats when no model specified)
     */
    async setDefaultModel(modelId) {
      await database.transaction(async client => {
        // Clear existing default
        await client.query(
          'UPDATE llm_installed_models SET is_default = false WHERE is_default = true'
        );
        // Set new default
        await client.query('UPDATE llm_installed_models SET is_default = true WHERE id = $1', [
          modelId,
        ]);
      });
      logger.info(`Default model set to ${modelId}`);
      return { success: true, defaultModel: modelId };
    }

    /**
     * Get default model ID
     * Priority: 1. DB default -> 2. Loaded model -> 3. Any installed -> 4. ENV -> 5. null
     */
    async getDefaultModel() {
      // 1. Check for explicitly set default in DB
      const defaultResult = await database.query(
        'SELECT id FROM llm_installed_models WHERE is_default = true LIMIT 1'
      );
      if (defaultResult.rows.length > 0) {
        return defaultResult.rows[0].id;
      }

      // 2. Check currently loaded model in Ollama
      const loadedModel = await this.getLoadedModel();
      if (loadedModel?.model_id) {
        // Validate it exists in our DB (match by ollama_name or id)
        const existsResult = await database.query(
          `SELECT i.id FROM llm_installed_models i
                     JOIN llm_model_catalog c ON i.id = c.id
                     WHERE COALESCE(c.ollama_name, c.id) = $1 AND i.status = 'available'`,
          [loadedModel.model_id]
        );
        if (existsResult.rows.length > 0) {
          logger.debug(`Using currently loaded model as default: ${existsResult.rows[0].id}`);
          return existsResult.rows[0].id;
        }
      }

      // 3. Use most recently downloaded available model
      const anyModelResult = await database.query(
        `SELECT id FROM llm_installed_models
                 WHERE status = 'available'
                 ORDER BY downloaded_at DESC NULLS LAST
                 LIMIT 1`
      );
      if (anyModelResult.rows.length > 0) {
        logger.debug(`Using most recent installed model as default: ${anyModelResult.rows[0].id}`);
        return anyModelResult.rows[0].id;
      }

      // 4. Fallback to environment variable
      if (process.env.LLM_MODEL) {
        logger.debug(`Using LLM_MODEL env variable as default: ${process.env.LLM_MODEL}`);
        return process.env.LLM_MODEL;
      }

      // 5. Fallback to hardware-profile-based recommendation
      try {
        const { getRecommendedModel } = require('../../utils/hardware');
        const recommendation = await getRecommendedModel();
        logger.debug(
          `Using hardware-recommended model as default: ${recommendation.model} (profile: ${recommendation.profile})`
        );
        return recommendation.model;
      } catch (e) {
        logger.warn(`Failed to get hardware recommendation: ${e.message}`);
      }

      // 6. No model available - return null (let caller handle the error)
      logger.warn('No default model available - no models installed');
      return null;
    }

    /**
     * Activate/Load a model into RAM
     * @param {string} modelId - Model to load (catalog ID)
     * @param {string} triggeredBy - Who triggered the switch ('user', 'queue', 'workflow')
     */
    async activateModel(modelId, triggeredBy = 'user') {
      // Cooldown check
      const now = Date.now();
      if (now - lastSwitchTime < MODEL_SWITCH_COOLDOWN) {
        const waitTime = MODEL_SWITCH_COOLDOWN - (now - lastSwitchTime);
        logger.debug(`Model switch cooldown active, waiting ${waitTime}ms`);
        await new Promise(resolve => {
          setTimeout(resolve, waitTime);
        });
      }

      // Wait for any in-progress switch to complete
      if (switchLock) {
        logger.info(`[SWITCH] Waiting for in-progress model switch to complete...`);
        try {
          await switchLock;
        } catch {
          // Previous switch failed, we can proceed
        }
      }

      // Create new lock
      let releaseLock;
      switchLock = new Promise(resolve => {
        releaseLock = resolve;
      });

      const startTime = Date.now();

      try {
        // Get model info from catalog for API calls and RAM check
        const catalogResult = await database.query(
          `SELECT COALESCE(ollama_name, id) as effective_ollama_name, ram_required_gb
                     FROM llm_model_catalog WHERE id = $1`,
          [modelId]
        );
        const catalogModel = catalogResult.rows[0];
        const ollamaName = catalogModel?.effective_ollama_name || modelId;
        const requiredRamGb = catalogModel?.ram_required_gb || 0;

        // P2-005: Check GPU/RAM availability before loading
        await _checkMemoryRequirements(this, modelId, requiredRamGb);

        // Validate model exists in Ollama before trying to load
        const validation = await this.validateModelAvailability(modelId);
        if (!validation.available) {
          // Update DB status to reflect reality
          await database.query(
            `UPDATE llm_installed_models
                         SET status = 'error', error_message = $1
                         WHERE id = $2`,
            [validation.error, modelId]
          );
          throw new Error(validation.error);
        }

        // Check if model is already among loaded models (multi-model support)
        const loadedModels = await this.getLoadedModels();
        const alreadyLoaded = loadedModels.some(m => m.model_id === ollamaName);

        if (alreadyLoaded) {
          logger.debug(`Model ${modelId} (Ollama: ${ollamaName}) already loaded`);
          return { success: true, alreadyLoaded: true, model: modelId };
        }

        const fromModel = loadedModels.length > 0 ? loadedModels[0].model_id : null;

        // Load the model (LRU eviction handled by _checkMemoryRequirements)
        await _executeModelSwitch(this, modelId, ollamaName, fromModel);

        const switchDuration = Date.now() - startTime;
        lastSwitchTime = Date.now();

        // Record the switch in database and update usage stats
        await _recordModelSwitch(modelId, fromModel, switchDuration, triggeredBy);

        this.invalidateAvailabilityCache();
        logger.info(`Model ${modelId} activated in ${switchDuration}ms`);
        return {
          success: true,
          switchDuration,
          fromModel,
          toModel: modelId,
        };
      } finally {
        releaseLock();
        switchLock = null;
      }
    }

    /**
     * Unload a model from RAM
     */
    async unloadModel(modelId) {
      try {
        await axios.post(
          `${LLM_SERVICE_URL}/api/generate`,
          {
            model: modelId,
            prompt: '',
            stream: false,
            keep_alive: 0, // 0 = unload immediately
          },
          { timeout: 10000 }
        );

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
      // Check Ollama reachability and loaded model in parallel
      let ollamaReachable = false;
      let loaded = null;

      const [loadedResult, tagsResult, installedResult, queueByModelResult, switchStatsResult] =
        await Promise.all([
          this.getLoadedModel(),
          // fire-and-forget: Ollama may be unavailable; null signals "unreachable"
          axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 3000 }).catch(() => null),
          database.query('SELECT COUNT(*) as count FROM llm_installed_models WHERE status = $1', [
            'available',
          ]),
          database.query('SELECT * FROM get_queue_status_by_model()'),
          database.query(`
                    SELECT
                        COUNT(*) as total_switches,
                        AVG(switch_duration_ms)::INTEGER as avg_switch_ms,
                        MAX(switched_at) as last_switch
                    FROM llm_model_switches
                    WHERE switched_at > NOW() - INTERVAL '1 hour'
                `),
        ]);

      loaded = loadedResult;
      ollamaReachable = tagsResult !== null;

      return {
        loaded_model: loaded,
        ollama_reachable: ollamaReachable,
        installed_count: parseInt(installedResult.rows[0].count),
        queue_by_model: queueByModelResult.rows,
        switch_stats: switchStatsResult.rows[0] || {},
        switch_in_progress: switchLock !== null,
        timestamp: new Date().toISOString(),
      };
    }

    /**
     * Get the next job using smart model batching
     * @param {string} currentModel - Currently loaded model
     * @returns {Object} Next job with switch information
     */
    async getNextBatchedJob(currentModel) {
      const result = await database.query('SELECT * FROM get_next_batched_job($1)', [currentModel]);

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
     * Quick check if model is available in Ollama (for queue validation)
     * Uses TTL cache (60s) to avoid redundant Ollama /api/tags calls.
     * @param {string} modelId - Model ID (catalog ID or ollama name)
     * @returns {Promise<boolean>}
     */
    async isModelAvailable(modelId) {
      const cached = modelAvailabilityCache.get(modelId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.available;
      }

      const validation = await this.validateModelAvailability(modelId);
      modelAvailabilityCache.set(modelId, {
        available: validation.available,
        expiresAt: Date.now() + MODEL_AVAILABILITY_TTL,
      });
      return validation.available;
    }

    /**
     * Invalidate model availability cache (called after sync/install/activate)
     */
    invalidateAvailabilityCache() {
      modelAvailabilityCache.clear();
    }

    /**
     * Validate model exists in Ollama
     * @param {string} modelId - Model ID from catalog
     * @returns {Promise<{available: boolean, error?: string}>}
     */
    async validateModelAvailability(modelId) {
      try {
        // Get ollama_name from catalog
        const catalogResult = await database.query(
          `SELECT COALESCE(ollama_name, id) as effective_ollama_name
                     FROM llm_model_catalog WHERE id = $1`,
          [modelId]
        );

        const ollamaName = catalogResult.rows[0]?.effective_ollama_name || modelId;

        const response = await axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 10000 });
        const ollamaModels = (response.data.models || []).map(m => m.name);

        if (ollamaModels.includes(ollamaName)) {
          return { available: true };
        }

        return {
          available: false,
          error: `Model "${modelId}" nicht in Ollama gefunden. Bitte im Model Store erneut herunterladen.`,
        };
      } catch (err) {
        logger.error(`Error validating model ${modelId}: ${err.message}`);
        return {
          available: false,
          error: `Ollama nicht erreichbar: ${err.message}`,
        };
      }
    }

    /**
     * Sync installed models with Ollama
     * Updates database based on what's actually in Ollama
     * Matches by ollama_name field to handle ID mapping
     * Also cleans up stale downloads that were interrupted
     */
    async syncWithOllama() {
      try {
        const response = await axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 10000 });
        const ollamaModels = (response.data.models || []).map(m => m.name);

        logger.info(
          `[SYNC] Ollama has ${ollamaModels.length} models: ${ollamaModels.join(', ') || 'none'}`
        );

        // 1. For each Ollama model, find matching catalog entry and mark as available
        await _markAvailableModels(ollamaModels);

        // 2. Mark models as error if marked available in DB but not in Ollama
        await _markMissingModels(ollamaModels);

        // 3. Clean up stale downloads (stuck in 'downloading')
        const cleanedUp = await _cleanupStaleDownloads(ollamaModels);

        this.invalidateAvailabilityCache();
        return { success: true, ollamaModels, cleanedUp };
      } catch (err) {
        logger.error(`[SYNC] Error syncing with Ollama: ${err.message}`);
        return { success: false, error: err.message };
      }
    }

    /**
     * Get model info from catalog
     */
    async getModelInfo(modelId) {
      const result = await database.query(
        `
                SELECT
                    c.*,
                    COALESCE(c.ollama_name, c.id) as effective_ollama_name,
                    i.status as install_status,
                    i.download_progress,
                    i.is_default,
                    i.last_used_at,
                    i.usage_count
                FROM llm_model_catalog c
                LEFT JOIN llm_installed_models i ON c.id = i.id
                WHERE c.id = $1
            `,
        [modelId]
      );

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
     * Get available disk space for model downloads
     * P1-001: Check disk space before download to prevent mid-download failures
     * @returns {Promise<{free: number, total: number}>} Disk space in bytes
     */
    async getDiskSpace() {
      try {
        // Check /data partition (where Ollama stores models) or fallback to /
        let stdout;
        try {
          ({ stdout } = await execFileAsync('df', ['-B1', '/data']));
        } catch {
          ({ stdout } = await execFileAsync('df', ['-B1', '/']));
        }
        // Parse df output: skip header, get last line
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const fields = lastLine.split(/\s+/);
        // df -B1 output: Filesystem 1B-blocks Used Available Use% Mounted
        const total = parseInt(fields[1]) || 0;
        const free = parseInt(fields[3]) || 0;
        return { free, total };
      } catch (err) {
        logger.warn(`Could not get disk space: ${err.message}`);
        // Return large value to not block on error
        return { free: 100 * 1024 * 1024 * 1024, total: 100 * 1024 * 1024 * 1024 };
      }
    }

    /**
     * Get available GPU memory
     * P2-005: Check GPU memory before model activation to prevent OOM
     * @returns {Promise<{free_mb: number, total_mb: number, used_mb: number}>}
     */
    async getGpuMemory() {
      try {
        // For Jetson AGX Orin: Use tegrastats or nvidia-smi
        // Try nvidia-smi first (works on both desktop and Jetson with newer JetPack)
        const { stdout } = await execFileAsync('nvidia-smi', [
          '--query-gpu=memory.free,memory.total,memory.used',
          '--format=csv,noheader,nounits',
        ]);
        const [free, total, used] = stdout
          .trim()
          .split(',')
          .map(v => parseInt(v.trim()));
        return { free_mb: free || 0, total_mb: total || 0, used_mb: used || 0 };
      } catch (err) {
        // Fallback for Jetson without nvidia-smi or desktop without GPU
        try {
          // Read /proc/meminfo directly instead of shell pipe
          const memInfo = await readFileAsync('/proc/meminfo', 'utf8');
          const match = memInfo.match(/MemAvailable:\s+(\d+)\s+kB/);
          if (!match) {
            throw new Error('MemAvailable not found');
          }
          const availableKb = parseInt(match[1]);
          // On Jetson, GPU shares unified RAM - 92% usable (kernel/drivers reserve ~8%)
          const estimatedGpuMb = Math.floor((availableKb / 1024) * 0.92);
          const totalMb = (() => {
            const totalMatch = memInfo.match(/MemTotal:\s+(\d+)\s+kB/);
            return totalMatch ? Math.floor(parseInt(totalMatch[1]) / 1024) : 64000;
          })();
          return { free_mb: estimatedGpuMb, total_mb: totalMb, used_mb: totalMb - estimatedGpuMb };
        } catch {
          logger.warn(`Could not get GPU memory info: ${err.message}`);
          // Assume 64GB Jetson AGX Orin with plenty of memory
          return { free_mb: 50000, total_mb: 64000, used_mb: 14000 };
        }
      }
    }

    /**
     * Format bytes to human-readable string
     */
    formatBytes(bytes) {
      if (bytes === 0) {
        return '0 B';
      }
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
      switchLock = null;
    }

    /**
     * Get switch state for testing
     */
    _getSwitchState() {
      return { lastSwitchTime, switchInProgress: switchLock !== null };
    }
  }

  return new ModelService();
}

// Create default singleton instance with real dependencies
const defaultInstance = createModelService();

// Export singleton for production use, factory for testing
module.exports = defaultInstance;
module.exports.createModelService = createModelService;
