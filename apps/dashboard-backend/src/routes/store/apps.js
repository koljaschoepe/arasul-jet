/**
 * Die Apps am Geraet, ueber die Schnittstelle (Phase C3 des Umbaus vom
 * 26.08.2026).
 *
 * Bis B7 war das hier ein Laden: ein Katalog von Manifesten, aus dem der
 * Administrator etwas aussuchte und installierte. Es gibt keinen Katalog mehr.
 * Eine App kommt vom Partner, der sie mit dem Ara-Kit gebaut und auf das Geraet
 * gerollt hat; diese Routen sagen, was davon da ist, spielen eine Version in
 * einen Stand ein und entfernen eine App wieder.
 *
 * Der Weg, auf dem ein PAKET ankommt (`POST /api/v1/apps`, gebaut und
 * versioniert am Geraet, mit dem Admin-Token aus `/device`), ist Phase C5. Bis
 * dahin liegt eine Version schon unter `/arasul/apps/<id>/<version>/`, und
 * `POST /:id/einspielen` nimmt sie von dort.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../../middleware/validate');
const { AppParams, EinspielenBody, LogsQuery, ZugangQuery } = require('../../schemas/apps');
const appStore = require('../../services/app/appStore');
const appContainer = require('../../services/app/appContainer');
const appZugang = require('../../services/app/appZugang');
const { logSecurityEvent } = require('../../utils/auditLog');

/**
 * GET /api/apps/meine — die Apps, die dem Aufrufer freigegeben sind.
 *
 * Die einzige Route hier, die auch ein Mitarbeiter aufrufen darf, und die
 * einzige, die keine Verwaltung ist: sie beantwortet die Frage aus der Vision,
 * „welche Apps sehe ich". Sie steht VOR `/:id`, sonst waere `meine` eine
 * App-Kennung.
 */
router.get(
  '/meine',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const data = await appStore.appsFuerNutzer(req.user.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/apps/:id/zugang — die Forward-Auth vor dem Backend einer App
 * (Phase C4).
 *
 * Traefik ruft diesen Endpunkt VOR jeder Anfrage an `/apps/<id>/api/` auf und
 * laesst sie nur durch, wenn hier eine 2xx herauskommt; die beiden Koepfe
 * `X-Arasul-User` und `X-Arasul-Role` gehen aus der Antwort in die Anfrage an
 * die App ueber. Das Etikett dazu haengt am Container
 * (`services/app/appContainer.js`), nicht in `middlewares.yml`: es traegt die
 * Kennung der App und ihren Stand, und beides weiss nur, wer den Container
 * anlegt.
 *
 * Warum das hier eine gewoehnliche Route mit `requireAuth` und `requireRole`
 * ist und nicht ein Sonderfall wie `GET /api/auth/verify`: die Antworten, die
 * eine Forward-Auth braucht, sind genau die, die der Fehlerbehandler ohnehin
 * baut -- 401 ohne Sitzung, 403 ohne Freigabe, 404 ohne Stand. Ein zweiter Weg
 * daneben waere ein zweiter Ort, an dem dieselbe Regel steht.
 *
 * Beide Rollen duerfen fragen. Ob jemand eine App benutzen darf, entscheidet
 * die Freigabe und nicht die Rolle (Entscheidung aus C2).
 */
router.get(
  '/:id/zugang',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateParams(AppParams),
  validateQuery(ZugangQuery),
  asyncHandler(async (req, res) => {
    const data = await appZugang.pruefe({
      benutzerId: req.user.id,
      appId: req.params.id,
      stand: req.query.stand,
    });
    appZugang.setzeKoepfe(res, req.user);
    res.json({
      data: { ...data, benutzer: req.user.username, rolle: req.user.role },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/apps — alle Apps mit beiden Staenden.
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = await appStore.listeApps();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

// GET /api/apps/:id — eine App mit allem, was das Geraet ueber sie weiss.
router.get(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  asyncHandler(async (req, res) => {
    const data = await appStore.holeApp(req.params.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/apps/:id/einspielen — eine Version in einen Stand bringen.
 *
 * Ohne Angabe geht es in den Teststand. So steht es im Lebenslauf einer App
 * (`kit-grundriss.md`): gerollt wird nach `test`, live schaltet ein Mensch.
 * Eine Voreinstellung `live` waere die bequeme und die falsche.
 */
router.post(
  '/:id/einspielen',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  validateBody(EinspielenBody),
  asyncHandler(async (req, res) => {
    const data = await appStore.spieleEin({
      appId: req.params.id,
      version: req.body.version,
      stand: req.body.stand,
      durch: req.user.id,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'app_eingespielt',
      details: { app_id: req.params.id, version: req.body.version, stand: req.body.stand },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.status(201).json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * DELETE /api/apps/:id — App weg: beide Container, beide Staende, Freigaben.
 *
 * Die Dateien unter `/arasul/apps/<id>/` bleiben; die Begruendung steht in
 * `appStore.entferneApp`.
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  asyncHandler(async (req, res) => {
    const data = await appStore.entferneApp(req.params.id);
    logSecurityEvent({
      userId: req.user.id,
      action: 'app_entfernt',
      details: { app_id: req.params.id },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

// GET /api/apps/:id/logs — die letzten Zeilen des App-Backends.
router.get(
  '/:id/logs',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  validateQuery(LogsQuery),
  asyncHandler(async (req, res) => {
    const logs = await appContainer.logs(req.params.id, req.query.stand, req.query.zeilen);
    res.json({
      data: { app_id: req.params.id, stand: req.query.stand, logs },
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
