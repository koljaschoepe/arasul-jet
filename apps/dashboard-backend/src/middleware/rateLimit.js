/**
 * Rate Limiting Middleware
 * Protects endpoints from abuse
 */

const rateLimit = require('express-rate-limit');
const db = require('../database');
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

/** Login rate limiter - 10 attempts per 15 minutes per IP */
const loginLimiter = createLimiter(
  'Login',
  15 * 60 * 1000,
  10,
  'Too many login attempts from this IP, please try again after 15 minutes'
);

/** API rate limiter - 100 requests per minute per IP */
const apiLimiter = createLimiter(
  'API',
  60 * 1000,
  100,
  'Too many requests from this IP, please try again later'
);

/** LLM API rate limiter - 10 requests per second per IP */
const llmLimiter = createLimiter(
  'LLM',
  1000,
  10,
  'LLM request rate limit exceeded, please slow down'
);

/** Metrics API rate limiter - 20 requests per second per IP */
const metricsLimiter = createLimiter('Metrics', 1000, 20, 'Metrics request rate limit exceeded', {
  skipSuccessfulRequests: true,
});

/** Webhook rate limiter (self-healing agent) - 100 requests per minute */
const webhookLimiter = createLimiter('Webhook', 60 * 1000, 100, 'Webhook rate limit exceeded');

/**
 * BUG-003 FIX: Global store for user rate limiters with automatic cleanup
 */
const userRateLimitStore = new Map();
const USER_TIMEOUT = 60 * 60 * 1000; // 1 hour - remove user data if no activity

/**
 * Custom rate limiter based on user account
 * Used for authenticated endpoints
 * BUG-003 FIX: Implemented proper cleanup to prevent memory leak
 */
function createUserRateLimiter(maxRequests, windowMs) {
  return async (req, res, next) => {
    // Skip if rate limiting is disabled (for testing)
    if (isRateLimitDisabled()) {
      return next();
    }

    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create user's request log with last activity timestamp
    if (!userRateLimitStore.has(userId)) {
      userRateLimitStore.set(userId, { requests: [], lastUsed: now });
    }

    const userData = userRateLimitStore.get(userId);
    userData.lastUsed = now;

    // Remove old requests outside window
    const recentRequests = userData.requests.filter(timestamp => timestamp > windowStart);
    userData.requests = recentRequests;

    // Check if limit exceeded
    if (recentRequests.length >= maxRequests) {
      logger.warn(`User rate limit exceeded for user: ${req.user.username}`);
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
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
    for (const [userId, userData] of userRateLimitStore.entries()) {
      if (now - userData.lastUsed > USER_TIMEOUT) {
        keysToDelete.push(userId);
      }
    }
    keysToDelete.forEach(key => userRateLimitStore.delete(key));

    if (keysToDelete.length > 0) {
      logger.info(`Rate limit cleanup: removed ${keysToDelete.length} inactive user entries`);
    }
    logger.debug(`Rate limit store size: ${userRateLimitStore.size} users`);
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
  'Too many requests, please try again later'
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
  'Too many requests, please try again later'
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
  apiLimiter,
  llmLimiter,
  metricsLimiter,
  webhookLimiter,
  generalAuthLimiter,
  probeLimiter,
  tailscaleLimiter,
  uploadLimiter,
  createUserRateLimiter,
};
