/**
 * Sandbox API routes
 * Project management and container lifecycle for sandbox environments.
 * Terminal WebSocket is handled separately in index.js upgrade handler.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError } = require('../utils/errors');
const sandboxService = require('../services/sandbox/sandboxService');
const terminalService = require('../services/sandbox/terminalService');

// ============================================================================
// Projects CRUD
// ============================================================================

// GET /api/sandbox/projects — List all projects
router.get(
  '/projects',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, search, limit, offset } = req.query;
    const result = await sandboxService.listProjects({ status, search, limit, offset });
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/projects — Create new project
router.post(
  '/projects',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, description, icon, color, baseImage, resourceLimits, environment } = req.body;
    const project = await sandboxService.createProject({
      name,
      description,
      icon,
      color,
      baseImage,
      resourceLimits,
      environment,
    });
    res.status(201).json({ project, timestamp: new Date().toISOString() });
  })
);

// GET /api/sandbox/projects/:id — Get project details
router.get(
  '/projects/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await sandboxService.getProject(req.params.id);
    res.json({ project, timestamp: new Date().toISOString() });
  })
);

// PUT /api/sandbox/projects/:id — Update project
router.put(
  '/projects/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, description, icon, color, environment, resourceLimits } = req.body;
    const project = await sandboxService.updateProject(req.params.id, {
      name,
      description,
      icon,
      color,
      environment,
      resourceLimits,
    });
    res.json({ project, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/sandbox/projects/:id — Archive project
router.delete(
  '/projects/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await sandboxService.deleteProject(req.params.id);
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// ============================================================================
// Container Lifecycle
// ============================================================================

// POST /api/sandbox/projects/:id/start — Start container
router.post(
  '/projects/:id/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await sandboxService.startContainer(req.params.id);
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/projects/:id/stop — Stop container
router.post(
  '/projects/:id/stop',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await sandboxService.stopContainer(req.params.id);
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/projects/:id/commit — Save container state as image
router.post(
  '/projects/:id/commit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await sandboxService.commitContainer(req.params.id);
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// GET /api/sandbox/projects/:id/status — Live container status
router.get(
  '/projects/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = await sandboxService.getContainerStatus(req.params.id);
    res.json({ status, timestamp: new Date().toISOString() });
  })
);

// ============================================================================
// Terminal Sessions
// ============================================================================

// GET /api/sandbox/projects/:id/sessions — List sessions for a project
router.get(
  '/projects/:id/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const includeCompleted = req.query.all === 'true';
    const sessions = await terminalService.listSessions(req.params.id, { includeCompleted });
    res.json({ sessions, timestamp: new Date().toISOString() });
  })
);

// ============================================================================
// Statistics
// ============================================================================

// GET /api/sandbox/stats — Sandbox statistics
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    const stats = await sandboxService.getStatistics();
    res.json({ stats, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
