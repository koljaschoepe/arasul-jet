/**
 * Erweiterungen — bauen, herunterladen, importieren, forken
 * (Plan 012 Phase E · Schritt 16).
 *
 * Eine Erweiterung ist ein Ordner-Paket (manifest.json + Assets). Der Ablauf:
 * in der Werkstatt-Sandbox bauen → `POST /bauen` paketiert und registriert →
 * `GET /:id/download` liefert ein `.tar.gz` → `POST /import` spielt es auf
 * einem anderen Gerät wieder ein → `POST /:id/fork` macht daraus eine neue
 * Werkstatt zum Weiterbauen.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const { uploadLimiter, llmLimiter, apiLimiter } = require('../middleware/rateLimit');
const { ValidationError, UnauthorizedError } = require('../utils/errors');
const extensionService = require('../services/extensions/extensionService');
const werkstattWatcher = require('../services/extensions/werkstattWatcher');
const brueckeService = require('../services/extensions/brueckeService');
const appToken = require('../services/extensions/appToken');
const {
  ExtensionIdParams,
  BuildExtensionBody,
  ForkExtensionBody,
  SetEnabledBody,
  BrueckeLlmBody,
  BrueckeRagBody,
  BrueckeDateienBody,
  BrueckeNetzBody,
  BrueckeTabellenBody,
  BrueckeZeitplanBody,
  BrueckeFlowRunBody,
  BrueckeFlowParams,
  BrueckeRunParams,
  WerkstattInventarQuery,
} = require('../schemas/extensions');

const UPLOAD_DIR = path.join(os.tmpdir(), 'arasul-extension-uploads');
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

// diskStorage statt memoryStorage: ein Paket-Archiv gehört nicht in den Heap.
// Der fileFilter wirft eine typisierte ValidationError, damit der globale
// Error-Handler die kanonische Fehler-Hülle liefert (nicht multers Rohtext).
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`),
  }),
  limits: { fileSize: MAX_ARCHIVE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/\.(tar\.gz|tgz)$/i.test(file.originalname)) {
      return cb(null, true);
    }
    cb(new ValidationError('Nur .tar.gz- oder .tgz-Pakete können importiert werden'));
  },
});

/** GET /api/extensions — installierte Erweiterungen. */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await extensionService.listExtensions();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/extensions/werkstatt/status — Watcher-Sicht: welche Werkstatt-Ordner
 * gerade erkannt/übernommen wurden bzw. mit welchem Grund abgelehnt (z. B. eine
 * kaputte manifest.json). Macht stille Ablehnungen in der UI sichtbar.
 */
router.get(
  '/werkstatt/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ data: werkstattWatcher.status(), timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/extensions/werkstatt/inventar?projekt=<slug> — die eine Datenquelle
 * für das Werkstatt-Panel (Plan 017 Schritt 4/7): erkannte Ordner eines
 * Projekts mit Status, Typ, Fähigkeiten, Version, Rollback-Verfügbarkeit +
 * Ablehnungsgründe.
 */
router.get(
  '/werkstatt/inventar',
  requireAuth,
  validateQuery(WerkstattInventarQuery),
  asyncHandler(async (req, res) => {
    const data = await extensionService.werkstattInventar(req.query.projekt);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/** POST /api/extensions/bauen — Ordner einer Werkstatt zum Paket machen. */
router.post(
  '/bauen',
  requireAuth,
  validateBody(BuildExtensionBody),
  asyncHandler(async (req, res) => {
    const { slug, subfolder, overwrite } = req.body;
    const data = await extensionService.buildFromSandbox({
      slug,
      subfolder,
      overwrite,
      userId: req.user.id,
    });
    res.status(201).json({ data, timestamp: new Date().toISOString() });
  })
);

/** POST /api/extensions/import — Paket-Archiv hochladen und installieren. */
router.post(
  '/import',
  requireAuth,
  uploadLimiter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError('Kein Paket hochgeladen (Feld "file")');
    }
    const data = await extensionService.installFromArchive({
      archivePath: req.file.path,
      overwrite: req.body?.overwrite === 'true' || req.body?.overwrite === true,
      userId: req.user.id,
    });
    res.status(201).json({ data, timestamp: new Date().toISOString() });
  })
);

/** GET /api/extensions/:id/download — Paket als .tar.gz. */
router.get(
  '/:id/download',
  requireAuth,
  validateParams(ExtensionIdParams),
  asyncHandler(async (req, res) => {
    const { stream, filename } = await extensionService.packageStream(req.params.id);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    // Der Stream wird erst nach den Headern gestartet; bricht der Client ab,
    // muss er aktiv geschlossen werden, sonst bleibt der tar-Reader hängen.
    stream.on('error', err => {
      res.destroy(err);
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  })
);

/**
 * GET /api/extensions/:id/app  und  /:id/app/*
 * Liefert die Oberfläche einer App-Erweiterung, damit sie „in der Mitte" (wie
 * n8n) in einem Sandbox-iframe laufen kann. Ohne Unterpfad = Startdatei
 * (`manifest.entry`), sonst die angeforderte Datei aus dem Paket.
 *
 * Auth kommt hier über das `arasul_session`-Cookie (ein iframe-`src` kann keinen
 * Bearer-Header setzen; `requireAuth` fällt auf das Cookie zurück). Der Inhalt
 * ist Nutzer-HTML: die CSP-`sandbox`-Direktive zwingt ihm einen eigenen, opaken
 * Origin auf — selbst direkt geöffnet kommt kein Skript an Dashboard-Cookies
 * oder die API. Die Id prüft `resolveAppAsset` über `assertSafeId`.
 */
async function sendAppAsset(res, id, relPath) {
  const asset = await extensionService.resolveAppAsset(id, relPath);
  res.setHeader('Content-Type', asset.contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-popups allow-forms;');
  // Der Rahmen laeuft ohne `allow-same-origin`, hat also einen opaken Origin.
  // Fuer ihn ist JEDE Antwort dieses Servers fremd — und Helmets Vorgabe
  // `Cross-Origin-Resource-Policy: same-origin` blockiert sie deshalb. Bis zum
  // 22.08.2026 traf das auch `arasul-bruecke.js`: die Bruecken-API laesst
  // `Origin: null` ausdruecklich zu (siehe `brueckeCors`), ihre eigene
  // Client-Datei kam aber nie im Rahmen an. Die Dateien bleiben hinter
  // `requireAuth` und tragen oben ihre eigene Sandbox-CSP.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'no-store');
  const stream = fs.createReadStream(asset.filePath);
  stream.on('error', err => res.destroy(err));
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

/**
 * POST /api/extensions/:id/app-token — kurzlebiger Lese-Token fuer die Dateien
 * dieser Erweiterung. Aufrufer ist die ANGEMELDETE Dashboard-Seite; sie baut
 * ihn in die Adresse des iframes ein. Warum das noetig ist, steht im Kopf von
 * `services/extensions/appToken.js`.
 */
router.post(
  '/:id/app-token',
  requireAuth,
  validateParams(ExtensionIdParams),
  asyncHandler(async (req, res) => {
    const data = appToken.ausgeben(req.params.id, req.user?.id);
    res.json({ ...data, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/extensions/:id/app/t/:token[/*] — dieselben Dateien, aber mit dem
 * Token im PFAD statt dem Cookie im Kopf. Relative Verweise im App-HTML erben
 * den Praefix von selbst; das ist der ganze Grund fuer diese Form.
 *
 * Ohne `requireAuth`, weil aus dem opaken Rahmen kein Cookie kommt. Der Token
 * ersetzt es: 32 Zufallsbytes, kurzlebig, und er oeffnet ausschliesslich die
 * Dateien GENAU DIESER Erweiterung — dieselben, die der angemeldete Aufrufer
 * eine Zeile weiter oben ohnehin lesen darf.
 */
function tokenPfad(req, res, next) {
  if (!appToken.gueltig(req.params.token, req.params.id)) {
    return next(new UnauthorizedError('Lese-Token ungueltig oder abgelaufen'));
  }
  next();
}

router.get(
  '/:id/app/t/:token',
  tokenPfad,
  asyncHandler(async (req, res) => {
    await sendAppAsset(res, req.params.id, '');
  })
);

router.get(
  '/:id/app/t/:token/*',
  tokenPfad,
  asyncHandler(async (req, res) => {
    await sendAppAsset(res, req.params.id, req.params[0] || '');
  })
);

router.get(
  '/:id/app',
  requireAuth,
  asyncHandler(async (req, res) => {
    await sendAppAsset(res, req.params.id, '');
  })
);

router.get(
  '/:id/app/*',
  requireAuth,
  asyncHandler(async (req, res) => {
    await sendAppAsset(res, req.params.id, req.params[0] || '');
  })
);

/**
 * GET /api/extensions/:id/flow-status — n8n-Live-Status einer Flow-Erweiterung
 * (Plan 017 Schritt 3): aktiv/importiert/erreichbar + letzter Lauf. Degradiert
 * sichtbar bei n8n-Ausfall (erreichbar:false), bricht nie.
 */
router.get(
  '/:id/flow-status',
  requireAuth,
  validateParams(ExtensionIdParams),
  asyncHandler(async (req, res) => {
    const data = await extensionService.flowStatus(req.params.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/extensions/:id/rollback — genau EINEN Schritt zurück auf den vor
 * dem letzten Überschreiben gesicherten Stand (Plan 017 Schritt 4).
 */
router.post(
  '/:id/rollback',
  requireAuth,
  validateParams(ExtensionIdParams),
  asyncHandler(async (req, res) => {
    const data = await extensionService.rollbackExtension(req.params.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/** POST /api/extensions/:id/fork — Kopie als neue Werkstatt-Sandbox. */
router.post(
  '/:id/fork',
  requireAuth,
  validateParams(ExtensionIdParams),
  validateBody(ForkExtensionBody),
  asyncHandler(async (req, res) => {
    const data = await extensionService.forkExtension({
      id: req.params.id,
      name: req.body.name,
      userId: req.user.id,
      userRole: req.user.role,
    });
    res.status(201).json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * PUT /api/extensions/:id — aktivieren/deaktivieren.
 * Deklariert die Erweiterung Brücken-Fähigkeiten, verlangt das Aktivieren die
 * ausdrückliche Freigabe (`faehigkeitenFreigeben: true`) — sonst kommt 400 mit
 * `details.freigabe_erforderlich`, worauf die UI den Freigabe-Dialog zeigt.
 */
router.put(
  '/:id',
  requireAuth,
  validateParams(ExtensionIdParams),
  validateBody(SetEnabledBody),
  asyncHandler(async (req, res) => {
    const data = await extensionService.setEnabled(req.params.id, req.body.enabled, {
      faehigkeitenFreigeben: req.body.faehigkeitenFreigeben,
      userId: req.user.id,
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

// ============================================================================
// KI-Brücke (Plan 017 Schritt 2)
// ============================================================================
// Die App im abgeriegelten iframe (opaker Origin) ruft diese Routen mit einem
// kurzlebigen Brücken-Token auf, den ihr die Dashboard-Seite per postMessage
// reicht. CORS ist AUSSCHLIESSLICH hier geöffnet (Origin "null"), Cookies
// spielen keine Rolle — die Autorisierung trägt allein der Token, den das
// Backend bei jedem Aufruf gegen Erweiterung + freigegebene Fähigkeit prüft.

function brueckeCors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', 'null');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
}

function bearerFrom(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

/**
 * Erst die Freigabe, dann der Rumpf (Plan 023 H1, Fund vom 22.08.2026).
 *
 * Bis hierher stand `autorisieren` IM Rumpf des Handlers, also NACH
 * `validateBody`. Wer die Faehigkeit nicht hatte, bekam deshalb einen
 * Schema-Fehler zu sehen:
 *
 *   POST .../bruecke/netz  ohne Freigabe, leerer Rumpf
 *   -> VALIDATION_ERROR: url: Invalid input: expected string, received undefined
 *
 * Der Plan verlangt an dieser Stelle "eine verstaendliche Meldung", und ein
 * Feldname aus einem Zod-Schema ist keine. Jetzt kommt zuerst
 *
 *   -> FORBIDDEN: Faehigkeit "netz" ist fuer "beispiel-drei" nicht freigegeben
 *
 * Nebeneffekt, der genauso zaehlt: ohne Freigabe verraet die Antwort nichts
 * mehr ueber die Form des Rumpfes.
 *
 * Das Ergebnis haengt an `req.brueckeExt`, damit der Handler die Erweiterung
 * nicht ein zweites Mal laden muss.
 */
function verlangeFaehigkeit(faehigkeit) {
  return asyncHandler(async (req, _res, next) => {
    req.brueckeExt = await brueckeService.autorisieren(req.params.id, bearerFrom(req), faehigkeit);
    next();
  });
}

router.use('/:id/bruecke', brueckeCors);
// Grunddrossel für ALLE Brücken-Aufrufe (aus untrusted iframe-Code erreichbar);
// die teuren LLM-/RAG-Routen bekommen zusätzlich den strengeren llmLimiter.
router.use('/:id/bruecke', apiLimiter);

/**
 * POST /api/extensions/:id/bruecke/token — Brücken-Token ausstellen.
 * Aufrufer ist die AUTHENTIFIZIERTE Dashboard-Seite (nicht das iframe); sie
 * reicht den Token der App per postMessage. Erneuter Aufruf = frischer Token.
 */
router.post(
  '/:id/bruecke/token',
  requireAuth,
  validateParams(ExtensionIdParams),
  asyncHandler(async (req, res) => {
    const data = await brueckeService.issueToken(req.params.id, req.user.id);
    res.json({ ...data, timestamp: new Date().toISOString() });
  })
);

/** GET /api/extensions/:id/bruecke/info — wer bin ich, was darf ich. */
router.get(
  '/:id/bruecke/info',
  validateParams(ExtensionIdParams),
  asyncHandler(async (req, res) => {
    const { extension } = await brueckeService.autorisieren(req.params.id, bearerFrom(req), null);
    res.json({
      id: extension.id,
      name: extension.name,
      faehigkeiten: extension.faehigkeiten.wirksam,
      timestamp: new Date().toISOString(),
    });
  })
);

/** POST /api/extensions/:id/bruecke/llm — gestreamte Antwort des lokalen Modells (SSE). */
router.post(
  '/:id/bruecke/llm',
  llmLimiter,
  validateParams(ExtensionIdParams),
  verlangeFaehigkeit('llm'),
  validateBody(BrueckeLlmBody),
  asyncHandler(async (req, res) => {
    await brueckeService.llmStream(req.body, res);
  })
);

/** POST /api/extensions/:id/bruecke/rag — Wissensbasis-Suche mit Quellen. */
router.post(
  '/:id/bruecke/rag',
  llmLimiter,
  validateParams(ExtensionIdParams),
  verlangeFaehigkeit('rag'),
  validateBody(BrueckeRagBody),
  asyncHandler(async (req, res) => {
    const treffer = await brueckeService.ragSuche(req.body);
    res.json({ treffer, timestamp: new Date().toISOString() });
  })
);

/** POST /api/extensions/:id/bruecke/dateien — Projektablage list/read/write. */
router.post(
  '/:id/bruecke/dateien',
  validateParams(ExtensionIdParams),
  verlangeFaehigkeit('dateien'),
  validateBody(BrueckeDateienBody),
  asyncHandler(async (req, res) => {
    const data = await brueckeService.dateien(req.params.id, req.body);
    res.json({ ...data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/extensions/:id/bruecke/netz — Aufruf an ein deklariertes Ziel.
 *
 * Die Ziele stehen im Manifest der Erweiterung, durchgesetzt werden sie im
 * Backend. Ohne die Fähigkeit `netz` scheitert der Aufruf hier, ohne passendes
 * Ziel im Manifest eine Zeile später.
 */
router.post(
  '/:id/bruecke/netz',
  apiLimiter,
  validateParams(ExtensionIdParams),
  verlangeFaehigkeit('netz'),
  validateBody(BrueckeNetzBody),
  asyncHandler(async (req, res) => {
    const { extension } = req.brueckeExt;
    const data = await brueckeService.netzAufruf(req.params.id, extension.manifest, req.body);
    res.json({ ...data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/extensions/:id/bruecke/tabellen — eigene Tabellen (Plan 023 H1).
 *
 * Die Erweiterung schickt nie SQL. Jede Aktion nennt Tabelle, Spalten und
 * Werte; das SQL entsteht im `tabellenService` aus geprüften Bezeichnern.
 */
router.post(
  '/:id/bruecke/tabellen',
  apiLimiter,
  validateParams(ExtensionIdParams),
  verlangeFaehigkeit('tabellen'),
  validateBody(BrueckeTabellenBody),
  asyncHandler(async (req, res) => {
    const data = await brueckeService.tabellen(req.params.id, req.body);
    res.json({ ...data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/extensions/:id/bruecke/zeitplan — nächtliche Läufe (Plan 023 H1).
 *
 * Was läuft, ist ein Flow. Ohne die Fähigkeit `zeitplan` scheitert schon das
 * Eintragen, nicht erst der Lauf.
 */
router.post(
  '/:id/bruecke/zeitplan',
  apiLimiter,
  validateParams(ExtensionIdParams),
  verlangeFaehigkeit('zeitplan'),
  validateBody(BrueckeZeitplanBody),
  asyncHandler(async (req, res) => {
    const data = await brueckeService.zeitplan(req.params.id, req.body);
    res.json({ ...data, timestamp: new Date().toISOString() });
  })
);

/** GET /api/extensions/:id/bruecke/flows — verfügbare Flows. */
router.get(
  '/:id/bruecke/flows',
  validateParams(ExtensionIdParams),
  asyncHandler(async (req, res) => {
    await brueckeService.autorisieren(req.params.id, bearerFrom(req), 'flows');
    const flows = await brueckeService.flowsListe();
    res.json({ flows, timestamp: new Date().toISOString() });
  })
);

/** POST /api/extensions/:id/bruecke/flows/:name/run — Flow starten. */
router.post(
  '/:id/bruecke/flows/:name/run',
  validateParams(BrueckeFlowParams),
  verlangeFaehigkeit('flows'),
  validateBody(BrueckeFlowRunBody),
  asyncHandler(async (req, res) => {
    const { userId } = req.brueckeExt;
    const data = await brueckeService.flowStarten({
      name: req.params.name,
      args: req.body.args,
      userId,
    });
    res.status(202).json({ ...data, status: 'laeuft', timestamp: new Date().toISOString() });
  })
);

/** GET /api/extensions/:id/bruecke/flows/runs/:runId — Lauf-Status/Ergebnis. */
router.get(
  '/:id/bruecke/flows/runs/:runId',
  validateParams(BrueckeRunParams),
  asyncHandler(async (req, res) => {
    const { userId } = await brueckeService.autorisieren(req.params.id, bearerFrom(req), 'flows');
    const data = await brueckeService.flowLauf({ runId: req.params.runId, userId });
    res.json({ ...data, timestamp: new Date().toISOString() });
  })
);

/** DELETE /api/extensions/:id — deinstallieren (Register + Paket-Ordner). */
router.delete(
  '/:id',
  requireAuth,
  validateParams(ExtensionIdParams),
  asyncHandler(async (req, res) => {
    const data = await extensionService.removeExtension(req.params.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
