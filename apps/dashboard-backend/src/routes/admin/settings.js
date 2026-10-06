/**
 * Settings API routes
 * Handles system settings including password management for the Dashboard
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { createUserRateLimiter } = require('../../middleware/rateLimit');
const { changeDashboardPassword } = require('../../services/auth/passwordService');
const { updateEnvVariablesOderZurueck, backupEnvFile } = require('../../utils/envManager');
const db = require('../../database');
const { logSecurityEvent } = require('../../utils/auditLog');
const { asyncHandler } = require('../../middleware/errorHandler');
const { blacklistAllUserTokens } = require('../../utils/jwt');
const { validateBody } = require('../../middleware/validate');
const { PasswordChangeBody, FirmennameBody, LogoBody } = require('../../schemas/admin-settings');
const { logoAusDatenAdresse } = require('../../utils/logoBild');
const systemSettings = require('../../services/system-settings/systemSettingsService');

// Rate limiter for password changes (3 attempts per 15 minutes)
const passwordChangeLimiter = createUserRateLimiter(3, 15 * 60 * 1000);

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
    // Die Datenbank ist die Quelle der Wahrheit, das Passwort ist also schon
    // gewechselt. Misslingt das Schreiben, rollt `updateEnvVariablesOderZurueck`
    // die `.env` auf `envVorher` zurueck und wirft weiter.
    await updateEnvVariablesOderZurueck({ ADMIN_HASH: newPasswordHash }, envVorher);

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
      message: 'Das Passwort wurde geändert.',
      requireRelogin: true,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/settings/firmenname
 *
 * Der Name des Unternehmens, das dieses Geraet betreibt (Auftrag
 * anmeldung-ohne-slogan, 30.08.2026). Er steht ueber dem Anmeldeformular
 * statt eines Slogans: ein Mitarbeiter, der „Eure Apps, auf eurem Geraet"
 * liest, haelt die Software fuer ein Bastelprodukt; der Name seiner Firma
 * sagt ihm, dass er am richtigen Ort ist.
 *
 * Die Spalte `company_name` in `system_settings` gibt es seit Migration 038;
 * sie gehoerte dem Einrichtungsassistenten, der in D4 gefallen ist, und
 * seitdem hat sie niemand mehr gelesen oder geschrieben. Gelesen wird sie
 * oeffentlich ueber `GET /api/auth/needs-setup` (aus dem Cache), geschrieben
 * hier -- nur vom Administrator, mit `reload()`, damit die naechste
 * Seitenladung den neuen Namen sieht. Leer speichert NULL: dann zeigt die
 * Anmeldeseite den Produktnamen.
 */
router.put(
  '/firmenname',
  requireAuth,
  requireRole('admin'),
  validateBody(FirmennameBody),
  asyncHandler(async (req, res) => {
    const firmenname = req.body.firmenname || null;
    await db.query('UPDATE system_settings SET company_name = $1 WHERE id = 1', [firmenname]);
    await systemSettings.reload();

    logSecurityEvent({
      userId: req.user.id,
      action: 'settings_change',
      details: { target: 'firmenname', firmenname },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.json({ firmenname });
  })
);

/**
 * PUT    /api/settings/logo
 * DELETE /api/settings/logo
 *
 * Das Logo des Hauses (M5, Auftrag verwaltung-geraet-und-system, Migration
 * 207). Die Aktivitaetsleiste zeigt es ueber dem Haus, fuer jeden. Die
 * Oberflaeche schickt die Datei als Daten-Adresse; `logoAusDatenAdresse`
 * prueft Art (nach den ersten Bytes, kein SVG) und Groesse (256 KB).
 * Ausgeliefert wird es ueber `GET /api/darstellung/logo`, und ob es eines
 * gibt, sagt `GET /api/auth/needs-setup` (`logo`: der Stand oder null) --
 * dieselbe Antwort, die den Firmennamen traegt, ohne dritte Anfrage.
 */
router.put(
  '/logo',
  requireAuth,
  requireRole('admin'),
  validateBody(LogoBody),
  asyncHandler(async (req, res) => {
    const { typ, inhalt } = logoAusDatenAdresse(req.body.bild);
    const { rows } = await db.query(
      `UPDATE system_settings
          SET company_logo = $1, company_logo_typ = $2, company_logo_stand = NOW()
        WHERE id = 1
        RETURNING company_logo_stand`,
      [inhalt, typ]
    );
    await systemSettings.reload();

    logSecurityEvent({
      userId: req.user.id,
      action: 'settings_change',
      details: { target: 'logo', typ, bytes: inhalt.length },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.json({ data: { logo: rows[0]?.company_logo_stand ?? null } });
  })
);

router.delete(
  '/logo',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await db.query(
      `UPDATE system_settings
          SET company_logo = NULL, company_logo_typ = NULL, company_logo_stand = NULL
        WHERE id = 1`
    );
    await systemSettings.reload();

    logSecurityEvent({
      userId: req.user.id,
      action: 'settings_change',
      details: { target: 'logo', entfernt: true },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.json({ data: { logo: null } });
  })
);

// HIER STANDEN BIS ZUM 04.10.2026 `GET/PATCH /api/settings/sprachmodell`: die
// Standardwerte, mit denen das Geraet ein Modell fragt, und der Basis-Prompt
// vor jedem Aufruf. Das Zielbild (`company/frontend.md`, Flows) sagt: der
// Administrator stellt je Schritt auf ein passendes Modell um, Prompts aendert
// er nicht, und Laden und Entladen regelt das Geraet selbst nach Nutzung. Die
// Seite „KI" der Verwaltung ist deshalb gestrichen und mit ihr der Weg. Die
// Spalten bleiben in `system_settings` und werden weiter gelesen
// (`llmOllamaStream.js`, `systemPromptBuilder.js`), mit ihren Vorgaben.

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
