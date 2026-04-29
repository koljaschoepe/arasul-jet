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

// Phase 5.3: Rate-limit windows are keyed by the stable numeric `api_keys.id`
// rather than the 12-char key prefix. Two distinct keys with a colliding
// prefix (8 random chars after `aras_`) would have shared a window before;
// they now get independent budgets. Counts reset on backend restart — for
// an edge appliance that's acceptable.
const rateLimitCache = new Map(); // Map<apiKeyId:number, { count, windowStart }>

// Janitor: prune entries whose window has fully expired so the map cannot
// grow unboundedly when many short-lived keys hit the API. Runs every
// minute and is a no-op when nothing is stale.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const _rateLimitJanitor = setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [id, usage] of rateLimitCache) {
    if (usage.windowStart < cutoff) {
      rateLimitCache.delete(id);
    }
  }
}, RATE_LIMIT_WINDOW_MS);
// Don't keep the event loop alive in test runs.
if (typeof _rateLimitJanitor.unref === 'function') {
  _rateLimitJanitor.unref();
}

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
    allowedEndpoints = [
      'llm:chat',
      'llm:status',
      'openai:chat',
      'openai:embeddings',
      'openai:models',
    ],
    expiresAt = null,
  } = options;

  // Generate random key: aras_ + 32 random hex chars
  const randomPart = crypto.randomBytes(16).toString('hex');
  const key = `aras_${randomPart}`;
  const keyPrefix = key.substring(0, 12); // aras_abc1234

  // Hash the key for storage
  const keyHash = await bcrypt.hash(key, 10);

  // Store in database
  const result = await database.query(
    `
        INSERT INTO api_keys (key_hash, key_prefix, name, description, created_by, rate_limit_per_minute, allowed_endpoints, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
    `,
    [
      keyHash,
      keyPrefix,
      name,
      description,
      createdBy,
      rateLimitPerMinute,
      allowedEndpoints,
      expiresAt,
    ]
  );

  logger.info(`API key created: ${keyPrefix}*** for "${name}"`);

  return {
    key, // Only returned once - store securely!
    keyPrefix,
    keyId: result.rows[0].id,
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
    const result = await database.query(
      `
            SELECT id, key_hash, name, rate_limit_per_minute, allowed_endpoints, expires_at, is_active, created_by
            FROM api_keys
            WHERE key_prefix = $1
        `,
      [keyPrefix]
    );

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
 * Check rate limit for API key.
 *
 * Phase 5.3: Keyed by numeric `api_keys.id` (stable, prefix-collision-free)
 * instead of the 12-char string prefix.
 *
 * @param {number} keyId - Stable api_keys.id
 * @param {number} limit - Requests per minute limit
 * @returns {{allowed: boolean, remaining: number, resetIn: number}}
 */
function checkRateLimit(keyId, limit) {
  const now = Date.now();
  const windowMs = RATE_LIMIT_WINDOW_MS;

  let usage = rateLimitCache.get(keyId);

  // Reset if window expired
  if (!usage || now - usage.windowStart > windowMs) {
    usage = { count: 0, windowStart: now };
    rateLimitCache.set(keyId, usage);
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
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key required. Use X-API-Key header.',
      },
      timestamp: new Date().toISOString(),
    });
  }

  const validation = await validateApiKey(apiKey);

  if (!validation.valid) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: validation.error },
      timestamp: new Date().toISOString(),
    });
  }

  const { keyData } = validation;
  const keyPrefix = apiKey.substring(0, 12);

  // Check rate limit (keyed by stable api_keys.id — Phase 5.3)
  const rateLimit = checkRateLimit(keyData.id, keyData.rate_limit_per_minute);

  res.setHeader('X-RateLimit-Limit', keyData.rate_limit_per_minute);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', rateLimit.resetIn);

  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
        details: { retryAfter: rateLimit.resetIn },
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Attach key data to request
  req.apiKey = {
    id: keyData.id,
    prefix: keyPrefix,
    name: keyData.name,
    userId: keyData.created_by,
    allowedEndpoints: keyData.allowed_endpoints,
  };

  next();
}

/**
 * Check if endpoint is allowed for API key
 *
 * Phase 5.4: Wildcard ('*') scopes are explicitly NOT honored. Legacy keys
 * created before the create-time refinement may still have '*' stored — they
 * are inert from the auth layer's perspective and need to be reissued with
 * an explicit endpoint list. Migration 085 flags affected keys.
 *
 * @param {string[]} allowedEndpoints - Array of allowed endpoint patterns
 * @param {string} endpoint - Endpoint to check (e.g., 'llm:chat')
 * @returns {boolean}
 */
function isEndpointAllowed(allowedEndpoints, endpoint) {
  return allowedEndpoints.includes(endpoint);
}

/**
 * Middleware factory to restrict endpoints
 * @param {string} endpoint - Endpoint identifier (e.g., 'llm:chat')
 */
function requireEndpoint(endpoint) {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'API key required' },
        timestamp: new Date().toISOString(),
      });
    }

    if (!isEndpointAllowed(req.apiKey.allowedEndpoints, endpoint)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access to '${endpoint}' not allowed for this API key`,
        },
        timestamp: new Date().toISOString(),
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
  checkRateLimit,
  // Test-only escape hatches: lets specs reset state between cases without
  // round-tripping through requireApiKey. Not part of any consumer contract.
  __rateLimitCache: rateLimitCache,
};
