/**
 * Workspace-Agent runner — the channel-neutral bridge between an HTTP caller
 * and the agent tool-loop (`toolLoop.runAgent`).
 *
 * `resolveAndRun` resolves a workspace (`sandbox_projects`, by id OR slug),
 * authorizes the caller (owner or admin — non-owners see a 404 just like the
 * owner-scoped sandbox routes), loads the named agent from
 * `<host_path>/agenten/<name>.md`, builds the run context and drives the
 * engine. It is deliberately transport-agnostic: the caller supplies an
 * `onEvent` sink and decides whether to stream it as SSE (Schritt 11, chat)
 * or buffer it into a single JSON response (Schritt 12, n8n).
 */

const db = require('../../database');
const { NotFoundError } = require('../../utils/errors');
const { loadAgent } = require('./agentFile');
const { runAgent } = require('./toolLoop');

// A workspace ref is either a UUID (sandbox_projects.id) or a slug.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Load an active workspace by id or slug, enforcing owner-or-admin access.
 * @param {string} workspaceRef - sandbox_projects id (UUID) or slug.
 * @param {{userId?:number, userRole?:string}} [auth]
 * @returns {Promise<object>} The sandbox_projects row.
 * @throws {NotFoundError} if the workspace is absent or not visible to the user.
 */
async function loadWorkspace(workspaceRef, { userId, userRole } = {}) {
  const ref = String(workspaceRef || '').trim();
  if (!ref) {
    throw new NotFoundError('Workspace nicht gefunden');
  }
  const byId = UUID_RE.test(ref);
  const result = await db.query(
    `SELECT * FROM sandbox_projects
     WHERE ${byId ? 'id' : 'slug'} = $1 AND status = 'active'
     LIMIT 1`,
    [ref]
  );
  const project = result.rows[0];
  if (!project) {
    throw new NotFoundError(`Workspace "${workspaceRef}" nicht gefunden`);
  }
  // Owner-or-admin gate. Non-owners get the same 404 the owner-scoped sandbox
  // routes produce (don't leak existence of other users' workspaces).
  if (userRole !== 'admin' && userId != null && project.user_id !== userId) {
    throw new NotFoundError(`Workspace "${workspaceRef}" nicht gefunden`);
  }
  return project;
}

/**
 * Resolve a workspace + agent, authorize, and run the agent to completion.
 *
 * @param {object} args
 * @param {string} args.workspaceRef - sandbox_projects id or slug.
 * @param {string} args.agentName - agent name (the `<name>.md` basename).
 * @param {string} args.userInput - the user's message to the agent.
 * @param {number} [args.userId] - caller's user id (owner check).
 * @param {string} [args.userRole] - caller's role ('admin' bypasses owner check).
 * @param {(evt:object)=>void} [args.onEvent] - event sink (see toolLoop.runAgent).
 * @returns {Promise<{result:string, iterations:number, truncated?:boolean, error?:string}>}
 * @throws {NotFoundError} for an unknown/invisible workspace or agent.
 */
async function resolveAndRun({
  workspaceRef,
  agentName,
  userInput,
  userId,
  userRole,
  onEvent,
} = {}) {
  const project = await loadWorkspace(workspaceRef, { userId, userRole });
  const agent = await loadAgent(project.host_path, agentName); // NotFoundError if absent

  const context = {
    workspaceId: project.id,
    hostPath: project.host_path,
    slug: project.slug,
    containerName: project.container_name,
    userId,
    networkMode: project.network_mode,
  };

  return runAgent({ agent, userInput, context, onEvent });
}

module.exports = { resolveAndRun, loadWorkspace };
