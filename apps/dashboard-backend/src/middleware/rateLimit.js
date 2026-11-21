/**
 * Rate Limiting Middleware
 * Protects endpoints from abuse
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Check if rate limiting is disabled (for testing)
 */
const isRateLimitDisabled = () => process.env.RATE_LIMIT_ENABLED === 'false';

/**
 * Factory for creating rate limiters with consistent defaults.
 * @param {string} name - Identifier used in log messages (e.g. "Login", "API")
 * @param {number} windowMs - Time window in milliseconds
 * @param {number} max - Max requests per window
 * @param {string} errorMessage - Error message returned in the 429 response
 * @param {object} [extraOptions] - Additional express-rate-limit options to merge
 */
function createLimiter(name, windowMs, max, errorMessage, extraOptions = {}) {
  const buildEnvelope = () => ({
    error: { code: 'RATE_LIMITED', message: errorMessage },
    timestamp: new Date().toISOString(),
  });
  return rateLimit({
    windowMs,
    max,
    skip: isRateLimitDisabled,
    message: buildEnvelope(),
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false }, // Suppress trust proxy warning (behind Traefik)
    handler: (req, res) => {
      logger.warn(`${name} rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json(buildEnvelope());
    },
    ...extraOptions,
  });
}

/**
 * Die Anmeldedrossel: 30 FEHLVERSUCHE je Viertelstunde und IP (Phase H7).
 *
 * WARUM SIE BIS H7 ZEHN ANMELDUNGEN ZAEHLTE UND WARUM DAS FALSCH WAR. Hinter
 * Traefik ist jede Anfrage dieselbe IP -- ein Buero hinter einer NAT-Adresse
 * ist EIN Zaehler fuer alle. Zehn je Viertelstunde hiess: der elfte Mensch,
 * der morgens um acht sein Passwort richtig eintippt, kommt nicht herein. Und
 * die Abnahmen dieses Repos sassen mit ihren zehn genau auf der Decke: drei
 * Laeufe der Oberflaechen-Reihe kosten sechs, daneben melden sich Ueberordner
 * und Rueckbau an, und ein Lauf wurde rot, weil ein anderer gerade fertig war.
 *
 * `skipSuccessfulRequests` ist die eigentliche Aenderung, nicht die Zahl: EINE
 * GELUNGENE ANMELDUNG IST KEIN ANGRIFF. express-rate-limit zaehlt zuerst hoch
 * und nimmt den Zaehler zurueck, sobald die Antwort unter 400 liegt; gezaehlt
 * bleibt damit genau das, wonach ein Angreifer aussieht -- eine Reihe von
 * Fehlschlaegen.
 *
 * DIE SCHARFE SPERRE STEHT WOANDERS, und sie weiss mehr als diese hier: fuenf
 * Fehlversuche JE KONTO sperren es fuenfzehn Minuten
 * (`services/postgres/init/002_auth_schema.sql`, `record_login_attempt`). Sie
 * kennt den Namen, den jemand zu raten versucht; diese Drossel kennt nur eine
 * IP, hinter der ein ganzes Haus sitzt. Ihre Aufgabe ist deshalb die andere:
 * ein Sprayen ueber VIELE Konten bremsen, das der Kontosperre je einzeln nie
 * auffiele. Dreissig Fehlschlaege je Viertelstunde und IP sind dafuer eng --
 * es sind sechs gesperrte Konten in der Zeit, in der eines gesperrt bleibt.
 */
const loginLimiter = createLimiter(
  'Login',
  15 * 60 * 1000,
  30,
  'Too many failed login attempts from this IP, please try again after 15 minutes',
  { skipSuccessfulRequests: true }
);

/**
 * Speicher der Drosseln je Person, ein Eintrag je ZWECK UND PERSON.
 *
 * Bis zum 21.11.2026 war der Schluessel nur die Person: alle Drosseln, die
 * `createUserRateLimiter` baute, schrieben in DENSELBEN Eintrag. Wer dreimal
 * etwas Gedrosseltes tat (drei Rueckmeldungen, drei Vorschauen des
 * Werksresets), sah danach 15 Minuten lang beim Passwortwechsel ein 429, weil
 * dessen Drossel bei drei Eintraegen zumacht. Gefunden von den Workern am
 * 20.11.2026 (Jet-PR 942). Jetzt zaehlt jeder Zweck fuer sich; zwei Routen
 * mit demselben Zweck (der Passwortwechsel steht unter /auth und unter
 * /settings) teilen sich mit Absicht einen Zaehler.
 */
const userRateLimitStore = new Map();
const USER_TIMEOUT = 60 * 60 * 1000; // 1 hour - remove user data if no activity

/**
 * Drossel je angemeldeter Person.
 *
 * @param {number} maxRequests - so viele Aufrufe je Fenster
 * @param {number} windowMs - Fenster in Millisekunden
 * @param {string} zweck - wofuer gezaehlt wird, etwa 'passwort'; Pflicht.
 *   Jeder Zweck hat seinen eigenen Zaehler je Person.
 */
function createUserRateLimiter(maxRequests, windowMs, zweck) {
  if (typeof zweck !== 'string' || zweck.trim() === '') {
    // Beim Laden des Moduls, nicht in einer Anfrage: ohne Zweck fiele die
    // Drossel wieder in einen gemeinsamen Topf, und genau das war der Fehler.
    throw new TypeError('createUserRateLimiter braucht einen Zweck (dritter Wert).');
  }
  return async (req, res, next) => {
    // Skip if rate limiting is disabled (for testing)
    if (isRateLimitDisabled()) {
      return next();
    }

    if (!req.user) {
      return next();
    }

    const schluessel = `${zweck}:${req.user.id}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!userRateLimitStore.has(schluessel)) {
      userRateLimitStore.set(schluessel, { requests: [], lastUsed: now });
    }

    const userData = userRateLimitStore.get(schluessel);
    userData.lastUsed = now;

    // Remove old requests outside window
    const recentRequests = userData.requests.filter(timestamp => timestamp > windowStart);
    userData.requests = recentRequests;

    // Check if limit exceeded
    if (recentRequests.length >= maxRequests) {
      logger.warn(`User rate limit (${zweck}) exceeded for user: ${req.user.username}`);
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Zu viele Anfragen, bitte später noch einmal.' },
        timestamp: new Date().toISOString(),
      });
    }

    // Add current request
    recentRequests.push(now);

    next();
  };
}

/**
 * BUG-003 FIX: Cleanup old rate limit data periodically to prevent memory leak
 */
const rateLimitCleanupInterval = setInterval(
  () => {
    const now = Date.now();

    // BH7 FIX: Collect keys first, then delete — avoids Map iteration race
    const keysToDelete = [];
    for (const [schluessel, userData] of userRateLimitStore.entries()) {
      if (now - userData.lastUsed > USER_TIMEOUT) {
        keysToDelete.push(schluessel);
      }
    }
    keysToDelete.forEach(key => userRateLimitStore.delete(key));

    if (keysToDelete.length > 0) {
      logger.info(`Rate limit cleanup: removed ${keysToDelete.length} inactive user entries`);
    }
    logger.debug(`Rate limit store size: ${userRateLimitStore.size} Einträge (Zweck und Person)`);
  },
  60 * 60 * 1000
); // Every hour
// Background housekeeping timer must not keep the process / Jest worker alive.
rateLimitCleanupInterval.unref();

/**
 * General auth rate limiter - 30 requests per minute per IP.
 *
 * Since 28.08.2026 it guards exactly one route, POST /api/auth/logout: a
 * mutation, asked once when a person leaves. The two probes that every page
 * load makes sit on `probeLimiter`; the reason is written there.
 */
const generalAuthLimiter = createLimiter(
  'GeneralAuth',
  60 * 1000,
  30,
  'Zu viele Anfragen, bitte später noch einmal.'
);

/**
 * Probe rate limiter - 120 requests per minute per IP, for BOTH probes that
 * every page load makes: GET /api/auth/session and GET /api/auth/needs-setup.
 *
 * Plan 023 C3 moved the session probe off generalAuthLimiter with this
 * argument: the probe is asked on every page load, several people in one
 * office share one IP behind NAT, and 30 a minute for the whole group would
 * answer 429 to a probe whose whole purpose is to be asked often. The argument
 * was right and applied to only half of its subject. `needs-setup` is the
 * other half -- App.tsx asks it on every page load too, it is a public read
 * that answers a constant `false` once the box has an admin, and it stayed on
 * the 30-a-minute limiter that exists to slow down guessing at auth endpoints.
 *
 * MEASURED on the Orin, 28.08.2026: one run of `oberflaeche-abnahme.mjs` makes
 * 44 page loads in 129 s and peaks at 22 of 30 in its busiest minute -- 73 %
 * of the ceiling, with nothing left over for a second client on the same IP.
 * The session probe peaked at 21 of 120 in the same run. The binding limit was
 * never the one the abnahmen were told to watch; it was this one, and a run
 * next to anything else went red on `POST /api/auth/logout` (which shares the
 * window) or on the page load behind it.
 *
 * So both probes live here now, and generalAuthLimiter guards what it was
 * meant for: a mutation. A page load costs TWO of the 120 -- sixty page loads
 * a minute from one office IP -- and the ceiling stays where it is, because it
 * is against abuse and not against use.
 */
const probeLimiter = createLimiter(
  'Probe',
  60 * 1000,
  120,
  'Zu viele Anfragen, bitte später noch einmal.'
);

/** Tailscale rate limiter - 5 requests per minute (install/connect are heavy) */
const tailscaleLimiter = createLimiter(
  'Tailscale',
  60 * 1000,
  5,
  'Zu viele Tailscale-Anfragen, bitte kurz warten'
);

/** Upload rate limiter - 20 uploads per minute per IP */
const uploadLimiter = createLimiter('Upload', 60 * 1000, 20, 'Zu viele Uploads, bitte kurz warten');

module.exports = {
  loginLimiter,
  generalAuthLimiter,
  probeLimiter,
  tailscaleLimiter,
  uploadLimiter,
  createUserRateLimiter,
};
