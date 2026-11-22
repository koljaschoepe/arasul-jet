/**
 * Was nur die Werkstatt braucht (J44, M7; seit J52, Karte
 * werkstatt-und-rechte, heisst das Entwickler-Cockpit Werkstatt).
 *
 *   GET /api/werkstatt/ich    hat die Person das Recht in der Werkstatt?
 *                             (jeder Angemeldete; die Oberflaeche zeigt
 *                             danach die Seiten zu Apps und Live)
 *   GET /api/werkstatt/apps   je App Test und Live, zuletzt geaendert,
 *                             offene Meldungen, ob Test neuer ist als Live
 *                             (nur mit dem Recht)
 *
 * Bis J52 hiess der zweite Weg `/api/entwickler/apps`. Nur das Cockpit rief
 * ihn, und das kommt im selben Abbild wie dieses Backend; einen Umweg fuer
 * die alte Adresse braucht es darum nicht.
 *
 * Die Werkstatt ist eine mitgelieferte App ohne eigenes Backend; sie ruft die
 * Plattform-API mit der Sitzung des Menschen (`services/app/mitgeliefert.js`).
 * Die Meldungen selbst kommen ueber `/api/rueckmeldungen`, geschaltet wird
 * ueber `POST /api/apps/:id/schalten` -- hier steht nur, was es sonst nirgends
 * gibt. Das Recht ist das Kennzeichen `admin_users.entwickler`, frisch aus
 * der Datenbank; die Rolle Administrator allein reicht nicht.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const rueckmeldungen = require('../services/rueckmeldung/rueckmeldungen');
const werkstatt = require('../services/app/werkstatt');

const nurMitRecht = asyncHandler(async (req, res, next) => {
  await rueckmeldungen.pruefeEntwickler(req.user.id);
  next();
});

router.get(
  '/ich',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const recht = await rueckmeldungen.hatWerkstattRecht(req.user.id);
    res.json({ data: { recht }, timestamp: new Date().toISOString() });
  })
);

router.get(
  '/apps',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  nurMitRecht,
  asyncHandler(async (req, res) => {
    const data = await werkstatt.apps();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
