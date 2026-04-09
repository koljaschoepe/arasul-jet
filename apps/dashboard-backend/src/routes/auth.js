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
const { verifyPassword } = require('../utils/password');
const { changeDashboardPassword } = require('../services/auth/passwordService');
const { requireAuth } = require('../middleware/auth');
const {
  loginLimiter,
  generalAuthLimiter,
  createUserRateLimiter,
} = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, UnauthorizedError, ForbiddenError } = require('../utils/errors');
const { generateCsrfToken, CSRF_COOKIE } = require('../middleware/csrf');
const logger = require('../utils/logger');
const { logSecurityEvent } = require('../utils/auditLog');

// Cookie security: enable secure flag in production or when explicitly forced
const isSecure =
  process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true';

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

    logSecurityEvent({
      userId: user.id,
      action: 'login',
      details: { username },
      ipAddress,
      requestId: req.headers['x-request-id'],
    });

    // Set HttpOnly cookie for LAN access support (session persists across IP/hostname changes)
    res.cookie('arasul_session', tokenData.token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'strict' : 'lax',
      maxAge: 4 * 60 * 60 * 1000, // 4 hours (matches JWT_EXPIRY)
      path: '/',
    });

    // Set CSRF cookie (readable by JS so frontend can send it as a header)
    const csrfToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false, // Must be readable by frontend JS
      secure: isSecure,
      sameSite: isSecure ? 'strict' : 'lax',
      maxAge: 4 * 60 * 60 * 1000, // 4 hours (matches session cookie)
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
  generalAuthLimiter,
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
      secure: isSecure,
      sameSite: isSecure ? 'strict' : 'lax',
      path: '/',
    });

    // Clear CSRF cookie
    res.clearCookie(CSRF_COOKIE, {
      httpOnly: false,
      secure: isSecure,
      sameSite: isSecure ? 'strict' : 'lax',
      path: '/',
    });

    logger.info(`User ${req.user.username} logged out`);

    logSecurityEvent({
      userId: req.user.id,
      action: 'logout',
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

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

    logSecurityEvent({
      userId: req.user.id,
      action: 'logout_all_sessions',
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

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

    await changeDashboardPassword(req.user.id, currentPassword, newPassword, {
      username: req.user.username,
      ipAddress: req.ip,
    });

    // Invalidate all existing sessions (force re-login) - outside transaction
    // since token blacklisting may use different storage
    await blacklistAllUserTokens(req.user.id);

    logSecurityEvent({
      userId: req.user.id,
      action: 'password_change',
      details: { method: 'dashboard' },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

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
