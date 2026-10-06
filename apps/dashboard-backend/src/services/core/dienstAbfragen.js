/**
 * Fuer `routes/system/services.js`: der Neustart eines Containers samt
 * Eintrag in `self_healing_events`.
 *
 * Aus der Route hierher gezogen (M5, Auftrag jet-fehlerklassen): Routen
 * fangen keine Fehler. Die Antworten und Statuscodes sind dieselben wie
 * vorher.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const dockerService = require('./docker');
const { ServiceUnavailableError } = require('../../utils/errors');

/** Einen Neustart in `self_healing_events` festhalten, Best-Effort. */
async function neustartFesthalten({ serviceName, username, userId }, success, fehler, dauer) {
  try {
    await db.query(
      `INSERT INTO self_healing_events
             (event_type, service_name, action_taken, details, success, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        'manual_restart',
        serviceName,
        'container_restart',
        JSON.stringify({
          initiated_by: username,
          user_id: userId,
          ...(dauer && { duration_ms: dauer }),
          ...(fehler && { error: fehler }),
          source: 'dashboard_api',
        }),
        success,
      ]
    );
  } catch (dbError) {
    logger.error(`Failed to log restart event to database: ${dbError.message}`);
  }
}

/**
 * Einen Container neu starten, hoechstens 30 Sekunden warten und das Ergebnis
 * festhalten.
 *
 * @returns {Promise<{success: boolean, duration: number}>}
 * @throws {ServiceUnavailableError} bei Zeitueberschreitung oder Fehler
 */
async function neuStarten({ serviceName, username, userId }) {
  const wer = { serviceName, username, userId };
  const startTime = Date.now();
  let success;
  try {
    success = await Promise.race([
      dockerService.restartContainer(serviceName),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Restart timeout')), 30000);
      }),
    ]);
  } catch (error) {
    const errorMsg =
      error.message === 'Restart timeout'
        ? 'Service restart timed out after 30 seconds'
        : `Error restarting service: ${error.message}`;
    await neustartFesthalten(wer, false, error.message);
    throw new ServiceUnavailableError(errorMsg);
  }

  const duration = Date.now() - startTime;
  if (success) {
    await neustartFesthalten(wer, true, null, duration);
  } else {
    await neustartFesthalten(wer, false, 'Restart returned false');
  }
  return { success, duration };
}

module.exports = {
  neuStarten,
};
