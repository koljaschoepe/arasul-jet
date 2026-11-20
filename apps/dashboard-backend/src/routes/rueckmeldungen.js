/**
 * Rueckmeldungen aus dem Rahmen (J42, M7, Karte rueckmeldung-im-rahmen).
 *
 *   POST   /api/rueckmeldungen          melden (jeder mit Zugang zur App)
 *   GET    /api/rueckmeldungen          die Liste (nur Kennzeichen Entwickler)
 *   GET    /api/rueckmeldungen/:id/bild das Bildschirmfoto (nur Entwickler)
 *   DELETE /api/rueckmeldungen/:id      entfernen, mit Bild (nur Entwickler)
 *
 * Der Melder sieht nach dem Absenden nur die Bestaetigung: die Antwort auf
 * POST nennt Nummer und Zeit, sonst nichts, und es gibt keinen Weg, die
 * eigenen Meldungen wieder zu lesen (schleife.md, Regel 2). Vertrag:
 * docs/features/RUECKMELDUNG.md.
 *
 * KEINE DROSSEL JE PERSON, mit Absicht: `createUserRateLimiter` teilt sich
 * einen Speicher je Person mit der Drossel des Passwortwechsels, und drei
 * Meldungen sperrten danach 15 Minuten lang den Passwortwechsel. Gegen eine
 * volle Platte steht die Grenze von 6 MB je Bild im Dienst.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const {
  RueckmeldungBody,
  RueckmeldungId,
  RueckmeldungenQuery,
} = require('../schemas/rueckmeldungen');
const rueckmeldungen = require('../services/rueckmeldung/rueckmeldungen');

/** Vor jedem lesenden Weg: das Kennzeichen, frisch aus der Datenbank. */
const nurEntwickler = asyncHandler(async (req, res, next) => {
  await rueckmeldungen.pruefeEntwickler(req.user.id);
  next();
});

router.post(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateBody(RueckmeldungBody),
  asyncHandler(async (req, res) => {
    const { id, erstellt_am } = await rueckmeldungen.melde({
      personId: req.user.id,
      appId: req.body.app_id,
      stand: req.body.stand,
      seite: req.body.seite,
      text: req.body.text,
      bild: req.body.bild ?? null,
      markierung: req.body.markierung ?? null,
    });
    res.status(201).json({ data: { id, erstellt_am }, timestamp: new Date().toISOString() });
  })
);

router.get(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  nurEntwickler,
  validateQuery(RueckmeldungenQuery),
  asyncHandler(async (req, res) => {
    const data = await rueckmeldungen.liste({ appId: req.query.app_id });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

router.get(
  '/:id/bild',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  nurEntwickler,
  validateParams(RueckmeldungId),
  asyncHandler(async (req, res) => {
    const bytes = await rueckmeldungen.bild(req.params.id);
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' }).send(bytes);
  })
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  nurEntwickler,
  validateParams(RueckmeldungId),
  asyncHandler(async (req, res) => {
    await rueckmeldungen.loesche(req.params.id);
    res.json({ data: { id: req.params.id, entfernt: true }, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
