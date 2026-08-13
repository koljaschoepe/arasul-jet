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
  EnsureProjectBody,
  ListProjectsQuery,
  WorkspaceParams,
  ClaudeAuthBody,
  ClaudeOAuthCompleteBody,
  CreateConnectionBody,
  UpdateConnectionBody,
  ProjectIdParams,
  ConnectionIdParams,
  SessionTitleParams,
  SessionTitleBody,
} = require('../schemas/sandbox');
const sandboxService = require('../services/sandbox/sandboxService');
const terminalService = require('../services/sandbox/terminalService');
const connectionsService = require('../services/sandbox/connectionsService');
const externalCredentialsService = require('../services/sandbox/externalCredentialsService');
const claudeOauthService = require('../services/sandbox/claudeOauthService');
const wsTicketService = require('../services/sandbox/wsTicketService');

// POST /api/sandbox/terminal/ticket — Einmal-Ticket für den WS-Aufbau.
// Der Browser kann auf der WebSocket-Verbindung keinen Authorization-Header
// setzen; dieser normal per Bearer authentifizierte Aufruf gibt ein
// kurzlebiges Ticket aus, das der Client an die WS-URL hängt (s.
// wsTicketService.js). So hängt das Terminal nicht mehr am Session-Cookie.
router.post(
  '/terminal/ticket',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { ticket, expiresInMs } = wsTicketService.issue(req.user.id);
    res.json({ ticket, expiresInMs, timestamp: new Date().toISOString() });
  })
);

// ============================================================================
// Projects CRUD
// ============================================================================

// GET /api/sandbox/projects — Alle Projekte, geräteweit (Plan 017 Schritt 1).
// `presence` je Projekt: wer ist gerade live per Terminal-WebSocket verbunden.
router.get(
  '/projects',
  requireAuth,
  validateQuery(ListProjectsQuery),
  asyncHandler(async (req, res) => {
    const result = await sandboxService.listProjects(req.query);
    const presence = terminalService.presenceSummary();
    const projects = result.projects.map(p => ({
      ...p,
      presence: presence[String(p.id)] || { connections: 0, users: [] },
    }));
    res.json({ ...result, projects, timestamp: new Date().toISOString() });
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

// POST /api/sandbox/projects/ensure — Container zum aktiven Workspace-Projekt
// nachschlagen oder atomar anlegen+koppeln (Plan 018: Projekt-Vereinheitlichung).
// Steht bewusst vor den '/projects/:id/*'-Routen; ein bloßes POST '/projects/:id'
// gibt es zwar nicht (nur GET/PUT/DELETE), die Reihenfolge bleibt aber robust
// gegen künftige Refactors.
router.post(
  '/projects/ensure',
  requireAuth,
  validateBody(EnsureProjectBody),
  asyncHandler(async (req, res) => {
    const { project, created } = await sandboxService.ensureProjectContainer(req.body.project_id, {
      userId: req.user.id,
      userRole: req.user.role,
    });
    res.status(created ? 201 : 200).json({ project, created, timestamp: new Date().toISOString() });
  })
);

// GET /api/sandbox/projects/:id — Get project details
router.get(
  '/projects/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await sandboxService.getProject(req.params.id);
    res.json({
      project: {
        ...project,
        presence: terminalService.presenceForProject(req.params.id),
      },
      timestamp: new Date().toISOString(),
    });
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
// Projekt-Verbindungen + MCP (Plan 017 Schritt 5)
// ============================================================================
// Verschlüsselt hinterlegte externe Zugänge (env) und MCP-Server je Projekt.
// Werte werden NIE zurückgegeben (nur `hatWert`); injiziert beim Sitzungs-Start.

// GET /api/sandbox/projects/:id/verbindungen — Verbindungen auflisten
router.get(
  '/projects/:id/verbindungen',
  requireAuth,
  validateParams(ProjectIdParams),
  asyncHandler(async (req, res) => {
    await sandboxService.getProject(req.params.id); // 404 bei unbekanntem Projekt
    const verbindungen = await connectionsService.listConnections(req.params.id);
    res.json({ verbindungen, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/projects/:id/verbindungen — Verbindung anlegen
router.post(
  '/projects/:id/verbindungen',
  requireAuth,
  validateParams(ProjectIdParams),
  validateBody(CreateConnectionBody),
  asyncHandler(async (req, res) => {
    await sandboxService.getProject(req.params.id);
    const verbindung = await connectionsService.createConnection(
      req.params.id,
      req.body,
      req.user.id
    );
    res.status(201).json({ verbindung, timestamp: new Date().toISOString() });
  })
);

// PUT /api/sandbox/projects/:id/verbindungen/:connId — Wert/Konfig ändern
router.put(
  '/projects/:id/verbindungen/:connId',
  requireAuth,
  validateParams(ConnectionIdParams),
  validateBody(UpdateConnectionBody),
  asyncHandler(async (req, res) => {
    await sandboxService.getProject(req.params.id);
    const verbindung = await connectionsService.updateConnection(
      req.params.id,
      req.params.connId,
      req.body
    );
    res.json({ verbindung, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/sandbox/projects/:id/verbindungen/:connId — Verbindung löschen
router.delete(
  '/projects/:id/verbindungen/:connId',
  requireAuth,
  validateParams(ConnectionIdParams),
  asyncHandler(async (req, res) => {
    await sandboxService.getProject(req.params.id);
    const result = await connectionsService.deleteConnection(req.params.id, req.params.connId);
    res.json({ ...result, timestamp: new Date().toISOString() });
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
    const titles = await terminalService.getSessionTitles(req.params.id);
    res.json({
      sessions,
      titles,
      presence: terminalService.presenceForProject(req.params.id),
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/sandbox/projects/:id/sitzungen/:tmux/titel — Sitzung umbenennen
// (serverseitig, geräteweit; Schlüssel Projekt + tmux-Name).
router.put(
  '/projects/:id/sitzungen/:tmux/titel',
  requireAuth,
  validateParams(SessionTitleParams),
  validateBody(SessionTitleBody),
  asyncHandler(async (req, res) => {
    await sandboxService.getProject(req.params.id); // 404 bei unbekanntem Projekt
    const result = await terminalService.setSessionTitle(
      req.params.id,
      req.params.tmux,
      req.body.title
    );
    res.json({ ...result, timestamp: new Date().toISOString() });
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
    // Existenz-Check (unbekannter Workspace → 404); Workspaces sind geräteweit.
    const project = await sandboxService.loadWorkspace(req.params.workspace);
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
    await sandboxService.loadWorkspace(req.params.workspace);
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
    await sandboxService.loadWorkspace(req.params.workspace);
    const deleted = await externalCredentialsService.deleteCredentials(
      req.user.id,
      externalCredentialsService.PROVIDER_CLAUDE
    );
    res.json({ deleted, timestamp: new Date().toISOString() });
  })
);

// ============================================================================
// Zentraler KI-Zugang (Plan 013, 2026-07-28)
// ============================================================================
// EINMAL hinterlegter Abo-Token / API-Key, der in JEDE Sandbox als Umgebungs-
// variable gebracht wird (siehe externalCredentialsService). Löst den kaputten
// interaktiven Terminal-Login ab: jede Sandbox ist sofort angemeldet.

// GET /api/sandbox/claude-auth — Status (ob + welche Art), NIE der Geheimwert.
router.get(
  '/claude-auth',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = await externalCredentialsService.getCentralAuthStatus(req.user.id);
    res.json({ ...status, timestamp: new Date().toISOString() });
  })
);

// PUT /api/sandbox/claude-auth — Zugang setzen/ändern und sofort auf alle
// laufenden Sandboxes des Nutzers anwenden (neue erhalten ihn beim Start).
router.put(
  '/claude-auth',
  requireAuth,
  validateBody(ClaudeAuthBody),
  asyncHandler(async (req, res) => {
    const { mode } = await externalCredentialsService.setCentralAuth(
      req.user.id,
      req.body.mode,
      req.body.value
    );
    const applied = await externalCredentialsService.applyCentralAuthToUserContainers(req.user.id);
    res.json({ configured: true, mode, applied_to: applied, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/sandbox/claude-auth — Zugang entfernen (auch aus laufenden Sandboxes).
router.delete(
  '/claude-auth',
  requireAuth,
  asyncHandler(async (req, res) => {
    const deleted = await externalCredentialsService.deleteCentralAuth(req.user.id);
    const applied = await externalCredentialsService.applyCentralAuthToUserContainers(req.user.id);
    res.json({ deleted, applied_to: applied, timestamp: new Date().toISOString() });
  })
);

// ----------------------------------------------------------------------------
// Eigener OAuth-PKCE-Handshake (Plan 015, Phase 3) — ersetzt den kaputten
// interaktiven `claude /login`-Link. Der Nutzer meldet sich EINMAL über die
// vom Backend erzeugte, garantiert korrekte Authorize-URL an.
// ----------------------------------------------------------------------------

// POST /api/sandbox/claude-auth/oauth/start — liefert die korrekte Authorize-URL
// (mit selbst erzeugtem code_challenge) + State; Verifier bleibt serverseitig.
router.post(
  '/claude-auth/oauth/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { authorizeUrl, state } = claudeOauthService.startClaudeOAuth(req.user.id);
    res.json({ authorizeUrl, state, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/claude-auth/oauth/complete — nimmt den eingefügten Code,
// tauscht ihn gegen Access-+Refresh-Token, legt sie verschlüsselt ab und spielt
// den Token in alle laufenden Sandboxes ein.
router.post(
  '/claude-auth/oauth/complete',
  requireAuth,
  validateBody(ClaudeOAuthCompleteBody),
  asyncHandler(async (req, res) => {
    const result = await claudeOauthService.completeClaudeOAuth(
      req.user.id,
      req.body.code,
      req.body.state
    );
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/claude-auth/oauth/refresh — Access-Token über den
// gespeicherten Refresh-Token erneuern (manueller „jetzt erneuern"-Weg).
router.post(
  '/claude-auth/oauth/refresh',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await claudeOauthService.refreshClaudeOAuth(req.user.id);
    res.json({ ...result, timestamp: new Date().toISOString() });
  })
);

// POST /api/sandbox/claude-auth/test — hinterlegten Zugang live gegen die
// Anthropic-API prüfen. Macht ein abgelaufenes/ungültiges Token im Dialog
// sichtbar, statt erst als stiller 401 beim `claude`-Aufruf im Terminal.
router.post(
  '/claude-auth/test',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await claudeOauthService.testCentralAuth(req.user.id);
    res.json({ ...result, timestamp: new Date().toISOString() });
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
