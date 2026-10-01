/**
 * Der Firmenordner (J33, 22.09.2026).
 *
 *   GET    /api/firmenordner                          wo er liegt und was ICH habe
 *   GET    /api/firmenordner/sicht                    meine sicht.md (Ausweis oder Sitzung)
 *   GET    /api/firmenordner/passt?pfad=&bytes=       passt das noch hinein? (Ausweis oder Sitzung)
 *   GET    /api/firmenordner/platz                    belegt, Grenze, frei je Raum (Administrator)
 *   PUT    /api/firmenordner/ordner/:id/grenze        die Grenze setzen oder wegnehmen
 *   GET    /api/firmenordner/ordner                   alle Ordner (Administrator)
 *   GET    /api/firmenordner/ordner/:id/aenderungen   wer zuletzt wann (Administrator)
 *   POST   /api/firmenordner/ordner                   einen anlegen (Administrator)
 *   GET    /api/firmenordner/rechte                   alle Rechte (Administrator)
 *   POST   /api/firmenordner/rechte                   eins vergeben (Administrator)
 *   DELETE /api/firmenordner/ordner/:id               wegwerfen, samt Inhalt
 *   GET    /api/firmenordner/papierkorb               wie viel in welchem liegt
 *   GET    /api/firmenordner/ordner/:id/papierkorb    was darin liegt
 *   DELETE /api/firmenordner/ordner/:id/papierkorb    ihn leeren, endgueltig
 *   POST   /api/firmenordner/ordner/:id/papierkorb/:eintrag/wiederherstellen
 *   DELETE /api/firmenordner/ordner/:id/papierkorb/:eintrag   einen endgueltig
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
  GrenzeBody,
  PasstQuery,
  OrdnerBody,
  OrdnerParams,
  OrdnerLoeschenQuery,
  PapierkorbParams,
  RechtBody,
  RechtParams,
  RechteQuery,
} = require('../schemas/firmenordner');
const verwaltung = require('../services/firmenordner/ordnerVerwaltung');
const { logSecurityEvent } = require('../utils/auditLog');
const { ServiceUnavailableError, ValidationError } = require('../utils/errors');

/** Wie eine Route den Namen erfaehrt, unter dem der Aufrufer das Geraet erreicht hat. */
const host = req => ({ host: req.hostname || null });

/**
 * Was am Abgleich vorbeigeht, und zwar lautlos.
 *
 * ES STEHT IN DER ANTWORT UND NICHT NUR IN DER KARTE, weil es sonst der
 * falsche liest. Das CLI am Rechner eines Menschen laeuft ueber den Baum --
 * es ist die einzige Stelle, die einen Symlink ueberhaupt SEHEN kann. Das
 * Geraet kann es nicht: was der Dateidienst nicht kennt, kennt auch das
 * Backend nicht, und ein Lauf ueber hunderttausend Dateien je Anfrage waere
 * ein Preis fuer eine Auskunft, die nichts heilt.
 *
 * Gemessen am 22.09.2026 am Orin (Nebeninstanz, vier Sorten Symlink im Baum:
 * auf eine Datei daneben, auf einen Ordner daneben, ins Leere, nach
 * draussen): KEINER steht im `PROPFIND`, KEINER ist herunterzuladen (`404`),
 * KEINER steht in der Suche. Der Ablagetreiber `posix` geht an ihnen vorbei,
 * ohne ein Wort -- es gibt keine Fehlermeldung, an der jemand es merken
 * koennte, und auf dem Rechner des Menschen sieht der Ordner vollstaendig
 * aus.
 *
 * EINE LISTE UND KEIN FELD, damit der naechste Fund dieser Sorte daneben
 * steht und nicht als zweites Feld irgendwohin.
 */
const NICHT_ABGEGLICHEN = [
  {
    art: 'symlink',
    text:
      'Ein Symlink im Baum wird nicht uebertragen -- weder die Verknuepfung noch das, worauf ' +
      'sie zeigt. Der Dateidienst geht an ihm vorbei, ohne es zu melden. Wer den Inhalt ' +
      'braucht, legt ihn als echte Datei ab.',
  },
];

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
    const lage = await verwaltung.zustand(host(req));
    if (!lage.an) {
      throw new ServiceUnavailableError(
        'Auf diesem Gerät läuft kein Firmenordner. Ihr Administrator kann ihn einschalten lassen.'
      );
    }
    const ordner = await verwaltung.meineOrdnerMitPlatz(req.user.id, req.user.role);
    res.json({
      data: {
        adresse: lage.adresse,
        adressen: lage.adressen,
        erreichbar: lage.erreichbar,
        benutzer: req.user.username,
        ordner,
        nicht_abgeglichen: NICHT_ABGEGLICHEN,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/firmenordner/sicht — meine `sicht.md`, als Text.
 *
 * REGEL 3 DES ZIELBILDES: „Was es gibt, steht in sicht.md, je Mitarbeiter
 * vom Geraet erzeugt aus seinen Rechten: seine Ordner mit Recht, seine Apps
 * mit Verweis auf ihre APP.md, die fremden Orte. Hoechstens eine
 * Bildschirmseite. Niemand pflegt Kontext je Rolle von Hand."
 *
 * DIE FUENFTE ROUTE MIT AUSWEIS, aus demselben Grund wie die vierte darueber:
 * das CLI holt sie beim Abgleich und legt sie unter `.claude/sicht.md` in
 * die Wurzel am Rechner des Menschen. `text/markdown` und kein JSON, weil
 * sie so abgelegt wird, wie sie kommt -- ein Umschlag darum waere eine
 * zweite Form fuer dieselbe Datei.
 *
 * Und sie nennt nichts, was der Mensch nicht hat -- dieselben zwei Abfragen
 * wie `GET /` und `GET /api/apps/meine`, nur als Satz.
 */
router.get(
  '/sicht',
  ausweisOderSitzung,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const lage = await verwaltung.zustand();
    if (!lage.an) {
      throw new ServiceUnavailableError(
        'Auf diesem Gerät läuft kein Firmenordner. Ihr Administrator kann ihn einschalten lassen.'
      );
    }
    const text = await verwaltung.sichtFuer({
      benutzerId: req.user.id,
      username: req.user.username,
      rolle: req.user.role,
    });
    res.type('text/markdown; charset=utf-8').send(text);
  })
);

/**
 * GET /api/firmenordner/passt?pfad=<pfad>&bytes=<n> — passt das noch hinein?
 *
 * DIE FRAGE DES KITS VOR EINEM ABGLEICH (J33, 28.09.2026). Bis dahin
 * erfuhr es von der Groessengrenze eines Bereichs erst, wenn der Dateidienst
 * mitten im Abgleich mit „exceeds the quota for the folder" abbrach -- in
 * einem Lauf aus launchd, den niemand ansah. Jetzt fragt es vorher, mit der
 * Summe dessen, was es hochladen will, und bekommt `200` oder
 * `409 GRENZE_ERREICHT` mit einem Satz fuer den Menschen.
 *
 * MIT AUSWEIS wie `GET /` und `sicht`: das Kit laeuft am Rechner eines
 * Menschen und hat keine Sitzung. Gefragt werden kann nur nach einem Ordner,
 * den der Mensch hat.
 */
router.get(
  '/passt',
  ausweisOderSitzung,
  requireRole('admin', 'mitarbeiter'),
  validateQuery(PasstQuery),
  asyncHandler(async (req, res) => {
    if (!verwaltung.istAn()) {
      throw new ServiceUnavailableError(
        'Auf diesem Gerät läuft kein Firmenordner. Ihr Administrator kann ihn einschalten lassen.'
      );
    }
    const data = await verwaltung.passt({
      benutzerId: req.user.id,
      rolle: req.user.role,
      pfad: req.query.pfad,
      bytes: req.query.bytes,
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/firmenordner/platz — belegt, Grenze und frei je Hauptordner und
 * Bereich, dazu der freie Platz des Geraets und die Vorgabe fuer neue
 * Bereiche. Eine Anfrage fuer die ganze Spalte, wie beim Papierkorb.
 */
router.get(
  '/platz',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = await verwaltung.platzUebersicht();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * PUT /api/firmenordner/ordner/:id/grenze — die Groessengrenze setzen
 * (`{ grenze: <bytes> }`) oder wegnehmen (`{ grenze: null }`, dann gilt der
 * freie Platz des Geraets). Nur Hauptordner und Bereich; ein Projekt teilt
 * die Grenze seines Bereichs.
 */
router.put(
  '/ordner/:id/grenze',
  requireAuth,
  requireRole('admin'),
  validateParams(OrdnerParams),
  validateBody(GrenzeBody),
  asyncHandler(async (req, res) => {
    const data = await verwaltung.setzeGrenze(req.params.id, req.body.grenze);
    logSecurityEvent({
      userId: req.user.id,
      action: 'firmenordner_grenze_gesetzt',
      details: { kennung: data.kennung, vorher: data.vorher, grenze: data.grenze },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/** GET /api/firmenordner/ordner — alle Ordner am Geraet, mit ihrer Ebene. */
router.get(
  '/ordner',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = await verwaltung.listeOrdner();
    res.json({
      data,
      zustand: await verwaltung.zustand(host(req)),
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/firmenordner/ordner/:id/aenderungen — wer zuletzt wann etwas
 * geaendert hat, aus dem Protokoll des Dienstes.
 *
 * Fuer die Uebersicht je Ordner in der Verwaltung. Das Geraet fuehrt kein
 * eigenes Protokoll: auf der Platte gehoert jede Datei dem Konto des
 * Geraets, und wer sie hochgeladen hat, weiss allein der Dienst. Steht er
 * gerade nicht, ist die Liste leer -- und das ist eine Antwort, kein Fehler.
 */
router.get(
  '/ordner/:id/aenderungen',
  requireAuth,
  requireRole('admin'),
  validateParams(OrdnerParams),
  asyncHandler(async (req, res) => {
    const data = await verwaltung.aenderungenVon(req.params.id);
    res.json({ data, timestamp: new Date().toISOString() });
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
 * Ein Ordner mit Kindern ist `409`, und der Satz sagt, was zuerst weg muss.
 * Ein Ordner mit Rechten ebenso -- es sei denn, die Abfrage traegt
 * `rechte=entziehen` (J34, 28.09.2026): dann fallen die Rechte mit ihm, in
 * einem Schritt, und `rechte_entzogen` nennt, wessen. Beides ist kein Schutz
 * vor Versehen, sondern vor einem Ordner, der unter den Fuessen von jemandem
 * verschwindet, der gerade darin arbeitet.
 *
 * DIE EINZIGE ROUTE DES GERAETS, DIE LANGE DAUERN DARF, und sie sagt es
 * selbst. `index.js` schneidet jede Antwort nach 60 s ab (TIMEOUT-001) --
 * richtig fuer alles, was eine Frage beantwortet, falsch fuer das Wegwerfen
 * eines Ordners mit zehntausend Dateien: der Dienst raeumt dann weiter, der
 * Mensch bekommt ein `408`, und am Geraet steht eine Zeile fuer einen Raum,
 * den es nicht mehr gibt (am 22.09.2026 am Orin genau so passiert, nur eine
 * Stufe tiefer). Die Zahl kommt aus dem Dienst und nicht von hier -- zwei
 * Zahlen fuer dieselbe Geduld laufen auseinander.
 */
router.delete(
  '/ordner/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(OrdnerParams),
  validateQuery(OrdnerLoeschenQuery),
  asyncHandler(async (req, res) => {
    res.setTimeout(verwaltung.ZEITGRENZE_LOESCHEN_MS + 30000);
    const ordner = await verwaltung.holeOrdner(req.params.id);
    if (req.query.kennung !== ordner.kennung) {
      throw new ValidationError(
        `Zum Wegwerfen muss die Kennung „${ordner.kennung}" abgetippt werden.`
      );
    }
    const data = await verwaltung.loescheOrdner({
      ordnerId: req.params.id,
      rechteEntziehen: req.query.rechte === 'entziehen',
      durch: req.user.id,
    });
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

/**
 * Der Papierkorb (Auftrag papierkorb-und-adresse-des-firmenordners,
 * 27.09.2026, J34).
 *
 * WAS VERSEHENTLICH IN EINEN ORDNER GING, NIMMT DER ADMINISTRATOR SELBST
 * WIEDER HERAUS. Im Dateidienst ist er nur Editor, und ein Editor darf den
 * Papierkorb nicht leeren (Generalprobe 27.09.2026: 38-mal `403`) -- also
 * tut es das Konto des Geraets fuer ihn, und diese Wege entscheiden, wer
 * darf: Administratoren, sonst niemand. Jeder Handgriff, der etwas
 * veraendert, steht im Audit-Protokoll mit Ordner und Eintrag.
 *
 * Ein Papierkorb gehoert zu einem Hauptordner oder Bereich; ein Projekt hat
 * keinen eigenen (`400` mit Satz).
 */
router.get(
  '/papierkorb',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = await verwaltung.papierkorbUebersicht();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

router.get(
  '/ordner/:id/papierkorb',
  requireAuth,
  requireRole('admin'),
  validateParams(OrdnerParams),
  asyncHandler(async (req, res) => {
    const data = await verwaltung.papierkorbVon(req.params.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * DELETE /api/firmenordner/ordner/:id/papierkorb — leeren, endgueltig.
 *
 * Darf lange dauern wie das Wegwerfen (am Orin lagen 700 MB darin), und
 * setzt deshalb dieselbe Frist auf die eigene Antwort.
 */
router.delete(
  '/ordner/:id/papierkorb',
  requireAuth,
  requireRole('admin'),
  validateParams(OrdnerParams),
  asyncHandler(async (req, res) => {
    res.setTimeout(verwaltung.ZEITGRENZE_LOESCHEN_MS + 30000);
    const data = await verwaltung.leerePapierkorb(req.params.id);
    logSecurityEvent({
      userId: req.user.id,
      action: 'firmenordner_papierkorb_geleert',
      details: data,
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

router.post(
  '/ordner/:id/papierkorb/:eintrag/wiederherstellen',
  requireAuth,
  requireRole('admin'),
  validateParams(PapierkorbParams),
  asyncHandler(async (req, res) => {
    res.setTimeout(verwaltung.ZEITGRENZE_LOESCHEN_MS + 30000);
    const data = await verwaltung.stelleAusPapierkorbWiederHer(req.params.id, req.params.eintrag);
    logSecurityEvent({
      userId: req.user.id,
      action: 'firmenordner_papierkorb_wiederhergestellt',
      details: data,
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

router.delete(
  '/ordner/:id/papierkorb/:eintrag',
  requireAuth,
  requireRole('admin'),
  validateParams(PapierkorbParams),
  asyncHandler(async (req, res) => {
    res.setTimeout(verwaltung.ZEITGRENZE_LOESCHEN_MS + 30000);
    const data = await verwaltung.entferneAusPapierkorb(req.params.id, req.params.eintrag);
    logSecurityEvent({
      userId: req.user.id,
      action: 'firmenordner_papierkorb_eintrag_entfernt',
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
