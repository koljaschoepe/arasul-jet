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
const { llmLimiter } = require('../middleware/rateLimit');
const { CreateProjectBody, UpdateProjectBody, ListProjectsQuery } = require('../schemas/sandbox');
const { AgentListParams, RunAgentParams, RunAgentBody } = require('../schemas/agents');
const sandboxService = require('../services/sandbox/sandboxService');
const terminalService = require('../services/sandbox/terminalService');
const { resolveAndRun, loadWorkspace } = require('../services/agents/runWorkspaceAgent');
const { listAgents, loadAgent } = require('../services/agents/agentFile');
const { initSSE, trackConnection } = require('../utils/sseHelper');

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
// Workspace Agents (Plan 008, Schritt 11 — chat as agent command center)
// ============================================================================

// GET /api/sandbox/projects/:workspace/agenten — List the workspace's agents
// (name + parsed metadata). Powers @-autocomplete / validation in the chat.
router.get(
  '/projects/:workspace/agenten',
  requireAuth,
  validateParams(AgentListParams),
  asyncHandler(async (req, res) => {
    const project = await loadWorkspace(req.params.workspace, {
      userId: req.user.id,
      userRole: req.user.role,
    });
    const names = await listAgents(project.host_path);
    const agents = [];
    for (const name of names) {
      try {
        const agent = await loadAgent(project.host_path, name);
        agents.push({
          name,
          displayName: agent.name,
          description: agent.description,
          model: agent.model,
          tools: agent.tools,
        });
      } catch {
        // A malformed definition file shouldn't hide the rest — list it bare.
        agents.push({ name });
      }
    }
    res.json({ agents, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/projects/:workspace/agenten/:agent/run/stream
// Runs the agent and streams every engine event as an SSE frame:
//   data: {"type":"tool_start","tool":"dateien","params":{...}}
//   data: {"type":"tool_result","tool":"dateien","result":"..."}
//   data: {"type":"text","content":"..."}
//   data: {"type":"done","result":"...","truncated":false}
//   data: {"type":"error","message":"..."}
// Resolution/auth failures happen BEFORE the first frame, so they still map to
// a real HTTP status (401 via requireAuth, 404 for unknown workspace/agent) —
// the SSE stream is opened lazily on the first emitted event.
router.post(
  '/projects/:workspace/agenten/:agent/run/stream',
  requireAuth,
  llmLimiter,
  validateParams(RunAgentParams),
  validateBody(RunAgentBody),
  asyncHandler(async (req, res) => {
    let sseStarted = false;
    const ensureSSE = () => {
      if (!sseStarted) {
        initSSE(res);
        trackConnection(res);
        sseStarted = true;
      }
    };
    const send = evt => {
      ensureSSE();
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      }
    };

    await resolveAndRun({
      workspaceRef: req.params.workspace,
      agentName: req.params.agent,
      userInput: req.body.input,
      userId: req.user.id,
      userRole: req.user.role,
      onEvent: send,
    });

    // runAgent always emits a terminal 'done'/'error' event, so the stream is
    // already open here; ensure it is closed. If it somehow emitted nothing,
    // open + close cleanly so the client isn't left hanging.
    ensureSSE();
    if (!res.writableEnded) {
      res.end();
    }
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
