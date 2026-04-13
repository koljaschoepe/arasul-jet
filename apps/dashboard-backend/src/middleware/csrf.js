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
 * - Requests without session cookie (Bearer-only / programmatic clients)
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
 * Rotate the CSRF token by generating a new one and setting it as a cookie.
 * Used after successful state-changing requests for defense in depth.
 * @param {import('express').Response} res
 * @returns {string} The new token
 */
function rotateCsrfToken(res) {
  const newToken = crypto.randomBytes(32).toString('hex');
  const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_HTTPS === 'true';
  res.cookie(CSRF_COOKIE, newToken, {
    httpOnly: false,
    secure: isSecure,
    sameSite: isSecure ? 'strict' : 'lax',
    maxAge: 4 * 60 * 60 * 1000,
    path: '/',
  });
  return newToken;
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

  // If there's no session cookie, the request is using Bearer-only or API-key auth
  // (e.g. programmatic client). These are not vulnerable to CSRF because
  // cross-origin requests cannot set custom Authorization headers.
  if (!req.cookies || !req.cookies.arasul_session) {
    return next();
  }

  // Session cookie is present - enforce CSRF
  const cookieToken = req.cookies[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken) {
    logger.warn(`CSRF token missing - ${req.method} ${req.originalUrl} from ${req.ip}`);
    return next(new ForbiddenError('CSRF token missing'));
  }

  // Constant-time comparison to prevent timing attacks
  if (
    cookieToken.length !== headerToken.length ||
    !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    logger.warn(`CSRF token mismatch - ${req.method} ${req.originalUrl} from ${req.ip}`);
    return next(new ForbiddenError('CSRF token invalid'));
  }

  // BH10 FIX: Rotate CSRF token with error handling — don't block the request on failure
  if (!SAFE_METHODS.has(req.method)) {
    try {
      rotateCsrfToken(res);
    } catch (rotateErr) {
      logger.warn(`CSRF token rotation failed: ${rotateErr.message}`);
      res.setHeader('X-CSRF-Token-Rotated', 'false');
    }
  }

  next();
}

module.exports = {
  generateCsrfToken,
  rotateCsrfToken,
  csrfProtection,
  CSRF_COOKIE,
};
