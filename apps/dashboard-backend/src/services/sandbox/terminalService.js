/**
 * Terminal Service
 * Manages interactive terminal sessions via Docker exec.
 * Handles WebSocket ↔ Docker exec stream piping for xterm.js clients.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { docker } = require('../core/docker');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const sandboxService = require('./sandboxService');

// Active sessions map: sessionId → { exec, stream, ws, projectId }
const activeSessions = new Map();

// Session type → command mapping
const SESSION_COMMANDS = {
  shell: ['/bin/bash'],
  'claude-code': ['/bin/bash', '-c', 'claude'],
  codex: ['/bin/bash', '-c', 'codex'],
  custom: null, // determined by user
};

/**
 * Create a new terminal session and attach it to a WebSocket
 */
async function createSession(
  projectId,
  ws,
  { sessionType = 'shell', command, cols = 120, rows = 30 } = {}
) {
  const project = await sandboxService.getProject(projectId);

  // Ensure container is running
  if (project.container_status !== 'running' || !project.container_id) {
    throw new ValidationError('Container ist nicht gestartet. Bitte zuerst den Container starten.');
  }

  // Determine command to execute
  let cmd;
  if (sessionType === 'custom' && command) {
    cmd = ['/bin/bash', '-c', command];
  } else {
    cmd = SESSION_COMMANDS[sessionType] || SESSION_COMMANDS.shell;
  }

  const container = docker.getContainer(project.container_id);

  // Create docker exec with TTY
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: [`TERM=xterm-256color`, `COLUMNS=${cols}`, `LINES=${rows}`],
  });

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

  // Store active session
  activeSessions.set(session.id, {
    exec,
    stream,
    ws,
    projectId,
    createdAt: Date.now(),
  });

  // Pipe Docker exec output → WebSocket (binary frames for xterm.js)
  stream.on('data', chunk => {
    if (ws.readyState === 1) {
      // WebSocket.OPEN
      try {
        // Send as binary frame — xterm.js expects raw terminal data
        ws.send(chunk, { binary: true });
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
  ws.on('message', (data, isBinary) => {
    if (isBinary || Buffer.isBuffer(data)) {
      // Binary frame: raw terminal input
      try {
        stream.write(data);
      } catch (err) {
        logger.warn(`Terminal write error for session ${session.id}: ${err.message}`);
      }
    } else {
      // Text frame: control message (JSON)
      try {
        const msg = JSON.parse(data.toString());
        handleControlMessage(session.id, msg);
      } catch (err) {
        // Not JSON — treat as terminal input
        try {
          stream.write(data);
        } catch (writeErr) {
          logger.warn(`Terminal write error: ${writeErr.message}`);
        }
      }
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
function handleControlMessage(sessionId, msg) {
  const session = activeSessions.get(sessionId);
  if (!session) {return;}

  switch (msg.type) {
    case 'resize': {
      const { cols, rows } = msg;
      if (cols > 0 && rows > 0 && cols <= 500 && rows <= 200) {
        resizeTerminal(sessionId, cols, rows);
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
  if (!session || !session.exec) {return;}

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
  if (!session) {return;}

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
 * Cleanup all sessions (called on server shutdown)
 */
async function cleanupAllSessions() {
  const sessionIds = [...activeSessions.keys()];
  for (const sessionId of sessionIds) {
    await closeSession(sessionId, 'server_shutdown');
  }
  logger.info(`Cleaned up ${sessionIds.length} terminal sessions`);
}

module.exports = {
  createSession,
  resizeTerminal,
  closeSession,
  listSessions,
  getActiveSessionCount,
  cleanupAllSessions,
};
