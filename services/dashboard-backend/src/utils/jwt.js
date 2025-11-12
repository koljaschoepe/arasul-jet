/**
 * JWT Token Management
 * Handles token generation, verification, and blacklisting
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const logger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

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
            type: 'access'
        };

        const token = jwt.sign(payload, JWT_SECRET, {
            expiresIn: JWT_EXPIRY,
            issuer: 'arasul-platform',
            subject: user.id.toString()
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
            expiresIn: JWT_EXPIRY
        };

    } catch (error) {
        logger.error(`Error generating token: ${error.message}`);
        throw new Error('Token generation failed');
    }
}

/**
 * Verify JWT token
 */
async function verifyToken(token) {
    try {
        // Verify signature and expiry
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: 'arasul-platform'
        });

        // Check if token is blacklisted
        const blacklistCheck = await db.query(
            'SELECT id FROM token_blacklist WHERE token_jti = $1',
            [decoded.jti]
        );

        if (blacklistCheck.rows.length > 0) {
            throw new Error('Token is blacklisted');
        }

        // Check if session exists and is active
        const sessionCheck = await db.query(
            'SELECT id FROM active_sessions WHERE token_jti = $1 AND expires_at > NOW()',
            [decoded.jti]
        );

        if (sessionCheck.rows.length === 0) {
            throw new Error('Session not found or expired');
        }

        // Update session activity
        await db.query(
            'SELECT update_session_activity($1)',
            [decoded.jti]
        );

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
        await db.query(
            'DELETE FROM active_sessions WHERE token_jti = $1',
            [decoded.jti]
        );

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
        await db.query(
            'DELETE FROM active_sessions WHERE user_id = $1',
            [userId]
        );

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
    cleanupExpiredAuth
};
