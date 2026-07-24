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
const { requireAuth } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody } = require('../../middleware/validate');
const projectService = require('../../services/rag/projectService');
const { cacheService } = require('../../services/core/cacheService');
const {
  CreateProjectBody,
  UpdateProjectBody,
  SetActiveProjectBody,
} = require('../../schemas/projects');

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
