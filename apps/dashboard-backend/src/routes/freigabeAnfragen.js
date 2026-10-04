/**
 * Freigabe-Anfragen aus einem Flow (Phase C7 des Umbaus vom 26.08.2026).
 *
 * Drei Wege, und alle drei gehen ueber die SITZUNG, nicht ueber einen
 * Schluessel: hier entscheidet ein Mensch, und ein Mensch ist angemeldet.
 *
 *   GET    /api/freigabe-anfragen                was liegt bei mir
 *   GET    /api/freigabe-anfragen/bei-anderen    was ich uebernehmen koennte (M5)
 *   POST   /api/freigabe-anfragen/:id/bestaetigen  ja
 *   POST   /api/freigabe-anfragen/:id/ablehnen     nein, mit Begruendung
 *   POST   /api/freigabe-anfragen/:id/uebernehmen  liegt danach bei mir (M5)
 *   POST   /api/freigabe-anfragen/:id/weitergeben  liegt danach bei `an` (M5)
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
const {
  AnfrageParams,
  AblehnenBody,
  BestaetigenBody,
  UebernehmenBody,
  WeitergebenBody,
} = require('../schemas/freigabeAnfragen');
const freigabeAnfragen = require('../services/flows/freigabeAnfragen');
const { logSecurityEvent } = require('../utils/auditLog');

/**
 * GET /api/freigabe-anfragen — die offenen Freigaben, die bei mir liegen.
 *
 * Seit M5 (04.10.2026) nur, was bei MIR liegt: bei mir persoenlich oder, ohne
 * Standardperson der Stufe, bei allen im Kreis. Die Startseite („Für Sie")
 * und die Zahl am Haus lesen diese Liste.
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
 * GET /api/freigabe-anfragen/bei-anderen — was ich entscheiden duerfte, das
 * aber bei einem anderen liegt (M5). Von hier aus uebernimmt man.
 */
router.get(
  '/bei-anderen',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const data = await freigabeAnfragen.listeBeiAnderen(req.user.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/freigabe-anfragen/eingereicht — was ich eingereicht habe und was
 * noch offen ist, mit dem Kreis, der entscheiden kann (J35, 26.09.2026).
 *
 * Bei vier Augen sieht der Einreicher seine Anfrage in der Liste oben nicht,
 * und das ist richtig; ohne diesen Weg wusste er aber auch nicht, bei wem sie
 * liegt. Nur lesen, nur die eigenen.
 */
router.get(
  '/eingereicht',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const data = await freigabeAnfragen.listeEingereichtVon(req.user.id);
    res.json({ data, ...freigabeAnfragen.ENTSCHEIDUNGSORT, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/freigabe-anfragen/:id/bestaetigen — ja, optional mit korrigierten
 * Feldern (`{"felder": {"datum": "01.10.2026"}}`, M5). Ein Feld, das die App
 * nicht als aenderbar erklaert, ist 400.
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
      felder: req.body.felder,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'freigabe_bestaetigt',
      details: {
        anfrage: data.id,
        app_id: data.app_id,
        stand: data.stand,
        lauf: data.run_id,
        // Welche Felder geaendert wurden, nicht ihr Inhalt: der steht an der
        // Anfrage, und ein Protokoll ist kein zweiter Ort fuer Belegdaten.
        ...(data.korrekturen?.length ? { geaendert: data.korrekturen.map(k => k.feld) } : {}),
      },
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

/**
 * POST /api/freigabe-anfragen/:id/uebernehmen — die Anfrage liegt danach bei
 * mir (M5). Jeder im Kreis darf das; wer nicht im Kreis steht, bekommt 403.
 */
router.post(
  '/:id/uebernehmen',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateParams(AnfrageParams),
  validateBody(UebernehmenBody),
  asyncHandler(async (req, res) => {
    const data = await freigabeAnfragen.uebernehmen({
      id: req.params.id,
      benutzerId: req.user.id,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'freigabe_uebernommen',
      details: {
        anfrage: data.id,
        app_id: data.app_id,
        stand: data.stand,
        lauf: data.run_id,
        vorher: data.vorher,
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/freigabe-anfragen/:id/weitergeben — `{"an": "<benutzername>"}`,
 * die Anfrage liegt danach bei diesem Menschen (M5). Er muss sie entscheiden
 * duerfen (Zugang, nicht der Einreicher), sonst 400.
 */
router.post(
  '/:id/weitergeben',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateParams(AnfrageParams),
  validateBody(WeitergebenBody),
  asyncHandler(async (req, res) => {
    const data = await freigabeAnfragen.weitergeben({
      id: req.params.id,
      benutzerId: req.user.id,
      an: req.body.an,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'freigabe_weitergegeben',
      details: {
        anfrage: data.id,
        app_id: data.app_id,
        stand: data.stand,
        lauf: data.run_id,
        an: data.liegt_bei,
        vorher: data.vorher,
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
