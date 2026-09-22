/**
 * Der Firmenordner (J33, 22.09.2026).
 *
 *   GET    /api/firmenordner                          wo er liegt und was ICH habe
 *   GET    /api/firmenordner/ordner                   alle Ordner (Administrator)
 *   POST   /api/firmenordner/ordner                   einen anlegen (Administrator)
 *   GET    /api/firmenordner/rechte                   alle Rechte (Administrator)
 *   POST   /api/firmenordner/rechte                   eins vergeben (Administrator)
 *   DELETE /api/firmenordner/ordner/:id               wegwerfen, samt Inhalt
 *   DELETE /api/firmenordner/rechte/:ordnerId/:benutzerId   zuruecknehmen
 *   POST   /api/firmenordner/abgleich                 nachholen, was offen ist
 *
 * BEI DEN KERN-WEGEN UND NICHT UNTER `admin/`, obwohl fuenf der sechs Wege
 * Admin-Wege sind. Der erste ist es nicht, und er ist der Grund fuer die
 * ganze Karte: er beantwortet einem MITARBEITER die Frage „wo liegt mein
 * Firmenordner und welche Ordner habe ich". Dieselbe Linie wie `/api/apps`
 * (C3), wo `meine` neben der Verwaltung steht -- ein Gegenstand, ein
 * Praefix, und die Rolle entscheidet je Weg.
 *
 * DIE VIERTE DER ROUTEN, DIE EINEN AUSWEIS ANNEHMEN (Bruecke, J34). Die drei
 * anderen sind die Forward-Auth, `GET /api/apps/meine` und die
 * Sitzungsprobe. Sie kommt aus demselben Grund dazu: das CLI der Wurzel
 * laeuft am Rechner eines Menschen, hat keine Sitzung, und muss VOR dem
 * ersten Abgleich wissen, wohin es den Kommandozeilen-Klienten schickt und
 * welche Ordner es anlegen darf. Ohne diese Auskunft muesste es die Adresse
 * raten und die Ordner ausprobieren.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { ausweisOderSitzung } = require('../middleware/ausweis');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const {
  OrdnerBody,
  OrdnerParams,
  OrdnerLoeschenQuery,
  RechtBody,
  RechtParams,
  RechteQuery,
} = require('../schemas/firmenordner');
const verwaltung = require('../services/firmenordner/ordnerVerwaltung');
const { logSecurityEvent } = require('../utils/auditLog');
const { ServiceUnavailableError, ValidationError } = require('../utils/errors');

/**
 * GET /api/firmenordner — wo der Dienst liegt und welche Ordner ich habe.
 *
 * DIE EINZIGE ROUTE HIER, DIE EIN MITARBEITER DARF, und die einzige, die
 * keine Verwaltung ist.
 *
 * SIE NENNT KEINE FREMDEN ORDNER. `meineOrdner` fragt die Rechte-Tabelle
 * nach DIESEM Menschen; ein Ordner, auf den er kein Recht hat, kommt in der
 * Antwort gar nicht vor -- auch sein Name nicht. Das ist Regel 2 des
 * Zielbildes, und sie wird hier nicht gefiltert, sondern nie gelesen: es
 * gibt keine Liste, aus der etwas herausfallen koennte.
 *
 * UND SIE NENNT KEINEN ORDNER AM GERAET. Die Abfrage schneidet `art =
 * 'geteilt'` zu; ein Ordner der Stufe „am Geraet" hat ohnehin keine
 * Rechte-Zeile, aber zwei Gruende sind hier besser als einer -- die Antwort
 * dieser Route ist das, was ein CLI abgleicht.
 *
 * `503`, WENN ES HIER KEINEN FIRMENORDNER GIBT, und nicht eine leere Liste:
 * „du hast keine Ordner" und „auf diesem Geraet laeuft kein Dateidienst"
 * sind zwei verschiedene Auskuenfte, und ein CLI, das die erste bekommt,
 * wuerde den Ordner des Menschen am Rechner leerraeumen.
 */
router.get(
  '/',
  ausweisOderSitzung,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const lage = await verwaltung.zustand();
    if (!lage.an) {
      throw new ServiceUnavailableError(
        'Auf diesem Geraet laeuft kein Firmenordner. ' +
          'Er wird mit dem Profil `firmenordner` eingeschaltet (docs/features/FIRMENORDNER.md).'
      );
    }
    const ordner = await verwaltung.meineOrdner(req.user.id);
    res.json({
      data: {
        adresse: lage.adresse,
        erreichbar: lage.erreichbar,
        benutzer: req.user.username,
        ordner,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/** GET /api/firmenordner/ordner — alle Ordner am Geraet, mit ihrer Ebene. */
router.get(
  '/ordner',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = await verwaltung.listeOrdner();
    res.json({ data, zustand: await verwaltung.zustand(), timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/firmenordner/ordner — einen Ordner anlegen.
 *
 * Die Antwort ist 201 und der Ordner. Ob der Dienst ihn schon kennt, steht
 * in `raum_id`: ist es `null`, lief das Anlegen am Geraet durch und der
 * Dienst war gerade nicht da -- `POST /abgleich` holt es nach.
 */
router.post(
  '/ordner',
  requireAuth,
  requireRole('admin'),
  validateBody(OrdnerBody),
  asyncHandler(async (req, res) => {
    const ordner = await verwaltung.legeOrdnerAn({
      kennung: req.body.kennung,
      name: req.body.name,
      ebene: req.body.ebene,
      elternKennung: req.body.eltern,
      art: req.body.art,
      durch: req.user.id,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'firmenordner_ordner_angelegt',
      details: { kennung: ordner.kennung, ebene: ordner.ebene, art: ordner.art },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.status(201).json({ data: ordner, timestamp: new Date().toISOString() });
  })
);

/**
 * DELETE /api/firmenordner/ordner/:id?kennung=<kennung> — wegwerfen.
 *
 * **Samt allem, was darin liegt.** Die Kennung steht deshalb in der Abfrage
 * und muss stimmen — derselbe Riegel wie beim Entfernen einer App (C5): wer
 * sie tippt, hat dabei gelesen, was er wegwirft.
 *
 * Ein Ordner mit Kindern oder mit Rechten ist `409`, und der Satz sagt, was
 * zuerst weg muss. Beides ist kein Schutz vor Versehen, sondern vor einem
 * Ordner, der unter den Fuessen von jemandem verschwindet, der gerade darin
 * arbeitet.
 */
router.delete(
  '/ordner/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(OrdnerParams),
  validateQuery(OrdnerLoeschenQuery),
  asyncHandler(async (req, res) => {
    const ordner = await verwaltung.holeOrdner(req.params.id);
    if (req.query.kennung !== ordner.kennung) {
      throw new ValidationError(
        `Zum Wegwerfen muss die Kennung „${ordner.kennung}" abgetippt werden.`
      );
    }
    const data = await verwaltung.loescheOrdner({ ordnerId: req.params.id });
    logSecurityEvent({
      userId: req.user.id,
      action: 'firmenordner_ordner_entfernt',
      details: data,
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/** GET /api/firmenordner/rechte — wer auf welchem Ordner was darf. */
router.get(
  '/rechte',
  requireAuth,
  requireRole('admin'),
  validateQuery(RechteQuery),
  asyncHandler(async (req, res) => {
    const data = await verwaltung.listeRechte({
      ordnerId: req.query.ordner_id,
      benutzerId: req.query.benutzer_id,
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/firmenordner/rechte — ein Recht vergeben.
 *
 * 409, wenn die Bitte weniger gibt als der Ordner darueber schon gibt. Der
 * Grund und der Ausweg stehen im Satz des Fehlers, weil dieser Fall der
 * einzige ist, in dem die Regel „nur vergeben" jemandem im Weg steht -- und
 * wer sie dann nicht erklaert bekommt, haelt sie fuer einen Fehler.
 */
router.post(
  '/rechte',
  requireAuth,
  requireRole('admin'),
  validateBody(RechtBody),
  asyncHandler(async (req, res) => {
    const ergebnis = await verwaltung.gibRecht({
      ordnerId: req.body.ordner_id,
      benutzerId: req.body.benutzer_id,
      recht: req.body.recht,
      durch: req.user.id,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'firmenordner_recht_erteilt',
      details: ergebnis,
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res
      .status(ergebnis.neu ? 201 : 200)
      .json({ data: ergebnis, timestamp: new Date().toISOString() });
  })
);

/** DELETE /api/firmenordner/rechte/:ordnerId/:benutzerId — Recht zuruecknehmen. */
router.delete(
  '/rechte/:ordnerId/:benutzerId',
  requireAuth,
  requireRole('admin'),
  validateParams(RechtParams),
  asyncHandler(async (req, res) => {
    const data = await verwaltung.nimmRechtZurueck({
      ordnerId: req.params.ordnerId,
      benutzerId: req.params.benutzerId,
    });
    logSecurityEvent({
      userId: req.user.id,
      action: 'firmenordner_recht_zurueckgenommen',
      details: data,
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/firmenordner/abgleich — nachholen, was der Dienst noch nicht weiss.
 *
 * EIN KNOPF UND KEIN ZEITPLAN. Was offen ist, steht in der Datenbank
 * (`abgleich_offen`), also geht nichts verloren; was fehlt, ist der
 * Augenblick, in dem es nachgeholt wird. Ein Zeitplan dafuer waere ein
 * Hintergrundlauf, der auf einem Geraet ohne Firmenordner jede Minute
 * nichts tut -- und auf einem mit Firmenordner still scheitert, ohne dass
 * jemand die Meldung liest. Dieser Weg antwortet mit dem Bericht.
 */
router.post(
  '/abgleich',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = await verwaltung.holeNach();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
