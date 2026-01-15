/**
 * Audit Logging Middleware
 * Automatically logs all API requests to the api_audit_logs table
 */

const db = require('../database');
const logger = require('../utils/logger');

// Endpoints to exclude from audit logging (high-frequency, low-value)
const EXCLUDED_ENDPOINTS = [
    '/api/health',
    '/api/metrics/live',
    '/api/metrics/live-stream'
];

// Sensitive fields to mask in request payloads
const SENSITIVE_FIELDS = [
    'password',
    'currentPassword',
    'newPassword',
    'current_password',
    'new_password',
    'token',
    'api_key',
    'apiKey',
    'secret',
    'bot_token',
    'authorization',
    'jwt',
    'bearer',
    'credential',
    'private_key',
    'privateKey'
];

/**
 * Mask sensitive data in an object recursively
 * @param {Object} obj - Object to mask
 * @returns {Object} Object with sensitive fields masked
 */
function maskSensitiveData(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => maskSensitiveData(item));
    }

    const masked = {};
    for (const [key, value] of Object.entries(obj)) {
        const keyLower = key.toLowerCase();

        // Check if this key is sensitive
        const isSensitive = SENSITIVE_FIELDS.some(field =>
            keyLower.includes(field.toLowerCase())
        );

        // Only mask primitive values (strings, numbers), not objects/arrays
        if (isSensitive && value !== undefined && value !== null && typeof value !== 'object') {
            masked[key] = '***REDACTED***';
        } else if (typeof value === 'object' && value !== null) {
            masked[key] = maskSensitiveData(value);
        } else {
            masked[key] = value;
        }
    }
    return masked;
}

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
    // Trust X-Forwarded-For header if behind a proxy (Traefik)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        // Take the first IP in the chain (original client)
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Write audit log entry to database asynchronously
 * @param {Object} logEntry - Audit log entry data
 */
async function writeAuditLog(logEntry) {
    try {
        await db.query(`
            INSERT INTO api_audit_logs (
                user_id,
                username,
                action_type,
                target_endpoint,
                request_method,
                request_payload,
                response_status,
                duration_ms,
                ip_address,
                user_agent,
                error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
            logEntry.user_id,
            logEntry.username,
            logEntry.action_type,
            logEntry.target_endpoint,
            logEntry.request_method,
            JSON.stringify(logEntry.request_payload),
            logEntry.response_status,
            logEntry.duration_ms,
            logEntry.ip_address,
            logEntry.user_agent,
            logEntry.error_message
        ]);
    } catch (error) {
        // Log error but don't fail the request
        logger.error(`Failed to write audit log: ${error.message}`, {
            endpoint: logEntry.target_endpoint,
            error: error.message
        });
    }
}

/**
 * Audit middleware factory
 * Creates middleware that logs all API requests
 * @returns {Function} Express middleware function
 */
function createAuditMiddleware() {
    return (req, res, next) => {
        // Skip excluded endpoints
        if (EXCLUDED_ENDPOINTS.some(ep => req.path.startsWith(ep))) {
            return next();
        }

        // Only audit /api/* requests
        if (!req.path.startsWith('/api/')) {
            return next();
        }

        const startTime = Date.now();

        // Capture original end method to intercept response
        const originalEnd = res.end;
        let responseEnded = false;

        res.end = function(chunk, encoding) {
            // Prevent double logging
            if (responseEnded) {
                return originalEnd.call(this, chunk, encoding);
            }
            responseEnded = true;

            const duration = Date.now() - startTime;

            // Build audit log entry
            const logEntry = {
                user_id: req.user?.id || null,
                username: req.user?.username || null,
                action_type: req.method,
                target_endpoint: req.originalUrl || req.path,
                request_method: req.method,
                request_payload: maskSensitiveData(req.body || {}),
                response_status: res.statusCode,
                duration_ms: duration,
                ip_address: getClientIP(req),
                user_agent: req.headers['user-agent'] || null,
                error_message: res.statusCode >= 400 ? (res.statusMessage || null) : null
            };

            // Write audit log asynchronously (don't block response)
            writeAuditLog(logEntry);

            // Call original end
            return originalEnd.call(this, chunk, encoding);
        };

        next();
    };
}

// Export for testing
module.exports = {
    createAuditMiddleware,
    maskSensitiveData,
    getClientIP,
    writeAuditLog,
    EXCLUDED_ENDPOINTS,
    SENSITIVE_FIELDS
};
