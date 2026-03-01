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
 * PHASE1-FIX (HIGH-B02): Improved error handling with separate try-catch blocks
 */
async function requireAuth(req, res, next) {
  let token = null;

  // Get token from Authorization header first
  const authHeader = req.headers.authorization;

  if (authHeader) {
    // Check if format is "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  // Fallback to cookie for LAN access support
  if (!token && req.cookies && req.cookies.arasul_session) {
    token = req.cookies.arasul_session;
  }

  if (!token) {
    return res.status(401).json({
      error: 'No authentication token provided',
      timestamp: new Date().toISOString(),
    });
  }

  // PHASE1-FIX: Separate try-catch for token verification vs database operations
  let decoded;
  try {
    decoded = await verifyToken(token);
  } catch (tokenError) {
    logger.debug(`Token verification failed: ${tokenError.message}`);

    if (tokenError.message === 'Token expired') {
      return res.status(401).json({
        error: 'Token expired',
        timestamp: new Date().toISOString(),
      });
    } else if (tokenError.message === 'Invalid token') {
      return res.status(401).json({
        error: 'Invalid token',
        timestamp: new Date().toISOString(),
      });
    } else if (tokenError.message === 'Token is blacklisted') {
      return res.status(401).json({
        error: 'Token has been revoked',
        timestamp: new Date().toISOString(),
      });
    } else {
      return res.status(401).json({
        error: 'Authentication failed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // PHASE1-FIX: Separate try-catch for database query with explicit error handling
  let result;
  try {
    result = await db.query(
      'SELECT id, username, email, is_active FROM admin_users WHERE id = $1',
      [decoded.userId]
    );
  } catch (dbError) {
    // Log database errors as they indicate infrastructure issues
    logger.error(`Auth middleware database error: ${dbError.message}`, {
      userId: decoded.userId,
      stack: dbError.stack,
    });
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      timestamp: new Date().toISOString(),
    });
  }

  if (result.rows.length === 0) {
    return res.status(401).json({
      error: 'User not found',
      timestamp: new Date().toISOString(),
    });
  }

  const user = result.rows[0];

  if (!user.is_active) {
    return res.status(403).json({
      error: 'User account is disabled',
      timestamp: new Date().toISOString(),
    });
  }

  // Attach user and token info to request
  req.user = user;
  req.tokenData = decoded;

  next();
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't require it
 * PHASE1-FIX (HIGH-B02): Improved error handling - only silence expected errors
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return next();
  }

  const token = parts[1];

  // PHASE1-FIX: Separate try-catch for token vs database errors
  let decoded;
  try {
    decoded = await verifyToken(token);
  } catch (tokenError) {
    // Token errors are expected in optional auth - silently continue
    logger.debug(`Optional auth token validation failed: ${tokenError.message}`);
    return next();
  }

  // Database errors should be logged as they indicate infrastructure issues
  try {
    const result = await db.query(
      'SELECT id, username, email, is_active FROM admin_users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length > 0 && result.rows[0].is_active) {
      req.user = result.rows[0];
      req.tokenData = decoded;
    }
  } catch (dbError) {
    // Log database errors but don't block the request
    logger.warn(`Optional auth database error: ${dbError.message}`);
  }

  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
};
