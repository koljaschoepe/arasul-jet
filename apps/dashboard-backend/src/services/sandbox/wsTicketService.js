/**
 * Kurzlebige Einmal-Tickets für den WebSocket-Aufbau (2026-07-31).
 *
 * Problem: Die Browser-WebSocket-API kann KEINEN Authorization-Header setzen.
 * Die Terminal-WS hing deshalb allein am httpOnly-Cookie `arasul_session` —
 * während die restliche App über den Bearer-Token (localStorage) läuft. Läuft
 * das Cookie ab oder wird es bei LAN-IP/SameSite gar nicht erst gesetzt,
 * scheitert nur die WS, still ("HTTP Authentication failed").
 *
 * Lösung: Der Client holt sich über einen NORMAL authentifizierten HTTP-Aufruf
 * (Bearer, wie jeder andere) ein Ticket und hängt es an die WS-URL. Damit nutzt
 * die WS denselben Auth-Pfad wie alles andere; die Cookie-Abhängigkeit entfällt.
 *
 * Warum ein Ticket in der Query-String KEIN Log-Leck ist (anders als ein JWT):
 * es ist zufällig, an EINEN Nutzer gebunden, lebt nur Sekunden und ist nach dem
 * ersten Verbrauch tot. Selbst wenn es in einem Access-Log landet, ist es dort
 * längst wertlos.
 */

const crypto = require('crypto');

/** Gültigkeitsdauer eines Tickets ab Ausstellung. */
const TICKET_TTL_MS = 30_000;
/** Aufräum-Takt für abgelaufene, nie verbrauchte Tickets. */
const CLEANUP_MS = 60_000;

/** ticket → { userId, expiresAt } */
const tickets = new Map();

/**
 * Stellt ein Einmal-Ticket für einen Nutzer aus.
 * @param {number|string} userId
 * @returns {{ ticket: string, expiresInMs: number }}
 */
function issue(userId) {
  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(ticket, { userId, expiresAt: Date.now() + TICKET_TTL_MS });
  return { ticket, expiresInMs: TICKET_TTL_MS };
}

/**
 * Verbraucht ein Ticket (Einmal-Nutzung): liefert die userId und löscht es.
 * Abgelaufene oder unbekannte Tickets ergeben null.
 * @param {string} ticket
 * @returns {number|string|null}
 */
function consume(ticket) {
  if (!ticket || typeof ticket !== 'string') {
    return null;
  }
  const eintrag = tickets.get(ticket);
  if (!eintrag) {
    return null;
  }
  tickets.delete(ticket); // Einmal-Nutzung: sofort entwerten
  if (Date.now() > eintrag.expiresAt) {
    return null;
  }
  return eintrag.userId;
}

// Abgelaufene, nie verbrauchte Tickets periodisch wegräumen, damit die Map bei
// abgebrochenen Verbindungsversuchen nicht langsam wächst (5-Jahre-Betrieb).
const cleanup = setInterval(() => {
  const jetzt = Date.now();
  for (const [ticket, eintrag] of tickets) {
    if (jetzt > eintrag.expiresAt) {
      tickets.delete(ticket);
    }
  }
}, CLEANUP_MS);
cleanup.unref?.();

module.exports = { issue, consume, TICKET_TTL_MS, _tickets: tickets };
