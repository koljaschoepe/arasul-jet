/**
 * Der Zettel in der rechten Spalte der Shell (Phase D1 des Umbaus vom
 * 26.08.2026).
 *
 *   GET /api/notizen    meinen Zettel lesen
 *   PUT /api/notizen    meinen Zettel schreiben
 *
 * ZWEI WEGE, KEIN DRITTER. Es gibt kein Loeschen: ein leerer Zettel ist ein
 * leerer Zettel, und `PUT {"inhalt": ""}` sagt genau das. Ein DELETE daneben
 * waere ein zweiter Weg in denselben Zustand.
 *
 * Es gibt auch keine Kennung in der Adresse. Der Zettel gehoert dem
 * Angemeldeten, und wer das ist, sagt die Sitzung -- nicht der Aufrufer. Eine
 * `/api/notizen/:id` waere eine Einladung, die Nummer eines anderen zu
 * probieren, und muesste dann an jeder Stelle wieder abwehren, was hier gar
 * nicht erst gefragt wird.
 *
 * ADMINISTRATOR UND MITARBEITER. Ein Zettel ist Arbeit, keine Verwaltung --
 * dieselbe Linie wie bei `/api/apps/meine` und `/api/freigabe-anfragen`.
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { NotizBody } = require('../schemas/notizen');

/**
 * GET /api/notizen — meinen Zettel.
 *
 * Ein Mensch ohne Zeile bekommt einen leeren Zettel und keine 404. "Ich habe
 * noch nichts geschrieben" ist kein Fehler, und die Oberflaeche muesste sonst
 * zwei Faelle unterscheiden, die dasselbe bedeuten.
 */
router.get(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const result = await db.query(
      'SELECT inhalt, geaendert_am FROM public.notizen WHERE user_id = $1',
      [req.user.id]
    );
    const zeile = result.rows[0];
    res.json({
      data: { inhalt: zeile?.inhalt ?? '', geaendert_am: zeile?.geaendert_am ?? null },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/notizen — meinen Zettel schreiben.
 *
 * Ein Schreibvorgang, kein Lesen-dann-Schreiben: der Primaerschluessel ist die
 * Benutzernummer (Migration 177), also loest `ON CONFLICT` den Fall "gibt es
 * noch nicht" mit auf. Zwei offene Fenster desselben Menschen ueberschreiben
 * einander damit; das ist bei einem Zettel die erwartete Ordnung und nicht der
 * Fall, fuer den man Versionen einfuehrt.
 */
router.put(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateBody(NotizBody),
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `INSERT INTO public.notizen (user_id, inhalt, geaendert_am)
            VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET inhalt = EXCLUDED.inhalt, geaendert_am = NOW()
         RETURNING inhalt, geaendert_am`,
      [req.user.id, req.body.inhalt]
    );
    res.json({ data: result.rows[0], timestamp: new Date().toISOString() });
  })
);

module.exports = router;
