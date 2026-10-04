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
const { ausweisOderSitzung } = require('../../middleware/ausweis');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../../middleware/validate');
const {
  AppParams,
  AppFlowParams,
  AppStufeParams,
  StufePersonBody,
  AppLaufParams,
  FlowModellBody,
  AppSchrittParams,
  SchrittModellBody,
  FlowArtBody,
  FlowAktivBody,
  FlowZeitplanBody,
  EinspielenBody,
  EntfernenSitzungQuery,
  FlowQuery,
  KiAufrufeQuery,
  LaeufeQuery,
  LaufQuery,
  LogsQuery,
  SchaltenBody,
  ZugangQuery,
  ReihenfolgeBody,
} = require('../../schemas/apps');
const appStore = require('../../services/app/appStore');
const liveSchalten = require('../../services/app/liveSchalten');
const appContainer = require('../../services/app/appContainer');
const appFlows = require('../../services/app/appFlows');
const appZugang = require('../../services/app/appZugang');
const appStufen = require('../../services/app/appStufen');
const flowSettings = require('../../services/flows/flowSettings');
const schrittModelle = require('../../services/flows/schrittModelle');
const runStore = require('../../services/flows/runStore');
const abschluss = require('../../services/flows/abschluss');
const kiProtokoll = require('../../services/app/kiProtokoll');
const { logSecurityEvent } = require('../../utils/auditLog');
const { NotFoundError, ValidationError } = require('../../utils/errors');

/**
 * GET /api/apps/meine — die Apps, die dem Aufrufer freigegeben sind.
 *
 * Die einzige Route hier, die auch ein Mitarbeiter aufrufen darf, und die
 * einzige, die keine Verwaltung ist: sie beantwortet die Frage aus der Vision,
 * „welche Apps sehe ich". Sie steht VOR `/:id`, sonst waere `meine` eine
 * App-Kennung.
 *
 * EINE DER DREI ROUTEN, DIE EINEN AUSWEIS ANNEHMEN (Bruecke, 21.09.2026).
 * Das CLI am Rechner eines Mitarbeiters fragt hier, welche Apps es ueberhaupt
 * gibt, bevor es eine anruft -- ohne diese Auskunft muesste es Kennungen
 * raten. Sie gibt genau das her, was auch der Browser sieht: die Apps DIESES
 * Menschen, mit ihrer Adresse.
 */
router.get(
  '/meine',
  ausweisOderSitzung,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const data = await appStore.appsFuerNutzer(req.user.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/apps/modell-hinweise -- Schritte, deren Modell am Geraet fehlt oder
 * deren Wahl nicht mehr passt, ueber alle Apps (M5, Modell je Schritt). Fuer die
 * Admin-Hinweise der Startseite; ist alles gut, ist die Liste leer.
 *
 * Vor `/:id`, damit der Pfad nicht als Kennung gelesen wird.
 */
router.get(
  '/modell-hinweise',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = await schrittModelle.hinweise();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET/PUT /api/apps/reihenfolge — die Reihenfolge meiner Apps in der
 * Aktivitaetsleiste (M5). Gehoert dem Angemeldeten, keine Kennung in der
 * Adresse; steht VOR `/:id`.
 */
router.get(
  '/reihenfolge',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const data = await appStore.leseReihenfolge(req.user.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

router.put(
  '/reihenfolge',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateBody(ReihenfolgeBody),
  asyncHandler(async (req, res) => {
    const data = await appStore.setzeReihenfolge(req.user.id, req.body.reihenfolge);
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
 * die Freigabe und nicht die Rolle (Entscheidung aus C2). *
 * UND SEIT DER BRUECKE (21.09.2026) AUCH EIN AUSWEIS. Traefik reicht die
 * Kopfzeile `Authorization` an diese Route weiter (`authRequestHeaders` am
 * Container, C4), also kommt ein `Bearer ausweis_…` hier an wie ein JWT --
 * das ist die ganze Verdrahtung. Was danach passiert, ist unveraendert: die
 * Freigabe entscheidet, nicht der Ausweis. Ein Agent am Rechner eines
 * Mitarbeiters sieht damit genau die Apps, die dieser Mensch sieht, und die
 * App dahinter bekommt dieselben zwei Kopfzeilen wie bei einem Browser --
 * sie merkt den Unterschied nicht und soll ihn nicht merken.
 */
router.get(
  '/:id/zugang',
  ausweisOderSitzung,
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
 * Die Dateien unter `/arasul/apps/<id>/` bleiben, wenn niemand etwas anderes
 * sagt (die Begruendung steht in `appStore.entferneApp`); `?dateien=true`
 * nimmt sie mit. Das ist der Weg, den die Oberflaeche nimmt (Einstellungen ->
 * Apps -> App entfernen, Auftrag app-leiche): ein Kunde, der eine App
 * loswerden will, will sie ganz los sein -- derselbe Dienst wie
 * `DELETE /api/v1/external/apps/:id` aus C5, nur mit einer Sitzung davor.
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  validateQuery(EntfernenSitzungQuery),
  asyncHandler(async (req, res) => {
    const data = await appStore.entferneApp(req.params.id, { dateien: req.query.dateien });
    logSecurityEvent({
      userId: req.user.id,
      action: 'app_entfernt',
      details: { app_id: req.params.id, dateien: req.query.dateien },
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
 * GET /api/apps/:id/stufen — die Freigabestufen der App mit ihrer
 * Standardperson (M5, 04.10.2026).
 *
 * Die Stufen nennen die Flows im Kopf (`stufen`, Kontrakt 8), aus beiden
 * Staenden; die Person setzt der Administrator, nie der Flow. Dazu die
 * Menschen mit Zugang, aus denen er waehlen kann, und je Stufe ohne gueltige
 * Person ein `hinweis`: dann liegt jede neue Freigabe bei allen mit Zugang.
 */
router.get(
  '/:id/stufen',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  asyncHandler(async (req, res) => {
    const data = await appStufen.liste(req.params.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * PUT /api/apps/:id/stufen/:stufe — die Standardperson einer Stufe setzen,
 * `{"benutzer_id": null}` nimmt sie zurueck (M5).
 *
 * Nur wer Zugang zur App hat, kann Standardperson sein (400). Offene
 * Freigaben bleiben, wo sie liegen; die Person gilt fuer jede neue.
 */
router.put(
  '/:id/stufen/:stufe',
  requireAuth,
  requireRole('admin'),
  validateParams(AppStufeParams),
  validateBody(StufePersonBody),
  asyncHandler(async (req, res) => {
    const data = await appStufen.setze({
      appId: req.params.id,
      stufe: req.params.stufe,
      benutzerId: req.body.benutzer_id,
      durch: req.user.id,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'stufe_standardperson_gesetzt',
      details: {
        app_id: req.params.id,
        stufe: req.params.stufe,
        person: data.person?.username ?? null,
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
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
 * GET /api/apps/:id/schritt-modelle -- je Flow die Schritte mit Modell (M5).
 *
 * Je Schritt: das Modell, das der Entwickler nennt (`original`), das, mit dem
 * der Schritt laeuft (`gilt`), und warum (`grund`); was der Schritt braucht
 * (`faehigkeiten`) und welche installierten Modelle alle erfuellen
 * (`moegliche`). Dazu die Modelle am Geraet mit ihren Faehigkeiten.
 *
 * Gilt fuer beide Staende zugleich: die Wahl gehoert dem Flow, nicht der Fassung.
 */
router.get(
  '/:id/schritt-modelle',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  asyncHandler(async (req, res) => {
    await appStore.holeApp(req.params.id);
    const data = await schrittModelle.uebersicht(req.params.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * PUT /api/apps/:id/flows/:name/schritte/:schritt/modell -- einen Schritt auf
 * ein anderes Modell umstellen (M5). `{"modell": null}` nimmt die Wahl zurueck.
 *
 * Das Backend weist ein Modell ab (400), das nicht am Geraet liegt oder nicht
 * alle Faehigkeiten des Schritts erfuellt. Der Prompt bleibt, wie der Partner
 * ihn schrieb; nichts hier aendert ihn. Die Wahl liegt in
 * `flow_schritt_modelle` und ueberlebt ein Update der App.
 */
router.put(
  '/:id/flows/:name/schritte/:schritt/modell',
  requireAuth,
  requireRole('admin'),
  validateParams(AppSchrittParams),
  validateBody(SchrittModellBody),
  asyncHandler(async (req, res) => {
    const { id: appId, name, schritt } = req.params;
    await appStore.holeApp(appId);
    const data = await schrittModelle.setzeFuerSchritt({
      appId,
      flowName: name,
      schritt,
      modell: req.body.modell,
      durch: req.user.id,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'schritt_modell_gesetzt',
      details: { app_id: appId, flow: name, schritt, modell: req.body.modell },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({
      data: { app_id: appId, flow: name, schritt, ...data },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/apps/:id/flows/:name/art — die Art eines Flows schalten (M5).
 *
 * Der Partner nennt im Flow-Kopf, welche Arten der Flow kann (`arten`); der
 * Administrator waehlt zwischen ihnen, sobald er der KI traut. Eine Art, die der
 * Kopf nicht nennt, weist das Backend mit 400 ab -- nicht erst der naechste
 * Lauf. `{"art": null}` nimmt die Wahl zurueck, es gilt wieder die Vorgabe des
 * Pakets.
 *
 * Die Wahl liegt in `flow_settings` (wie das Modell) und gilt ab dem NAECHSTEN
 * Lauf; ein laufender oder wartender Lauf behaelt seine. Sie steht im
 * Sicherheitsprotokoll. Ohne `stand`: gilt dem Flow, nicht der Fassung -- darum
 * muss jeder Stand, der den Flow hat, die Art nennen.
 */
router.put(
  '/:id/flows/:name/art',
  requireAuth,
  requireRole('admin'),
  validateParams(AppFlowParams),
  validateBody(FlowArtBody),
  asyncHandler(async (req, res) => {
    const { id: appId, name } = req.params;
    const { art } = req.body;
    await appStore.holeApp(appId);
    const vorhandene = (
      await Promise.all(['test', 'live'].map(stand => appFlows.liste({ appId, stand })))
    )
      .flat()
      .filter(f => f.name === name);
    if (vorhandene.length === 0) {
      throw new NotFoundError(`App ${appId} hat keinen Flow "${name}"`);
    }
    if (art != null) {
      const nichtErlaubt = vorhandene.find(f => !f.arten.includes(art));
      if (nichtErlaubt) {
        throw new ValidationError(
          `Der Flow "${name}" kann die Art "${art}" nicht: sein Kopf nennt ${nichtErlaubt.arten
            .map(a => `"${a}"`)
            .join(', ')}. Die App muss sie unter "arten" aufnehmen.`
        );
      }
    }
    const vorher = (await flowSettings.hole({ appId, flowName: name }))?.art ?? null;
    await flowSettings.setzeArt({ appId, flowName: name, art, durch: req.user.id });
    const gilt = appFlows.artAngabe({ arten: vorhandene[0].arten }, { art });
    logSecurityEvent({
      userId: req.user.id,
      action: 'flow_art_gesetzt',
      details: { app_id: appId, flow: name, art: gilt.art, vorher, zurueck_zum_paket: art == null },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({
      data: { app_id: appId, flow_name: name, ...gilt, gilt_ab: 'dem nächsten Lauf' },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/apps/:id/flows/:name/aktiv — einen Flow aus- und einschalten (M5).
 *
 * Aus heisst: er startet nicht, jeder Start bekommt 409 `FLOW_INAKTIV`
 * (`flowRunner.starten`). Ein Lauf, der schon laeuft oder auf eine Freigabe
 * wartet, geht zu Ende. Wie Modell und Art in `flow_settings`, ohne Stand,
 * und im Sicherheitsprotokoll.
 */
router.put(
  '/:id/flows/:name/aktiv',
  requireAuth,
  requireRole('admin'),
  validateParams(AppFlowParams),
  validateBody(FlowAktivBody),
  asyncHandler(async (req, res) => {
    const { id: appId, name } = req.params;
    const { aktiv } = req.body;
    await appStore.holeApp(appId);
    const staende = await Promise.all(
      ['test', 'live'].map(stand => appFlows.liste({ appId, stand }))
    );
    if (!staende.flat().some(f => f.name === name)) {
      throw new NotFoundError(`App ${appId} hat keinen Flow "${name}"`);
    }
    const vorher = await flowSettings.istAktiv({ appId, flowName: name });
    await flowSettings.setzeAktiv({ appId, flowName: name, aktiv, durch: req.user.id });
    logSecurityEvent({
      userId: req.user.id,
      action: aktiv ? 'flow_eingeschaltet' : 'flow_ausgeschaltet',
      details: { app_id: appId, flow: name, aktiv, vorher },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({
      data: { app_id: appId, flow_name: name, aktiv },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/apps/:id/flows/:name/zeitplan — den Zeitplan eines Flows pausieren
 * und fortsetzen (M5, Migration 203).
 *
 * Trifft NUR den Zeitplan: der Schalter `aktiv` und der Start von Hand bleiben.
 * Termine in der Pause werden nach dem Fortsetzen nicht nachgeholt. Einen Flow
 * ohne Zeitplan weist die Route mit 400 ab: eine Pause, die nichts pausiert,
 * waere eine Zeile, die nie jemand wieder anfasst. Sicherheitsprotokoll wie bei
 * `aktiv`.
 */
router.put(
  '/:id/flows/:name/zeitplan',
  requireAuth,
  requireRole('admin'),
  validateParams(AppFlowParams),
  validateBody(FlowZeitplanBody),
  asyncHandler(async (req, res) => {
    const { id: appId, name } = req.params;
    const { pausiert } = req.body;
    await appStore.holeApp(appId);
    const staende = await Promise.all(
      ['test', 'live'].map(stand => appFlows.liste({ appId, stand }))
    );
    const flow = staende.flat().find(f => f.name === name);
    if (!flow) {
      throw new NotFoundError(`App ${appId} hat keinen Flow "${name}"`);
    }
    if (!flow.zeitplan) {
      throw new ValidationError(
        `Der Flow "${name}" hat keinen Zeitplan. Er startet, wie sein Kopf es unter "ausloeser" nennt.`
      );
    }
    const vorher = flow.zeitplan.pausiert;
    await flowSettings.setzeZeitplanPause({ appId, flowName: name, pausiert, durch: req.user.id });
    logSecurityEvent({
      userId: req.user.id,
      action: pausiert ? 'flow_zeitplan_pausiert' : 'flow_zeitplan_fortgesetzt',
      details: { app_id: appId, flow: name, pausiert, vorher },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    const live = await appFlows.liste({ appId, stand: 'live' });
    res.json({
      data: {
        app_id: appId,
        flow_name: name,
        zeitplan: live.find(f => f.name === name)?.zeitplan ?? flow.zeitplan,
      },
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
    // Erst die App, dann der Flow: sonst waere die Antwort auf eine unbekannte
    // Kennung zwar auch ein 404, aber mit der falschen Begruendung ("dieser
    // Stand hat den Flow nicht"). Wer sie liest, sucht an der falschen Stelle.
    await appStore.pruefeVorhanden(req.params.id);
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
    // `pruefeVorhanden` und nicht `holeApp`: hier soll nur die Kennung geprueft
    // werden, und `holeApp` faehrt dafuer den Docker-Proxy und die Platte an.
    await appStore.pruefeVorhanden(req.params.id);
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
 * GET /api/apps/:id/ki-aufrufe — jeder Modellaufruf dieser App (J35).
 *
 * Die Laeufe zeigen, was ein FLOW getan hat. Ein Aufruf von
 * `document/extract-structured` ist keiner und stand bis hierher nirgends,
 * wo ein Administrator ihn sah. Hier steht je Aufruf: wann, welcher Stand,
 * fuer wen, welcher Weg, welches Modell, wie lange, wie es ausging -- ohne
 * Inhalt (`services/app/kiProtokoll.js`).
 *
 * KEIN `pruefeVorhanden`, anders als die Laeufe: das Protokoll ueberlebt die
 * App mit Absicht (Migration 187), und nach dem Entfernen muss es sich weiter
 * lesen lassen. Eine Kennung mit Tippfehler bekommt eine leere Liste.
 */
router.get(
  '/:id/ki-aufrufe',
  requireAuth,
  requireRole('admin'),
  validateParams(AppParams),
  validateQuery(KiAufrufeQuery),
  asyncHandler(async (req, res) => {
    const data = await kiProtokoll.listeFuerApp({
      appId: req.params.id,
      stand: req.query.stand ?? null,
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
 * POST /api/apps/:id/laeufe/:runId/erneut — die Uebergabe eines Laufs an die
 * Abschluss-Route der App noch einmal ausloesen (M5, Kontrakt 11).
 *
 * Nur fuer einen Lauf auf `nicht_uebergeben`: das Ergebnis steht, die App hat
 * den Empfang nicht bestaetigt. Die Schritte laufen NICHT neu; die Route
 * bekommt dieselbe Lauf-Kennung wie beim ersten Mal. Antwortet die App jetzt
 * mit 2xx, ist der Lauf `fertig`, sonst bleibt er `nicht_uebergeben` (mit dem
 * neuen Grund) und die Antwort sagt es.
 */
router.post(
  '/:id/laeufe/:runId/erneut',
  requireAuth,
  requireRole('admin'),
  validateParams(AppLaufParams),
  asyncHandler(async (req, res) => {
    const lauf = await abschluss.erneut({ runId: req.params.runId, appId: req.params.id });
    logSecurityEvent({
      userId: req.user.id,
      action: 'lauf_erneut_uebergeben',
      details: { app_id: req.params.id, run_id: Number(req.params.runId), status: lauf.status },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data: lauf, timestamp: new Date().toISOString() });
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
    // Nach live geht es gesichert und mit Rueckfall (M5): `liveSchalten`.
    // Scheitert die neue Fassung, wirft es 409 LIVE_ZURUECKGESCHALTET; beide
    // Richtungen laufen unter einer Sperre je App.
    const data =
      req.body.ziel === 'live'
        ? await liveSchalten.schalteLive({ appId: req.params.id, durch: req.user.id })
        : await liveSchalten.schalteZurueck({ appId: req.params.id, durch: req.user.id });
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
