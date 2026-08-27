/**
 * Settings API routes
 * Handles system settings including password management for the Dashboard
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { createUserRateLimiter } = require('../../middleware/rateLimit');
const { verifyPassword, validatePasswordComplexity } = require('../../utils/password');
const { changeDashboardPassword } = require('../../services/auth/passwordService');
const { updateEnvVariables, backupEnvFile, envZurueckrollen } = require('../../utils/envManager');
const db = require('../../database');
const logger = require('../../utils/logger');
const { logSecurityEvent } = require('../../utils/auditLog');
const { execFile } = require('child_process');
const util = require('util');
const { asyncHandler } = require('../../middleware/errorHandler');
const {
  ValidationError,
  UnauthorizedError,
  ServiceUnavailableError,
} = require('../../utils/errors');
const { blacklistAllUserTokens } = require('../../utils/jwt');
const { validateBody } = require('../../middleware/validate');
const { PasswordChangeBody } = require('../../schemas/admin-settings');

// SECURITY: Use execFile (not exec) to prevent shell injection
const execFilePromise = util.promisify(execFile);

// Whitelist of services allowed to be restarted (SECURITY: prevents command injection)
const ALLOWED_RESTART_SERVICES = [
  'llm-service',
  'embedding-service',
  'dashboard-backend',
  'dashboard-frontend',
  'document-indexer',
  'metrics-collector',
];

// Rate limiter for password changes (3 attempts per 15 minutes)
const passwordChangeLimiter = createUserRateLimiter(3, 15 * 60 * 1000);

/**
 * Verify current dashboard password for security
 */
async function verifyCurrentDashboardPassword(userId, currentPassword) {
  const result = await db.query('SELECT password_hash FROM admin_users WHERE id = $1', [userId]);

  if (result.rows.length === 0) {
    throw new UnauthorizedError('User not found');
  }

  const isValid = await verifyPassword(currentPassword, result.rows[0].password_hash);

  if (!isValid) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  return true;
}

/**
 * Restart a Docker Compose service
 * SECURITY: Only allows whitelisted services to prevent command injection
 */
async function restartService(serviceName) {
  // SECURITY: Validate service name against whitelist to prevent command injection
  if (!ALLOWED_RESTART_SERVICES.includes(serviceName)) {
    logger.error(`Attempted to restart non-whitelisted service: ${serviceName}`);
    throw new ValidationError(`Service '${serviceName}' is not allowed to be restarted`);
  }

  const composeDir = process.env.COMPOSE_PROJECT_DIR || '/opt/arasul';

  try {
    logger.info(`Restarting service: ${serviceName}`);

    // SECURITY: execFile with array arguments prevents shell injection
    // serviceName is validated against whitelist above
    const { stderr } = await execFilePromise('docker', ['compose', 'restart', serviceName], {
      cwd: composeDir,
      timeout: 60000,
    });

    if (stderr && !stderr.includes('Container')) {
      logger.warn(`Service restart warning: ${stderr}`);
    }

    logger.info(`Service ${serviceName} restarted successfully`);
    return true;
  } catch (error) {
    logger.error(`Failed to restart service ${serviceName}: ${error.message}`);
    throw new ServiceUnavailableError(`Failed to restart ${serviceName} service`);
  }
}

/**
 * POST /api/settings/password/dashboard
 * Change Dashboard admin password
 */
router.post(
  '/password/dashboard',
  requireAuth,
  requireRole('admin'),
  passwordChangeLimiter,
  validateBody(PasswordChangeBody),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Sicherung im Speicher, nicht auf der Platte. Warum, steht im Kopf von
    // `utils/envManager.js`: `.env` ist als einzelne Datei eingehaengt, eine
    // Nachbardatei kann dort nicht entstehen, und der Versuch liess jeden
    // Passwortwechsel mit HTTP 500 enden.
    const envVorher = await backupEnvFile();

    const newPasswordHash = await changeDashboardPassword(
      req.user.id,
      currentPassword,
      newPassword,
      {
        username: req.user.username,
        ipAddress: req.ip,
      }
    );

    // SECURITY FIX: Only store the hash, not the plaintext password
    // The hash is sufficient for authentication (DB is source of truth)
    try {
      await updateEnvVariables({
        ADMIN_HASH: newPasswordHash,
      });
    } catch (err) {
      // Die Datenbank ist die Quelle der Wahrheit, das Passwort ist also schon
      // gewechselt. Eine halb geschriebene `.env` waere trotzdem ein kaputtes
      // Geraet beim naechsten Start.
      await envZurueckrollen(envVorher);
      throw err;
    }

    // SEC-FIX: Invalidate all existing sessions after password change
    // Without this, old tokens remain valid even after password change
    await blacklistAllUserTokens(req.user.id);

    logSecurityEvent({
      userId: req.user.id,
      action: 'password_change',
      details: { target: 'dashboard' },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.json({
      success: true,
      message: 'Dashboard password changed successfully',
      requireRelogin: true,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/settings/password-requirements
 * Get password complexity requirements
 */
router.get(
  '/password-requirements',
  // No auth required — password rules are not sensitive and needed during setup
  asyncHandler(async (req, res) => {
    const { PASSWORD_REQUIREMENTS } = require('../../utils/password');

    res.json({
      requirements: PASSWORD_REQUIREMENTS,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
