/**
 * Forward-Auth (`GET /api/auth/verify`) antwortet Traefik mit einer
 * schlichten 401 statt mit dem JSON-Umschlag des Fehlerbehandlers: jede
 * Antwort ausser 2xx heisst dort „abweisen". Darum braucht sie die Pruefung
 * des Tokens ohne Ausnahme.
 *
 * Aus `routes/auth.js` hierher gezogen (M5, Auftrag jet-fehlerklassen):
 * Routen fangen keine Fehler.
 */

const { verifyToken } = require('../../utils/jwt');

/**
 * Wie `verifyToken`, aber ungueltig, abgelaufen oder widerrufen ist `null`
 * statt einer Ausnahme.
 */
async function tokenOderNull(token) {
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

module.exports = { tokenOderNull };
