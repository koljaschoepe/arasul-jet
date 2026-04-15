/**
 * Model Download Helpers
 *
 * Handles download streaming, progress tracking, verification, and disk space checks.
 * Extracted from modelService.js for maintainability.
 *
 * Usage: const helpers = createDownloadHelpers({ database, logger, axios, ... });
 */

const LLM_SERVICE_URL = require('../../config/services').llm.url;

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
   * Check available disk space vs model size before download
   * @param {Object} service - ModelService instance (for getDiskSpace/formatBytes)
   * @param {number} modelSizeBytes - Size of the model in bytes
   */
  async function validateDiskSpace(service, modelSizeBytes) {
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
   * Update download progress in DB and notify callback
   * @param {string} modelId - Model ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} status - Status string from Ollama
   * @param {function|null} progressCallback - Optional callback
   */
  async function updateDownloadProgress(modelId, progress, status, progressCallback) {
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
   * Stream model download from Ollama and handle progress/completion events
   * @param {string} modelId - Catalog model ID
   * @param {string} ollamaName - Ollama model name
   * @param {Object} response - Axios streaming response
   * @param {function|null} progressCallback - Optional progress callback
   * @returns {Promise<{success: boolean, modelId: string}>}
   */
  function streamModelDownload(modelId, ollamaName, response, progressCallback) {
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

            // Update progress if changed
            if (progress !== lastProgress) {
              lastProgress = progress;
              await updateDownloadProgress(
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
              await autoSetDefault(modelId);
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
          // Verify model is actually available in Ollama before marking as available
          const verified = await verifyDownloadComplete(modelId, ollamaName);
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
          await autoSetDefault(modelId);
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

  return {
    validateDiskSpace,
    streamModelDownload,
    updateDownloadProgress,
    verifyDownloadComplete,
  };
}

module.exports = { createDownloadHelpers };
