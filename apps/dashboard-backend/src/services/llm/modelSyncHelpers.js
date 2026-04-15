/**
 * Model Sync Helpers
 *
 * Handles synchronization between the DB catalog and Ollama's actual model list:
 * - Mark available models
 * - Detect missing models
 * - Clean up stale downloads
 *
 * Extracted from modelService.js for maintainability.
 *
 * Usage: const helpers = createSyncHelpers({ database, logger, ... });
 */

/**
 * Factory: create sync helpers bound to injected dependencies.
 * @param {Object} deps
 * @param {Object} deps.database
 * @param {Object} deps.logger
 * @param {Set}    deps.activeDownloadIds
 * @param {Map}    deps.modelAvailabilityCache
 * @returns {Object} Sync helper functions
 */
function createSyncHelpers({ database, logger, activeDownloadIds, modelAvailabilityCache }) {
  /**
   * Mark models as available that Ollama has (sync step 1)
   * @param {string[]} ollamaModels - List of model names from Ollama
   */
  async function markAvailableModels(ollamaModels) {
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
  async function markMissingModels(ollamaModels) {
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
  async function cleanupStaleDownloads(ollamaModels) {
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
        logger.warn(`[SYNC] Cleaned up stale download: ${row.id}`);
        modelAvailabilityCache.delete(row.id);
        staleCount++;
      }
    }

    if (staleCount > 0) {
      logger.warn(`[SYNC] Cleaned up ${staleCount} stale download(s)`);
    }

    return staleCount;
  }

  return {
    markAvailableModels,
    markMissingModels,
    cleanupStaleDownloads,
  };
}

module.exports = { createSyncHelpers };
