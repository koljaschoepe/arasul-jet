/**
 * JWT Token Management
 * Handles token generation, verification, and blacklisting
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const logger = require('./logger');

// SEC-006 FIX: Require JWT_SECRET to be set, no default fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET environment variable is not set');
  logger.error('The application cannot start without a secure JWT secret');
  logger.error('Set JWT_SECRET in /arasul/config/.env to a strong random value');
  process.exit(1);
}

const JWT_EXPIRY = process.env.JWT_EXPIRY || '4h';

// PERF: In-memory cache for verified tokens to avoid 3 DB queries per request
// Key: token JTI, Value: { decoded, expiresAt }
const verifiedTokenCache = new Map();
const TOKEN_CACHE_TTL = 60_000; // 60 seconds - balance between performance and security
const TOKEN_CACHE_MAX = 100; // Max cached tokens

// Activity update throttle: only update DB once per minute per session
const lastActivityUpdate = new Map();
const ACTIVITY_UPDATE_INTERVAL = 60_000; // 1 minute

/**
 * Invalidate a token from cache (called on logout/blacklist)
 */
function invalidateTokenCache(jti) {
  verifiedTokenCache.delete(jti);
  lastActivityUpdate.delete(jti);
}

/**
 * Generate JWT token for user
 */
async function generateToken(user, ipAddress, userAgent) {
  try {
    const jti = uuidv4(); // Unique token identifier

    const payload = {
      userId: user.id,
      username: user.username,
      jti: jti,
      type: 'access',
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: JWT_EXPIRY,
      issuer: 'arasul-platform',
      subject: user.id.toString(),
    });

    // Decode to get expiry time
    const decoded = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000);

    // Store active session
    await db.query(
      `INSERT INTO active_sessions (user_id, token_jti, ip_address, user_agent, expires_at)
             VALUES ($1, $2, $3, $4, $5)`,
      [user.id, jti, ipAddress, userAgent, expiresAt]
    );

    logger.info(`Token generated for user ${user.username} (JTI: ${jti})`);

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      expiresIn: JWT_EXPIRY,
    };
  } catch (error) {
    logger.error(`Error generating token: ${error.message}`);
    throw new Error('Token generation failed');
  }
}

/**
 * Verify JWT token
 * PERF: Uses in-memory cache to avoid 3 DB queries per request.
 * Cache entries expire after TOKEN_CACHE_TTL (60s).
 * Blacklisting invalidates the cache immediately.
 */
async function verifyToken(token) {
  try {
    // Verify signature and expiry (always - crypto check is fast)
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'arasul-platform',
    });

    // PERF: Check cache first
    const cached = verifiedTokenCache.get(decoded.jti);
    if (cached && Date.now() < cached.expiresAt) {
      // Throttled activity update - don't hit DB on every request
      const lastUpdate = lastActivityUpdate.get(decoded.jti) || 0;
      if (Date.now() - lastUpdate > ACTIVITY_UPDATE_INTERVAL) {
        lastActivityUpdate.set(decoded.jti, Date.now());
        // fire-and-forget: session activity update is non-critical, don't block the request
        db.query('SELECT update_session_activity($1)', [decoded.jti]).catch(() => {});
      }
      return cached.decoded;
    }

    // Cache miss or expired - do full DB verification
    const blacklistCheck = await db.query('SELECT id FROM token_blacklist WHERE token_jti = $1', [
      decoded.jti,
    ]);

    if (blacklistCheck.rows.length > 0) {
      verifiedTokenCache.delete(decoded.jti);
      throw new Error('Token is blacklisted');
    }

    const sessionCheck = await db.query(
      'SELECT id FROM active_sessions WHERE token_jti = $1 AND expires_at > NOW()',
      [decoded.jti]
    );

    if (sessionCheck.rows.length === 0) {
      verifiedTokenCache.delete(decoded.jti);
      throw new Error('Session not found or expired');
    }

    // BH9 FIX: Set timestamp before async DB call to prevent duplicate concurrent updates
    lastActivityUpdate.set(decoded.jti, Date.now());
    // fire-and-forget: session activity update is non-critical, consistent with cached path
    db.query('SELECT update_session_activity($1)', [decoded.jti]).catch(() => {});

    // Store in cache
    if (verifiedTokenCache.size >= TOKEN_CACHE_MAX) {
      // Evict oldest entry
      const firstKey = verifiedTokenCache.keys().next().value;
      verifiedTokenCache.delete(firstKey);
      lastActivityUpdate.delete(firstKey);
    }
    verifiedTokenCache.set(decoded.jti, {
      decoded,
      expiresAt: Date.now() + TOKEN_CACHE_TTL,
    });

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else {
      throw error;
    }
  }
}

/**
 * Blacklist token (logout)
 */
async function blacklistToken(token) {
  try {
    const decoded = jwt.decode(token);

    if (!decoded) {
      throw new Error('Invalid token format');
    }

    const expiresAt = new Date(decoded.exp * 1000);

    // Add to blacklist
    await db.query(
      `INSERT INTO token_blacklist (token_jti, user_id, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (token_jti) DO NOTHING`,
      [decoded.jti, decoded.userId, expiresAt]
    );

    // Remove active session
    await db.query('DELETE FROM active_sessions WHERE token_jti = $1', [decoded.jti]);

    // Invalidate cache immediately
    invalidateTokenCache(decoded.jti);

    logger.info(`Token blacklisted (JTI: ${decoded.jti})`);

    return true;
  } catch (error) {
    logger.error(`Error blacklisting token: ${error.message}`);
    throw new Error('Token blacklisting failed');
  }
}

/**
 * Blacklist all user tokens (logout all sessions)
 */
async function blacklistAllUserTokens(userId) {
  try {
    // Get all active sessions for user
    const sessions = await db.query(
      'SELECT token_jti, expires_at FROM active_sessions WHERE user_id = $1',
      [userId]
    );

    // Blacklist all tokens
    for (const session of sessions.rows) {
      await db.query(
        `INSERT INTO token_blacklist (token_jti, user_id, expires_at)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (token_jti) DO NOTHING`,
        [session.token_jti, userId, session.expires_at]
      );
    }

    // Delete all active sessions
    await db.query('DELETE FROM active_sessions WHERE user_id = $1', [userId]);

    // Invalidate all cached tokens for this user
    for (const session of sessions.rows) {
      invalidateTokenCache(session.token_jti);
    }

    logger.info(`All tokens blacklisted for user ${userId}`);

    return true;
  } catch (error) {
    logger.error(`Error blacklisting all user tokens: ${error.message}`);
    throw new Error('Mass token blacklisting failed');
  }
}

/**
 * Get active sessions for user
 */
async function getUserSessions(userId) {
  try {
    const result = await db.query(
      `SELECT
                token_jti,
                ip_address,
                user_agent,
                created_at,
                expires_at,
                last_activity
             FROM active_sessions
             WHERE user_id = $1 AND expires_at > NOW()
             ORDER BY last_activity DESC`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    logger.error(`Error getting user sessions: ${error.message}`);
    throw new Error('Failed to get user sessions');
  }
}

/**
 * Cleanup expired tokens and sessions
 */
async function cleanupExpiredAuth() {
  try {
    await db.query('SELECT cleanup_expired_auth_data()');
    logger.info('Expired auth data cleaned up');
  } catch (error) {
    logger.error(`Error cleaning up expired auth data: ${error.message}`);
  }
}

module.exports = {
  generateToken,
  verifyToken,
  blacklistToken,
  blacklistAllUserTokens,
  getUserSessions,
  cleanupExpiredAuth,
};
