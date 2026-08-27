/**
 * Freigaben (Phase C2 des Umbaus vom 26.08.2026).
 *
 * Der Administrator gibt eine App fuer einen Benutzer frei und nimmt die
 * Freigabe zurueck. Alle drei Wege sind Admin-Wege; der Mitarbeiter bekommt
 * hier 403. Seine eigene Sicht auf das Freigegebene kommt mit dem App-Modell
 * (Phase C3) — vorher gibt es nichts zu zeigen als eine Kennung.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../../middleware/validate');
const { FreigabeBody, FreigabeParams, FreigabenQuery } = require('../../schemas/freigaben');
const freigabeService = require('../../services/app/freigabeService');
const { logSecurityEvent } = require('../../utils/auditLog');

// GET /api/freigaben — alle Freigaben, wahlweise nach App oder Benutzer gefiltert.
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  validateQuery(FreigabenQuery),
  asyncHandler(async (req, res) => {
    const data = await freigabeService.listeFreigaben({
      appId: req.query.app_id,
      benutzerId: req.query.benutzer_id,
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

// POST /api/freigaben — eine App fuer einen Benutzer freigeben.
// 201, wenn die Freigabe neu ist, 200, wenn sie schon stand (siehe Service).
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validateBody(FreigabeBody),
  asyncHandler(async (req, res) => {
    const { freigabe, neu } = await freigabeService.gibFrei({
      appId: req.body.app_id,
      benutzerId: req.body.benutzer_id,
      durch: req.user.id,
    });
    if (neu) {
      logSecurityEvent({
        userId: req.user.id,
        action: 'freigabe_erteilt',
        details: { app_id: req.body.app_id, benutzer_id: req.body.benutzer_id },
        ipAddress: req.ip,
        requestId: req.headers['x-request-id'],
      });
    }
    res.status(neu ? 201 : 200).json({ data: freigabe, neu, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/freigaben/:appId/:benutzerId — Freigabe zuruecknehmen.
router.delete(
  '/:appId/:benutzerId',
  requireAuth,
  requireRole('admin'),
  validateParams(FreigabeParams),
  asyncHandler(async (req, res) => {
    const data = await freigabeService.nimmZurueck({
      appId: req.params.appId,
      benutzerId: req.params.benutzerId,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'freigabe_zurueckgenommen',
      details: { app_id: req.params.appId, benutzer_id: req.params.benutzerId },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
