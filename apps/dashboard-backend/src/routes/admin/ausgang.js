/**
 * Ausgang: wohin Apps und Plattform ins Internet wollen (J38).
 *
 *   GET  /api/ausgang            -- fuer den Administrator: je App eingetragen,
 *                                   genutzt, abgewiesen; dazu die Plattform
 *   GET  /api/ausgang/regeln     -- fuer den Ausgangs-Proxy
 *   POST /api/ausgang/ereignisse -- vom Ausgangs-Proxy
 *
 * Die zwei Wege des Proxys tragen keine Sitzung, sondern den Kopf
 * `X-Egress-Token` (HMAC aus dem Geheimnis des Geraets, siehe
 * `ausgangsProxy.tokenFuer`).
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody } = require('../../middleware/validate');
const { UnauthorizedError } = require('../../utils/errors');
const { EreignisseBody } = require('../../schemas/ausgang');
const ausgang = require('../../services/app/ausgangsProxy');

function nurProxy(req, res, next) {
  if (!ausgang.dienstTokenGueltig(req.headers['x-egress-token'])) {
    throw new UnauthorizedError('Nur der Ausgangs-Proxy darf das');
  }
  next();
}

router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json({ data: await ausgang.uebersicht(), timestamp: new Date().toISOString() });
  })
);

router.get(
  '/regeln',
  nurProxy,
  asyncHandler(async (req, res) => {
    res.json({ regeln: await ausgang.regeln() });
  })
);

router.post(
  '/ereignisse',
  nurProxy,
  validateBody(EreignisseBody),
  asyncHandler(async (req, res) => {
    await ausgang.nimmAuf(req.body.ereignisse);
    res.json({ angenommen: req.body.ereignisse.length });
  })
);

module.exports = router;
