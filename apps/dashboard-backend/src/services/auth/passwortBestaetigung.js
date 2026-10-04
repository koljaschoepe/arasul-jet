/**
 * Ein schwerer Handgriff (Zurueckholen aus einer Sicherung, M5) verlangt das
 * Passwort des angemeldeten Menschen. Ein Fehlversuch steht im
 * Sicherheitsprotokoll -- das Passwort selbst nie.
 *
 * Aus `routes/admin/backup.js` hierher gezogen (M5, Auftrag
 * jet-fehlerklassen): Routen fangen keine Fehler.
 */

const { bestaetigePasswort } = require('./passwordService');
const { logSecurityEvent } = require('../../utils/auditLog');

/**
 * @param {object} p
 * @param {number} p.userId
 * @param {string} p.passwort
 * @param {string} p.action      Vorsatz fuer den Eintrag (`<action>_passwort_falsch`)
 * @param {string} [p.ipAddress]
 * @param {string} [p.requestId]
 */
async function bestaetigeMitProtokoll({ userId, passwort, action, ipAddress, requestId }) {
  try {
    await bestaetigePasswort(userId, passwort);
  } catch (fehler) {
    logSecurityEvent({
      userId,
      action: `${action}_passwort_falsch`,
      details: {},
      ipAddress,
      requestId,
    });
    throw fehler;
  }
}

module.exports = { bestaetigeMitProtokoll };
