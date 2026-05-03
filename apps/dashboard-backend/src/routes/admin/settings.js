/**
 * Settings API routes
 * Handles system settings including password management for Dashboard, MinIO, and n8n
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { createUserRateLimiter } = require('../../middleware/rateLimit');
const { verifyPassword, validatePasswordComplexity } = require('../../utils/password');
const { changeDashboardPassword } = require('../../services/auth/passwordService');
const { updateEnvVariables, backupEnvFile } = require('../../utils/envManager');
const db = require('../../database');
const logger = require('../../utils/logger');
const { logSecurityEvent } = require('../../utils/auditLog');
const { execFile } = require('child_process');
const util = require('util');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, UnauthorizedError } = require('../../utils/errors');
const { getEmbedding } = require('../../services/embeddingService');
const { blacklistAllUserTokens } = require('../../utils/jwt');
const { validateBody } = require('../../middleware/validate');
const { PasswordChangeBody, CompanyContextBody } = require('../../schemas/admin-settings');
const { invalidateFeatureFlagsCache } = require('../../middleware/featureFlags');

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
    const err = new Error(`Failed to restart ${serviceName} service`);
    err.statusCode = 503;
    throw err;
  }
}

/**
 * POST /api/settings/password/dashboard
 * Change Dashboard admin password
 */
router.post(
  '/password/dashboard',
  requireAuth,
  requireAdmin,
  passwordChangeLimiter,
  validateBody(PasswordChangeBody),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Create backup before making changes
    await backupEnvFile();

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
    await updateEnvVariables({
      ADMIN_HASH: newPasswordHash,
    });

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
 * POST /api/settings/password/minio
 * Change MinIO root password
 */
router.post(
  '/password/minio',
  requireAuth,
  requireAdmin,
  passwordChangeLimiter,
  validateBody(PasswordChangeBody),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Validate new password complexity
    const validation = validatePasswordComplexity(newPassword);
    if (!validation.valid) {
      throw new ValidationError('Password does not meet complexity requirements');
    }

    // Verify current dashboard password for authorization
    try {
      await verifyCurrentDashboardPassword(req.user.id, currentPassword);
    } catch (error) {
      if (error.message === 'Current password is incorrect') {
        throw new UnauthorizedError('Current password is incorrect');
      }
      throw error;
    }

    // Check if new password is different
    if (newPassword === process.env.MINIO_ROOT_PASSWORD) {
      throw new ValidationError('New password must be different from current password');
    }

    // Create backup before making changes
    await backupEnvFile();

    // Update .env file
    await updateEnvVariables({
      MINIO_ROOT_PASSWORD: newPassword,
    });

    // Restart MinIO service to apply new password
    await restartService('minio');

    logger.info(`MinIO password changed successfully by ${req.user.username}`);

    logSecurityEvent({
      userId: req.user.id,
      action: 'password_change',
      details: { target: 'minio' },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.json({
      success: true,
      message: 'MinIO password changed successfully. Service restarted.',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/settings/password/n8n
 * Change n8n basic auth password
 */
router.post(
  '/password/n8n',
  requireAuth,
  requireAdmin,
  passwordChangeLimiter,
  validateBody(PasswordChangeBody),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // Validate new password complexity
    const validation = validatePasswordComplexity(newPassword);
    if (!validation.valid) {
      throw new ValidationError('Password does not meet complexity requirements');
    }

    // Verify current dashboard password for authorization
    try {
      await verifyCurrentDashboardPassword(req.user.id, currentPassword);
    } catch (error) {
      if (error.message === 'Current password is incorrect') {
        throw new UnauthorizedError('Current password is incorrect');
      }
      throw error;
    }

    // Check if new password is different
    if (newPassword === process.env.N8N_BASIC_AUTH_PASSWORD) {
      throw new ValidationError('New password must be different from current password');
    }

    // Create backup before making changes
    await backupEnvFile();

    // Update .env file
    await updateEnvVariables({
      N8N_BASIC_AUTH_PASSWORD: newPassword,
    });

    // Restart n8n service to apply new password
    await restartService('n8n');

    logger.info(`n8n password changed successfully by ${req.user.username}`);

    logSecurityEvent({
      userId: req.user.id,
      action: 'password_change',
      details: { target: 'n8n' },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.json({
      success: true,
      message: 'n8n password changed successfully. Service restarted.',
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

// =============================================================================
// COMPANY CONTEXT (RAG 2.0)
// =============================================================================

/**
 * GET /api/settings/company-context
 * Get the company context used in RAG queries
 */
router.get(
  '/company-context',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT content, updated_at, updated_by
        FROM company_context
        WHERE id = 1
    `);

    if (result.rows.length === 0) {
      // Return default template if not set
      return res.json({
        content: `# Unternehmensprofil

**Firma:** [Firmenname]
**Branche:** [Branche]

## Hauptprodukte/Dienstleistungen
- [Produkt 1]
- [Produkt 2]

## Kunden
- [Kundensegment 1]
- [Kundensegment 2]

---
*Diese Informationen werden bei jeder RAG-Anfrage als Hintergrundkontext bereitgestellt.*`,
        updated_at: null,
        updated_by: null,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      content: result.rows[0].content,
      updated_at: result.rows[0].updated_at,
      updated_by: result.rows[0].updated_by,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/settings/company-context
 * Update the company context
 */
router.put(
  '/company-context',
  requireAuth,
  requireAdmin,
  validateBody(CompanyContextBody),
  asyncHandler(async (req, res) => {
    const { content } = req.body;

    // Generate embedding for the content (for potential future use)
    const embedding = await getEmbedding(content);
    const embeddingJson = embedding ? JSON.stringify(embedding) : null;

    // Upsert the company context
    const result = await db.query(
      `
        INSERT INTO company_context (id, content, content_embedding, updated_at, updated_by)
        VALUES (1, $1, $2, NOW(), $3)
        ON CONFLICT (id) DO UPDATE SET
            content = $1,
            content_embedding = $2,
            updated_at = NOW(),
            updated_by = $3
        RETURNING content, updated_at, updated_by
    `,
      [content.trim(), embeddingJson, req.user.id]
    );

    logger.info(`Company context updated by user ${req.user.username}`);

    // Invalidate system prompt cache
    const { invalidateCompanyContextCache } = require('../../services/llm/systemPromptBuilder');
    invalidateCompanyContextCache();

    res.json({
      content: result.rows[0].content,
      updated_at: result.rows[0].updated_at,
      message: 'Unternehmenskontext erfolgreich gespeichert',
      timestamp: new Date().toISOString(),
    });
  })
);

// =============================================================================
// N8N EXTERNAL-WHITELIST + CALL-LOG (Phase 1.7)
// =============================================================================

/**
 * GET /api/settings/n8n-whitelist
 * Liefert die aktuelle Whitelist externer Domains, die n8n-Workflows
 * kontaktieren dürfen. Leer = alles geblockt (Soll-Zustand).
 */
router.get(
  '/n8n-whitelist',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT id, domain, description, added_by, added_at
         FROM n8n_allowed_external_domains
         ORDER BY domain ASC`
    );
    res.json({
      domains: result.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/settings/n8n-whitelist
 * Body: { domain: string, description?: string }
 * Fügt einen Eintrag zur Whitelist hinzu. Bei Konflikt 409.
 */
router.post(
  '/n8n-whitelist',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { domain, description } = req.body || {};
    if (!domain || typeof domain !== 'string') {
      throw new ValidationError('domain ist erforderlich');
    }
    const normalized = domain.trim().toLowerCase();
    // Sehr einfache Validierung — keine Schema-Validation hier nötig.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized)) {
      throw new ValidationError(
        'Ungültiges Domain-Format (z. B. api.telegram.org, oauth2.googleapis.com)'
      );
    }

    const existing = await db.query(
      `SELECT id FROM n8n_allowed_external_domains WHERE domain = $1`,
      [normalized]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'Domain ist bereits gewhitelistet' },
        timestamp: new Date().toISOString(),
      });
    }

    const result = await db.query(
      `INSERT INTO n8n_allowed_external_domains (domain, description, added_by)
       VALUES ($1, $2, $3)
       RETURNING id, domain, description, added_by, added_at`,
      [normalized, description || null, req.user.id]
    );

    logSecurityEvent({
      userId: req.user.id,
      action: 'n8n_whitelist_add',
      details: { domain: normalized },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.status(201).json({
      domain: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/settings/n8n-whitelist/:id
 */
router.delete(
  '/n8n-whitelist/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Ungültige ID');
    }
    const result = await db.query(
      `DELETE FROM n8n_allowed_external_domains WHERE id = $1 RETURNING domain`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Eintrag nicht gefunden' },
        timestamp: new Date().toISOString(),
      });
    }
    logSecurityEvent({
      userId: req.user.id,
      action: 'n8n_whitelist_remove',
      details: { domain: result.rows[0].domain },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ success: true, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/settings/n8n-call-log
 * Liefert die letzten externen HTTP-Calls aus n8n-Workflows.
 * Query-Params: limit (max 200, default 50), blocked_only=1
 */
router.get(
  '/n8n-call-log',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const blockedOnly = req.query.blocked_only === '1' || req.query.blocked_only === 'true';
    const where = blockedOnly ? 'WHERE blocked = TRUE' : '';
    const result = await db.query(
      `SELECT id, workflow_id, workflow_name, execution_id, target_url, target_host,
              method, status_code, blocked, block_reason, duration_ms, created_at
         FROM n8n_external_call_log
         ${where}
         ORDER BY created_at DESC
         LIMIT $1`,
      [limit]
    );
    res.json({
      calls: result.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

// =============================================================================
// COMPLIANCE-SETTINGS (Phase 1.4 + 1.6)
// =============================================================================

/**
 * GET /api/settings/compliance
 * Vollständige Compliance-Konfiguration (mit Audit-Metadaten).
 * Für Admin-UI. Public-Lesezugriff geht via /api/system/feature-flags.
 */
router.get(
  '/compliance',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await db.query(`
      SELECT telegram_enabled, telegram_disclaimer_accepted, telegram_disclaimer_accepted_at,
             telegram_disclaimer_accepted_by,
             ai_transparency_enabled, ai_transparency_disabled_at, ai_transparency_disabled_by
      FROM system_settings WHERE id = 1
    `);
    const row = result.rows[0] || {};
    res.json({
      telegram: {
        enabled: row.telegram_enabled ?? false,
        disclaimer_accepted: row.telegram_disclaimer_accepted ?? false,
        disclaimer_accepted_at: row.telegram_disclaimer_accepted_at,
        disclaimer_accepted_by: row.telegram_disclaimer_accepted_by,
      },
      ai_transparency: {
        enabled: row.ai_transparency_enabled ?? true,
        disabled_at: row.ai_transparency_disabled_at,
        disabled_by: row.ai_transparency_disabled_by,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/settings/compliance/telegram
 * Telegram aktivieren/deaktivieren. Aktivierung setzt voraus, dass der Disclaimer
 * ausdrücklich bestätigt wurde (DSGVO Drittland-UAE).
 * Body: { enabled: boolean, disclaimer_accepted?: boolean }
 */
router.put(
  '/compliance/telegram',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { enabled, disclaimer_accepted } = req.body || {};
    if (typeof enabled !== 'boolean') {
      throw new ValidationError('enabled muss boolean sein');
    }
    if (enabled && !disclaimer_accepted) {
      throw new ValidationError(
        'Disclaimer muss aktiv bestätigt werden, bevor Telegram aktiviert werden kann'
      );
    }

    const setClauses = ['telegram_enabled = $1'];
    const params = [enabled];
    if (enabled && disclaimer_accepted) {
      setClauses.push(
        'telegram_disclaimer_accepted = TRUE',
        'telegram_disclaimer_accepted_at = NOW()',
        `telegram_disclaimer_accepted_by = $${params.length + 1}`
      );
      params.push(req.user.id);
    }

    await db.query(`UPDATE system_settings SET ${setClauses.join(', ')} WHERE id = 1`, params);
    invalidateFeatureFlagsCache();

    logger.info(
      `Compliance: telegram_enabled = ${enabled} by user ${req.user.username} (id=${req.user.id})`
    );
    logSecurityEvent({
      userId: req.user.id,
      action: enabled ? 'telegram_enabled' : 'telegram_disabled',
      details: { disclaimer_accepted: !!disclaimer_accepted },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.json({ success: true, telegram_enabled: enabled, timestamp: new Date().toISOString() });
  })
);

/**
 * PUT /api/settings/compliance/ai-transparency
 * AI-Transparenz-Label (EU-AI-Act Art. 50) aktivieren/deaktivieren.
 * Default ON. Deaktivierung wird im Audit-Log nachvollzogen.
 * Body: { enabled: boolean }
 */
router.put(
  '/compliance/ai-transparency',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      throw new ValidationError('enabled muss boolean sein');
    }

    if (enabled) {
      await db.query(
        `UPDATE system_settings
           SET ai_transparency_enabled = TRUE,
               ai_transparency_disabled_at = NULL,
               ai_transparency_disabled_by = NULL
           WHERE id = 1`
      );
    } else {
      await db.query(
        `UPDATE system_settings
           SET ai_transparency_enabled = FALSE,
               ai_transparency_disabled_at = NOW(),
               ai_transparency_disabled_by = $1
           WHERE id = 1`,
        [req.user.id]
      );
    }
    invalidateFeatureFlagsCache();

    logger.warn(
      `Compliance: ai_transparency_enabled = ${enabled} by user ${req.user.username} (id=${req.user.id})`
    );
    logSecurityEvent({
      userId: req.user.id,
      action: enabled ? 'ai_transparency_enabled' : 'ai_transparency_disabled',
      details: {},
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.json({
      success: true,
      ai_transparency_enabled: enabled,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
