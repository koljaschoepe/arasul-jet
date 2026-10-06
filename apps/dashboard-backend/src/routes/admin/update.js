/**
 * Update API routes
 * Die eigene Fassung und das Einspielen einer neuen (J39).
 */

const { versionFuerAnzeige, versionFuerVergleich, versionBekannt } = require('../../utils/version');
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const fassungsdienst = require('../../services/betrieb/fassungsdienst');
const nachtUpdate = require('../../services/betrieb/nachtUpdate');
const { asyncHandler } = require('../../middleware/errorHandler');
const { logSecurityEvent } = require('../../utils/auditLog');
const { validateBody } = require('../../middleware/validate');
const { UpdateFassungBody, UpdateNachtsBody } = require('../../schemas/admin-update');

// GET /api/update/status - die eigene Fassung.
//
// Das Ara-Kit liest hier vor und nach einem Update `fassung.version`
// (`upgrade.mjs`). Der Rest der alten Antwort beschrieb den Offline-Weg ueber
// ein `.araupdate`-Paket (Hochladen, USB-Stick); der lief am Geraet nie, weil
// das Backend kein `docker`-Programm hat, und ist mit der Totcode-Pruefung vom
// 06.10.2026 gefallen. Aktualisiert wird ueber `/api/update/fassung` darunter,
// ohne Netz an der Konsole mit `./arasul update`.
router.get(
  '/status',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    // Die eigene Fassung ist die erste Frage, die jemand an den
    // Aktualisierungsweg stellt, und die ehrliche Antwort lautet an einem
    // Vorseriengeraet: unbekannt. Sie kommt aus dem Bau (Phase C10).
    res.json({
      status: 'idle',
      fassung: {
        version: versionBekannt() ? versionFuerVergleich() : null,
        anzeige: versionFuerAnzeige(),
        bekannt: versionBekannt(),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// ---------------------------------------------------------------------------
// Die Plattform auf eine neue Fassung bringen (J39). Dieselbe Logik wie
// `/api/v1/external/update`, nur mit Sitzung statt Schluessel.
// ---------------------------------------------------------------------------

// GET /api/update/fassung - Stand und Fortschritt
router.get(
  '/fassung',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json({ data: await fassungsdienst.stand(), timestamp: new Date().toISOString() });
  })
);

// GET /api/update/fassung/neueste - die neueste Fassung im Netz
router.get(
  '/fassung/neueste',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const neueste = await fassungsdienst.neuesteFassung();
    res.json({ data: neueste, timestamp: new Date().toISOString() });
  })
);

// POST /api/update/fassung/einspielen - einspielen (202)
router.post(
  '/fassung/einspielen',
  requireAuth,
  requireRole('admin'),
  validateBody(UpdateFassungBody),
  asyncHandler(async (req, res) => {
    const data = await fassungsdienst.spieleEin({
      fassung: req.body.fassung ?? null,
      durch: req.user.username,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'fassung_einspielen',
      details: { von: data.von, nach: data.nach },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.status(202).json({ data, timestamp: new Date().toISOString() });
  })
);

// POST /api/update/fassung/zurueck - zurueck auf die vorige Fassung (202)
router.post(
  '/fassung/zurueck',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = await fassungsdienst.zurueck({ durch: req.user.username });
    logSecurityEvent({
      userId: req.user.id,
      action: 'fassung_zurueck',
      details: { nach: data.nach },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.status(202).json({ data, timestamp: new Date().toISOString() });
  })
);

// ---------------------------------------------------------------------------
// Aktualisierung nachts auf Wunsch (M5, update-nachts)
// ---------------------------------------------------------------------------

// GET /api/update/fassung/nachts - Schalter, Fenster, letzte Nacht, Hinweis
router.get(
  '/fassung/nachts',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json({ data: await nachtUpdate.stand(), timestamp: new Date().toISOString() });
  })
);

// PUT /api/update/fassung/nachts - Schalter setzen
router.put(
  '/fassung/nachts',
  requireAuth,
  requireRole('admin'),
  validateBody(UpdateNachtsBody),
  asyncHandler(async (req, res) => {
    await nachtUpdate.setzeAn(req.body.aktiv);
    logSecurityEvent({
      userId: req.user.id,
      action: req.body.aktiv ? 'update_nachts_an' : 'update_nachts_aus',
      details: {},
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data: await nachtUpdate.stand(), timestamp: new Date().toISOString() });
  })
);

// POST /api/update/fassung/nachts/trockenlauf - den Ablauf prüfen, nichts ändern
router.post(
  '/fassung/nachts/trockenlauf',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const lauf = await nachtUpdate.trockenlauf();
    res.json({ data: lauf, timestamp: new Date().toISOString() });
  })
);

// POST /api/update/fassung/nachts/gesehen - den Hinweis vom Morgen wegklicken
router.post(
  '/fassung/nachts/gesehen',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await nachtUpdate.hinweisGesehen();
    res.json({ data: { ok: true }, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
