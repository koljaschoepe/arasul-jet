/**
 * Rate Limiting Middleware
 * Protects endpoints from abuse
 */

const rateLimit = require('express-rate-limit');
const db = require('../database');
const logger = require('../utils/logger');

/**
 * Login rate limiter - 5 attempts per 15 minutes per IP
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: {
        error: 'Too many login attempts from this IP, please try again after 15 minutes',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
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
    message: {
        error: 'Too many requests from this IP, please try again later',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
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
    message: {
        error: 'LLM request rate limit exceeded, please slow down',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
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
    message: {
        error: 'Metrics request rate limit exceeded',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests (only errors)
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
    message: {
        error: 'Webhook rate limit exceeded',
        timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Webhook rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'Webhook rate limit exceeded',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Custom rate limiter based on user account
 * Used for authenticated endpoints
 */
function createUserRateLimiter(maxRequests, windowMs) {
    const store = new Map();

    return async (req, res, next) => {
        if (!req.user) {
            return next();
        }

        const userId = req.user.id;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Get or create user's request log
        if (!store.has(userId)) {
            store.set(userId, []);
        }

        const requests = store.get(userId);

        // Remove old requests outside window
        const recentRequests = requests.filter(timestamp => timestamp > windowStart);
        store.set(userId, recentRequests);

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
        store.set(userId, recentRequests);

        next();
    };
}

/**
 * Cleanup old rate limit data periodically
 */
setInterval(() => {
    logger.debug('Rate limit cleanup (no-op for express-rate-limit)');
}, 60 * 60 * 1000); // Every hour

module.exports = {
    loginLimiter,
    apiLimiter,
    llmLimiter,
    metricsLimiter,
    webhookLimiter,
    createUserRateLimiter
};
