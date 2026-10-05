/**
 * Die Live-Werte fuer `GET /api/metrics/live`: zuerst vom Metrics-Collector,
 * und wenn der nicht antwortet, die letzten Werte aus der Datenbank.
 *
 * Aus `routes/system/metrics.js` hierher gezogen (M5, Auftrag
 * jet-fehlerklassen): Routen fangen keine Fehler.
 */

const axios = require('axios');
const db = require('../../database');
const logger = require('../../utils/logger');
const { ServiceUnavailableError } = require('../../utils/errors');
const services = require('../../config/services');

const METRICS_COLLECTOR_URL = services.metrics.url;

/**
 * @returns {Promise<object>} die Antwort des Collectors unveraendert, oder die
 *   Werte aus der Datenbank mit `source: 'database_fallback'`
 * @throws {ServiceUnavailableError} wenn auch die Datenbank nichts liefert
 */
async function holeLiveMetriken() {
  try {
    const response = await axios.get(`${METRICS_COLLECTOR_URL}/metrics`, { timeout: 1000 });
    return response.data;
  } catch (collectorError) {
    logger.warn(
      `Metrics collector unavailable, falling back to database: ${collectorError.message}`
    );
  }

  try {
    const result = await db.query(`
            SELECT
                (SELECT value FROM metrics_cpu ORDER BY timestamp DESC LIMIT 1) as cpu,
                (SELECT value FROM metrics_ram ORDER BY timestamp DESC LIMIT 1) as ram,
                (SELECT value FROM metrics_gpu ORDER BY timestamp DESC LIMIT 1) as gpu,
                (SELECT value FROM metrics_temperature ORDER BY timestamp DESC LIMIT 1) as temperature,
                (SELECT json_build_object(
                    'used', used,
                    'free', free,
                    'total', used + free,
                    'percent', percent
                ) FROM metrics_disk ORDER BY timestamp DESC LIMIT 1) as disk
        `);

    const data = result.rows[0];
    return {
      cpu: parseFloat(data.cpu) || 0,
      ram: parseFloat(data.ram) || 0,
      gpu: parseFloat(data.gpu) || 0,
      temperature: parseFloat(data.temperature) || 0,
      disk: data.disk || { used: 0, free: 0, total: 0, percent: 0 },
      timestamp: new Date().toISOString(),
      source: 'database_fallback',
    };
  } catch (dbError) {
    logger.error(`Database fallback also failed: ${dbError.message}`);
    throw new ServiceUnavailableError('Der Messwertdienst ist nicht erreichbar.');
  }
}

module.exports = { holeLiveMetriken };
