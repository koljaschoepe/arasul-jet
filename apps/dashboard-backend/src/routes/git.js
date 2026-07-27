/**
 * Git-Sync API (Plan 013, B9) — koppelt ein Projekt an ein GitHub-Repo und
 * gleicht den Projekt-Checkout zwei-wegig ab (clone/pull/push).
 *
 * Alle Routen sind projekt-gescopt (`/:projectId/...`). Der Klartext-PAT geht nur
 * herein (POST /connect) — er verlässt das Backend nie wieder; GET liefert nur
 * die maskierten letzten 4 Zeichen.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateParams } = require('../middleware/validate');
const { ProjectIdParams, ConnectGitBody } = require('../schemas/git');
const projectService = require('../services/rag/projectService');
const gitSyncService = require('../services/git/gitSyncService');

/**
 * GET /api/git/:projectId
 * Kopplungs-/Sync-Status eines Projekts (oder null, wenn nicht gekoppelt).
 */
router.get(
  '/:projectId',
  requireAuth,
  validateParams(ProjectIdParams),
  asyncHandler(async (req, res) => {
    const kopplung = await gitSyncService.status({ projectId: req.params.projectId });
    res.json({ data: kopplung, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/git/:projectId/connect
 * Repo + Branch (+ optional PAT) koppeln; prüft die Erreichbarkeit sofort.
 */
router.post(
  '/:projectId/connect',
  requireAuth,
  validateParams(ProjectIdParams),
  validateBody(ConnectGitBody),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    await projectService.getProject(projectId); // wirft NotFound, wenn Projekt weg
    const kopplung = await gitSyncService.verbinde({
      projectId,
      repoUrl: req.body.repo_url,
      branch: req.body.branch,
      pat: req.body.pat ?? null,
    });
    res.json({
      data: kopplung,
      message: 'Repository verbunden',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/git/:projectId/sync
 * Zwei-Wege-Sync: lokale Änderungen committen → fetch → merge → push.
 */
router.post(
  '/:projectId/sync',
  requireAuth,
  validateParams(ProjectIdParams),
  asyncHandler(async (req, res) => {
    const ergebnis = await gitSyncService.synchronisiere({ projectId: req.params.projectId });
    res.json({
      data: ergebnis,
      message: 'Synchronisiert',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/git/:projectId
 * Kopplung lösen (verschlüsselter PAT + lokaler Checkout werden entfernt).
 */
router.delete(
  '/:projectId',
  requireAuth,
  validateParams(ProjectIdParams),
  asyncHandler(async (req, res) => {
    await gitSyncService.trenne({ projectId: req.params.projectId });
    res.json({
      data: { disconnected: true },
      message: 'Repository getrennt',
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
