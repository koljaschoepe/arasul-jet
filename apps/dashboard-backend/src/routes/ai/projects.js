/**
 * Projects API (Workspace-Neuausrichtung Batch 2) — die oberste Ebene über den
 * Ordnern. Ein Projekt bündelt mehrere Ordner (knowledge_spaces.project_id); das
 * aktive Projekt scopt Explorer + Suche/Agenten.
 *
 * Literale Routen (/active) stehen VOR /:id, damit sie nicht als :id verschluckt
 * werden.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { spawn } = require('child_process');
const multer = require('multer');
const { requireAuth } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../../middleware/validate');
const { uploadLimiter } = require('../../middleware/rateLimit');
const projectService = require('../../services/rag/projectService');
const ablageService = require('../../services/projects/ablageService');
const ordnerSyncService = require('../../services/projects/ordnerSyncService');
const { cacheService } = require('../../services/core/cacheService');
const { ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const {
  CreateProjectBody,
  UpdateProjectBody,
  SetActiveProjectBody,
  ProjectIdParams,
  AblageReadQuery,
  AblageWriteBody,
  AblageOrdnerBody,
  AblageDeleteQuery,
  AblageMoveBody,
  AblageDownloadQuery,
} = require('../../schemas/projects');

// Upload in die Projektablage: im Speicher (max. 50 MB), der Service legt die
// Datei sicher eingesperrt im Projektordner ab.
const ablageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ablageService.MAX_UPLOAD_BYTES, files: 1 },
});

// Der Ordner-/Baum-Cache (spaces:list) hängt am aktiven Projekt (die Listen sind
// projektgescopt) — beim Wechsel/Änderungen invalidieren.
const CACHE_KEY_SPACES = 'spaces:list';

/**
 * GET /api/projects
 * Alle Projekte mit Ordner-Zähler.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projects = await projectService.listProjects();
    res.json({ data: projects, total: projects.length, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/projects/active
 * Das aktive Projekt + seine space_ids (RAG-Scope).
 */
router.get(
  '/active',
  requireAuth,
  asyncHandler(async (req, res) => {
    const activeId = await projectService.getActiveProjectId();
    const project = activeId ? await projectService.getProject(activeId) : null;
    const spaceIds = activeId ? await projectService.getProjectSpaceIds(activeId) : [];
    res.json({
      data: { project, space_ids: spaceIds },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/projects/active
 * Aktives Projekt setzen.
 */
router.put(
  '/active',
  requireAuth,
  validateBody(SetActiveProjectBody),
  asyncHandler(async (req, res) => {
    const activeId = await projectService.setActiveProjectId(req.body.project_id);
    const spaceIds = await projectService.getProjectSpaceIds(activeId);
    // Der projektgescopte Ordner-/Baum-Cache muss zum neuen Projekt passen.
    cacheService.invalidate(CACHE_KEY_SPACES);
    res.json({
      data: { active_project_id: activeId, space_ids: spaceIds },
      message: 'Aktives Projekt gesetzt',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/projects
 * Neues Projekt anlegen.
 */
router.post(
  '/',
  requireAuth,
  validateBody(CreateProjectBody),
  asyncHandler(async (req, res) => {
    const project = await projectService.createProject(req.body);
    res.status(201).json({
      data: project,
      message: 'Projekt erstellt',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/projects/:id
 * Projekt aktualisieren.
 */
router.put(
  '/:id',
  requireAuth,
  validateBody(UpdateProjectBody),
  asyncHandler(async (req, res) => {
    const project = await projectService.updateProject(req.params.id, req.body);
    res.json({
      data: project,
      message: 'Projekt aktualisiert',
      timestamp: new Date().toISOString(),
    });
  })
);

// --- Projektablage: die Datei-API des echten Projektordners -----------------
// (data/projects/<uuid> auf dem Gerät; Explorer-Bereich „Dateien", Flows und
// Sandboxes arbeiten im selben Ordner.)

/**
 * GET /api/projects/:id/dateien
 * Der Datei-Baum des Projektordners (rekursiv, Budget-gedeckelt) — der EINE
 * Baum des Ein-Ordner-Modells. Dateien tragen ihren Wissens-Status
 * (`dokument: {id, status}`), Ordner ihren Wissensraum (`space_id`).
 */
router.get(
  '/:id/dateien',
  requireAuth,
  validateParams(ProjectIdParams),
  asyncHandler(async (req, res) => {
    const { eintraege, gekuerzt } = await ablageService.listTreeMitWissen(req.params.id);
    res.json({ data: { eintraege, gekuerzt }, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/projects/:id/dateien/inhalt?pfad=…
 * Datei-Inhalt für den Editor (Text; Binär/zu groß → Kennzeichen statt Inhalt).
 */
router.get(
  '/:id/dateien/inhalt',
  requireAuth,
  validateParams(ProjectIdParams),
  validateQuery(AblageReadQuery),
  asyncHandler(async (req, res) => {
    const datei = await ablageService.readFile(req.params.id, req.query.pfad);
    res.json({ data: datei, timestamp: new Date().toISOString() });
  })
);

/**
 * PUT /api/projects/:id/dateien/inhalt
 * Textdatei schreiben (anlegen oder überschreiben, legt Zwischenordner an).
 */
router.put(
  '/:id/dateien/inhalt',
  requireAuth,
  validateParams(ProjectIdParams),
  validateBody(AblageWriteBody),
  asyncHandler(async (req, res) => {
    const datei = await ablageService.writeFile(req.params.id, req.body.pfad, req.body.inhalt);
    ordnerSyncService.trigger(req.params.id);
    res.json({ data: datei, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/projects/:id/dateien/ordner
 * Ordner anlegen (verschachtelt erlaubt).
 */
router.post(
  '/:id/dateien/ordner',
  requireAuth,
  validateParams(ProjectIdParams),
  validateBody(AblageOrdnerBody),
  asyncHandler(async (req, res) => {
    const ordner = await ablageService.createDir(req.params.id, req.body.pfad);
    ordnerSyncService.trigger(req.params.id);
    res.status(201).json({ data: ordner, timestamp: new Date().toISOString() });
  })
);

/**
 * DELETE /api/projects/:id/dateien?pfad=…
 * Datei oder Ordner (rekursiv) löschen. Die Wurzel und .git nie.
 */
router.delete(
  '/:id/dateien',
  requireAuth,
  validateParams(ProjectIdParams),
  validateQuery(AblageDeleteQuery),
  asyncHandler(async (req, res) => {
    const geloescht = await ablageService.remove(req.params.id, req.query.pfad);
    ordnerSyncService.trigger(req.params.id);
    res.json({ data: geloescht, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/projects/:id/dateien/verschieben
 * Umbenennen/Verschieben innerhalb der Ablage.
 */
router.post(
  '/:id/dateien/verschieben',
  requireAuth,
  validateParams(ProjectIdParams),
  validateBody(AblageMoveBody),
  asyncHandler(async (req, res) => {
    const ergebnis = await ablageService.move(req.params.id, req.body.von, req.body.nach);
    ordnerSyncService.trigger(req.params.id);
    res.json({ data: ergebnis, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/projects/:id/dateien/upload
 * Datei in die Ablage hochladen (multipart: file + optional ordner).
 */
router.post(
  '/:id/dateien/upload',
  requireAuth,
  uploadLimiter,
  validateParams(ProjectIdParams),
  (req, res, next) => {
    ablageUpload.single('file')(req, res, err => {
      if (err) {
        return next(new ValidationError(err.message || 'Fehler beim Datei-Upload'));
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError('Keine Datei hochgeladen');
    }
    const zielOrdner = typeof req.body.ordner === 'string' ? req.body.ordner.trim() : '';
    if (zielOrdner.startsWith('/') || zielOrdner.split('/').includes('..')) {
      throw new ValidationError('Ungültiger Zielordner');
    }
    const datei = await ablageService.saveUpload(
      req.params.id,
      zielOrdner || null,
      req.file.originalname,
      req.file.buffer
    );
    ordnerSyncService.trigger(req.params.id);
    res.status(201).json({ data: datei, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/projects/:id/dateien/download?pfad=…
 * Einzeldatei als Download; ohne pfad (oder für einen Ordner) ein .tar.gz.
 */
router.get(
  '/:id/dateien/download',
  requireAuth,
  validateParams(ProjectIdParams),
  validateQuery(AblageDownloadQuery),
  asyncHandler(async (req, res) => {
    const ziel = await ablageService.fuerDownload(req.params.id, req.query.pfad ?? '.');
    if (ziel.typ === 'datei') {
      res.download(ziel.abs, ziel.name);
      return;
    }
    // Ordner: als tar.gz streamen. `tar` gehört zur Alpine-Basis (busybox).
    const dateiname = `${ziel.name}.tar.gz`;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${dateiname}"`);
    const rel = path.relative(ziel.wurzel, ziel.abs) || '.';
    const tar = spawn('tar', ['-cz', '--exclude=.git', '-C', ziel.wurzel, rel]);
    tar.stdout.pipe(res);
    tar.stderr.on('data', chunk => logger.warn(`Ablage-Export: ${chunk.toString().trim()}`));
    tar.on('error', err => {
      logger.error(`Ablage-Export fehlgeschlagen: ${err.message}`);
      if (!res.headersSent) {
        res.status(500);
      }
      res.end();
    });
    req.on('close', () => tar.kill('SIGKILL'));
  })
);

/**
 * DELETE /api/projects/:id
 * Projekt löschen (nur leer, nicht das Standard-Projekt).
 */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await projectService.deleteProject(req.params.id);
    cacheService.invalidate(CACHE_KEY_SPACES);
    res.json({
      status: 'deleted',
      message: 'Projekt gelöscht',
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
