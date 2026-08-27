/**
 * Benutzerverwaltung (Phasen C1 und C2 des Umbaus vom 26.08.2026).
 *
 * Der Administrator legt Mitarbeiter an, sieht sie, setzt ihr Passwort, legt
 * sie still und loescht sie. Ein Mitarbeiter meldet sich mit E-Mail-Adresse
 * oder Benutzername und Passwort an und sieht, was ein Admin ihm freigegeben
 * hat (`/api/freigaben`, ebenfalls C2).
 *
 * Zwei Dinge liegen bewusst NICHT hier:
 *
 *   Das eigene Passwort wechselt jeder ueber `POST /api/auth/change-password`
 *   — dort wird das alte geprueft, hier nicht, weil der Administrator es nicht
 *   kennt und nicht kennen soll.
 *
 *   Sich selbst loescht jeder ueber `DELETE /api/gdpr/me`. Der Weg hier ist
 *   fuer andere.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams } = require('../../middleware/validate');
const { ValidationError } = require('../../utils/errors');
const {
  CreateBenutzerBody,
  BenutzerIdParams,
  SetzePasswortBody,
  SetzeAktivBody,
} = require('../../schemas/benutzer');
const benutzerService = require('../../services/auth/benutzerService');
const { setzePasswort } = require('../../services/auth/passwordService');
const { blacklistAllUserTokens } = require('../../utils/jwt');
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

// PUT /api/benutzer/:id/passwort — dem Mitarbeiter ein Passwort setzen.
//
// Ohne Kenntnis des alten: der Administrator hat es nie gesehen. Danach sind
// alle Sitzungen des Betroffenen ungueltig, sonst liefe seine alte Anmeldung
// mit dem alten Passwort weiter, obwohl das Passwort gerade zurueckgesetzt
// wurde — genau der Fall, in dem jemand ausgesperrt werden SOLL.
//
// Bewusst ohne Drossel: `passwordChangeLimiter` (drei je Viertelstunde) sitzt
// auf dem Selbstwechsel und schuetzt vor dem Erraten des ALTEN Passworts. Hier
// gibt es nichts zu erraten, und ein Administrator, der zehn neue Mitarbeiter
// einrichtet, wuerde von einer Drossel nur aufgehalten.
router.put(
  '/:id/passwort',
  requireAuth,
  requireRole('admin'),
  validateParams(BenutzerIdParams),
  validateBody(SetzePasswortBody),
  asyncHandler(async (req, res) => {
    const ziel = await benutzerService.holeBenutzer(req.params.id);
    await setzePasswort(ziel.id, req.body.password, {
      gesetztVon: req.user.username,
      ipAddress: req.ip,
    });
    await blacklistAllUserTokens(ziel.id);
    logSecurityEvent({
      userId: req.user.id,
      action: 'benutzer_passwort_gesetzt',
      details: { benutzer: ziel.username },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({
      data: { id: ziel.id, username: ziel.username },
      message: 'Passwort gesetzt. Alle Sitzungen dieses Benutzers sind beendet.',
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/benutzer/:id/aktiv — stilllegen (`false`) oder wieder zulassen (`true`).
router.put(
  '/:id/aktiv',
  requireAuth,
  requireRole('admin'),
  validateParams(BenutzerIdParams),
  validateBody(SetzeAktivBody),
  asyncHandler(async (req, res) => {
    // Sich selbst stillzulegen heisst, sich auszusperren; das ist nie gemeint.
    // Der Schutz des letzten Administrators (im Service) faengt das auf einem
    // Geraet mit einem Zugang ohnehin ab, aber nicht auf einem mit zweien.
    if (req.params.id === req.user.id && req.body.aktiv === false) {
      throw new ValidationError('Das eigene Konto kann nicht stillgelegt werden');
    }
    const benutzer = await benutzerService.setzeAktiv({
      userId: req.params.id,
      aktiv: req.body.aktiv,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: req.body.aktiv ? 'benutzer_zugelassen' : 'benutzer_stillgelegt',
      details: { benutzer: benutzer.username },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data: benutzer, timestamp: new Date().toISOString() });
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
