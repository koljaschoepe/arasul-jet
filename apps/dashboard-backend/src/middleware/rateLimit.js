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
  return rateLimit({
    windowMs,
    max,
    skip: isRateLimitDisabled,
    message: { error: errorMessage, timestamp: new Date().toISOString() },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false }, // Suppress trust proxy warning (behind Traefik)
    handler: (req, res) => {
      logger.warn(`${name} rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    },
    ...extraOptions,
  });
}

/** Login rate limiter - 30 attempts per 5 minutes per IP */
const loginLimiter = createLimiter(
  'Login',
  5 * 60 * 1000,
  30,
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

/** n8n Webhook rate limiter - 100 requests per minute */
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
        error: 'Too many requests, please try again later',
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
setInterval(
  () => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, userData] of userRateLimitStore.entries()) {
      // Remove users with no activity in the last hour
      if (now - userData.lastUsed > USER_TIMEOUT) {
        userRateLimitStore.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Rate limit cleanup: removed ${cleanedCount} inactive user entries`);
    }
    logger.debug(`Rate limit store size: ${userRateLimitStore.size} users`);
  },
  60 * 60 * 1000
); // Every hour

module.exports = {
  loginLimiter,
  apiLimiter,
  llmLimiter,
  metricsLimiter,
  webhookLimiter,
  createUserRateLimiter,
};
