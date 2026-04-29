/**
 * Model Download Helpers
 *
 * Handles download streaming, progress tracking, verification, and disk space
 * checks. Phase 0 of the LLM/RAG hardening plan added byte-level persistence
 * (bytes_completed / bytes_total) so multi-hour downloads survive container
 * restarts and Jetson reboots.
 *
 * Status conventions written here:
 *   'downloading' — actively pulling from Ollama
 *   'paused'      — interrupted with bytes_completed > 0; safe to resume
 *   'error'       — unrecoverable failure (model not found, disk full, etc.)
 *   'available'   — pull finished and Ollama has the model
 *
 * Plan reference: docs/plans/LLM_RAG_N8N_HARDENING.md (Phase 0.2)
 *
 * Usage: const helpers = createDownloadHelpers({ database, logger, axios, ... });
 */

const LLM_SERVICE_URL = require('../../config/services').llm.url;

// How often to flush byte-level progress to Postgres. The Ollama stream emits
// many small "data: {...}" lines per second; writing each to PG would dominate
// CPU. 2s strikes a balance between recovery granularity and DB load.
const PROGRESS_FLUSH_INTERVAL_MS = 2000;

/**
 * Factory: create download helpers bound to injected dependencies.
 * @param {Object} deps
 * @param {Object} deps.database
 * @param {Object} deps.logger
 * @param {Object} deps.axios
 * @param {Map}    deps.modelAvailabilityCache
 * @returns {Object} Download helper functions
 */
function createDownloadHelpers({ database, logger, axios, modelAvailabilityCache }) {
  /**
   * Check available disk space vs model size before download.
   * Honours bytes already downloaded — a 50% resume only needs disk for the
   * remaining 50%.
   *
   * @param {Object} service - ModelService instance (for getDiskSpace/formatBytes)
   * @param {number} modelSizeBytes - Size of the model in bytes
   * @param {number} alreadyDownloadedBytes - Bytes already on disk from a previous attempt
   */
  async function validateDiskSpace(service, modelSizeBytes, alreadyDownloadedBytes = 0) {
    if (modelSizeBytes <= 0) {
      return;
    }
    const diskSpace = await service.getDiskSpace();
    const remainingBytes = Math.max(0, modelSizeBytes - alreadyDownloadedBytes);
    const requiredSpace = Math.floor(remainingBytes * 1.5); // 50% buffer for extraction/temp files

    if (diskSpace.free < requiredSpace) {
      const errorMsg =
        `Nicht genügend Speicherplatz für Download. ` +
        `Benötigt: ${service.formatBytes(requiredSpace)}, ` +
        `Verfügbar: ${service.formatBytes(diskSpace.free)}. ` +
        `Bitte Speicherplatz freigeben oder ein kleineres Modell wählen.`;
      logger.error(`[DOWNLOAD] ${errorMsg}`);
      const e = new Error(errorMsg);
      e.code = 'ENOSPC';
      throw e;
    }

    logger.info(
      `[DOWNLOAD] Disk space check passed: ${service.formatBytes(diskSpace.free)} available, ${service.formatBytes(requiredSpace)} required`
    );
  }

  /**
   * Update download progress in DB (percent + bytes + activity stamp).
   * Also fires the optional callback for SSE consumers.
   *
   * @param {string} modelId
   * @param {Object} update
   * @param {number} update.progress     - Percent (0-100), kept for backward compat
   * @param {number} [update.bytesCompleted]
   * @param {number} [update.bytesTotal]
   * @param {number} [update.speedBps]
   * @param {string} [update.status]     - Raw Ollama status string for the UI
   * @param {function|null} progressCallback
   */
  async function updateDownloadProgress(modelId, update, progressCallback) {
    const {
      progress,
      bytesCompleted = null,
      bytesTotal = null,
      speedBps = null,
      status = null,
    } = update;

    await database.query(
      `UPDATE llm_installed_models
          SET download_progress = $1,
              bytes_completed   = COALESCE($2, bytes_completed),
              bytes_total       = COALESCE($3, bytes_total),
              download_speed_bps = COALESCE($4, download_speed_bps),
              last_activity_at  = NOW()
        WHERE id = $5`,
      [progress, bytesCompleted, bytesTotal, speedBps, modelId]
    );

    if (progressCallback) {
      progressCallback(progress, status || 'downloading', {
        bytesCompleted,
        bytesTotal,
        speedBps,
      });
    }
  }

  /**
   * Verify that a model is actually available in Ollama after download
   * @param {string} modelId - Catalog model ID
   * @param {string} ollamaName - Ollama model name
   * @returns {Promise<boolean>}
   */
  async function verifyDownloadComplete(modelId, ollamaName) {
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
              SET status = 'error',
                  error_message = $1,
                  last_error_code = 'VERIFY_MISSING'
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
      return true;
    }
  }

  /**
   * Auto-set model as default if no default exists yet (atomic)
   * @param {string} modelId
   */
  async function autoSetDefault(modelId) {
    await database.transaction(async client => {
      const hasDefault = await client.query(
        'SELECT id FROM llm_installed_models WHERE is_default = true FOR UPDATE'
      );
      if (hasDefault.rows.length === 0) {
        await client.query('UPDATE llm_installed_models SET is_default = true WHERE id = $1', [
          modelId,
        ]);
        logger.info(`Auto-set ${modelId} as default model (first model downloaded)`);
      }
    });
  }

  /**
   * Mark a download as paused (bytes preserved, will be resumed) or as a hard
   * error (no recovery). Decision is based on whether any bytes were saved.
   *
   * @param {string} modelId
   * @param {Object} ctx
   * @param {number} ctx.bytesCompleted
   * @param {string} ctx.errorMessage   - User-facing message
   * @param {string} ctx.errorCode      - Machine code (e.g. 'STALL', 'ECONNRESET')
   */
  async function markPausedOrError(modelId, { bytesCompleted, errorMessage, errorCode }) {
    if (bytesCompleted > 0) {
      await database.query(
        `UPDATE llm_installed_models
            SET status = 'paused',
                error_message = $1,
                last_error_code = $2,
                last_activity_at = NOW()
          WHERE id = $3`,
        [errorMessage, errorCode, modelId]
      );
      logger.warn(
        `[DOWNLOAD] Model ${modelId} paused at ${bytesCompleted} bytes (${errorCode}); resume on next attempt.`
      );
    } else {
      await database.query(
        `UPDATE llm_installed_models
            SET status = 'error',
                error_message = $1,
                last_error_code = $2
          WHERE id = $3`,
        [errorMessage, errorCode, modelId]
      );
    }
  }

  /**
   * Stream model download from Ollama and persist byte-level progress.
   *
   * Ollama's pull-stream emits JSON lines with `completed` and `total` byte
   * counts during the actual blob download. We persist them every
   * PROGRESS_FLUSH_INTERVAL_MS so a crash loses at most that many seconds of
   * progress (not the entire pull).
   *
   * On stall (5 min without activity) and on transport error we route through
   * markPausedOrError() — never directly to status='error' if any bytes have
   * landed, because Ollama's local blob cache lets us resume cheaply.
   *
   * @param {string} modelId
   * @param {string} ollamaName
   * @param {Object} response - Axios streaming response
   * @param {function|null} progressCallback
   * @returns {Promise<{success: boolean, modelId: string}>}
   */
  function streamModelDownload(modelId, ollamaName, response, progressCallback) {
    return new Promise((resolve, reject) => {
      let lastProgress = 0;
      let buffer = '';
      let lastActivityTime = Date.now();
      const STALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes without any activity

      // Bytes seen so far in this attempt. Persisted on a timer rather than
      // on every chunk to keep DB load low while still being recoverable.
      let bytesCompleted = 0;
      let bytesTotal = null;
      let pendingFlush = false;
      let lastFlushedAt = Date.now();
      let lastFlushedBytes = 0;
      let lastStatusForFlush = 'downloading';

      const flushProgressIfNeeded = async (force = false) => {
        if (!force && !pendingFlush) {
          return;
        }
        if (!force && Date.now() - lastFlushedAt < PROGRESS_FLUSH_INTERVAL_MS) {
          return;
        }
        pendingFlush = false;
        const now = Date.now();
        const elapsedSec = Math.max(0.001, (now - lastFlushedAt) / 1000);
        const speedBps = Math.round((bytesCompleted - lastFlushedBytes) / elapsedSec);
        try {
          await updateDownloadProgress(
            modelId,
            {
              progress: lastProgress,
              bytesCompleted,
              bytesTotal,
              speedBps: speedBps > 0 ? speedBps : null,
              status: lastStatusForFlush,
            },
            progressCallback
          );
        } catch (err) {
          logger.warn(`[DOWNLOAD] Progress flush failed for ${modelId}: ${err.message}`);
        }
        lastFlushedAt = now;
        lastFlushedBytes = bytesCompleted;
      };

      // Stall detection: check every 60s if progress has stalled
      const stallCheckInterval = setInterval(async () => {
        if (Date.now() - lastActivityTime > STALL_TIMEOUT_MS) {
          clearInterval(stallCheckInterval);
          clearInterval(flushInterval);
          logger.error(
            `[DOWNLOAD] Model ${modelId} download stalled (no progress for 5min, bytes=${bytesCompleted})`
          );
          response.data.destroy();
          await flushProgressIfNeeded(true);
          await markPausedOrError(modelId, {
            bytesCompleted,
            errorMessage:
              bytesCompleted > 0
                ? 'Download pausiert (keine Aktivität seit 5 Minuten) — wird automatisch fortgesetzt.'
                : 'Download stagniert (keine Aktivität seit 5 Minuten)',
            errorCode: 'STALL',
          });
          reject(new Error('Download stagniert'));
        }
      }, 60000);

      // Periodic flusher to write byte progress without blocking the data path
      const flushInterval = setInterval(() => {
        if (pendingFlush) {
          flushProgressIfNeeded().catch(() => {});
        }
      }, PROGRESS_FLUSH_INTERVAL_MS);

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
              clearInterval(stallCheckInterval);
              clearInterval(flushInterval);
              await flushProgressIfNeeded(true);
              // Manifest/registry errors are unrecoverable — go straight to 'error'
              await database.query(
                `UPDATE llm_installed_models
                    SET status = 'error',
                        error_message = $1,
                        last_error_code = 'OLLAMA_ERROR'
                  WHERE id = $2`,
                [errorMsg, modelId]
              );
              if (progressCallback) {
                progressCallback(0, errorMsg);
              }
              reject(new Error(errorMsg));
              return;
            }

            // Capture byte-level progress from the blob phase
            if (typeof data.completed === 'number') {
              bytesCompleted = data.completed;
            }
            if (typeof data.total === 'number') {
              bytesTotal = data.total;
            }

            // Coarse percent for the UI (kept for backward compat)
            if (data.status) {
              const statusLower = data.status.toLowerCase();
              lastStatusForFlush = data.status;

              if (statusLower.includes('pulling manifest')) {
                progress = 1;
              } else if (data.total && data.completed) {
                progress = 2 + Math.round((data.completed / data.total) * 93);
              } else if (statusLower.includes('verifying')) {
                progress = 96;
              } else if (statusLower.includes('writing')) {
                progress = 98;
              } else if (statusLower.includes('success')) {
                progress = 100;
              }

              logger.debug(`Model ${modelId} download status: ${data.status} (${progress}%)`);
            }

            if (progress !== lastProgress) {
              lastProgress = progress;
            }
            // Mark dirty; the flush interval (or completion) will persist.
            pendingFlush = true;

            // Download completed
            if (data.status === 'success' || (data.status && data.status.includes('success'))) {
              clearInterval(stallCheckInterval);
              clearInterval(flushInterval);
              await database.query(
                `UPDATE llm_installed_models
                    SET status = 'available',
                        download_progress = 100,
                        bytes_completed = COALESCE($2, bytes_completed),
                        bytes_total = COALESCE($2, bytes_total),
                        downloaded_at = NOW(),
                        last_activity_at = NOW(),
                        error_message = NULL,
                        last_error_code = NULL,
                        download_speed_bps = NULL
                  WHERE id = $1`,
                [modelId, bytesTotal]
              );
              logger.info(`Model ${modelId} downloaded successfully (${bytesCompleted} bytes)`);
              modelAvailabilityCache.delete(modelId);
              await autoSetDefault(modelId);
            }
          } catch (parseError) {
            // Ignore JSON parse errors for partial lines
          }
        }
      });

      response.data.on('end', async () => {
        clearInterval(stallCheckInterval);
        clearInterval(flushInterval);
        await flushProgressIfNeeded(true);

        // Ensure final state is set
        const finalResult = await database.query(
          'SELECT status FROM llm_installed_models WHERE id = $1',
          [modelId]
        );
        if (finalResult.rows.length > 0 && finalResult.rows[0].status === 'downloading') {
          // Verify model is actually available in Ollama before marking as available
          const verified = await verifyDownloadComplete(modelId, ollamaName);
          if (!verified) {
            reject(new Error('Model verification failed - model not found in Ollama'));
            return;
          }

          await database.query(
            `UPDATE llm_installed_models
                SET status = 'available',
                    download_progress = 100,
                    bytes_completed = COALESCE(bytes_total, bytes_completed),
                    downloaded_at = NOW(),
                    last_activity_at = NOW(),
                    error_message = NULL,
                    last_error_code = NULL,
                    download_speed_bps = NULL
              WHERE id = $1`,
            [modelId]
          );
          modelAvailabilityCache.delete(modelId);
          await autoSetDefault(modelId);
        }
        resolve({ success: true, modelId });
      });

      response.data.on('error', async err => {
        clearInterval(stallCheckInterval);
        clearInterval(flushInterval);
        await flushProgressIfNeeded(true);
        logger.error(`Model ${modelId} download error: ${err.message}`);
        await markPausedOrError(modelId, {
          bytesCompleted,
          errorMessage: err.message,
          errorCode: err.code || 'STREAM_ERROR',
        });
        reject(err);
      });
    });
  }

  return {
    validateDiskSpace,
    streamModelDownload,
    updateDownloadProgress,
    verifyDownloadComplete,
    markPausedOrError,
  };
}

module.exports = { createDownloadHelpers };
