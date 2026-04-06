/**
 * Datentabellen Re-index Service
 * Periodically re-indexes tables that have been modified since last indexing
 */

const logger = require('../../utils/logger');
const dataDb = require('../../dataDatabase');
const indexingService = require('./indexingService');

let intervalId = null;
let isProcessing = false;

/**
 * Initialize periodic re-indexing
 * @param {{ intervalMs?: number }} options
 */
function initialize({ intervalMs = 300000 } = {}) {
  if (intervalId) {
    clearInterval(intervalId);
  }

  intervalId = setInterval(() => processPendingTables(), intervalMs);
  logger.info(`[ReindexService] Started (interval: ${intervalMs / 1000}s)`);
}

/**
 * Process tables that need re-indexing (max 1 per cycle)
 */
async function processPendingTables() {
  if (!dataDb.isInitialized() || isProcessing) {return;}

  isProcessing = true;
  try {
    // Find one table that needs re-indexing (oldest first)
    const result = await dataDb.query(
      `SELECT slug, name FROM dt_tables
       WHERE needs_reindex = TRUE
       ORDER BY updated_at ASC
       LIMIT 1`
    );

    if (result.rows.length === 0) {return;}

    const { slug, name } = result.rows[0];
    const start = Date.now();

    logger.info(`[ReindexService] Re-indexing table "${name}" (${slug})...`);

    const { indexed } = await indexingService.indexTable(slug);
    const duration = ((Date.now() - start) / 1000).toFixed(1);

    logger.info(`[ReindexService] Re-indexed "${name}" (${indexed} rows, ${duration}s)`);
  } catch (err) {
    logger.error(`[ReindexService] Re-index failed: ${err.message}`);
  } finally {
    isProcessing = false;
  }
}

/**
 * Stop the service
 */
function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[ReindexService] Stopped');
  }
}

/**
 * Get the interval ID for cleanup tracking
 */
function getIntervalId() {
  return intervalId;
}

module.exports = {
  initialize,
  processPendingTables,
  stop,
  getIntervalId,
};
