/**
 * CSRF Protection Middleware
 * Double-submit cookie pattern: the server sets a non-HttpOnly cookie (arasul_csrf)
 * and the frontend reads it and sends it back as the X-CSRF-Token header.
 * An attacker's cross-origin request cannot read the cookie value, so they
 * cannot forge the header.
 *
 * Skipped for:
 * - Safe methods (GET, HEAD, OPTIONS)
 * - API key authenticated requests (no cookie-based session)
 * - Bearer-only requests (no session cookie present)
 */

const crypto = require('crypto');
const { ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

const CSRF_COOKIE = 'arasul_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Routes that are exempt from CSRF (login creates the token, so it can't require one)
const EXEMPT_PATHS = ['/api/auth/login'];

/**
 * Generate a cryptographically random CSRF token
 * @returns {string} 64-char hex token
 */
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF validation middleware
 * Place on /api routes after cookieParser
 */
function csrfProtection(req, res, next) {
  // Safe methods don't change state - skip
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Login endpoint is exempt - it creates the CSRF token
  if (EXEMPT_PATHS.includes(req.originalUrl || req.url)) {
    return next();
  }

  // API key requests are not cookie-based - skip
  // Check header directly so middleware works regardless of mount order
  if (req.headers['x-api-key']) {
    return next();
  }

  // If there's no session cookie, the request is using Bearer-only auth
  // (e.g. programmatic client). These are not vulnerable to CSRF.
  if (!req.cookies || !req.cookies.arasul_session) {
    return next();
  }

  // Session cookie is present - enforce CSRF
  const cookieToken = req.cookies[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken) {
    logger.warn(`CSRF token missing - ${req.method} ${req.originalUrl} from ${req.ip}`);
    throw new ForbiddenError('CSRF token missing');
  }

  // Constant-time comparison to prevent timing attacks
  if (
    cookieToken.length !== headerToken.length ||
    !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    logger.warn(`CSRF token mismatch - ${req.method} ${req.originalUrl} from ${req.ip}`);
    throw new ForbiddenError('CSRF token invalid');
  }

  next();
}

module.exports = {
  generateCsrfToken,
  csrfProtection,
  CSRF_COOKIE,
};
