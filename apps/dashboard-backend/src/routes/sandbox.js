/**
 * Sandbox API routes
 * Project management and container lifecycle for sandbox environments.
 * Terminal WebSocket is handled separately in index.js upgrade handler.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateQuery, validateParams } = require('../middleware/validate');
const { llmLimiter, webhookLimiter } = require('../middleware/rateLimit');
const { CreateProjectBody, UpdateProjectBody, ListProjectsQuery } = require('../schemas/sandbox');
const {
  AgentListParams,
  RunAgentParams,
  RunAgentBody,
  AgentTokenParams,
  ExternalRunAgentBody,
} = require('../schemas/agents');
const sandboxService = require('../services/sandbox/sandboxService');
const terminalService = require('../services/sandbox/terminalService');
const externalCredentialsService = require('../services/sandbox/externalCredentialsService');
const { resolveAndRun, loadWorkspace } = require('../services/agents/runWorkspaceAgent');
const { listAgents, loadAgent } = require('../services/agents/agentFile');
const { initSSE, trackConnection } = require('../utils/sseHelper');
const { UnauthorizedError, ServiceUnavailableError } = require('../utils/errors');
const db = require('../database');
const logger = require('../utils/logger');

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
// External agent run (Plan 008, Schritt 12 — n8n / HTTP integration surface)
// ============================================================================

// POST /api/sandbox/projects/:workspace/agenten/token
// Cookie/session-authenticated. Owner-or-admin generates (rotates) a
// per-workspace bearer token that the non-cookie external run route below
// accepts. The plaintext token is returned exactly ONCE — only its bcrypt hash
// is stored, and each call overwrites the previous hash (rotation). A caller
// that loses the token must generate a new one.
router.post(
  '/projects/:workspace/agenten/token',
  requireAuth,
  validateParams(AgentTokenParams),
  asyncHandler(async (req, res) => {
    // Existence + owner-or-admin gate (NotFoundError → 404 for foreign/unknown).
    const project = await loadWorkspace(req.params.workspace, {
      userId: req.user.id,
      userRole: req.user.role,
    });

    // High-entropy token: `arun_` + 32 random bytes, url-safe base64.
    const token = `arun_${crypto.randomBytes(32).toString('base64url')}`;
    const tokenHash = await bcrypt.hash(token, 10);

    await db.query(
      `UPDATE sandbox_projects
         SET agent_run_token_hash = $1, agent_run_token_set_at = NOW()
       WHERE id = $2`,
      [tokenHash, project.id]
    );

    logger.info(`Agent-run token rotated for workspace ${project.id} by user ${req.user.id}`);

    res.status(201).json({
      token,
      message:
        'Dieses Token wird nur EINMAL angezeigt und ersetzt ein zuvor erzeugtes ' +
        'Token. Sicher speichern — es kann nicht erneut abgerufen werden.',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/sandbox/projects/:workspace/agenten/:agent/run
// Token-authenticated (NOT cookie/session). The external, buffering counterpart
// to the SSE stream route above — one plain JSON request in, one JSON response
// out, so n8n (or any HTTP client) can start an agent and read its result.
//
// Auth: `Authorization: Bearer <token>` (or `X-Agent-Token: <token>`). The
// token is validated against the workspace's stored bcrypt hash. Every failure
// mode — missing token, unknown workspace, workspace without a token, wrong
// token — collapses to a single 401 so the route never leaks which workspaces
// exist. On success the token authorizes AS THE WORKSPACE OWNER: we hand
// `resolveAndRun` the workspace's own `user_id`, so the owner-scoping inside
// the helper passes without being bypassed.
router.post(
  '/projects/:workspace/agenten/:agent/run',
  webhookLimiter,
  validateParams(RunAgentParams),
  validateBody(ExternalRunAgentBody),
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearer || String(req.headers['x-agent-token'] || '').trim();
    if (!token) {
      throw new UnauthorizedError('Agenten-Token erforderlich (Authorization: Bearer <token>)');
    }

    // Resolve the workspace WITHOUT owner-scoping (no acting user yet), then
    // authenticate via the stored token hash. Unknown workspace, NULL hash, or
    // a mismatched token all map to 401 (never 404) to avoid leaking existence.
    let project = null;
    try {
      project = await loadWorkspace(req.params.workspace);
    } catch {
      project = null;
    }
    const hash = project && project.agent_run_token_hash;
    if (!hash || !(await bcrypt.compare(token, hash))) {
      throw new UnauthorizedError('Ungültiges oder fehlendes Agenten-Token');
    }

    // Buffer the engine events: `steps` lets the caller inspect what the agent
    // did; `engineError` captures a mid-run failure the engine reports without
    // throwing (it emits an `error` event and returns `{ error }`).
    const steps = [];
    let engineError = null;
    const onEvent = evt => {
      if (evt.type === 'tool_start' || evt.type === 'tool_result') {
        steps.push(evt);
      } else if (evt.type === 'error') {
        engineError = evt.message;
      }
    };

    // Authorize as the owner: pass the workspace's own user_id so
    // resolveAndRun's owner check (user_id === userId) passes. Unknown agent
    // still throws NotFoundError → 404 (the caller is authenticated here).
    const run = await resolveAndRun({
      workspaceRef: req.params.workspace,
      agentName: req.params.agent,
      userInput: req.body.input,
      userId: project.user_id,
      onEvent,
    });

    const errMsg = run.error || engineError;
    if (errMsg) {
      throw new ServiceUnavailableError(`Agenten-Lauf fehlgeschlagen: ${errMsg}`);
    }

    res.json({
      result: run.result,
      iterations: run.iterations,
      truncated: run.truncated || false,
      steps,
      timestamp: new Date().toISOString(),
    });
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
  validateParams(AgentTokenParams),
  asyncHandler(async (req, res) => {
    // Existenz + Owner-or-Admin-Gate (fremder/unbekannter Workspace → 404).
    const project = await loadWorkspace(req.params.workspace, {
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
  validateParams(AgentTokenParams),
  asyncHandler(async (req, res) => {
    await loadWorkspace(req.params.workspace, {
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
  validateParams(AgentTokenParams),
  asyncHandler(async (req, res) => {
    await loadWorkspace(req.params.workspace, {
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
