/**
 * Freigabe-Anfragen aus einem Flow (Phase C7 des Umbaus vom 26.08.2026).
 *
 * Drei Wege, und alle drei gehen ueber die SITZUNG, nicht ueber einen
 * Schluessel: hier entscheidet ein Mensch, und ein Mensch ist angemeldet.
 *
 *   GET    /api/freigabe-anfragen                was wartet auf mich
 *   POST   /api/freigabe-anfragen/:id/bestaetigen  ja
 *   POST   /api/freigabe-anfragen/:id/ablehnen     nein, mit Begruendung
 *
 * ADMINISTRATOR UND MITARBEITER, ausdruecklich beide. Freigeben ist Arbeit und
 * keine Verwaltung; wer die App benutzen darf, darf ihre Freigaben
 * entscheiden. Wer das ist, sagt `app_members` (Phase C2) -- der Flow nennt
 * keine Person und kein Rollenmodell (Entscheidung Kolja vom 27.08.2026).
 *
 * NICHT ZU VERWECHSELN mit `/api/freigaben` (routes/admin/freigaben.js): das
 * ist die Freigabe einer APP fuer einen Menschen, ein Admin-Weg. Die beiden
 * haengen zusammen -- das eine ist die Voraussetzung fuer das andere -- und
 * sind trotzdem verschiedene Gegenstaende.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateParams } = require('../middleware/validate');
const { AnfrageParams, AblehnenBody, BestaetigenBody } = require('../schemas/freigabeAnfragen');
const freigabeAnfragen = require('../services/flows/freigabeAnfragen');
const { logSecurityEvent } = require('../utils/auditLog');

/**
 * GET /api/freigabe-anfragen — die offenen Freigaben meiner Apps.
 *
 * „Meiner Apps" ist keine Bequemlichkeit, sondern die Berechtigung: die
 * Abfrage verbindet mit `app_members`, und was dort nicht steht, kommt hier
 * nicht heraus. Eine Liste, die erst alles holt und dann siebt, waere zwei
 * Stellen mit derselben Regel.
 */
router.get(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const data = await freigabeAnfragen.listeOffeneFuer(req.user.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/freigabe-anfragen/:id/bestaetigen — ja.
 *
 * Der Lauf laeuft danach weiter, ab dem Schritt, an dem er angehalten hat.
 * `fortgesetzt: false` heisst: die Entscheidung steht, aber niemand hat sie
 * mehr weitergefuehrt (das Backend ist zwischendurch neu gestartet). Das wird
 * gesagt und nicht verschwiegen -- sonst wartet jemand auf ein Ergebnis, das
 * nie kommt.
 */
router.post(
  '/:id/bestaetigen',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateParams(AnfrageParams),
  validateBody(BestaetigenBody),
  asyncHandler(async (req, res) => {
    const data = await freigabeAnfragen.entscheide({
      id: req.params.id,
      benutzerId: req.user.id,
      status: 'bestaetigt',
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'freigabe_bestaetigt',
      details: { anfrage: data.id, app_id: data.app_id, stand: data.stand, lauf: data.run_id },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/freigabe-anfragen/:id/ablehnen — nein, mit Begruendung.
 *
 * Der Lauf endet als `abgebrochen`, und die Begruendung wird sein Grund. Ein
 * Mensch hat ihn beendet; das ist kein Fehler des Geraets.
 */
router.post(
  '/:id/ablehnen',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateParams(AnfrageParams),
  validateBody(AblehnenBody),
  asyncHandler(async (req, res) => {
    const data = await freigabeAnfragen.entscheide({
      id: req.params.id,
      benutzerId: req.user.id,
      status: 'abgelehnt',
      begruendung: req.body.begruendung,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'freigabe_abgelehnt',
      details: { anfrage: data.id, app_id: data.app_id, stand: data.stand, lauf: data.run_id },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
