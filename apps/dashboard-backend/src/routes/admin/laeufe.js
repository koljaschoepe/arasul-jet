/**
 * Läufe über alle Apps (M5, Verwaltung → Läufe).
 *
 * Der Administrator sieht hier alles, was auf dem Gerät gelaufen ist,
 * gefiltert nach App, Ergebnis, Person und Zeitraum, mit einem Link auf jeden
 * Lauf. Läufe aus
 * Zeitplan oder Ereignis gehören keinem Menschen; er sieht und bricht auch sie.
 *
 * Alles hier ist Admin-Sache (`requireRole('admin')`).
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateParams, validateQuery } = require('../../middleware/validate');
const { RunIdParams, LaeufeAlleQuery } = require('../../schemas/flows');
const { LaufQuery } = require('../../schemas/apps');
const { NotFoundError } = require('../../utils/errors');
const { logSecurityEvent } = require('../../utils/auditLog');
const runStore = require('../../services/flows/runStore');
const flowRunner = require('../../services/flows/flowRunner');

// GET /api/laeufe — die Läufe aller Apps, Fehler und „nicht übergeben" oben.
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  validateQuery(LaeufeAlleQuery),
  asyncHandler(async (req, res) => {
    const { laeufe, gesamt } = await runStore.listRunsAlle(req.query);
    res.json({ data: laeufe, gesamt, timestamp: new Date().toISOString() });
  })
);

// GET /api/laeufe/:id — ein Lauf samt Schritten, Freigaben und Person.
router.get(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(RunIdParams),
  validateQuery(LaufQuery),
  asyncHandler(async (req, res) => {
    const data = await runStore.getRunAlle({ runId: req.params.id, includeRaw: req.query.raw });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

// POST /api/laeufe/:id/abbrechen — einen laufenden oder wartenden Lauf abbrechen,
// gleich von wem er stammt.
router.post(
  '/:id/abbrechen',
  requireAuth,
  requireRole('admin'),
  validateParams(RunIdParams),
  asyncHandler(async (req, res) => {
    const run = await flowRunner.abbrechen({ runId: req.params.id });
    if (!run) {
      throw new NotFoundError(`Kein laufender Flow-Lauf ${req.params.id}`);
    }
    logSecurityEvent({
      userId: req.user.id,
      action: 'lauf_abgebrochen',
      details: { run_id: Number(req.params.id), app_id: run.app_id, flow: run.flow_name },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data: run, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
