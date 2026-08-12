/**
 * Terminal Service
 * Manages interactive terminal sessions via Docker exec.
 * Handles WebSocket ↔ Docker exec stream piping for xterm.js clients.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { docker } = require('../core/docker');
const { ValidationError } = require('../../utils/errors');
const sandboxService = require('./sandboxService');
const externalCredentialsService = require('./externalCredentialsService');
const claudeOauthService = require('./claudeOauthService');

// Active sessions map: sessionId → { exec, stream, ws, projectId }
const activeSessions = new Map();

// Default tmux session name for persistent terminals
const TMUX_SESSION = 'main';

// Strict allowlist for the per-connection tmux session name. Multiple terminal
// sessions in the SAME project (container) must attach to DISTINCT tmux sessions
// to be independent shells rather than mirrors of one screen — the client sends
// a stable name per session (e.g. 'main', 'main-2'). Only [A-Za-z0-9_-] so the
// value is safe inside `tmux new-session -s <name>` (still single-quoted below).
const TMUX_NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;

// Allowlist for sessionType — anything else is rejected
const ALLOWED_SESSION_TYPES = new Set(['shell', 'custom', 'claude-code', 'codex']);

// Strict allowlist for user-supplied custom commands.
// Permits binary names, paths, hyphens, dots and a single space for simple args;
// blocks every shell metacharacter (; & | ` $ ( ) < > " ' \ newline tab).
const CUSTOM_COMMAND_RE = /^[A-Za-z0-9_.\-/ ]{1,200}$/;

// Produce a single-quoted shell literal (POSIX).
// Replaces every ' with '\'' so the result is safe inside bash -c '...'.
function shellSingleQuote(str) {
  return `'${String(str).replace(/'/g, "'\\''")}'`;
}

/**
 * Zentralen KI-Zugang einer Session ermitteln.
 * - Erneuert vorher (lazy) einen bald ablaufenden OAuth-Token — best effort.
 * - `envList`: `KEY=VALUE`-Paare (Token bzw. API-Key) für die exec-Env.
 * - `names`: die Variablennamen (für `tmux setenv`, per Referenz — nie als Wert).
 * - `neutralize`: true, sobald NICHT der apikey-Modus aktiv ist. Dann muss
 *   `ANTHROPIC_API_KEY` GANZ ENTFERNT werden (nicht nur geleert): ein geerbter
 *   API-Key würde den Abo-/OAuth-Token still schlagen und auf metered
 *   API-Billing umleiten. Vollständiges `unset` ist robust auch gegen eine CLI,
 *   die auf ANWESENHEIT statt Wahrheitswert prüft.
 * Fehler hier dürfen ein Terminal NIE blockieren → alles best effort.
 */
async function buildAuthEnv(userId) {
  if (!userId) {
    return { envList: [], names: [], neutralize: false };
  }
  try {
    await claudeOauthService.ensureFreshToken(userId);
    const authEnv = await externalCredentialsService.getCentralAuthEnv(userId);
    const envList = Object.entries(authEnv).map(([k, v]) => `${k}=${v}`);
    const names = Object.keys(authEnv);
    const neutralize = !Object.prototype.hasOwnProperty.call(authEnv, 'ANTHROPIC_API_KEY');
    return { envList, names, neutralize };
  } catch (err) {
    logger.warn(`buildAuthEnv: zentralen KI-Zugang übersprungen: ${err.message}`);
    return { envList: [], names: [], neutralize: true };
  }
}

/**
 * Create a new terminal session and attach it to a WebSocket
 */
async function createSession(
  projectId,
  ws,
  { sessionType = 'shell', command, cols = 120, rows = 30, tmuxName = TMUX_SESSION, userId } = {}
) {
  if (!ALLOWED_SESSION_TYPES.has(sessionType)) {
    throw new ValidationError(`Ungültiger sessionType: ${sessionType}`);
  }
  if (sessionType === 'custom') {
    if (!command || typeof command !== 'string' || !CUSTOM_COMMAND_RE.test(command)) {
      throw new ValidationError(
        'Ungültiger command — nur [A-Za-z0-9_.-/ ] zulässig, max 200 Zeichen'
      );
    }
  }
  if (!TMUX_NAME_RE.test(tmuxName)) {
    throw new ValidationError('Ungültiger tmux-Session-Name — nur [A-Za-z0-9_-], max 40 Zeichen');
  }

  const project = await sandboxService.getProject(projectId);

  // Ensure container is running
  if (project.container_status !== 'running' || !project.container_id) {
    throw new ValidationError('Container ist nicht gestartet. Bitte zuerst den Container starten.');
  }

  // Anwesenheit (Plan 017 Schritt 1): Username des verbundenen Nutzers für die
  // Presence-Anzeige auflösen — best effort, blockiert die Session nie.
  let username = null;
  if (userId != null) {
    try {
      const userResult = await db.query('SELECT username FROM admin_users WHERE id = $1', [userId]);
      username = userResult.rows[0]?.username || null;
    } catch (err) {
      logger.debug(`Presence: Username für User ${userId} nicht auflösbar: ${err.message}`);
    }
  }

  // Determine inner command for the tmux session
  let innerCmd = null;
  if (sessionType === 'custom') {
    innerCmd = command;
  } else if (sessionType === 'claude-code') {
    innerCmd = 'claude';
  } else if (sessionType === 'codex') {
    innerCmd = 'codex';
  }
  // shell → no innerCmd (tmux starts default shell)

  // Zentralen KI-Zugang DIREKT injizieren (robuster als nur die aus .bashrc
  // gesourcte Profildatei, die timing-abhängig ist): so ist `claude`/`codex` in
  // JEDER Session sofort angemeldet. Vorher (lazy) den OAuth-Token erneuern,
  // falls er kurz vor Ablauf steht — scheitert nie hart.
  const auth = await buildAuthEnv(userId);
  // `claude`/`codex` laufen als tmux-Session-Kommando und sourcen KEINE .bashrc;
  // ein bereits laufender tmux-Server erbt die exec-Env NICHT. Deshalb:
  //  1) `unset ANTHROPIC_API_KEY` (falls Token-Modus) — entfernt einen geerbten
  //     API-Key GANZ, robust gegen Anwesenheits-Prüfungen der CLI.
  //  2) `tmux setenv -g NAME "$NAME"` spiegelt den Zugang in die tmux-Global-Env
  //     (neue Sessions erben ihn) — per Variablen-NAME referenziert, damit der
  //     Token-WERT NIE als Literal in die Kommandozeile (→ ps, DB-`command`) gerät.
  //  3) `tmux setenv -gu ANTHROPIC_API_KEY` entfernt ihn auch aus einem bereits
  //     laufenden tmux-Server.
  // Hinweis: Ein bereits laufender `claude`/`codex`-Prozess behält beim Reattach
  // seine Start-Env — ein frisch erneuerter Token greift erst beim nächsten Start.
  const unsetPrefix = auth.neutralize ? 'unset ANTHROPIC_API_KEY; ' : '';
  const tmuxSetenv = [
    ...auth.names
      .filter(name => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      .map(name => `tmux setenv -g ${name} "$${name}"`),
    ...(auth.neutralize ? ['tmux setenv -gu ANTHROPIC_API_KEY'] : []),
  ].join('; ');
  const tmuxPrep = tmuxSetenv ? `${tmuxSetenv}; ` : '';

  // Use tmux for persistent sessions: attach if exists, create if not.
  // Falls back to plain shell if tmux is not installed (old containers).
  // innerCmd is validated above; still single-quote it for defense in depth.
  // tmuxName is validated against TMUX_NAME_RE above; still single-quote for
  // defense in depth. Distinct names → independent persistent shells per project.
  const tmuxSession = shellSingleQuote(tmuxName);
  let cmd;
  if (innerCmd) {
    const quoted = shellSingleQuote(innerCmd);
    cmd = [
      '/bin/bash',
      '-c',
      `${unsetPrefix}command -v tmux >/dev/null 2>&1 && { ${tmuxPrep}tmux new-session -A -s ${tmuxSession} ${quoted}; } || exec ${quoted}`,
    ];
  } else {
    cmd = [
      '/bin/bash',
      '-c',
      `${unsetPrefix}command -v tmux >/dev/null 2>&1 && { ${tmuxPrep}tmux new-session -A -s ${tmuxSession}; } || exec /bin/bash`,
    ];
  }

  const container = docker.getContainer(project.container_id);

  // Create docker exec with TTY
  let exec;
  try {
    exec = await container.exec({
      Cmd: cmd,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      // TERM=xterm-256color: was xterm.js außen emuliert. COLORTERM=truecolor
      // ist entscheidend, damit TUIs (claude/codex nutzen chalk/supports-color)
      // 24-bit-Farben ausgeben statt auf 256 herunterzustufen; tmux reicht die
      // RGB-Sequenzen per terminal-features an xterm.js durch. LANG/LC_ALL
      // sichern UTF-8 in der exec-Umgebung (Box-/Rahmenzeichen der TUIs).
      Env: [
        `TERM=xterm-256color`,
        `COLORTERM=truecolor`,
        `LANG=en_US.UTF-8`,
        `LC_ALL=en_US.UTF-8`,
        `COLUMNS=${cols}`,
        `LINES=${rows}`,
        ...auth.envList,
      ],
    });
  } catch (err) {
    if (err.statusCode === 404) {
      // Container wurde extern entfernt (docker rm / prune): DB-Zustand heilen,
      // damit der Client den Container regulär neu startet, statt in einer
      // Reconnect-Schleife gegen die verwaiste Container-ID zu laufen.
      await db.query(
        `UPDATE sandbox_projects
            SET container_status = 'stopped', container_id = NULL
          WHERE id = $1`,
        [projectId]
      );
      logger.warn(
        `Sandbox container for project ${projectId} vanished externally — state reset to 'stopped'`
      );
      throw new ValidationError(
        'Container wurde extern entfernt — bitte Projekt neu öffnen/starten.'
      );
    }
    throw err;
  }

  // Start exec and get the duplex stream
  const stream = await exec.start({
    hijack: true,
    stdin: true,
    Tty: true,
  });

  // Create session record in database
  const sessionResult = await db.query(
    `INSERT INTO sandbox_terminal_sessions (project_id, session_type, command, container_exec_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [projectId, sessionType, cmd.join(' '), exec.id]
  );
  const session = sessionResult.rows[0];

  // Update project last_accessed_at
  await db.query(`UPDATE sandbox_projects SET last_accessed_at = NOW() WHERE id = $1`, [projectId]);

  // Store active session (inkl. Presence-Infos: wer hängt an welcher tmux-Session)
  activeSessions.set(session.id, {
    exec,
    stream,
    ws,
    projectId,
    userId: userId ?? null,
    username,
    tmuxName,
    createdAt: Date.now(),
  });

  // Pipe Docker exec output → WebSocket (binary frames for xterm.js)
  // WS-BACKPRESSURE: a slow/stalled client must not let ws.bufferedAmount grow
  // unbounded (a `yes`-style flood would OOM the backend). Pause the Docker exec
  // stream once buffered data crosses the high-water mark and resume when it
  // drains below the low-water mark.
  const WS_BUFFER_HIGH_WATER = 1024 * 1024; // 1MB — pause reading the exec stream
  const WS_BUFFER_LOW_WATER = 256 * 1024; // 256KB — resume once drained below this
  let streamPaused = false;
  stream.on('data', chunk => {
    if (ws.readyState === 1) {
      // WebSocket.OPEN
      try {
        // Send as binary frame — xterm.js expects raw terminal data
        ws.send(chunk, { binary: true });
        if (!streamPaused && ws.bufferedAmount >= WS_BUFFER_HIGH_WATER) {
          streamPaused = true;
          stream.pause();
          const drain = setInterval(() => {
            if (ws.readyState !== 1 || ws.bufferedAmount <= WS_BUFFER_LOW_WATER) {
              clearInterval(drain);
              if (streamPaused) {
                streamPaused = false;
                stream.resume();
              }
            }
          }, 50);
        }
      } catch (err) {
        logger.warn(`Terminal send error for session ${session.id}: ${err.message}`);
      }
    }
  });

  stream.on('end', () => {
    closeSession(session.id, 'closed');
  });

  stream.on('error', err => {
    logger.error(`Terminal stream error for session ${session.id}: ${err.message}`);
    closeSession(session.id, 'error');
  });

  // Pipe WebSocket input → Docker exec stdin
  // Note: ws library v8+ always provides Buffer for data. Use isBinary flag only
  // to distinguish binary frames (terminal input) from text frames (control JSON).
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      // Binary frame: raw terminal input from xterm.js
      try {
        stream.write(data);
      } catch (err) {
        logger.warn(`Terminal write error for session ${session.id}: ${err.message}`);
      }
    } else {
      // Text frame: control message (JSON) — resize, ping, etc.
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        // Not JSON — treat as terminal input
        try {
          stream.write(data);
        } catch (writeErr) {
          logger.warn(`Terminal write error: ${writeErr.message}`);
        }
        return;
      }
      handleControlMessage(session.id, msg).catch(err => {
        logger.warn(`Terminal control message error: ${err.message}`);
      });
    }
  });

  ws.on('close', () => {
    closeSession(session.id, 'closed');
  });

  ws.on('error', err => {
    logger.error(`WebSocket error for session ${session.id}: ${err.message}`);
    closeSession(session.id, 'error');
  });

  // Send ready message to client
  ws.send(
    JSON.stringify({
      type: 'ready',
      sessionId: session.id,
      projectId,
      projectName: project.name,
      command: cmd.join(' '),
    })
  );

  logger.info(
    `Terminal session created: ${session.id} (${sessionType}) for project ${project.slug}`
  );
  return session;
}

/**
 * Handle control messages from WebSocket client
 */
async function handleControlMessage(sessionId, msg) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return;
  }

  switch (msg.type) {
    case 'resize': {
      const { cols, rows } = msg;
      if (cols > 0 && rows > 0 && cols <= 500 && rows <= 200) {
        await resizeTerminal(sessionId, cols, rows);
      }
      break;
    }
    case 'ping': {
      if (session.ws.readyState === 1) {
        session.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Resize terminal
 */
async function resizeTerminal(sessionId, cols, rows) {
  const session = activeSessions.get(sessionId);
  if (!session || !session.exec) {
    return;
  }

  try {
    await session.exec.resize({ h: rows, w: cols });
  } catch (err) {
    // Resize errors are non-fatal (e.g., exec already finished)
    logger.debug(`Resize failed for session ${sessionId}: ${err.message}`);
  }
}

/**
 * Close a terminal session
 */
async function closeSession(sessionId, reason = 'closed') {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return;
  }

  // Remove from active map first to prevent re-entry
  activeSessions.delete(sessionId);

  // End the Docker exec stream
  try {
    if (session.stream && !session.stream.destroyed) {
      session.stream.end();
    }
  } catch (err) {
    // Ignore
  }

  // Close WebSocket if still open
  try {
    if (session.ws && session.ws.readyState <= 1) {
      session.ws.send(JSON.stringify({ type: 'closed', sessionId, reason }));
      session.ws.close(1000, reason);
    }
  } catch (err) {
    // Ignore
  }

  // Update database
  try {
    const status = reason === 'error' ? 'error' : 'closed';
    await db.query(
      `UPDATE sandbox_terminal_sessions SET status = $1, ended_at = NOW() WHERE id = $2 AND status = 'active'`,
      [status, sessionId]
    );
  } catch (err) {
    logger.warn(`Could not update session ${sessionId} in DB: ${err.message}`);
  }

  logger.info(`Terminal session closed: ${sessionId} (${reason})`);
}

/**
 * List active sessions for a project
 */
async function listSessions(projectId, { includeCompleted = false } = {}) {
  const conditions = ['project_id = $1'];
  const params = [projectId];

  if (!includeCompleted) {
    conditions.push(`status = 'active'`);
  }

  const result = await db.query(
    `SELECT * FROM sandbox_terminal_sessions
     WHERE ${conditions.join(' AND ')}
     ORDER BY started_at DESC
     LIMIT 50`,
    params
  );

  return result.rows;
}

/**
 * Get count of active sessions across all projects
 */
function getActiveSessionCount() {
  return activeSessions.size;
}

/**
 * Anwesenheit für EIN Projekt (Plan 017 Schritt 1): welche Nutzer sind live
 * per WebSocket verbunden, aufgeschlüsselt nach tmux-Session — die Grundlage
 * für „2 verbunden“-Badges an Projekt und Sitzungs-Tab.
 */
function presenceForProject(projectId) {
  const sessions = {};
  const users = new Map();
  let connections = 0;
  for (const s of activeSessions.values()) {
    if (String(s.projectId) !== String(projectId)) {
      continue;
    }
    connections++;
    const name = s.tmuxName || TMUX_SESSION;
    if (!sessions[name]) {
      sessions[name] = { connections: 0, users: [] };
    }
    sessions[name].connections++;
    if (s.username && !sessions[name].users.includes(s.username)) {
      sessions[name].users.push(s.username);
    }
    if (s.userId != null && !users.has(s.userId)) {
      users.set(s.userId, s.username);
    }
  }
  return { connections, users: [...users.values()].filter(Boolean), sessions };
}

/**
 * Anwesenheit über ALLE Projekte: projectId → { connections, users } — für die
 * Projektliste, ohne pro Projekt einzeln zu fragen.
 */
function presenceSummary() {
  const summary = {};
  for (const s of activeSessions.values()) {
    const key = String(s.projectId);
    if (!summary[key]) {
      summary[key] = { connections: 0, users: [] };
    }
    summary[key].connections++;
    if (s.username && !summary[key].users.includes(s.username)) {
      summary[key].users.push(s.username);
    }
  }
  return summary;
}

/**
 * Cleanup all sessions (called on server shutdown)
 */
async function cleanupAllSessions() {
  const sessionIds = [...activeSessions.keys()];
  for (const sessionId of sessionIds) {
    await closeSession(sessionId, 'server_shutdown');
  }
  logger.info(`Cleaned up ${sessionIds.length} terminal sessions`);
}

/**
 * Close all active sessions for a specific project (e.g. when container is stopped)
 */
async function closeProjectSessions(projectId) {
  const sessionIds = [];
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.projectId === projectId) {
      sessionIds.push(sessionId);
    }
  }
  for (const sessionId of sessionIds) {
    await closeSession(sessionId, 'container_stopped');
  }
  if (sessionIds.length > 0) {
    logger.info(`Closed ${sessionIds.length} terminal sessions for project ${projectId}`);
  }
}

module.exports = {
  createSession,
  resizeTerminal,
  closeSession,
  closeProjectSessions,
  listSessions,
  getActiveSessionCount,
  presenceForProject,
  presenceSummary,
  cleanupAllSessions,
  // Exported for tests / defense-in-depth reuse
  _internals: {
    ALLOWED_SESSION_TYPES,
    CUSTOM_COMMAND_RE,
    shellSingleQuote,
    activeSessions,
  },
};
