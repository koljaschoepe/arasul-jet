/**
 * Sandbox API routes
 * Project management and container lifecycle for sandbox environments.
 * Terminal WebSocket is handled separately in index.js upgrade handler.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateQuery, validateParams } = require('../middleware/validate');
const {
  CreateProjectBody,
  UpdateProjectBody,
  ListProjectsQuery,
  WorkspaceParams,
} = require('../schemas/sandbox');
const sandboxService = require('../services/sandbox/sandboxService');
const terminalService = require('../services/sandbox/terminalService');
const externalCredentialsService = require('../services/sandbox/externalCredentialsService');

// ============================================================================
// Projects CRUD
// ============================================================================

// GET /api/sandbox/projects — List all projects (filtered by user)
router.get(
  '/projects',
  requireAuth,
  validateQuery(ListProjectsQuery),
  asyncHandler(async (req, res) => {
    const result = await sandboxService.listProjects({
      ...req.query,
      userId: req.user.id,
    });
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/projects — Create new project
router.post(
  '/projects',
  requireAuth,
  validateBody(CreateProjectBody),
  asyncHandler(async (req, res) => {
    // userRole steuert das Infrastruktur-Gate im Service (nur Admin-Rolle;
    // req.body ist strict-validiert, kann userRole also nicht injizieren).
    const project = await sandboxService.createProject({
      ...req.body,
      userId: req.user.id,
      userRole: req.user.role,
    });
    res.status(201).json({ project, timestamp: new Date().toISOString() });
  })
);

// GET /api/sandbox/projects/:id — Get project details
router.get(
  '/projects/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await sandboxService.getProject(req.params.id, req.user.id);
    res.json({ project, timestamp: new Date().toISOString() });
  })
);

// PUT /api/sandbox/projects/:id — Update project
router.put(
  '/projects/:id',
  requireAuth,
  validateBody(UpdateProjectBody),
  asyncHandler(async (req, res) => {
    const project = await sandboxService.updateProject(
      req.params.id,
      req.body,
      req.user.id,
      req.user.role
    );
    res.json({ project, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/sandbox/projects/:id — Archive project
router.delete(
  '/projects/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await sandboxService.deleteProject(req.params.id, req.user.id);
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
    const result = await sandboxService.startContainer(req.params.id, req.user.id);
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/projects/:id/stop — Stop container
router.post(
  '/projects/:id/stop',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await sandboxService.stopContainer(req.params.id, req.user.id);
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/projects/:id/commit — Save container state as image
router.post(
  '/projects/:id/commit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await sandboxService.commitContainer(req.params.id, req.user.id);
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// GET /api/sandbox/projects/:id/status — Live container status
router.get(
  '/projects/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = await sandboxService.getContainerStatus(req.params.id, req.user.id);
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
// Claude-Login-Persistenz (Plan 008, Schritt 14)
// ============================================================================
// Ein einmaliger Claude-Code-Login im Sandbox-Terminal soll einen Container-
// Neubau überleben. Nach dem Login ruft der Nutzer `capture` auf; die
// Credential-Dateien werden pro Nutzer VERSCHLÜSSELT in der DB abgelegt und beim
// nächsten Container-Start automatisch zurückgespielt (sandboxService).

// POST /api/sandbox/projects/:workspace/claude-login/capture
// Liest den aktuellen Claude-Login aus dem Workspace-Container und speichert ihn
// verschlüsselt für den eingeloggten Nutzer. 200 auch dann, wenn (noch) kein
// Login vorhanden war — `captured:false` signalisiert das dem Client.
router.post(
  '/projects/:workspace/claude-login/capture',
  requireAuth,
  validateParams(WorkspaceParams),
  asyncHandler(async (req, res) => {
    // Existenz + Owner-or-Admin-Gate (fremder/unbekannter Workspace → 404).
    const project = await sandboxService.loadWorkspace(req.params.workspace, {
      userId: req.user.id,
      userRole: req.user.role,
    });
    const result = await externalCredentialsService.captureClaudeLogin(req.user.id, project);
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// GET /api/sandbox/projects/:workspace/claude-login/status
// Ob für den eingeloggten Nutzer ein Claude-Login hinterlegt ist. Der Workspace
// dient nur als Auth-Kontext (Credentials sind pro Nutzer, nicht pro Workspace).
router.get(
  '/projects/:workspace/claude-login/status',
  requireAuth,
  validateParams(WorkspaceParams),
  asyncHandler(async (req, res) => {
    await sandboxService.loadWorkspace(req.params.workspace, {
      userId: req.user.id,
      userRole: req.user.role,
    });
    const stored = await externalCredentialsService.hasCredentials(
      req.user.id,
      externalCredentialsService.PROVIDER_CLAUDE
    );
    res.json({ stored, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/sandbox/projects/:workspace/claude-login
// Löscht den gespeicherten Claude-Login des eingeloggten Nutzers.
router.delete(
  '/projects/:workspace/claude-login',
  requireAuth,
  validateParams(WorkspaceParams),
  asyncHandler(async (req, res) => {
    await sandboxService.loadWorkspace(req.params.workspace, {
      userId: req.user.id,
      userRole: req.user.role,
    });
    const deleted = await externalCredentialsService.deleteCredentials(
      req.user.id,
      externalCredentialsService.PROVIDER_CLAUDE
    );
    res.json({ deleted, timestamp: new Date().toISOString() });
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
