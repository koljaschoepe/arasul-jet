/**
 * Rueckmeldungen aus dem Rahmen (J42, M7, Karte rueckmeldung-im-rahmen).
 *
 *   POST   /api/rueckmeldungen          melden (jeder mit Zugang zur App)
 *   GET    /api/rueckmeldungen          die Liste: die eigenen, mit dem Recht
 *                                       in der Werkstatt alle (J52)
 *   GET    /api/rueckmeldungen/:id/bild das Bildschirmfoto: das eigene, mit
 *                                       dem Recht jedes
 *   PATCH  /api/rueckmeldungen/:id      Stand setzen (nur mit dem Recht, J44)
 *   DELETE /api/rueckmeldungen/:id      entfernen, mit Bild (nur mit dem Recht)
 *
 * Seit J52 (22.11.2026) sieht jeder seine eigenen Meldungen mit Stand und
 * Grund in der Werkstatt (schleife.md, Regel 2, neu); fremde Meldungen und
 * ihre Bilder nur, wer das Recht in der Werkstatt hat (Kennzeichen
 * `admin_users.entwickler`). Die Antwort auf GET sagt in `sicht`, welche
 * Sicht galt. Vertrag: docs/features/RUECKMELDUNG.md.
 *
 * DROSSEL JE PERSON, eigene fuer das Melden (21.11.2026): 20 Meldungen je
 * Viertelstunde. Bis dahin gab es hier keine, weil `createUserRateLimiter`
 * alle Zwecke in einem Speicher je Person zaehlte und drei Meldungen danach
 * den Passwortwechsel sperrten. Seitdem zaehlt jeder Zweck fuer sich
 * (`middleware/rateLimit.js`). Zwanzig genuegen jedem, der ernsthaft meldet,
 * und halten eine Schleife auf, die mit je 6 MB Bild die Platte fuellt.
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
  StandSetzenBody,
} = require('../schemas/rueckmeldungen');
const { logSecurityEvent } = require('../utils/auditLog');
const { createUserRateLimiter } = require('../middleware/rateLimit');
const rueckmeldungen = require('../services/rueckmeldung/rueckmeldungen');

/** Melden: 20 je Viertelstunde und Person, eigener Zaehler (Zweck `rueckmeldung`). */
const meldeDrossel = createUserRateLimiter(20, 15 * 60 * 1000, 'rueckmeldung');

/** Vor jedem Weg, der fremde Meldungen beruehrt: das Recht, frisch aus der Datenbank. */
const nurEntwickler = asyncHandler(async (req, res, next) => {
  await rueckmeldungen.pruefeEntwickler(req.user.id);
  next();
});

router.post(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  meldeDrossel,
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
  validateQuery(RueckmeldungenQuery),
  asyncHandler(async (req, res) => {
    const alle = await rueckmeldungen.hatWerkstattRecht(req.user.id);
    const data = await rueckmeldungen.liste({
      appId: req.query.app_id,
      personId: alle ? undefined : req.user.id,
    });
    res.json({ data, sicht: alle ? 'alle' : 'eigene', timestamp: new Date().toISOString() });
  })
);

router.get(
  '/:id/bild',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateParams(RueckmeldungId),
  asyncHandler(async (req, res) => {
    const alle = await rueckmeldungen.hatWerkstattRecht(req.user.id);
    const bytes = await rueckmeldungen.bild(req.params.id, {
      personId: alle ? undefined : req.user.id,
    });
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' }).send(bytes);
  })
);

/**
 * Den Stand setzen, in der Werkstatt (J44): neu, angenommen, umgesetzt,
 * abgelehnt; bei abgelehnt mit Grund. Dieselbe Regel und derselbe Eintrag im
 * Protokoll wie beim Kit (`rueckmeldung_stand_gesetzt`), nur mit der Person
 * statt eines Schluessels. Der Melder sieht Stand und Grund danach in seiner
 * Werkstatt (Regel 2 seit J52).
 */
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  nurEntwickler,
  validateParams(RueckmeldungId),
  validateBody(StandSetzenBody),
  asyncHandler(async (req, res) => {
    const data = await rueckmeldungen.setzeStandAmGeraet({
      id: req.params.id,
      standMeldung: req.body.stand_meldung,
      grund: req.body.grund,
      durch: `person:${req.user.id}`,
    });
    await logSecurityEvent({
      userId: req.user.id,
      action: 'rueckmeldung_stand_gesetzt',
      details: {
        app_id: data.app_id,
        rueckmeldung: data.id,
        vorher: data.vorher,
        nachher: data.stand_meldung,
        mit_grund: Boolean(data.grund),
        durch: 'werkstatt',
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
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
