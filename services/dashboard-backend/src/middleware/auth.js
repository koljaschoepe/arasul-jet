/**
 * Authentication Middleware
 * Validates JWT tokens and protects routes
 */

const { verifyToken } = require('../utils/jwt');
const logger = require('../utils/logger');
const db = require('../database');

/**
 * Require authentication middleware
 * Validates JWT token from Authorization header
 */
async function requireAuth(req, res, next) {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                error: 'No authorization header provided',
                timestamp: new Date().toISOString()
            });
        }

        // Check if format is "Bearer <token>"
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({
                error: 'Invalid authorization header format. Expected: Bearer <token>',
                timestamp: new Date().toISOString()
            });
        }

        const token = parts[1];

        // Verify token
        const decoded = await verifyToken(token);

        // Get user from database
        const result = await db.query(
            'SELECT id, username, email, is_active FROM admin_users WHERE id = $1',
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: 'User not found',
                timestamp: new Date().toISOString()
            });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(403).json({
                error: 'User account is disabled',
                timestamp: new Date().toISOString()
            });
        }

        // Attach user and token info to request
        req.user = user;
        req.tokenData = decoded;

        next();

    } catch (error) {
        logger.error(`Auth middleware error: ${error.message}`);

        if (error.message === 'Token expired') {
            return res.status(401).json({
                error: 'Token expired',
                timestamp: new Date().toISOString()
            });
        } else if (error.message === 'Invalid token') {
            return res.status(401).json({
                error: 'Invalid token',
                timestamp: new Date().toISOString()
            });
        } else if (error.message === 'Token is blacklisted') {
            return res.status(401).json({
                error: 'Token has been revoked',
                timestamp: new Date().toISOString()
            });
        } else {
            return res.status(401).json({
                error: 'Authentication failed',
                timestamp: new Date().toISOString()
            });
        }
    }
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't require it
 */
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader) {
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                const token = parts[1];
                const decoded = await verifyToken(token);

                const result = await db.query(
                    'SELECT id, username, email, is_active FROM admin_users WHERE id = $1',
                    [decoded.userId]
                );

                if (result.rows.length > 0 && result.rows[0].is_active) {
                    req.user = result.rows[0];
                    req.tokenData = decoded;
                }
            }
        }

        next();

    } catch (error) {
        // Silently fail for optional auth
        logger.debug(`Optional auth failed: ${error.message}`);
        next();
    }
}

module.exports = {
    requireAuth,
    optionalAuth
};
