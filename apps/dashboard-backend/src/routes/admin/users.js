/**
 * User-Management API (Phase 1.1)
 *
 * Admins legen Mitarbeiter (members) und Lesezugriff (readonly) an, vergeben
 * Rollen, deaktivieren Konten. Solo-Admin-Setups (1 Admin = Kanzleichef)
 * funktionieren wie bisher; Multi-User-Setups (5+ Mitarbeiter) bekommen hier
 * die UI-Schiene.
 *
 * Rollen:
 *   - admin    — sieht alles, kann Benutzer anlegen, alles bearbeiten.
 *   - member   — Default. Sieht nur eigene Resources + Spaces in denen er
 *                Member ist.
 *   - readonly — Wie member, aber Schreibrechte sind UI-seitig deaktiviert.
 */

const express = require('express');
const router = express.Router();
const db = require('../../database');
const logger = require('../../utils/logger');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');
const { hashPassword, validatePasswordComplexity } = require('../../utils/password');
const { logSecurityEvent } = require('../../utils/auditLog');

const VALID_ROLES = new Set(['admin', 'member', 'readonly']);

/**
 * GET /api/admin/users — Liste aller Benutzer.
 */
router.get(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT id, username, email, role, is_active, created_at, last_login
         FROM admin_users
         ORDER BY id ASC`
    );
    res.json({
      users: result.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/admin/users — Neuen Benutzer anlegen.
 * Body: { username, email, password, role? }
 */
router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { username, email, password, role } = req.body || {};

    if (!username || username.trim().length < 3) {
      throw new ValidationError('Benutzername muss mindestens 3 Zeichen haben');
    }
    if (!email || !email.includes('@')) {
      throw new ValidationError('Gültige E-Mail-Adresse erforderlich');
    }
    if (!password) {
      throw new ValidationError('Passwort erforderlich');
    }
    const complexity = validatePasswordComplexity(password);
    if (!complexity.valid) {
      throw new ValidationError(
        complexity.errors?.[0] || 'Passwort erfüllt die Komplexitäts-Anforderungen nicht'
      );
    }

    const userRole = role && VALID_ROLES.has(role) ? role : 'member';
    const passwordHash = await hashPassword(password);

    let result;
    try {
      result = await db.query(
        `INSERT INTO admin_users (username, password_hash, email, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         RETURNING id, username, email, role, is_active, created_at`,
        [username.trim(), passwordHash, email.trim().toLowerCase(), userRole]
      );
    } catch (err) {
      if (err.code === '23505') {
        throw new ConflictError('Benutzername oder E-Mail existiert bereits');
      }
      throw err;
    }

    const created = result.rows[0];
    logger.info(
      `Admin ${req.user.username} (id=${req.user.id}) created user ${created.username} (id=${created.id}, role=${created.role})`
    );
    logSecurityEvent({
      userId: req.user.id,
      action: 'user_create',
      details: {
        new_user_id: created.id,
        new_username: created.username,
        role: created.role,
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.status(201).json({
      user: created,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PATCH /api/admin/users/:id — Rolle / Aktivierung ändern.
 * Body: { role?, is_active? }
 */
router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const targetId = parseInt(req.params.id, 10);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      throw new ValidationError('Ungültige User-ID');
    }
    const { role, is_active } = req.body || {};

    const setClauses = [];
    const params = [];
    if (role !== undefined) {
      if (!VALID_ROLES.has(role)) {
        throw new ValidationError(`Ungültige Rolle. Erlaubt: ${[...VALID_ROLES].join(', ')}`);
      }
      params.push(role);
      setClauses.push(`role = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(!!is_active);
      setClauses.push(`is_active = $${params.length}`);
    }
    if (setClauses.length === 0) {
      throw new ValidationError('Keine Änderungen angegeben');
    }

    // Selbst-Schutz: Admins dürfen sich nicht selbst deaktivieren oder
    // herabstufen — sonst sperrt sich der Solo-Admin aus.
    // req.user.id kommt aus admin_users (BIGINT) und wird als String serialisiert,
    // targetId aus req.params ist Integer — Number-Coerce auf beiden Seiten.
    const callerId = Number(req.user.id);
    if (targetId === callerId) {
      if (is_active === false) {
        throw new ValidationError('Sie können Ihr eigenes Konto nicht deaktivieren');
      }
      if (role && role !== 'admin') {
        throw new ValidationError('Sie können sich nicht selbst zur Nicht-Admin-Rolle setzen');
      }
    }

    // Nicht den letzten aktiven Admin entfernen — gilt für beide Wege:
    // Rolle herabstufen ODER Konto deaktivieren.
    const wouldRemoveAdmin = (role && role !== 'admin') || is_active === false;
    if (wouldRemoveAdmin) {
      const adminCountResult = await db.query(
        `SELECT COUNT(*) AS c FROM admin_users
           WHERE role = 'admin' AND is_active = true AND id <> $1`,
        [targetId]
      );
      if (parseInt(adminCountResult.rows[0].c, 10) === 0) {
        throw new ValidationError('Mindestens ein aktiver Admin muss vorhanden sein');
      }
    }

    params.push(targetId);
    const result = await db.query(
      `UPDATE admin_users SET ${setClauses.join(', ')}, updated_at = NOW()
         WHERE id = $${params.length}
         RETURNING id, username, email, role, is_active, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Benutzer nicht gefunden');
    }

    logSecurityEvent({
      userId: req.user.id,
      action: 'user_update',
      details: {
        target_user_id: targetId,
        changed_fields: { role: role ?? null, is_active: is_active ?? null },
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.json({
      user: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/admin/users/:id/reset-password — neues Passwort setzen.
 * Body: { password }
 */
router.post(
  '/:id/reset-password',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const targetId = parseInt(req.params.id, 10);
    const { password } = req.body || {};
    if (!password) {throw new ValidationError('Passwort erforderlich');}
    const complexity = validatePasswordComplexity(password);
    if (!complexity.valid) {
      throw new ValidationError(
        complexity.errors?.[0] || 'Passwort erfüllt die Komplexitäts-Anforderungen nicht'
      );
    }

    const passwordHash = await hashPassword(password);
    const result = await db.query(
      `UPDATE admin_users SET password_hash = $1, updated_at = NOW()
         WHERE id = $2 RETURNING id, username`,
      [passwordHash, targetId]
    );
    if (result.rows.length === 0) {throw new NotFoundError('Benutzer nicht gefunden');}

    logSecurityEvent({
      userId: req.user.id,
      action: 'user_password_reset',
      details: { target_user_id: targetId },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.json({
      success: true,
      user: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
