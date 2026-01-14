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
 * Login rate limiter - 30 attempts per 5 minutes per IP
 * Balance security vs. usability for development/testing
 * Additional security: Database tracks failed attempts per user account
 */
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30,
    skip: isRateLimitDisabled,
    message: {
        error: 'Too many login attempts from this IP, please try again after 15 minutes',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false }, // Suppress trust proxy warning (behind Traefik)
    handler: (req, res) => {
        logger.warn(`Login rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'Too many login attempts from this IP, please try again after 15 minutes',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * API rate limiter - 100 requests per minute per IP
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    skip: isRateLimitDisabled,
    message: {
        error: 'Too many requests from this IP, please try again later',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false }, // Suppress trust proxy warning (behind Traefik)
    handler: (req, res) => {
        logger.warn(`API rate limit exceeded for IP: ${req.ip}, path: ${req.path}`);
        res.status(429).json({
            error: 'Too many requests from this IP, please try again later',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * LLM API rate limiter - 10 requests per second per IP
 */
const llmLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 10,
    skip: isRateLimitDisabled,
    message: {
        error: 'LLM request rate limit exceeded, please slow down',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false }, // Suppress trust proxy warning (behind Traefik)
    handler: (req, res) => {
        logger.warn(`LLM rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'LLM request rate limit exceeded, please slow down',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Metrics API rate limiter - 20 requests per second per IP
 */
const metricsLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 20,
    skip: isRateLimitDisabled,
    message: {
        error: 'Metrics request rate limit exceeded',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests (only errors)
    validate: { trustProxy: false }, // Suppress trust proxy warning (behind Traefik)
    handler: (req, res) => {
        logger.warn(`Metrics rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'Metrics request rate limit exceeded',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * n8n Webhook rate limiter - 100 requests per minute
 */
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    skip: isRateLimitDisabled,
    message: {
        error: 'Webhook rate limit exceeded',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false }, // Suppress trust proxy warning (behind Traefik)
    handler: (req, res) => {
        logger.warn(`Webhook rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'Webhook rate limit exceeded',
            timestamp: new Date().toISOString()
        });
    }
});

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
                timestamp: new Date().toISOString()
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
setInterval(() => {
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
}, 60 * 60 * 1000); // Every hour

module.exports = {
    loginLimiter,
    apiLimiter,
    llmLimiter,
    metricsLimiter,
    webhookLimiter,
    createUserRateLimiter
};
