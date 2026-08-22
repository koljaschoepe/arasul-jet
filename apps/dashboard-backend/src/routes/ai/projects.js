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
const { mitNamensReparatur } = require('../../utils/uploadName');
const { attachmentHeader } = require('../../utils/contentDisposition');
const { requireAuth } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../../middleware/validate');
const { uploadLimiter } = require('../../middleware/rateLimit');
const projectService = require('../../services/rag/projectService');
const ablageService = require('../../services/projects/ablageService');
const ordnerSyncService = require('../../services/projects/ordnerSyncService');
const vorlagenService = require('../../services/projects/vorlagenService');
const vorlagenUpdate = require('../../services/projects/vorlagenUpdate');
const steckbriefIndex = require('../../services/projects/steckbriefIndex');
const { cacheService } = require('../../services/core/cacheService');
const { ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const {
  CreateProjectBody,
  UpdateProjectBody,
  SetActiveProjectBody,
  ProjectIdParams,
  AblageReadQuery,
  AblageSucheQuery,
  AblageEbeneQuery,
  AblageWriteBody,
  AblageOrdnerBody,
  VorlagenUebernahmeBody,
  AblageDeleteQuery,
  AblageMoveBody,
  AblageDownloadQuery,
} = require('../../schemas/projects');

// Upload in die Projektablage: im Speicher (max. 50 MB), der Service legt die
// Datei sicher eingesperrt im Projektordner ab.
const ablageUpload = multer(
  mitNamensReparatur({
    storage: multer.memoryStorage(),
    limits: { fileSize: ablageService.MAX_UPLOAD_BYTES, files: 1 },
  })
);

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
 * GET /api/projects/vorlagen
 * Die Vorlagen-Galerie fürs Anlegen (Plan 014, Phase 1): alle mitgelieferten
 * Standardprojekt-Vorlagen aus dem Backend-Image.
 */
router.get(
  '/vorlagen',
  requireAuth,
  asyncHandler(async (req, res) => {
    const vorlagen = await vorlagenService.listeVorlagen();
    res.json({ data: vorlagen, total: vorlagen.length, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/projects
 * Neues Projekt anlegen — optional aus einer Vorlage (`vorlage: <id>`): dann
 * werden Ordnerstruktur, Wissens-Dateien und Flows der Vorlage in den
 * Projektordner kopiert (wx — überschreibt nie) und das Projekt merkt sich
 * Vorlage + Version.
 */
router.post(
  '/',
  requireAuth,
  validateBody(CreateProjectBody),
  asyncHandler(async (req, res) => {
    const { vorlage: vorlageId, ...felder } = req.body;

    // Vorlage FRÜH laden — eine unbekannte Vorlage soll als 404 kommen,
    // bevor ein Projekt entsteht.
    const vorlage = vorlageId ? await vorlagenService.getVorlage(vorlageId) : null;

    const project = await projectService.createProject({
      ...felder,
      icon: felder.icon || (vorlage ? vorlage.icon : undefined),
      color: felder.color || (vorlage ? vorlage.color : undefined),
      description: felder.description ?? (vorlage ? vorlage.beschreibung : null),
    });

    if (vorlage) {
      const ergebnis = await vorlagenService.wendeVorlageAn(project.id, vorlage.id);
      project.vorlage_id = vorlage.id;
      project.vorlage_version = vorlage.version;
      logger.info(
        `Projekt "${project.name}" aus Vorlage "${vorlage.id}" angelegt ` +
          `(${ergebnis.kopiert.length} Dateien)`
      );
      // Die kopierten Wissens-Dateien sollen zügig im Index landen.
      ordnerSyncService.trigger(project.id);
    }

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
 * GET /api/projects/:id/vorlagen-update
 * Vorlagen-Update-Stand (Plan 014, Phase 6): gibt es eine neuere Vorlagen-
 * Version, und welche Neuerungen (fehlende Vorlagen-Dateien) sind übernehmbar?
 */
router.get(
  '/:id/vorlagen-update',
  requireAuth,
  validateParams(ProjectIdParams),
  asyncHandler(async (req, res) => {
    const stand = await vorlagenUpdate.pruefeUpdate(req.params.id);
    res.json({ data: stand, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/projects/:id/vorlagen-update
 * Ausgewählte Neuerungen übernehmen (ADDITIV, wx — nie überschreiben).
 */
router.post(
  '/:id/vorlagen-update',
  requireAuth,
  validateParams(ProjectIdParams),
  validateBody(VorlagenUebernahmeBody),
  asyncHandler(async (req, res) => {
    // uebernehmeNeuerungen triggert den Ordner-Sync selbst (nur wenn wirklich
    // kopiert wurde) — hier kein zweiter Aufruf.
    const ergebnis = await vorlagenUpdate.uebernehmeNeuerungen(req.params.id, req.body.pfade);
    res.json({
      data: ergebnis,
      message: `${ergebnis.uebernommen.length} Neuerung(en) übernommen`,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/projects/:id/kunden
 * Die Kundenübersicht des CRM-Pakets (Plan 014, Phase 3): je Unterordner von
 * `Kunden/` ein Eintrag mit den Steckbrief-Feldern — direkt von der Platte
 * gelesen (kein DB-Zustand, kein Drift).
 */
router.get(
  '/:id/kunden',
  requireAuth,
  validateParams(ProjectIdParams),
  asyncHandler(async (req, res) => {
    const { kunden } = await steckbriefIndex.listeKunden(req.params.id);
    res.json({ data: kunden, total: kunden.length, timestamp: new Date().toISOString() });
  })
);

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
 * GET /api/projects/:id/dateien/ebene?ordner=…
 *
 * Die direkten Kinder EINES Ordners (Plan 023 G1). Der Baum darueber ist auf
 * 2000 Eintraege ueber alle Ebenen gedeckelt; bei 5000 Dateien blieb davon
 * "Liste gekuerzt" ohne einen Weg zum Rest. Wer aufklappt, fragt ab jetzt
 * genau die Ebene, die er aufgeklappt hat, und die hat keinen Deckel ueber
 * fremde Ordner hinweg.
 */
router.get(
  '/:id/dateien/ebene',
  requireAuth,
  validateParams(ProjectIdParams),
  validateQuery(AblageEbeneQuery),
  asyncHandler(async (req, res) => {
    const { eintraege, gekuerzt } = await ablageService.listEbeneMitWissen(
      req.params.id,
      req.query.ordner
    );
    res.json({ data: { eintraege, gekuerzt }, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/projects/:id/dateien/suche?q=…
 * Rekursive Namenssuche über die KOMPLETTE Ablage — der Baum-Endpoint ist
 * Budget-gedeckelt, die Suche nicht (eigenes, höheres Besuchs-Budget).
 */
router.get(
  '/:id/dateien/suche',
  requireAuth,
  validateParams(ProjectIdParams),
  validateQuery(AblageSucheQuery),
  asyncHandler(async (req, res) => {
    const { eintraege, gekuerzt } = await ablageService.searchTree(req.params.id, req.query.q);
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
 * GET /api/projects/:id/dateien/versionen?pfad=…
 * Undo-Verlauf einer Datei (Plan 022): Anzahl Stufen + Text-Vorher-Stand für
 * den Diff. Speist die Diff-/Undo-Leiste im Editor.
 */
router.get(
  '/:id/dateien/versionen',
  requireAuth,
  validateParams(ProjectIdParams),
  validateQuery(AblageReadQuery),
  asyncHandler(async (req, res) => {
    const info = await ablageService.versionsInfo(req.params.id, req.query.pfad);
    res.json({ data: info, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/projects/:id/dateien/undo
 * Macht den jüngsten Schreibschritt einer Datei rückgängig (mehrstufig).
 */
router.post(
  '/:id/dateien/undo',
  requireAuth,
  validateParams(ProjectIdParams),
  validateBody(AblageOrdnerBody),
  asyncHandler(async (req, res) => {
    const ergebnis = await ablageService.undoDatei(req.params.id, req.body.pfad);
    ordnerSyncService.trigger(req.params.id);
    res.json({ data: ergebnis, timestamp: new Date().toISOString() });
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
    // Unicode-Ordnernamen (Umlaute, CJK, Emoji) RFC-5987-korrekt kodieren —
    // der handgebaute filename="…"-Header warf sonst ERR_INVALID_CHAR → 500
    // (QA-Sweep-Befund). Eigener Helfer statt (nur transitiver) Abhängigkeit.
    res.setHeader('Content-Disposition', attachmentHeader(dateiname));
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
 * GET /api/projects/:id/dateien/vorschau?pfad=…
 * Inline-Vorschau einer Datei (PDF/Bild, Plan 019 · Phase 3): streamt die
 * Datei mit Content-Type aus der Endung, `Content-Disposition: inline` und
 * Range-Unterstützung (Express `sendFile`), bis MAX_VORSCHAU_BYTES (~50 MB) —
 * anders als der 5-MB-gedeckelte Editor-JSON-Endpunkt. `nosniff` verhindert
 * MIME-Raten; große Dateien landen so nie komplett im Speicher.
 */
router.get(
  '/:id/dateien/vorschau',
  requireAuth,
  validateParams(ProjectIdParams),
  validateQuery(AblageReadQuery),
  asyncHandler(async (req, res) => {
    const ziel = await ablageService.fuerVorschau(req.params.id, req.query.pfad);
    res.sendFile(ziel.abs, {
      headers: {
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(ziel.name)}`,
        'Cache-Control': 'private, max-age=60',
        'X-Content-Type-Options': 'nosniff',
      },
    });
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
