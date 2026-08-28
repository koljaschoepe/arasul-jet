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
const {
  AppParams,
  AppFlowParams,
  AppLaufParams,
  FlowModellBody,
  EinspielenBody,
  FlowQuery,
  LaeufeQuery,
  LaufQuery,
  LogsQuery,
  SchaltenBody,
  ZugangQuery,
} = require('../../schemas/apps');
const appStore = require('../../services/app/appStore');
const appContainer = require('../../services/app/appContainer');
const appFlows = require('../../services/app/appFlows');
const appZugang = require('../../services/app/appZugang');
const flowSettings = require('../../services/flows/flowSettings');
const runStore = require('../../services/flows/runStore');
const { logSecurityEvent } = require('../../utils/auditLog');
const { NotFoundError } = require('../../utils/errors');

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

/**
 * GET /api/apps/:id/flows — die Flows beider Staende dieser App (Phase C6).
 *
 * Sie kommen aus dem Paket und sind beim Einspielen registriert worden; hier
 * steht, was ein Stand hat und mit welchem Modell es laeuft. Beide Staende in
 * einer Antwort, weil die Frage, die davor steht, beide meint: der Teststand
 * ist die Fassung, die gleich live geht.
 *
 * Eine App, die es nicht gibt, ist ein 404 und keine leere Liste. Der
 * Unterschied ist der zwischen "diese App hat keine Flows" und "diese App gibt
 * es nicht", und wer sie verwechselt, sucht den Fehler an der falschen Stelle.
 */
router.get(
  '/:id/flows',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  asyncHandler(async (req, res) => {
    await appStore.holeApp(req.params.id);
    const data = {
      app_id: req.params.id,
      test: await appFlows.liste({ appId: req.params.id, stand: 'test' }),
      live: await appFlows.liste({ appId: req.params.id, stand: 'live' }),
    };
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * PUT /api/apps/:id/flows/:name/modell — das Modell eines Flows setzen.
 *
 * Der Partner hat im Frontmatter seines Flows hinterlegt, womit er gemeint
 * war. Der Administrator kennt sein Geraet und weiss, welche Modelle darauf
 * liegen; er darf es ueberschreiben. `{"modell": null}` nimmt die
 * Ueberschreibung zurueck.
 *
 * DIE UEBERSCHREIBUNG LANDET IN `flow_settings` UND NICHT IN DER DATEI. Die
 * Datei kommt mit jedem Paket neu; eine Aenderung darin waere beim naechsten
 * App-Update weg. So ueberlebt sie es (Entscheidung Kolja vom 27.08.2026).
 *
 * OHNE `stand`: die Entscheidung gilt dem Flow, nicht der Fassung, mit der
 * jemand gerade testet. Wer im Teststand einstellte und im Livestand nicht,
 * merkte es erst beim Schalten.
 *
 * Der Flow muss es in wenigstens EINEM Stand geben. Sonst waere das hier ein
 * Endpunkt, der Einstellungen zu erfundenen Namen annimmt und sie
 * stillschweigend behaelt, bis irgendwann eine App denselben Namen mitbringt.
 */
router.put(
  '/:id/flows/:name/modell',
  requireAuth,
  requireRole('admin'),
  validateParams(AppFlowParams),
  validateBody(FlowModellBody),
  asyncHandler(async (req, res) => {
    const { id: appId, name } = req.params;
    // Erst die App, dann der Flow: `appFlows.liste` gibt fuer eine unbekannte
    // App zwei leere Listen zurueck, und die Antwort waere dann zwar auch ein
    // 404, aber mit der falschen Begruendung.
    await appStore.holeApp(appId);
    const staende = await Promise.all(
      ['test', 'live'].map(stand => appFlows.liste({ appId, stand }))
    );
    if (!staende.flat().some(f => f.name === name)) {
      throw new NotFoundError(`App ${appId} hat keinen Flow "${name}"`);
    }

    const extern = req.body.extern;
    const data = extern
      ? await flowSettings.setzeExtern({
          appId,
          flowName: name,
          anbieter: extern.anbieter,
          modell: extern.modell,
          basisUrl: extern.basis_url,
          schluessel: extern.schluessel ?? null,
          durch: req.user.id,
        })
      : await flowSettings.setzeModell({
          appId,
          flowName: name,
          modell: req.body.modell,
          durch: req.user.id,
        });
    // DER SCHLUESSEL STEHT IN KEINEM PROTOKOLL. Was hier festgehalten wird, ist
    // die Entscheidung -- wer, welcher Flow, welches Modell, welcher Anbieter --
    // und die letzten vier Zeichen genuegen, um zwei Schluessel auseinanderzu-
    // halten. Ein Audit-Log, das Geheimnisse mitschreibt, ist selbst eines.
    logSecurityEvent({
      userId: req.user.id,
      action: extern ? 'flow_modell_extern_gesetzt' : 'flow_modell_gesetzt',
      details: extern
        ? {
            app_id: appId,
            flow: name,
            anbieter: extern.anbieter,
            modell: extern.modell,
            basis_url: extern.basis_url,
            schluessel_endet_auf: data?.extern_endet_auf ?? null,
          }
        : { app_id: appId, flow: name, modell: req.body.modell },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({
      data: data ?? { app_id: appId, flow_name: name, modell: null, extern: null },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/apps/:id/flows/:name — die Flow-Datei lesen (Phase D4).
 *
 * `?stand=` sagt, welche Fassung: der Flow des Teststandes ist ein anderer
 * Gegenstand als der gleichnamige des Livestandes -- der Teststand ist eine
 * andere Version, und genau deshalb liest man ihn nach.
 *
 * Was hier steht und in `GET /:id/flows` nicht: der Prompt. Die Begruendung
 * steht an `appFlows.hole`.
 */
router.get(
  '/:id/flows/:name',
  requireAuth,
  requireRole('admin'),
  validateParams(AppFlowParams),
  validateQuery(FlowQuery),
  asyncHandler(async (req, res) => {
    const data = await appFlows.hole({
      appId: req.params.id,
      stand: req.query.stand,
      name: req.params.name,
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/apps/:id/laeufe — was diese App hat laufen lassen (Phase D4).
 *
 * NICHT `GET /api/flows/laeufe`, und das ist der Grund, warum es diese Route
 * gibt: die dortige Liste ist die des ANGEMELDETEN Menschen. Ein App-Lauf
 * traegt als Nutzer den, dem der App-Schluessel gehoert -- also den
 * Administrator, der die App eingespielt hat. Ein zweiter Administrator saehe
 * die Laeufe der App dort nie, obwohl beide dasselbe Geraet verwalten.
 *
 * Die App muss es geben: sonst waere eine leere Liste die Antwort auf eine
 * Kennung mit Tippfehler.
 */
router.get(
  '/:id/laeufe',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  validateQuery(LaeufeQuery),
  asyncHandler(async (req, res) => {
    await appStore.holeApp(req.params.id);
    const data = await runStore.listRunsFuerApp({
      appId: req.params.id,
      stand: req.query.stand ?? null,
      flowName: req.query.flow ?? null,
      status: req.query.status ?? null,
      limit: req.query.limit,
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/apps/:id/laeufe/:runId — ein Lauf mit seinen Schritten (Phase D4).
 *
 * Der Gedankengang steht in denselben Schritten: was das Modell sagte, bevor
 * es ein Werkzeug rief, liegt als Schritt der Art `modell` dazwischen
 * (`services/flows/runFlow.js`). `?raw=1` holt zusaetzlich die Rohdaten der
 * Subagent-Schritte -- die Ansicht laedt sie erst, wenn jemand einen Schritt
 * aufklappt.
 */
router.get(
  '/:id/laeufe/:runId',
  requireAuth,
  requireRole('admin'),
  validateParams(AppLaufParams),
  validateQuery(LaufQuery),
  asyncHandler(async (req, res) => {
    const data = await runStore.getRunFuerApp({
      runId: req.params.runId,
      appId: req.params.id,
      includeRaw: req.query.raw,
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/apps/:id/schalten — den Livestand setzen oder zuruecknehmen
 * (Phase D4).
 *
 * DENSELBEN DIENST WIE DER KIT-WEG (`POST /api/v1/external/apps/:id/schalten`,
 * C5), aber fuer einen Menschen mit einer Sitzung. Beide rufen `appStore.schalte`;
 * die Regel, was `live` und was `zurueck` bedeutet, steht dort und nur dort.
 *
 * WARUM ES BEIDE GIBT: das Kit schaltet, wenn der Partner ausgeliefert hat --
 * aus der Ferne, mit einem Schluessel. Der Administrator schaltet, wenn ER es
 * fuer richtig haelt, nachdem er den Teststand gesehen hat. Das ist der
 * Lebenslauf einer App aus `kit-grundriss.md`: gerollt wird nach `test`, live
 * schaltet ein Mensch. Ohne diese Route braeuchte dieser Mensch einen
 * API-Schluessel und eine Befehlszeile.
 */
router.post(
  '/:id/schalten',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  validateBody(SchaltenBody),
  asyncHandler(async (req, res) => {
    const data = await appStore.schalte({
      appId: req.params.id,
      ziel: req.body.ziel,
      durch: req.user.id,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'app_geschaltet',
      details: { app_id: req.params.id, ziel: req.body.ziel, version: data.version },
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
