/**
 * LLM Model Service
 * Manages model catalog, installation, activation, and smart queue batching
 * for Jetson AGX Orin with multi-model memory budget
 *
 * Download streaming logic is in modelDownloadHelpers.js
 * Ollama sync logic is in modelSyncHelpers.js
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

const { createDownloadHelpers } = require('./modelDownloadHelpers');
const { createSyncHelpers } = require('./modelSyncHelpers');
const { ValidationError } = require('../../utils/errors');

// Service URLs (from centralized config)
const LLM_SERVICE_URL = services.llm.url;

// Configuration
const MODEL_SWITCH_COOLDOWN = parseInt(process.env.MODEL_SWITCH_COOLDOWN_SECONDS || '5') * 1000;

// Phase 5.5: Defense-in-depth model-name validator. Catalog IDs follow Ollama's
// naming (e.g. `gemma3:9b-q8`, `llama3.1:8b`, `qwen2.5-coder:7b-instruct`),
// so we accept lowercase alphanumerics plus `: . _ - /` between non-boundary
// chars. Hard-fails on shell-meta, NUL, whitespace, traversal sequences, etc.
// Catalog lookup already validates existence — this catches malformed IDs
// before they reach DB queries / Ollama HTTP calls and surfaces clearly.
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9:._/-]*[a-z0-9]$/i;
const MODEL_ID_MAX_LEN = 128;

function _assertValidModelId(modelId, op) {
  if (typeof modelId !== 'string' || modelId.length === 0 || modelId.length > MODEL_ID_MAX_LEN) {
    throw new ValidationError(`Invalid model id for ${op}: must be 1..${MODEL_ID_MAX_LEN} chars`, {
      field: 'modelId',
      op,
    });
  }
  if (!MODEL_ID_PATTERN.test(modelId)) {
    throw new ValidationError(
      `Invalid model id for ${op}: only lowercase alphanumerics + ":._/-" allowed`,
      { field: 'modelId', op }
    );
  }
}

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
  const activeDownloadIds = new Set();

  // Model availability cache (TTL-based)
  const MODEL_AVAILABILITY_TTL = 15 * 1000; // 15 seconds (aligned with frontend polling interval)
  const modelAvailabilityCache = new Map(); // modelId -> { available, expiresAt }

  // Create helper instances bound to our dependencies
  const downloadHelpers = createDownloadHelpers({
    database,
    logger,
    axios,
    modelAvailabilityCache,
  });

  const syncHelpers = createSyncHelpers({
    database,
    logger,
    activeDownloadIds,
    modelAvailabilityCache,
  });

  // ============================================================================
  // Internal helper functions
  // ============================================================================

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
  async function _executeModelSwitch(service, modelId, ollamaName, _fromModel) {
    logger.info(`Loading model: ${modelId} (Ollama: ${ollamaName})`);

    // Get dynamic keep-alive from lifecycle service
    const modelLifecycleService = require('./modelLifecycleService');
    const { keepAliveSeconds } = await modelLifecycleService.getCurrentKeepAlive();

    // Load model by making a minimal request using ollamaName
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
    await database.query(`SELECT record_model_switch($1, $2, $3, $4, $5)`, [
      fromModel,
      modelId,
      switchDuration,
      triggeredBy,
      'activated',
    ]);

    await database.query(
      'UPDATE llm_installed_models SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1',
      [modelId]
    );
  }

  // ============================================================================
  // ModelService class
  // ============================================================================

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
                    c.context_window AS max_context_window,
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

      // Parse RAM_LIMIT_LLM (e.g. "32G" -> 32768 MB)
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
        }

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
     * Download (or resume) a model with progress callback.
     *
     * Phase 0 changes:
     *   - Atomic claim is now race-safe (SELECT FOR UPDATE inside a TX) instead
     *     of the WHERE-clause trick on the upsert that had a TOCTOU window.
     *   - 'paused' rows are valid resume targets; bytes_completed is preserved
     *     so Ollama's local blob cache picks up where it left off.
     *   - attempt_count is incremented per claim and capped at 5 to avoid
     *     infinite loops on a permanently failing pull.
     *
     * @param {string} modelId
     * @param {function|null} progressCallback - (percent, statusString, {bytesCompleted, bytesTotal, speedBps})
     * @param {Object}   [options]
     * @param {AbortSignal} [options.signal]
     * @param {string}   [options.triggeredBy='user'] - 'user' | 'auto-resume' | 'sync'
     */
    async downloadModel(modelId, progressCallback = null, { signal, triggeredBy = 'user' } = {}) {
      _assertValidModelId(modelId, 'download');
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

      const ollamaName = catalogModel.effective_ollama_name;
      const MAX_ATTEMPTS_PER_MODEL = 5;

      // Atomic claim inside a transaction. We:
      //   1. Insert a brand-new row if none exists.
      //   2. Lock the row (SELECT FOR UPDATE) and inspect.
      //   3. Reject if already 'downloading' (another process owns it).
      //   4. Reject if 'available' (no work needed).
      //   5. Promote 'paused'/'error'/initial → 'downloading', preserving
      //      bytes_completed for resume.
      const claimInfo = await database.transaction(async client => {
        await client.query(
          `INSERT INTO llm_installed_models (id, status, download_progress, bytes_completed, attempt_count)
           VALUES ($1, 'paused', 0, 0, 0)
           ON CONFLICT (id) DO NOTHING`,
          [modelId]
        );
        const row = await client.query(
          `SELECT status, bytes_completed, attempt_count
             FROM llm_installed_models
            WHERE id = $1
            FOR UPDATE`,
          [modelId]
        );
        const current = row.rows[0];
        if (current.status === 'downloading') {
          return { action: 'already_downloading', bytesCompleted: current.bytes_completed || 0 };
        }
        if (current.status === 'available') {
          return { action: 'already_installed', bytesCompleted: current.bytes_completed || 0 };
        }
        if ((current.attempt_count || 0) >= MAX_ATTEMPTS_PER_MODEL) {
          return {
            action: 'max_attempts',
            attempts: current.attempt_count,
          };
        }
        await client.query(
          `UPDATE llm_installed_models
              SET status = 'downloading',
                  attempt_count = COALESCE(attempt_count, 0) + 1,
                  download_started_at = COALESCE(download_started_at, NOW()),
                  last_activity_at = NOW(),
                  error_message = NULL,
                  last_error_code = NULL
            WHERE id = $1`,
          [modelId]
        );
        return {
          action: current.bytes_completed > 0 ? 'resume' : 'fresh',
          bytesCompleted: current.bytes_completed || 0,
        };
      });

      if (claimInfo.action === 'already_downloading') {
        logger.warn(
          `[DOWNLOAD] Model ${modelId} is already downloading (${claimInfo.bytesCompleted} bytes), skipping`
        );
        throw new Error('Modell wird bereits heruntergeladen');
      }
      if (claimInfo.action === 'already_installed') {
        logger.info(`[DOWNLOAD] Model ${modelId} is already installed, skipping`);
        return { success: true, modelId, alreadyInstalled: true };
      }
      if (claimInfo.action === 'max_attempts') {
        const msg = `Modell ${modelId} hat die maximale Anzahl an Download-Versuchen (${claimInfo.attempts}) erreicht. Bitte aus dem Store löschen und neu starten.`;
        logger.error(`[DOWNLOAD] ${msg}`);
        throw new Error(msg);
      }

      // Register as active AFTER successful claim so periodic sync can't mark it stale
      activeDownloadIds.add(modelId);

      const resumeBytes = claimInfo.bytesCompleted || 0;
      logger.info(
        `Starting ${claimInfo.action === 'resume' ? 'RESUME' : 'download'} of model ${modelId} (Ollama: ${ollamaName})` +
          (claimInfo.action === 'resume'
            ? ` from ${resumeBytes} bytes (triggered by ${triggeredBy})`
            : ` (triggered by ${triggeredBy})`)
      );

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
            // Validate disk space right before download — accounting for resume bytes
            await downloadHelpers.validateDiskSpace(
              this,
              catalogModel.size_bytes || 0,
              resumeBytes
            );

            // Re-verify model isn't already available
            const statusCheck = await database.query(
              'SELECT status FROM llm_installed_models WHERE id = $1',
              [modelId]
            );
            if (statusCheck.rows.length > 0 && statusCheck.rows[0].status === 'available') {
              logger.info(`[DOWNLOAD] Model ${modelId} is already available, skipping download`);
              return { success: true, modelId };
            }

            // Start pull with streaming. Ollama natively reuses any blob it
            // already has on disk, so a resume after partial download is
            // automatic — we don't need a special "resume" flag.
            const response = await axios({
              method: 'post',
              url: `${LLM_SERVICE_URL}/api/pull`,
              data: { name: ollamaName, stream: true },
              responseType: 'stream',
              timeout: 7200000, // 2 hours for very large models (70B+)
              signal,
            });

            return await downloadHelpers.streamModelDownload(
              modelId,
              ollamaName,
              response,
              progressCallback
            );
          } catch (err) {
            // Handle abort (explicit cancel via AbortSignal). We do NOT retry,
            // and we preserve any bytes already on disk by going to 'paused'
            // (so the user — or the boot recovery — can resume cheaply).
            const isAborted =
              err.name === 'AbortError' || err.name === 'CanceledError' || signal?.aborted;
            if (isAborted) {
              logger.info(`[DOWNLOAD] Model ${modelId} download aborted by client`);
              const bytesNow = await database.query(
                'SELECT bytes_completed FROM llm_installed_models WHERE id = $1',
                [modelId]
              );
              await downloadHelpers.markPausedOrError(modelId, {
                bytesCompleted: bytesNow.rows[0]?.bytes_completed || 0,
                errorMessage: 'Download abgebrochen — kann fortgesetzt werden.',
                errorCode: 'ABORTED',
              });
              throw new Error('Download abgebrochen');
            }

            // Non-retryable errors (model not found, disk full)
            const isNotFound = err.response?.data?.error?.includes('not found');
            const isDiskFull = err.message?.includes('ENOSPC') || err.code === 'ENOSPC';
            const isRetryable =
              !isNotFound &&
              !isDiskFull &&
              (RETRY_CODES.includes(err.code) || err.message?.includes('stagniert'));

            if (isRetryable && attempt < MAX_RETRIES) {
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
              logger.warn(
                `[DOWNLOAD] Model ${modelId} attempt ${attempt}/${MAX_RETRIES} failed (${err.code || err.message}), retrying in ${delay}ms...`
              );
              if (progressCallback) {
                progressCallback(0, `Verbindungsfehler - Versuch ${attempt + 1}/${MAX_RETRIES}...`);
              }
              // NOTE: we deliberately do NOT zero download_progress or
              // bytes_completed here — Ollama's blob cache will let the next
              // attempt resume from where we left off.
              await database.query(
                `UPDATE llm_installed_models
                    SET error_message = NULL,
                        last_error_code = NULL,
                        last_activity_at = NOW()
                  WHERE id = $1`,
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

            // User-friendly error messages + machine code for the row
            let errorMessage = err.message;
            let errorCode = err.code || 'UNKNOWN';
            if (isNotFound) {
              errorMessage = `Model "${ollamaName}" nicht in Ollama Registry gefunden. Bitte Modell-Konfiguration prüfen.`;
              errorCode = 'NOT_FOUND';
            } else if (err.code === 'ECONNREFUSED') {
              errorMessage = 'LLM-Service nicht erreichbar. Bitte Systemstatus prüfen.';
            } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
              errorMessage = 'Download-Timeout nach mehreren Versuchen. Bitte erneut versuchen.';
            } else if (isDiskFull) {
              errorMessage = 'Nicht genügend Speicherplatz für den Download.';
              errorCode = 'ENOSPC';
            }

            // 'not found' and 'disk full' are unrecoverable — go straight to
            // 'error'. Network-class failures preserve bytes via 'paused'.
            const bytesNow = await database.query(
              'SELECT bytes_completed FROM llm_installed_models WHERE id = $1',
              [modelId]
            );
            const bytesCompleted = bytesNow.rows[0]?.bytes_completed || 0;
            if (isNotFound || isDiskFull) {
              await database.query(
                `UPDATE llm_installed_models
                    SET status = 'error',
                        error_message = $1,
                        last_error_code = $2
                  WHERE id = $3`,
                [errorMessage, errorCode, modelId]
              );
            } else {
              await downloadHelpers.markPausedOrError(modelId, {
                bytesCompleted,
                errorMessage,
                errorCode,
              });
            }
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
      _assertValidModelId(modelId, 'delete');
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
          await this.unloadModel(ollamaName);
        }

        try {
          // Delete from Ollama using ollamaName
          await axios.delete(`${LLM_SERVICE_URL}/api/delete`, {
            data: { name: ollamaName },
            timeout: 30000,
          });
        } catch (err) {
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
        await client.query(
          'UPDATE llm_installed_models SET is_default = false WHERE is_default = true'
        );
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

      // 6. No model available
      logger.warn('No default model available - no models installed');
      return null;
    }

    /**
     * Activate/Load a model into RAM
     * @param {string} modelId - Model to load (catalog ID)
     * @param {string} triggeredBy - Who triggered the switch ('user', 'queue', 'workflow')
     */
    async activateModel(modelId, triggeredBy = 'user') {
      _assertValidModelId(modelId, 'activate');
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

        // Check GPU/RAM availability before loading
        await _checkMemoryRequirements(this, modelId, requiredRamGb);

        // Validate model exists in Ollama before trying to load
        const validation = await this.validateModelAvailability(modelId);
        if (!validation.available) {
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
      let ollamaReachable = false;

      const [loadedResult, tagsResult, installedResult, queueByModelResult, switchStatsResult] =
        await Promise.all([
          this.getLoadedModel(),
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

      ollamaReachable = tagsResult !== null;

      return {
        loaded_model: loadedResult,
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
     * Uses TTL cache to avoid redundant Ollama /api/tags calls.
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
     * Updates database based on what's actually in Ollama.
     * Returns { paused, errored } from the stale-download cleanup so callers
     * (e.g. ollamaReadiness) can trigger auto-resume.
     */
    async syncWithOllama() {
      try {
        const response = await axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 10000 });
        const ollamaModels = (response.data.models || []).map(m => m.name);

        logger.info(
          `[SYNC] Ollama has ${ollamaModels.length} models: ${ollamaModels.join(', ') || 'none'}`
        );

        // 1. For each Ollama model, find matching catalog entry and mark as available
        await syncHelpers.markAvailableModels(ollamaModels);

        // 2. Mark models as error if marked available in DB but not in Ollama
        await syncHelpers.markMissingModels(ollamaModels);

        // 3. Clean up stale downloads — distinguishes paused vs errored now
        const cleanedUp = await syncHelpers.cleanupStaleDownloads(ollamaModels);

        this.invalidateAvailabilityCache();
        return { success: true, ollamaModels, cleanedUp };
      } catch (err) {
        logger.error(`[SYNC] Error syncing with Ollama: ${err.message}`);
        return { success: false, error: err.message };
      }
    }

    /**
     * List downloads that are 'paused' and ready for resume.
     * Thin wrapper over the sync-helper so callers don't need to know about it.
     */
    async listResumableDownloads() {
      return syncHelpers.listResumableDownloads();
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
    resolveModel(requestedModel) {
      if (requestedModel) {
        return requestedModel;
      }
      return this.getDefaultModel();
    }

    /**
     * Get available disk space for model downloads
     * @returns {Promise<{free: number, total: number}>} Disk space in bytes
     */
    async getDiskSpace() {
      try {
        let stdout;
        try {
          ({ stdout } = await execFileAsync('df', ['-B1', '/data']));
        } catch {
          ({ stdout } = await execFileAsync('df', ['-B1', '/']));
        }
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const fields = lastLine.split(/\s+/);
        const total = parseInt(fields[1]) || 0;
        const free = parseInt(fields[3]) || 0;
        return { free, total };
      } catch (err) {
        logger.warn(`Could not get disk space: ${err.message}`);
        return { free: 100 * 1024 * 1024 * 1024, total: 100 * 1024 * 1024 * 1024 };
      }
    }

    /**
     * Get available GPU memory
     * @returns {Promise<{free_mb: number, total_mb: number, used_mb: number}>}
     */
    async getGpuMemory() {
      try {
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
        try {
          const memInfo = await readFileAsync('/proc/meminfo', 'utf8');
          const match = memInfo.match(/MemAvailable:\s+(\d+)\s+kB/);
          if (!match) {
            throw new Error('MemAvailable not found');
          }
          const availableKb = parseInt(match[1]);
          const estimatedGpuMb = Math.floor((availableKb / 1024) * 0.92);
          const totalMb = (() => {
            const totalMatch = memInfo.match(/MemTotal:\s+(\d+)\s+kB/);
            return totalMatch ? Math.floor(parseInt(totalMatch[1]) / 1024) : 64000;
          })();
          return { free_mb: estimatedGpuMb, total_mb: totalMb, used_mb: totalMb - estimatedGpuMb };
        } catch {
          logger.warn(`Could not get GPU memory info: ${err.message}`);
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
