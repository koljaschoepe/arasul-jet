/**
 * Authentication Middleware
 * Validates JWT tokens and protects routes
 */

const { verifyToken } = require('../utils/jwt');
const logger = require('../utils/logger');
const db = require('../database');

// PERF: Cache user lookups - userId → { user, expiresAt }
const userCache = new Map();
const USER_CACHE_TTL = 60_000; // 60 seconds
const USER_CACHE_MAX = 50;

/**
 * Der Schluessel des Zwischenspeichers, immer als Zeichenkette.
 *
 * Gefunden im Review zu Phase C2 (27.08.2026), vierter Fall derselben Falle:
 * `admin_users.id` ist BIGSERIAL, `node-postgres` liefert das als Zeichenkette,
 * und ueber den JWT bleibt sie eine (am Geraet nachgesehen: die Nutzlast traegt
 * `"userId": "1"`). Der Zwischenspeicher wird also mit `'1'` gefuellt. Ein
 * Aufrufer, der seine Kennung aus einem Pfadparameter hat, reicht dagegen die
 * ZAHL 1 herein -- `z.coerce.number()` in den Zod-Schemata macht daraus eine.
 *
 * `Map` vergleicht mit SameValueZero, also ist `delete(1)` auf einem Schluessel
 * `'1'` ein stiller Fehlschlag: kein Fehler, keine Wirkung. `setzeAktiv` hat
 * genau so aufgeraeumt und nichts aufgeraeumt.
 *
 * Deshalb liegt die Vereinheitlichung HIER, an der einen Stelle, der die `Map`
 * gehoert, und nicht bei jedem Aufrufer. Wer eine Kennung hat, darf sie
 * hereinreichen, wie er sie hat.
 */
const schluessel = userId => String(userId);

/**
 * Require authentication middleware
 * Validates JWT token from Authorization header
 * PHASE1-FIX (HIGH-B02): Improved error handling with separate try-catch blocks
 */
async function requireAuth(req, res, next) {
  let token = null;

  // Get token from Authorization header first
  const authHeader = req.headers.authorization;

  if (authHeader) {
    // Check if format is "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  // Fallback to cookie for LAN access support
  if (!token && req.cookies && req.cookies.arasul_session) {
    token = req.cookies.arasul_session;
  }

  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'No authentication token provided' },
      timestamp: new Date().toISOString(),
    });
  }

  // PHASE1-FIX: Separate try-catch for token verification vs database operations
  let decoded;
  try {
    decoded = await verifyToken(token);
  } catch (tokenError) {
    logger.debug(`Token verification failed: ${tokenError.message}`);

    // Dispatch on the typed error code (set by jwt.js typed errors). Falls back
    // to UNAUTHORIZED for any unrecognised code.
    const code = tokenError.code || 'UNAUTHORIZED';
    const known = ['TOKEN_EXPIRED', 'INVALID_TOKEN', 'TOKEN_REVOKED'];
    return res.status(401).json({
      error: {
        code: known.includes(code) ? code : 'UNAUTHORIZED',
        message: known.includes(code) ? tokenError.message : 'Authentication failed',
      },
      timestamp: new Date().toISOString(),
    });
  }

  // PERF: Check user cache first
  let user;
  const cached = userCache.get(schluessel(decoded.userId));
  if (cached && Date.now() < cached.expiresAt) {
    user = cached.user;
  } else {
    // Cache miss - query DB
    let result;
    try {
      result = await db.query(
        'SELECT id, username, email, role, is_active FROM admin_users WHERE id = $1',
        [decoded.userId]
      );
    } catch (dbError) {
      logger.error(`Auth middleware database error: ${dbError.message}`, {
        userId: decoded.userId,
        stack: dbError.stack,
      });
      return res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
        timestamp: new Date().toISOString(),
      });
    }

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'User not found' },
        timestamp: new Date().toISOString(),
      });
    }

    user = result.rows[0];

    // Store in cache (BE8: TTL-based eviction instead of FIFO)
    if (userCache.size >= USER_CACHE_MAX) {
      // First pass: remove all expired entries
      const now = Date.now();
      let evicted = false;
      for (const [key, entry] of userCache.entries()) {
        if (now >= entry.expiresAt) {
          userCache.delete(key);
          evicted = true;
        }
      }
      // If no expired entries found, evict the oldest by timestamp
      if (!evicted && userCache.size >= USER_CACHE_MAX) {
        let oldestKey = null;
        let oldestExpiry = Infinity;
        for (const [key, entry] of userCache.entries()) {
          if (entry.expiresAt < oldestExpiry) {
            oldestExpiry = entry.expiresAt;
            oldestKey = key;
          }
        }
        if (oldestKey) {
          userCache.delete(oldestKey);
        }
      }
    }
    userCache.set(schluessel(decoded.userId), { user, expiresAt: Date.now() + USER_CACHE_TTL });
  }

  if (!user.is_active) {
    userCache.delete(schluessel(decoded.userId));
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User account is disabled' },
      timestamp: new Date().toISOString(),
    });
  }

  // Attach user and token info to request
  req.user = user;
  req.tokenData = decoded;

  next();
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't require it
 * PHASE1-FIX (HIGH-B02): Improved error handling - only silence expected errors
 */
async function optionalAuth(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  // Fallback to cookie for LAN access support, same order as requireAuth above.
  // Plan 023 C3: this fallback was missing here, so a caller authenticated only
  // by the httpOnly `arasul_session` cookie (LAN access, forward-auth, a browser
  // whose localStorage was cleared by a privacy extension that cannot touch
  // httpOnly cookies) looked anonymous to every optionalAuth route. requireAuth
  // has had the fallback since day one; the two must not disagree about what
  // counts as a session.
  if (!token && req.cookies && req.cookies.arasul_session) {
    token = req.cookies.arasul_session;
  }

  if (!token) {
    return next();
  }

  // PHASE1-FIX: Separate try-catch for token vs database errors
  let decoded;
  try {
    decoded = await verifyToken(token);
  } catch (tokenError) {
    // Token errors are expected in optional auth - silently continue
    logger.debug(`Optional auth token validation failed: ${tokenError.message}`);
    return next();
  }

  // Database errors should be logged as they indicate infrastructure issues
  try {
    const result = await db.query(
      'SELECT id, username, email, role, is_active FROM admin_users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length > 0 && result.rows[0].is_active) {
      req.user = result.rows[0];
      req.tokenData = decoded;
    }
  } catch (dbError) {
    // Log database errors but don't block the request
    logger.warn(`Optional auth database error: ${dbError.message}`);
  }

  next();
}

/**
 * Die zwei Rollen des Geraets (Phase C1 des Umbaus vom 26.08.2026):
 * `admin` verwaltet Mitarbeiter, Apps, Freigaben, Modelle und den Betrieb;
 * `mitarbeiter` sieht seine freigegebenen Apps, Freigaben und eigenen
 * Flow-Laeufe. Migration 167 haelt `admin_users.role` auf genau diese zwei.
 */
const ROLLEN = Object.freeze(['admin', 'mitarbeiter']);

/**
 * Rollenpruefung. Kommt NACH requireAuth und laesst nur die genannten Rollen
 * durch; alles andere antwortet 403. Jede Route traegt sie ausdruecklich,
 * `scripts/test/rollenregeln.py` prueft das. Eine Route ohne Rollenpruefung
 * gibt es nur mit Grund in der Liste PUBLIC des Waechters.
 *
 *   requireRole('admin')                  nur der Administrator
 *   requireRole('admin', 'mitarbeiter')   ausdruecklich auch der Mitarbeiter
 */
function requireRole(...rollen) {
  const unbekannt = rollen.filter(r => !ROLLEN.includes(r));
  if (rollen.length === 0 || unbekannt.length > 0) {
    throw new TypeError(`requireRole: unbekannte Rolle ${unbekannt.join(', ') || '(keine)'}`);
  }
  return function rollenPruefung(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        timestamp: new Date().toISOString(),
      });
    }
    if (!rollen.includes(req.user.role)) {
      logger.warn(
        `Zugriff verweigert: ${req.method} ${req.originalUrl} fuer ${req.user.username} (Rolle ${req.user.role}, erlaubt ${rollen.join(', ')})`
      );
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Diese Funktion ist dem Administrator vorbehalten' },
        timestamp: new Date().toISOString(),
      });
    }
    next();
  };
}

/**
 * Invalidate a user's cached identity. Call this when the account is deleted or
 * disabled so a warm userCache entry cannot keep the user authenticated for up
 * to USER_CACHE_TTL (60s) after the DB row is gone.
 */
function invalidateUserCache(userId) {
  userCache.delete(schluessel(userId));
}

/**
 * Alle zwischengespeicherten Identitäten verwerfen. Gebraucht vom Werksreset
 * (Plan 023 B5), der die ganze Tabelle `admin_users` leert: ohne das käme jede
 * noch warme Zeile bis zu USER_CACHE_TTL (60 s) weiter durch `requireAuth`,
 * obwohl es in der Datenbank keinen Administrator mehr gibt. Genau das soll die
 * Stufe „Auslieferungszustand" ja gerade herstellen.
 */
function clearUserCache() {
  userCache.clear();
}

/**
 * Test-only: clear the per-user auth cache so a suite that authenticates as
 * different users under the same userId (e.g. admin vs non-admin) does not
 * leak a stale role between tests. Mirrors systemSettings._setForTest.
 */
const _clearUserCacheForTest = clearUserCache;

module.exports = {
  requireAuth,
  requireRole,
  ROLLEN,
  optionalAuth,
  invalidateUserCache,
  clearUserCache,
  _clearUserCacheForTest,
};
