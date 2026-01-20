/**
 * API Key Authentication Middleware
 * Provides authentication for external apps (n8n, workflows, etc.)
 *
 * API Key format: aras_<random32chars>
 * Header: X-API-Key: aras_abc12345...
 */

const bcrypt = require('bcrypt');
const database = require('../database');
const logger = require('../utils/logger');
const crypto = require('crypto');

// Cache for rate limiting (in-memory, resets on restart)
const rateLimitCache = new Map();

/**
 * Generate a new API key
 * @param {string} name - Key name/label
 * @param {string} description - Key description
 * @param {number} createdBy - User ID who created this key
 * @param {Object} options - Additional options
 * @returns {Promise<{key: string, keyPrefix: string, keyId: number}>}
 */
async function generateApiKey(name, description, createdBy, options = {}) {
    const {
        rateLimitPerMinute = 60,
        allowedEndpoints = ['llm:chat', 'llm:status'],
        expiresAt = null
    } = options;

    // Generate random key: aras_ + 32 random hex chars
    const randomPart = crypto.randomBytes(16).toString('hex');
    const key = `aras_${randomPart}`;
    const keyPrefix = key.substring(0, 12); // aras_abc1234

    // Hash the key for storage
    const keyHash = await bcrypt.hash(key, 10);

    // Store in database
    const result = await database.query(`
        INSERT INTO api_keys (key_hash, key_prefix, name, description, created_by, rate_limit_per_minute, allowed_endpoints, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
    `, [keyHash, keyPrefix, name, description, createdBy, rateLimitPerMinute, allowedEndpoints, expiresAt]);

    logger.info(`API key created: ${keyPrefix}*** for "${name}"`);

    return {
        key,  // Only returned once - store securely!
        keyPrefix,
        keyId: result.rows[0].id
    };
}

/**
 * Validate API key from request
 * @param {string} apiKey - Full API key from header
 * @returns {Promise<{valid: boolean, keyData?: Object, error?: string}>}
 */
async function validateApiKey(apiKey) {
    if (!apiKey || !apiKey.startsWith('aras_')) {
        return { valid: false, error: 'Invalid API key format' };
    }

    const keyPrefix = apiKey.substring(0, 12);

    try {
        // Get key data by prefix
        const result = await database.query(`
            SELECT id, key_hash, name, rate_limit_per_minute, allowed_endpoints, expires_at, is_active
            FROM api_keys
            WHERE key_prefix = $1
        `, [keyPrefix]);

        if (result.rows.length === 0) {
            return { valid: false, error: 'API key not found' };
        }

        const keyData = result.rows[0];

        // Check if active
        if (!keyData.is_active) {
            return { valid: false, error: 'API key is deactivated' };
        }

        // Check expiration
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            return { valid: false, error: 'API key has expired' };
        }

        // Verify hash
        const isValid = await bcrypt.compare(apiKey, keyData.key_hash);
        if (!isValid) {
            return { valid: false, error: 'Invalid API key' };
        }

        return { valid: true, keyData };

    } catch (err) {
        logger.error(`API key validation error: ${err.message}`);
        return { valid: false, error: 'Validation error' };
    }
}

/**
 * Check rate limit for API key
 * @param {string} keyPrefix - Key prefix for identification
 * @param {number} limit - Requests per minute limit
 * @returns {{allowed: boolean, remaining: number, resetIn: number}}
 */
function checkRateLimit(keyPrefix, limit) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window

    let usage = rateLimitCache.get(keyPrefix);

    // Reset if window expired
    if (!usage || now - usage.windowStart > windowMs) {
        usage = { count: 0, windowStart: now };
        rateLimitCache.set(keyPrefix, usage);
    }

    const remaining = Math.max(0, limit - usage.count);
    const resetIn = Math.ceil((usage.windowStart + windowMs - now) / 1000);

    if (usage.count >= limit) {
        return { allowed: false, remaining: 0, resetIn };
    }

    usage.count++;
    return { allowed: true, remaining: remaining - 1, resetIn };
}

/**
 * API Key authentication middleware
 * Use this instead of requireAuth for external app endpoints
 */
async function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            error: 'API key required. Use X-API-Key header.',
            timestamp: new Date().toISOString()
        });
    }

    const validation = await validateApiKey(apiKey);

    if (!validation.valid) {
        return res.status(401).json({
            error: validation.error,
            timestamp: new Date().toISOString()
        });
    }

    const { keyData } = validation;
    const keyPrefix = apiKey.substring(0, 12);

    // Check rate limit
    const rateLimit = checkRateLimit(keyPrefix, keyData.rate_limit_per_minute);

    res.setHeader('X-RateLimit-Limit', keyData.rate_limit_per_minute);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimit.resetIn);

    if (!rateLimit.allowed) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: rateLimit.resetIn,
            timestamp: new Date().toISOString()
        });
    }

    // Attach key data to request
    req.apiKey = {
        id: keyData.id,
        prefix: keyPrefix,
        name: keyData.name,
        allowedEndpoints: keyData.allowed_endpoints
    };

    next();
}

/**
 * Check if endpoint is allowed for API key
 * @param {string[]} allowedEndpoints - Array of allowed endpoint patterns
 * @param {string} endpoint - Endpoint to check (e.g., 'llm:chat')
 * @returns {boolean}
 */
function isEndpointAllowed(allowedEndpoints, endpoint) {
    return allowedEndpoints.includes(endpoint) || allowedEndpoints.includes('*');
}

/**
 * Middleware factory to restrict endpoints
 * @param {string} endpoint - Endpoint identifier (e.g., 'llm:chat')
 */
function requireEndpoint(endpoint) {
    return (req, res, next) => {
        if (!req.apiKey) {
            return res.status(401).json({ error: 'API key required' });
        }

        if (!isEndpointAllowed(req.apiKey.allowedEndpoints, endpoint)) {
            return res.status(403).json({
                error: `Access to '${endpoint}' not allowed for this API key`,
                timestamp: new Date().toISOString()
            });
        }

        next();
    };
}

module.exports = {
    generateApiKey,
    validateApiKey,
    requireApiKey,
    requireEndpoint,
    checkRateLimit
};
