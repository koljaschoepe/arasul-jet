/**
 * Authentication API routes
 * Handles login, logout, password changes, and session management
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const {
  generateToken,
  blacklistToken,
  blacklistAllUserTokens,
  getUserSessions,
} = require('../utils/jwt');
const { verifyPassword, hashPassword, validatePasswordComplexity } = require('../utils/password');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, createUserRateLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} = require('../utils/errors');
const logger = require('../utils/logger');

// Rate limiter for password changes
const passwordChangeLimiter = createUserRateLimiter(3, 15 * 60 * 1000); // 3 per 15 minutes

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent') || 'unknown';

    // Validate input
    if (!username || !password) {
      throw new ValidationError('Username and password are required');
    }

    // Check if user is locked
    const lockCheck = await db.query('SELECT is_user_locked($1) as locked', [username]);

    if (lockCheck.rows[0].locked) {
      logger.warn(`Login attempt for locked account: ${username} from ${ipAddress}`);
      throw new ForbiddenError(
        'Account is temporarily locked due to too many failed login attempts'
      );
    }

    // Get user from database
    const result = await db.query(
      'SELECT id, username, password_hash, email, is_active FROM admin_users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      // Record failed attempt (even for non-existent users to prevent enumeration)
      await db.query('SELECT record_login_attempt($1, $2, $3, $4)', [
        username,
        ipAddress,
        false,
        userAgent,
      ]);

      logger.warn(`Login attempt for non-existent user: ${username} from ${ipAddress}`);

      throw new UnauthorizedError('Invalid username or password');
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      logger.warn(`Login attempt for inactive account: ${username} from ${ipAddress}`);
      throw new ForbiddenError('Account is disabled');
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);

    if (!passwordValid) {
      // Record failed attempt
      await db.query('SELECT record_login_attempt($1, $2, $3, $4)', [
        username,
        ipAddress,
        false,
        userAgent,
      ]);

      logger.warn(`Failed login attempt for user: ${username} from ${ipAddress}`);

      throw new UnauthorizedError('Invalid username or password');
    }

    // Record successful login
    await db.query('SELECT record_login_attempt($1, $2, $3, $4)', [
      username,
      ipAddress,
      true,
      userAgent,
    ]);

    // Generate JWT token
    const tokenData = await generateToken(user, ipAddress, userAgent);

    logger.info(`Successful login for user: ${username} from ${ipAddress}`);

    // Set HttpOnly cookie for LAN access support (session persists across IP/hostname changes)
    res.cookie('arasul_session', tokenData.token, {
      httpOnly: true,
      secure: false, // Allow HTTP for LAN access
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    res.json({
      success: true,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      expiresIn: tokenData.expiresIn,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/auth/logout
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Get token from header or cookie
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.arasul_session;

    // Blacklist the token
    if (token) {
      await blacklistToken(token);
    }

    // Clear session cookie
    res.clearCookie('arasul_session', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });

    logger.info(`User ${req.user.username} logged out`);

    res.json({
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/auth/logout-all
router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Blacklist all user tokens
    await blacklistAllUserTokens(req.user.id);

    logger.info(`User ${req.user.username} logged out from all sessions`);

    res.json({
      success: true,
      message: 'Logged out from all sessions successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/auth/change-password
router.post(
  '/change-password',
  requireAuth,
  passwordChangeLimiter,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const ipAddress = req.ip;

    // Validate input
    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }

    // Validate new password complexity
    const validation = validatePasswordComplexity(newPassword);
    if (!validation.valid) {
      throw new ValidationError(
        'Password does not meet complexity requirements',
        validation.errors
      );
    }

    // Get user's current password hash
    const result = await db.query('SELECT password_hash FROM admin_users WHERE id = $1', [
      req.user.id,
    ]);

    if (result.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    const user = result.rows[0];

    // Verify current password
    const passwordValid = await verifyPassword(currentPassword, user.password_hash);

    if (!passwordValid) {
      logger.warn(`Failed password change attempt for user: ${req.user.username}`);
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Check if new password is same as current
    const sameAsOld = await verifyPassword(newPassword, user.password_hash);
    if (sameAsOld) {
      throw new ValidationError('New password must be different from current password');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Use transaction for atomicity: password update + history record
    await db.transaction(async client => {
      // Update password
      await client.query(
        'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newPasswordHash, req.user.id]
      );

      // Record password change in history
      await client.query(
        `INSERT INTO password_history (user_id, password_hash, changed_by, ip_address)
             VALUES ($1, $2, $3, $4)`,
        [req.user.id, newPasswordHash, req.user.username, ipAddress]
      );
    });

    // Invalidate all existing sessions (force re-login) - outside transaction
    // since token blacklisting may use different storage
    await blacklistAllUserTokens(req.user.id);

    logger.info(`Password changed for user: ${req.user.username}`);

    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again with your new password.',
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/auth/me - Get current user info
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/auth/sessions - Get active sessions
router.get(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sessions = await getUserSessions(req.user.id);

    res.json({
      sessions: sessions.map(s => ({
        id: s.token_jti,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        lastActivity: s.last_activity,
        isCurrent: s.token_jti === req.tokenData.jti,
      })),
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/auth/verify - Forward Auth endpoint for Traefik
// Used to protect routes like n8n and Claude Code terminal
// Note: This endpoint intentionally returns 401 (not thrown errors) because
// Traefik forward-auth interprets non-2xx as "deny access"
router.get(
  '/verify',
  asyncHandler(async (req, res) => {
    const { verifyToken } = require('../utils/jwt');

    // Get token from cookie first, then Authorization header
    let token = null;

    if (req.cookies && req.cookies.arasul_session) {
      token = req.cookies.arasul_session;
    } else if (req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      // Case-insensitive Bearer check
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      logger.debug('Forward auth: No token provided');
      return res.status(401).send('No authentication token');
    }

    // Verify token
    let decoded;
    try {
      decoded = await verifyToken(token);
    } catch {
      logger.debug('Forward auth: Token verification failed');
      return res.status(401).send('Invalid token');
    }

    if (!decoded) {
      logger.debug('Forward auth: Token verification failed');
      return res.status(401).send('Invalid token');
    }

    // Get user info
    const result = await db.query(
      'SELECT id, username, email FROM admin_users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      logger.debug('Forward auth: User not found or inactive');
      return res.status(401).send('User not found');
    }

    const user = result.rows[0];

    // Set response headers with user info (for downstream services)
    res.set({
      'X-User-Id': user.id.toString(),
      'X-User-Name': user.username,
      'X-User-Email': user.email || '',
    });

    logger.debug(`Forward auth success for user: ${user.username}`);
    res.status(200).send('OK');
  })
);

module.exports = router;
