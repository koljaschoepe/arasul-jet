/**
 * Benutzerverwaltung (Phase C1 des Umbaus vom 26.08.2026).
 *
 * Der Administrator legt Mitarbeiter an, sieht sie und loescht sie. Ein
 * Mitarbeiter meldet sich mit E-Mail-Adresse oder Benutzername und Passwort an
 * und sieht, was ein Admin ihm freigibt (die Freigaben kommen mit den
 * naechsten C-Phasen). Sich selbst loescht jeder ueber `DELETE /api/gdpr/me`;
 * dieser Weg hier ist fuer andere.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams } = require('../../middleware/validate');
const { ValidationError } = require('../../utils/errors');
const { CreateBenutzerBody, BenutzerIdParams } = require('../../schemas/benutzer');
const benutzerService = require('../../services/auth/benutzerService');
const { logSecurityEvent } = require('../../utils/auditLog');

// GET /api/benutzer — alle Benutzer mit Rolle.
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = await benutzerService.listeBenutzer();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

// POST /api/benutzer — einen Benutzer anlegen (409, wenn der Name vergeben ist).
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validateBody(CreateBenutzerBody),
  asyncHandler(async (req, res) => {
    const benutzer = await benutzerService.legeBenutzerAn(req.body);
    logSecurityEvent({
      userId: req.user.id,
      action: 'benutzer_angelegt',
      details: { username: benutzer.username, rolle: benutzer.role },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.status(201).json({ data: benutzer, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/benutzer/:id — einen anderen Benutzer samt seiner Daten loeschen.
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(BenutzerIdParams),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      throw new ValidationError('Das eigene Konto wird ueber DELETE /api/gdpr/me geloescht');
    }
    const ziel = await benutzerService.holeBenutzer(req.params.id);
    const { summary, zugangBleibt } = await benutzerService.loescheBenutzer({
      userId: ziel.id,
      username: ziel.username,
      role: ziel.role,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'benutzer_geloescht',
      details: { deleted_user: ziel.username, summary },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({
      deleted: !zugangBleibt,
      zugangBleibt,
      summary,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
