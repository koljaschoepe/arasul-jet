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
const { ValidationError } = require('../utils/errors');
const extensionService = require('../services/extensions/extensionService');
const werkstattWatcher = require('../services/extensions/werkstattWatcher');
const brueckeService = require('../services/extensions/brueckeService');
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
  res.setHeader('Cache-Control', 'no-store');
  const stream = fs.createReadStream(asset.filePath);
  stream.on('error', err => res.destroy(err));
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

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
  validateBody(BrueckeLlmBody),
  asyncHandler(async (req, res) => {
    await brueckeService.autorisieren(req.params.id, bearerFrom(req), 'llm');
    await brueckeService.llmStream(req.body, res);
  })
);

/** POST /api/extensions/:id/bruecke/rag — Wissensbasis-Suche mit Quellen. */
router.post(
  '/:id/bruecke/rag',
  llmLimiter,
  validateParams(ExtensionIdParams),
  validateBody(BrueckeRagBody),
  asyncHandler(async (req, res) => {
    await brueckeService.autorisieren(req.params.id, bearerFrom(req), 'rag');
    const treffer = await brueckeService.ragSuche(req.body);
    res.json({ treffer, timestamp: new Date().toISOString() });
  })
);

/** POST /api/extensions/:id/bruecke/dateien — Projektablage list/read/write. */
router.post(
  '/:id/bruecke/dateien',
  validateParams(ExtensionIdParams),
  validateBody(BrueckeDateienBody),
  asyncHandler(async (req, res) => {
    await brueckeService.autorisieren(req.params.id, bearerFrom(req), 'dateien');
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
  validateBody(BrueckeNetzBody),
  asyncHandler(async (req, res) => {
    const { extension } = await brueckeService.autorisieren(req.params.id, bearerFrom(req), 'netz');
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
  validateBody(BrueckeTabellenBody),
  asyncHandler(async (req, res) => {
    await brueckeService.autorisieren(req.params.id, bearerFrom(req), 'tabellen');
    const data = await brueckeService.tabellen(req.params.id, req.body);
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
  validateBody(BrueckeFlowRunBody),
  asyncHandler(async (req, res) => {
    const { userId } = await brueckeService.autorisieren(req.params.id, bearerFrom(req), 'flows');
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
