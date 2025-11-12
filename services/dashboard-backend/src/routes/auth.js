/**
 * Authentication API routes
 * Handles login, logout, password changes, and session management
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const { generateToken, blacklistToken, blacklistAllUserTokens, getUserSessions } = require('../utils/jwt');
const { verifyPassword, hashPassword, validatePasswordComplexity } = require('../utils/password');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, createUserRateLimiter } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

// Rate limiter for password changes
const passwordChangeLimiter = createUserRateLimiter(3, 15 * 60 * 1000); // 3 per 15 minutes

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const ipAddress = req.ip;
        const userAgent = req.get('user-agent') || 'unknown';

        // Validate input
        if (!username || !password) {
            return res.status(400).json({
                error: 'Username and password are required',
                timestamp: new Date().toISOString()
            });
        }

        // Check if user is locked
        const lockCheck = await db.query(
            'SELECT is_user_locked($1) as locked',
            [username]
        );

        if (lockCheck.rows[0].locked) {
            logger.warn(`Login attempt for locked account: ${username} from ${ipAddress}`);
            return res.status(403).json({
                error: 'Account is temporarily locked due to too many failed login attempts',
                timestamp: new Date().toISOString()
            });
        }

        // Get user from database
        const result = await db.query(
            'SELECT id, username, password_hash, email, is_active FROM admin_users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            // Record failed attempt (even for non-existent users to prevent enumeration)
            await db.query(
                'SELECT record_login_attempt($1, $2, $3, $4)',
                [username, ipAddress, false, userAgent]
            );

            logger.warn(`Login attempt for non-existent user: ${username} from ${ipAddress}`);

            return res.status(401).json({
                error: 'Invalid username or password',
                timestamp: new Date().toISOString()
            });
        }

        const user = result.rows[0];

        // Check if user is active
        if (!user.is_active) {
            logger.warn(`Login attempt for inactive account: ${username} from ${ipAddress}`);
            return res.status(403).json({
                error: 'Account is disabled',
                timestamp: new Date().toISOString()
            });
        }

        // Verify password
        const passwordValid = await verifyPassword(password, user.password_hash);

        if (!passwordValid) {
            // Record failed attempt
            await db.query(
                'SELECT record_login_attempt($1, $2, $3, $4)',
                [username, ipAddress, false, userAgent]
            );

            logger.warn(`Failed login attempt for user: ${username} from ${ipAddress}`);

            return res.status(401).json({
                error: 'Invalid username or password',
                timestamp: new Date().toISOString()
            });
        }

        // Record successful login
        await db.query(
            'SELECT record_login_attempt($1, $2, $3, $4)',
            [username, ipAddress, true, userAgent]
        );

        // Generate JWT token
        const tokenData = await generateToken(user, ipAddress, userAgent);

        logger.info(`Successful login for user: ${username} from ${ipAddress}`);

        res.json({
            success: true,
            token: tokenData.token,
            expiresAt: tokenData.expiresAt,
            expiresIn: tokenData.expiresIn,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/auth/login: ${error.message}`);
        res.status(500).json({
            error: 'Login failed',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];

        // Blacklist the token
        await blacklistToken(token);

        logger.info(`User ${req.user.username} logged out`);

        res.json({
            success: true,
            message: 'Logged out successfully',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/auth/logout: ${error.message}`);
        res.status(500).json({
            error: 'Logout failed',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/auth/logout-all
router.post('/logout-all', requireAuth, async (req, res) => {
    try {
        // Blacklist all user tokens
        await blacklistAllUserTokens(req.user.id);

        logger.info(`User ${req.user.username} logged out from all sessions`);

        res.json({
            success: true,
            message: 'Logged out from all sessions successfully',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/auth/logout-all: ${error.message}`);
        res.status(500).json({
            error: 'Logout all failed',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, passwordChangeLimiter, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const ipAddress = req.ip;

        // Validate input
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                error: 'Current password and new password are required',
                timestamp: new Date().toISOString()
            });
        }

        // Validate new password complexity
        const validation = validatePasswordComplexity(newPassword);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Password does not meet complexity requirements',
                details: validation.errors,
                timestamp: new Date().toISOString()
            });
        }

        // Get user's current password hash
        const result = await db.query(
            'SELECT password_hash FROM admin_users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                timestamp: new Date().toISOString()
            });
        }

        const user = result.rows[0];

        // Verify current password
        const passwordValid = await verifyPassword(currentPassword, user.password_hash);

        if (!passwordValid) {
            logger.warn(`Failed password change attempt for user: ${req.user.username}`);
            return res.status(401).json({
                error: 'Current password is incorrect',
                timestamp: new Date().toISOString()
            });
        }

        // Check if new password is same as current
        const sameAsOld = await verifyPassword(newPassword, user.password_hash);
        if (sameAsOld) {
            return res.status(400).json({
                error: 'New password must be different from current password',
                timestamp: new Date().toISOString()
            });
        }

        // Hash new password
        const newPasswordHash = await hashPassword(newPassword);

        // Update password
        await db.query(
            'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newPasswordHash, req.user.id]
        );

        // Record password change in history
        await db.query(
            `INSERT INTO password_history (user_id, password_hash, changed_by, ip_address)
             VALUES ($1, $2, $3, $4)`,
            [req.user.id, newPasswordHash, req.user.username, ipAddress]
        );

        // Invalidate all existing sessions (force re-login)
        await blacklistAllUserTokens(req.user.id);

        logger.info(`Password changed for user: ${req.user.username}`);

        res.json({
            success: true,
            message: 'Password changed successfully. Please log in again with your new password.',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/auth/change-password: ${error.message}`);
        res.status(500).json({
            error: 'Password change failed',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/auth/me - Get current user info
router.get('/me', requireAuth, async (req, res) => {
    try {
        res.json({
            user: {
                id: req.user.id,
                username: req.user.username,
                email: req.user.email
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/auth/me: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get user info',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/auth/sessions - Get active sessions
router.get('/sessions', requireAuth, async (req, res) => {
    try {
        const sessions = await getUserSessions(req.user.id);

        res.json({
            sessions: sessions.map(s => ({
                id: s.token_jti,
                ipAddress: s.ip_address,
                userAgent: s.user_agent,
                createdAt: s.created_at,
                expiresAt: s.expires_at,
                lastActivity: s.last_activity,
                isCurrent: s.token_jti === req.tokenData.jti
            })),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/auth/sessions: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get sessions',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/auth/password-requirements
router.get('/password-requirements', (req, res) => {
    const { PASSWORD_REQUIREMENTS } = require('../utils/password');

    res.json({
        requirements: PASSWORD_REQUIREMENTS,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
