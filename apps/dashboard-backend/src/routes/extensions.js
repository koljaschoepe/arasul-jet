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
const { validateBody, validateParams } = require('../middleware/validate');
const { uploadLimiter } = require('../middleware/rateLimit');
const { ValidationError } = require('../utils/errors');
const extensionService = require('../services/extensions/extensionService');
const {
  ExtensionIdParams,
  BuildExtensionBody,
  ForkExtensionBody,
  SetEnabledBody,
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

/** PUT /api/extensions/:id — aktivieren/deaktivieren. */
router.put(
  '/:id',
  requireAuth,
  validateParams(ExtensionIdParams),
  validateBody(SetEnabledBody),
  asyncHandler(async (req, res) => {
    const data = await extensionService.setEnabled(req.params.id, req.body.enabled);
    res.json({ data, timestamp: new Date().toISOString() });
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
