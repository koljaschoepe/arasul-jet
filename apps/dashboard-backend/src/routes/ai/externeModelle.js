/**
 * Externe Cloud-Modelle verwalten (Plan 023 D9).
 *
 * Endpunkte:
 * - GET    /api/modelle-extern            Stand aller Anbieter (ohne Schlüssel)
 * - PUT    /api/modelle-extern/:anbieter  Schlüssel hinterlegen oder ersetzen
 * - DELETE /api/modelle-extern/:anbieter  Schlüssel entfernen
 * - POST   /api/modelle-extern/:anbieter/pruefen  Schlüssel gegen den Anbieter prüfen
 * - POST   /api/modelle-extern/:anbieter/schalten Anbieter ein- oder ausschalten
 * - GET    /api/modelle-extern/modelle    Die heute wählbaren externen Modelle
 *
 * Der Schlüssel geht in EINE Richtung: hinein. Es gibt bewusst keinen
 * Endpunkt, der ihn zurückgibt. Die Oberfläche zeigt die letzten vier
 * Zeichen, und die stehen als eigene Spalte in der Datenbank.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams } = require('../../middleware/validate');
const { apiLimiter } = require('../../middleware/rateLimit');
const {
  ExternerAnbieterParams,
  ExternerSchluesselBody,
  ExternerSchalterBody,
} = require('../../schemas/externeModelle');
const speicher = require('../../services/llm/extern/schluesselSpeicher');
const externeModelle = require('../../services/llm/extern/externeModelle');

/**
 * GET /api/modelle-extern
 * Der Stand aller bekannten Anbieter, auch der ohne Schlüssel.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      data: await speicher.anbieterStand(),
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/modelle-extern/modelle
 * Die externen Modelle, die heute wählbar sind. Ohne eingeschalteten
 * Anbieter mit Schlüssel ist die Liste leer, und zwar von selbst.
 */
router.get(
  '/modelle',
  requireAuth,
  asyncHandler(async (req, res) => {
    const modelle = await externeModelle.modelleListen({ frisch: req.query.frisch === 'true' });
    res.json({
      data: modelle,
      total: modelle.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/modelle-extern/:anbieter
 * Schlüssel hinterlegen oder ersetzen. Der Anbieter bleibt danach aus, bis
 * jemand ihn ausdrücklich einschaltet.
 */
router.put(
  '/:anbieter',
  requireAuth,
  apiLimiter,
  validateParams(ExternerAnbieterParams),
  validateBody(ExternerSchluesselBody),
  asyncHandler(async (req, res) => {
    const zeile = await speicher.schluesselSetzen(req.params.anbieter, req.body.schluessel);
    externeModelle.speicherLeeren(req.params.anbieter);
    res.json({ data: zeile, timestamp: new Date().toISOString() });
  })
);

/**
 * DELETE /api/modelle-extern/:anbieter
 */
router.delete(
  '/:anbieter',
  requireAuth,
  validateParams(ExternerAnbieterParams),
  asyncHandler(async (req, res) => {
    const entfernt = await speicher.schluesselEntfernen(req.params.anbieter);
    externeModelle.speicherLeeren(req.params.anbieter);
    res.json({ data: { entfernt }, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/modelle-extern/:anbieter/pruefen
 * Holt die Modellliste. Das ist der billigste Aufruf, der einen Schlüssel
 * wirklich beweist: er erzeugt kein einziges Token.
 */
router.post(
  '/:anbieter/pruefen',
  requireAuth,
  apiLimiter,
  validateParams(ExternerAnbieterParams),
  asyncHandler(async (req, res) => {
    const ergebnis = await externeModelle.schluesselPruefen(req.params.anbieter);
    res.json({ data: ergebnis, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/modelle-extern/:anbieter/schalten
 */
router.post(
  '/:anbieter/schalten',
  requireAuth,
  validateParams(ExternerAnbieterParams),
  validateBody(ExternerSchalterBody),
  asyncHandler(async (req, res) => {
    const zeile = await speicher.aktivSetzen(req.params.anbieter, req.body.aktiv);
    res.json({ data: zeile, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
