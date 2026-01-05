/**
 * Settings API routes
 * Handles system settings including password management for Dashboard, MinIO, and n8n
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { createUserRateLimiter } = require('../middleware/rateLimit');
const { verifyPassword, hashPassword, validatePasswordComplexity } = require('../utils/password');
const { updateEnvVariables, backupEnvFile } = require('../utils/envManager');
const db = require('../database');
const logger = require('../utils/logger');
const { execFile } = require('child_process');
const util = require('util');

// SECURITY: Use execFile (not exec) to prevent shell injection
const execFilePromise = util.promisify(execFile);

// Whitelist of services allowed to be restarted (SECURITY: prevents command injection)
const ALLOWED_RESTART_SERVICES = [
    'minio',
    'n8n',
    'llm-service',
    'embedding-service',
    'dashboard-backend',
    'dashboard-frontend',
    'document-indexer',
    'metrics-collector'
];

// Rate limiter for password changes (3 attempts per 15 minutes)
const passwordChangeLimiter = createUserRateLimiter(3, 15 * 60 * 1000);

/**
 * Verify current dashboard password for security
 */
async function verifyCurrentDashboardPassword(userId, currentPassword) {
    const result = await db.query(
        'SELECT password_hash FROM admin_users WHERE id = $1',
        [userId]
    );

    if (result.rows.length === 0) {
        throw new Error('User not found');
    }

    const isValid = await verifyPassword(currentPassword, result.rows[0].password_hash);

    if (!isValid) {
        throw new Error('Current password is incorrect');
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
        throw new Error(`Service '${serviceName}' is not allowed to be restarted`);
    }

    const composeDir = process.env.COMPOSE_PROJECT_DIR || '/home/arasul/arasul/arasul-jet';

    try {
        logger.info(`Restarting service: ${serviceName}`);

        // SECURITY: execFile with array arguments prevents shell injection
        // serviceName is validated against whitelist above
        const { stdout, stderr } = await execFilePromise(
            'docker',
            ['compose', 'restart', serviceName],
            { cwd: composeDir, timeout: 60000 }
        );

        if (stderr && !stderr.includes('Container')) {
            logger.warn(`Service restart warning: ${stderr}`);
        }

        logger.info(`Service ${serviceName} restarted successfully`);
        return true;

    } catch (error) {
        logger.error(`Failed to restart service ${serviceName}: ${error.message}`);
        throw new Error(`Failed to restart ${serviceName} service`);
    }
}

/**
 * POST /api/settings/password/dashboard
 * Change Dashboard admin password
 */
router.post('/password/dashboard', requireAuth, passwordChangeLimiter, async (req, res) => {
    let backupPath = null;

    try {
        const { currentPassword, newPassword } = req.body;

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

        // Verify current password
        await verifyCurrentDashboardPassword(req.user.id, currentPassword);

        // Check if new password is same as current
        const result = await db.query(
            'SELECT password_hash FROM admin_users WHERE id = $1',
            [req.user.id]
        );

        const sameAsOld = await verifyPassword(newPassword, result.rows[0].password_hash);
        if (sameAsOld) {
            return res.status(400).json({
                error: 'New password must be different from current password',
                timestamp: new Date().toISOString()
            });
        }

        // Create backup before making changes
        backupPath = await backupEnvFile();

        // Hash new password
        const newPasswordHash = await hashPassword(newPassword);

        // Update database
        await db.query(
            'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newPasswordHash, req.user.id]
        );

        // SECURITY FIX: Only store the hash, not the plaintext password
        // The hash is sufficient for authentication (DB is source of truth)
        await updateEnvVariables({
            ADMIN_HASH: newPasswordHash
        });

        // Record password change
        await db.query(
            `INSERT INTO password_history (user_id, password_hash, changed_by, ip_address)
             VALUES ($1, $2, $3, $4)`,
            [req.user.id, newPasswordHash, req.user.username, req.ip]
        );

        logger.info(`Dashboard password changed successfully by ${req.user.username}`);

        res.json({
            success: true,
            message: 'Dashboard password changed successfully',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error changing dashboard password: ${error.message}`);

        res.status(error.message === 'Current password is incorrect' ? 401 : 500).json({
            error: error.message || 'Failed to change dashboard password',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/settings/password/minio
 * Change MinIO root password
 */
router.post('/password/minio', requireAuth, passwordChangeLimiter, async (req, res) => {
    let backupPath = null;

    try {
        const { currentPassword, newPassword } = req.body;

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

        // Verify current dashboard password for authorization
        await verifyCurrentDashboardPassword(req.user.id, currentPassword);

        // Check if new password is different
        if (newPassword === process.env.MINIO_ROOT_PASSWORD) {
            return res.status(400).json({
                error: 'New password must be different from current password',
                timestamp: new Date().toISOString()
            });
        }

        // Create backup before making changes
        backupPath = await backupEnvFile();

        // Update .env file
        await updateEnvVariables({
            MINIO_ROOT_PASSWORD: newPassword
        });

        // Restart MinIO service to apply new password
        await restartService('minio');

        logger.info(`MinIO password changed successfully by ${req.user.username}`);

        res.json({
            success: true,
            message: 'MinIO password changed successfully. Service restarted.',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error changing MinIO password: ${error.message}`);

        res.status(error.message === 'Current password is incorrect' ? 401 : 500).json({
            error: error.message || 'Failed to change MinIO password',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/settings/password/n8n
 * Change n8n basic auth password
 */
router.post('/password/n8n', requireAuth, passwordChangeLimiter, async (req, res) => {
    let backupPath = null;

    try {
        const { currentPassword, newPassword } = req.body;

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

        // Verify current dashboard password for authorization
        await verifyCurrentDashboardPassword(req.user.id, currentPassword);

        // Check if new password is different
        if (newPassword === process.env.N8N_BASIC_AUTH_PASSWORD) {
            return res.status(400).json({
                error: 'New password must be different from current password',
                timestamp: new Date().toISOString()
            });
        }

        // Create backup before making changes
        backupPath = await backupEnvFile();

        // Update .env file
        await updateEnvVariables({
            N8N_BASIC_AUTH_PASSWORD: newPassword
        });

        // Restart n8n service to apply new password
        await restartService('n8n');

        logger.info(`n8n password changed successfully by ${req.user.username}`);

        res.json({
            success: true,
            message: 'n8n password changed successfully. Service restarted.',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error changing n8n password: ${error.message}`);

        res.status(error.message === 'Current password is incorrect' ? 401 : 500).json({
            error: error.message || 'Failed to change n8n password',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/settings/password-requirements
 * Get password complexity requirements
 */
router.get('/password-requirements', requireAuth, (req, res) => {
    const { PASSWORD_REQUIREMENTS } = require('../utils/password');

    res.json({
        requirements: PASSWORD_REQUIREMENTS,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
