/**
 * Die Ausweise eines Menschen (Bruecke, 21.09.2026, J34).
 *
 *   GET    /api/ausweise        meine Ausweise
 *   POST   /api/ausweise        einen ausstellen -- der Wert kommt EINMAL
 *   GET    /api/ausweise/alle   alle am Geraet, mit Eigentuemer (Administrator)
 *   DELETE /api/ausweise/:id    widerrufen: ich meine, der Administrator jeden
 *
 * BEI DEN KERN-WEGEN UND NICHT UNTER `admin/`. Ein Ausweis gehoert dem
 * Angemeldeten, jeder darf einen haben, und niemand stellt einen fuer einen
 * anderen aus -- dieselbe Linie wie die Notizen (D1) und `/api/apps/meine`.
 * Der Administrator kommt hier nur in EINER Rolle vor, und zwar in der des
 * Betreibers: er sieht, welche Ausweise am Geraet liegen, und er kann einen
 * widerrufen. Ausstellen kann er nur fuer sich selbst.
 *
 * WARUM AUSSTELLEN NICHT FUER ANDERE GEHT. Der Wert wird genau einmal
 * gezeigt, und zwar dem, der vor dem Bildschirm sitzt. Ein Ausweis, den ein
 * Administrator fuer jemanden ausstellt, muss auf einem Weg zu diesem
 * Menschen -- und dieser Weg ist eine Mail oder ein Zettel. Der Ausweis ist
 * das Gegenteil davon: er entsteht dort, wo er liegen bleibt.
 *
 * KEINE DRITTE ROLLE. Die Route zum Widerrufen traegt `admin, mitarbeiter`
 * und schneidet DARIN zu: wer nicht Administrator ist, bekommt seinen eigenen
 * Ausweis weggenommen und sonst keinen. Der Unterschied liegt also nicht in
 * der Rollenpruefung, sondern in einer Zeile des Dienstes -- und dort gehoert
 * er hin, weil er von den Daten abhaengt und nicht vom Weg.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateParams } = require('../middleware/validate');
const { AusweisBody, AusweisParams } = require('../schemas/ausweise');
const mitarbeiterAusweis = require('../services/auth/mitarbeiterAusweis');
const { logSecurityEvent } = require('../utils/auditLog');
const { NotFoundError, ConflictError } = require('../utils/errors');

/** GET /api/ausweise — meine Ausweise, ohne Werte. Es gibt keine mehr. */
router.get(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const data = await mitarbeiterAusweis.liste(req.user.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/ausweise/alle — alle Ausweise am Geraet.
 *
 * VOR `/:id` gibt es hier nichts zu klaeren -- `:id` ist eine Zahl und hat
 * nur ein DELETE. Die Route steht trotzdem hier oben, weil sie zur Liste
 * daneben gehoert und nicht zum Widerruf darunter.
 */
router.get(
  '/alle',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = await mitarbeiterAusweis.listeAlle();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/ausweise — einen Ausweis ausstellen.
 *
 * `ausweis` im Rumpf der Antwort ist das einzige Mal, dass dieser Wert das
 * Geraet verlaesst. Er steht deshalb NICHT im Audit-Log und in keiner
 * Logzeile -- dort steht der Vorsatz, an dem ein Mensch die Zeile
 * wiedererkennt.
 */
router.post(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateBody(AusweisBody),
  asyncHandler(async (req, res) => {
    let angelegt;
    try {
      angelegt = await mitarbeiterAusweis.stelleAus({
        benutzerId: req.user.id,
        name: req.body.name,
      });
    } catch (err) {
      // Zwei Ausweise mit demselben Namen waeren zwei Zeilen, die derselbe
      // Rechner zu sein behaupten. Der Fehlerbehandler macht aus 23505 zwar
      // ohnehin einen 409, aber ohne den Satz, der sagt, was zu tun ist.
      if (err.code === '23505') {
        throw new ConflictError(
          `Es gibt schon einen Ausweis mit dem Namen „${req.body.name}". ` +
            'Widerrufen Sie ihn oder nehmen Sie einen anderen Namen.'
        );
      }
      throw err;
    }
    await logSecurityEvent({
      userId: req.user.id,
      action: 'ausweis_ausgestellt',
      details: { ausweisId: angelegt.id, name: angelegt.name, praefix: angelegt.praefix },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.status(201).json({ data: angelegt, timestamp: new Date().toISOString() });
  })
);

/**
 * DELETE /api/ausweise/:id — widerrufen.
 *
 * Ein Mitarbeiter widerruft seinen eigenen, der Administrator jeden. Ein
 * Ausweis, den es nicht gibt, und einer, der einem anderen gehoert, sind fuer
 * den Aufrufer DIESELBE Antwort: 404. Andernfalls waere die Nummernfolge eine
 * Auskunft darueber, wie viele Ausweise am Geraet liegen.
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateParams(AusweisParams),
  asyncHandler(async (req, res) => {
    const weg = await mitarbeiterAusweis.widerrufe({
      ausweisId: req.params.id,
      nurBenutzer: req.user.role === 'admin' ? null : req.user.id,
    });
    if (!weg) {
      throw new NotFoundError('Diesen Ausweis gibt es nicht.');
    }
    await logSecurityEvent({
      userId: req.user.id,
      action: 'ausweis_widerrufen',
      details: { ausweisId: weg.id, name: weg.name, praefix: weg.praefix, gehoert: weg.user_id },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data: { id: weg.id, name: weg.name }, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
