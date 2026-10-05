/**
 * Der Herzschlag des Self-Healing-Agenten fuer `GET /api/self-healing/status`.
 *
 * Aus `routes/admin/selfhealing.js` hierher gezogen (M5, Auftrag
 * jet-fehlerklassen): Routen fangen keine Fehler.
 */

const axios = require('axios');

/**
 * Best-Effort: ist der Agent nicht erreichbar, steht das in der Antwort
 * (`healthy: false` mit Grund) statt als Fehler der ganzen Seite.
 */
async function holeHeartbeat() {
  const port = process.env.SELF_HEALING_HEARTBEAT_PORT || 9200;
  try {
    const antwort = await axios.get(`http://self-healing-agent:${port}/health`, {
      timeout: 2000,
    });
    return antwort.data;
  } catch {
    return {
      healthy: false,
      seconds_since_heartbeat: null,
      check_count: 0,
      last_action: null,
      error: 'Der Herzschlag-Dienst ist nicht erreichbar.',
    };
  }
}

module.exports = { holeHeartbeat };
