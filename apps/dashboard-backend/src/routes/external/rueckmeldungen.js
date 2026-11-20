/**
 * Die Rueckmeldungen einer App fuer das Kit (J43, M7, Karte
 * rueckmeldung-schnittstelle).
 *
 *   GET   /api/v1/external/apps/:id/rueckmeldungen            die Meldungen lesen
 *   GET   /api/v1/external/apps/:id/rueckmeldungen/:nr/bild   ein Bild, nur mit Erlaubnis
 *   PATCH /api/v1/external/apps/:id/rueckmeldungen/:nr        den Stand setzen
 *
 * WER DARF: ein Schluessel mit dem Bereich `feedback:agent`
 * (`config/apiBereiche.js`), angelegt mit `scripts/util/kit-schluessel.sh`.
 * Ein Schluessel, der nur `app:deploy` traegt, bekommt 403: in den Meldungen
 * stehen Namen von Mitarbeitern. Ist ein Schluessel an eine App gebunden
 * (die Schluessel, die das Geraet den Apps mitgibt), liest er hoechstens
 * deren Meldungen -- einen solchen mit `feedback:agent` legt heute niemand an,
 * die Pruefung steht trotzdem hier.
 *
 * BILDER NUR MIT ERLAUBNIS JE APP (company/schleife.md, Regel 3): der Schalter
 * steht in Einstellungen › Apps, Vorgabe aus. Was das an der Antwort aendert,
 * steht im Dienst bei `fuerAgenten`.
 *
 * JEDE ABFRAGE STEHT IM PROTOKOLL (`audit_logs`): wer (Schluessel, Praefix und
 * Name, und dessen Besitzer), wann, welche App, mit oder ohne Bilder, wie viele
 * Meldungen. Gewartet wird auf die Zeile, bevor die Antwort geht -- ein
 * Protokoll, das hinterherlaeuft, fehlt genau dann, wenn der Prozess stirbt.
 *
 * Vertrag mit Beispielen: docs/features/RUECKMELDUNG.md, Abschnitt
 * „Schnittstelle für das Kit". Die Wege stehen auch im Kontrakt
 * (`services/app/appKontrakt.js`, `endpunkte` und `rueckmeldungen`).
 */

const express = require('express');
const router = express.Router();
const { requireApiKey, requireEndpoint } = require('../../middleware/apiKeyAuth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../../middleware/validate');
const {
  KitRueckmeldungenParams,
  KitRueckmeldungParams,
  KitRueckmeldungenQuery,
  StandSetzenBody,
} = require('../../schemas/rueckmeldungen');
const rueckmeldungen = require('../../services/rueckmeldung/rueckmeldungen');
const { ForbiddenError } = require('../../utils/errors');
const { logSecurityEvent } = require('../../utils/auditLog');

const BEREICH = 'feedback:agent';

/** Ein an eine App gebundener Schluessel liest nur deren Meldungen. */
function nurEigeneApp(req, res, next) {
  if (req.apiKey.appId && req.apiKey.appId !== req.params.id) {
    return next(
      new ForbiddenError(
        `Dieser Schlüssel gehört zur App ${req.apiKey.appId}, nicht zu ${req.params.id}.`
      )
    );
  }
  return next();
}

/** Wer gefragt hat, so wie es ins Protokoll geht. */
function wer(req) {
  return {
    schluessel: req.apiKey.prefix,
    schluessel_name: req.apiKey.name,
  };
}

function protokolliere(req, action, details) {
  return logSecurityEvent({
    userId: req.apiKey.userId ?? null,
    action,
    details: { ...wer(req), ...details },
    ipAddress: req.ip,
    requestId: req.headers['x-request-id'],
  });
}

router.get(
  '/apps/:id/rueckmeldungen',
  requireApiKey,
  requireEndpoint(BEREICH),
  validateParams(KitRueckmeldungenParams),
  nurEigeneApp,
  validateQuery(KitRueckmeldungenQuery),
  asyncHandler(async (req, res) => {
    const data = await rueckmeldungen.fuerAgenten({
      appId: req.params.id,
      standMeldung: req.query.stand_meldung,
      stand: req.query.stand,
      grenze: req.query.grenze,
    });
    await protokolliere(req, 'rueckmeldungen_abgefragt', {
      app_id: data.app_id,
      mit_bildern: data.bilder_an_agenten,
      anzahl: data.anzahl,
      filter: {
        stand_meldung: req.query.stand_meldung ?? null,
        stand: req.query.stand ?? null,
      },
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

router.get(
  '/apps/:id/rueckmeldungen/:nr/bild',
  requireApiKey,
  requireEndpoint(BEREICH),
  validateParams(KitRueckmeldungParams),
  nurEigeneApp,
  asyncHandler(async (req, res) => {
    const bytes = await rueckmeldungen.bildFuerAgenten(req.params.id, req.params.nr);
    await protokolliere(req, 'rueckmeldung_bild_abgeholt', {
      app_id: req.params.id,
      rueckmeldung: req.params.nr,
      mit_bildern: true,
    });
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' }).send(bytes);
  })
);

router.patch(
  '/apps/:id/rueckmeldungen/:nr',
  requireApiKey,
  requireEndpoint(BEREICH),
  validateParams(KitRueckmeldungParams),
  nurEigeneApp,
  validateBody(StandSetzenBody),
  asyncHandler(async (req, res) => {
    const data = await rueckmeldungen.setzeStand({
      appId: req.params.id,
      nr: req.params.nr,
      standMeldung: req.body.stand_meldung,
      grund: req.body.grund,
      durch: `schluessel:${req.apiKey.prefix}`,
    });
    await protokolliere(req, 'rueckmeldung_stand_gesetzt', {
      app_id: req.params.id,
      rueckmeldung: req.params.nr,
      vorher: data.vorher,
      nachher: data.stand_meldung,
      mit_grund: Boolean(data.grund),
      mit_bildern: 'bild' in data,
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
