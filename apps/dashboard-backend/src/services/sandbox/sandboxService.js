/**
 * Sandbox Service
 * Manages sandbox project lifecycle: create, list, start, stop, commit.
 * Each project gets a persistent Docker container with a bind-mounted workspace.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { docker } = require('../core/docker');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const path = require('path');
const fs = require('fs');

// Container name prefix for all sandbox containers
const CONTAINER_PREFIX = 'arasul-sandbox-';
const DEFAULT_IMAGE = 'arasul-sandbox:latest';
const NETWORK_NAME = process.env.DOCKER_NETWORK || 'arasul-platform_arasul-backend';

// Container-local path where sandbox project directories are accessible.
// Bind-mounted from host via compose.app.yaml: ../data/sandbox/projects:/arasul/sandbox/projects
const SANDBOX_DATA_DIR = process.env.SANDBOX_DATA_DIR || '/arasul/sandbox/projects';

// Host-side base path for Docker API bind mounts.
// We discover this by inspecting our own container's bind mounts via Docker API.
// The SANDBOX_DATA_DIR (/arasul/sandbox/projects) is bind-mounted from the host,
// and we read the source path from Docker inspect to get the absolute host path.
let _hostDirCache = null;
async function getHostDataDir() {
  if (process.env.SANDBOX_HOST_DATA_DIR) {
    return process.env.SANDBOX_HOST_DATA_DIR;
  }
  if (_hostDirCache) {
    return _hostDirCache;
  }

  try {
    const container = docker.getContainer('dashboard-backend');
    const info = await container.inspect();
    const binds = info.HostConfig.Binds || [];
    const sandboxBind = binds.find(b => b.includes('/arasul/sandbox/projects'));
    if (sandboxBind) {
      _hostDirCache = sandboxBind.split(':')[0];
      logger.info(`Sandbox host data dir resolved: ${_hostDirCache}`);
      return _hostDirCache;
    }
  } catch (err) {
    logger.warn(`Could not resolve sandbox host dir from Docker: ${err.message}`);
  }

  _hostDirCache = '/opt/arasul/data/sandbox/projects';
  return _hostDirCache;
}

// Default resource limits
const DEFAULT_RESOURCE_LIMITS = {
  memory: '2G',
  cpus: '2',
  pids: 256,
};

/**
 * Parse memory string (e.g., "2G", "512M") to bytes
 */
function parseMemoryLimit(mem) {
  const match = String(mem).match(/^(\d+(?:\.\d+)?)\s*(B|K|M|G|T)?$/i);
  if (!match) {
    return 2 * 1024 * 1024 * 1024;
  } // default 2G
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return Math.round(value * (multipliers[unit] || 1));
}

// ============================================================================
// Project CRUD
// ============================================================================

/**
 * Create a new sandbox project
 */
async function createProject({
  name,
  description,
  icon,
  color,
  baseImage,
  resourceLimits,
  environment,
  network_mode,
  userId,
}) {
  if (!userId) {
    throw new ValidationError('User-ID ist erforderlich');
  }
  if (!name || !name.trim()) {
    throw new ValidationError('Projektname ist erforderlich');
  }
  if (name.trim().length > 100) {
    throw new ValidationError('Projektname darf maximal 100 Zeichen lang sein');
  }

  // Generate slug via database function
  const slugResult = await db.query('SELECT generate_sandbox_slug($1) AS slug', [name.trim()]);
  const slug = slugResult.rows[0].slug;

  // Build host path (absolute path for Docker bind mounts)
  const hostBaseDir = await getHostDataDir();
  const hostPath = path.join(hostBaseDir, slug);

  // Merge resource limits with defaults
  const limits = { ...DEFAULT_RESOURCE_LIMITS, ...(resourceLimits || {}) };

  // Validate network_mode — default is 'isolated' (bridge, no access to backend services)
  const validNetworkModes = ['isolated', 'internal'];
  const netMode = validNetworkModes.includes(network_mode) ? network_mode : 'isolated';

  const result = await db.query(
    `INSERT INTO sandbox_projects
      (name, slug, description, icon, color, base_image, host_path, container_path, resource_limits, environment, network_mode, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '/workspace', $8, $9, $10, $11)
     RETURNING *`,
    [
      name.trim(),
      slug,
      description || '',
      icon || 'terminal',
      color || '#45ADFF',
      baseImage || DEFAULT_IMAGE,
      hostPath,
      JSON.stringify(limits),
      JSON.stringify(environment || {}),
      netMode,
      userId,
    ]
  );

  const project = result.rows[0];

  // Create project directory via container-local mount path
  const localPath = path.join(SANDBOX_DATA_DIR, slug);
  try {
    fs.mkdirSync(localPath, { recursive: true });
    logger.info(`Sandbox project created: ${project.name} (${slug})`);
  } catch (err) {
    logger.warn(`Could not create project dir ${localPath}: ${err.message}`);
  }

  return project;
}

/**
 * List all projects with optional filters
 */
async function listProjects({ status, search, limit = 50, offset = 0, userId } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  // User isolation: only show projects belonging to this user
  if (userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(userId);
  }

  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  } else {
    // Default: only active projects
    conditions.push(`status = 'active'`);
  }

  if (search) {
    conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query(
    `SELECT COUNT(*) FROM sandbox_projects ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const boundedLimit = Math.min(Math.max(1, parseInt(limit) || 50), 100);
  const boundedOffset = Math.max(0, parseInt(offset) || 0);

  const result = await db.query(
    `SELECT sp.*,
       (SELECT COUNT(*) FROM sandbox_terminal_sessions st
        WHERE st.project_id = sp.id AND st.status = 'active') AS active_sessions
     FROM sandbox_projects sp
     ${whereClause}
     ORDER BY sp.last_accessed_at DESC NULLS LAST, sp.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, boundedLimit, boundedOffset]
  );

  return { projects: result.rows, total, limit: boundedLimit, offset: boundedOffset };
}

/**
 * Get a single project by ID
 */
async function getProject(projectId, userId) {
  const params = [projectId];
  let userFilter = '';

  if (userId) {
    userFilter = ' AND sp.user_id = $2';
    params.push(userId);
  }

  const result = await db.query(
    `SELECT sp.*,
       (SELECT COUNT(*) FROM sandbox_terminal_sessions st
        WHERE st.project_id = sp.id AND st.status = 'active') AS active_sessions
     FROM sandbox_projects sp
     WHERE sp.id = $1${userFilter}`,
    params
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Projekt nicht gefunden');
  }

  return result.rows[0];
}

/**
 * Update project metadata
 */
async function updateProject(
  projectId,
  { name, description, icon, color, environment, resourceLimits, network_mode },
  userId
) {
  // Verify project exists and belongs to user
  await getProject(projectId, userId);

  const setClauses = ['updated_at = NOW()'];
  const params = [];
  let idx = 1;

  if (name !== undefined) {
    if (!name.trim()) {
      throw new ValidationError('Projektname darf nicht leer sein');
    }
    if (name.trim().length > 100) {
      throw new ValidationError('Projektname darf maximal 100 Zeichen lang sein');
    }
    setClauses.push(`name = $${idx++}`);
    params.push(name.trim());
  }
  if (description !== undefined) {
    setClauses.push(`description = $${idx++}`);
    params.push(description);
  }
  if (icon !== undefined) {
    setClauses.push(`icon = $${idx++}`);
    params.push(icon);
  }
  if (color !== undefined) {
    setClauses.push(`color = $${idx++}`);
    params.push(color);
  }
  if (environment !== undefined) {
    setClauses.push(`environment = $${idx++}`);
    params.push(JSON.stringify(environment));
  }
  if (resourceLimits !== undefined) {
    const limits = { ...DEFAULT_RESOURCE_LIMITS, ...resourceLimits };
    setClauses.push(`resource_limits = $${idx++}`);
    params.push(JSON.stringify(limits));
  }
  if (network_mode !== undefined) {
    const validModes = ['isolated', 'internal'];
    if (!validModes.includes(network_mode)) {
      throw new ValidationError(`Ungültiger Netzwerkmodus: ${network_mode}`);
    }
    setClauses.push(`network_mode = $${idx++}`);
    params.push(network_mode);
  }

  const result = await db.query(
    `UPDATE sandbox_projects SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    [...params, projectId]
  );

  return result.rows[0];
}

/**
 * Delete (archive) a project
 */
async function deleteProject(projectId, userId) {
  const project = await getProject(projectId, userId);

  // Stop container if running (userId already verified via getProject above)
  if (project.container_status === 'running') {
    await stopContainer(projectId, userId);
  }

  // Remove container if it exists
  if (project.container_id) {
    try {
      const container = docker.getContainer(project.container_id);
      await container.remove({ force: true });
      logger.info(`Sandbox container removed: ${project.container_name}`);
    } catch (err) {
      if (err.statusCode !== 404) {
        logger.warn(`Could not remove container: ${err.message}`);
      }
    }
  }

  // Archive the project (soft delete)
  await db.query(
    `UPDATE sandbox_projects
     SET status = 'archived', container_id = NULL, container_name = NULL, container_status = 'none'
     WHERE id = $1`,
    [projectId]
  );

  logger.info(`Sandbox project archived: ${project.name}`);
  return { success: true, id: projectId };
}

// ============================================================================
// Container Lifecycle
// ============================================================================

/**
 * Start (or create) the container for a project
 */
async function startContainer(projectId, userId) {
  const project = await getProject(projectId, userId);

  if (['running', 'creating', 'committing'].includes(project.container_status)) {
    return { success: true, message: 'Container wird bereits verarbeitet' };
  }

  // Update status to creating
  await db.query(`UPDATE sandbox_projects SET container_status = 'creating' WHERE id = $1`, [
    projectId,
  ]);

  try {
    // If container exists (was stopped), just start it
    if (project.container_id) {
      try {
        const existing = docker.getContainer(project.container_id);
        const info = await existing.inspect();

        if (info.State.Status === 'exited' || info.State.Status === 'created') {
          await existing.start();
          await db.query(
            `UPDATE sandbox_projects
             SET container_status = 'running', last_accessed_at = NOW()
             WHERE id = $1`,
            [projectId]
          );
          logger.info(`Sandbox container started: ${project.container_name}`);
          return { success: true, message: 'Container gestartet' };
        }

        if (info.State.Status === 'running') {
          await db.query(`UPDATE sandbox_projects SET container_status = 'running' WHERE id = $1`, [
            projectId,
          ]);
          return { success: true, message: 'Container läuft bereits' };
        }
      } catch (err) {
        if (err.statusCode === 404) {
          // Container was removed externally, create a new one
          logger.info(`Container ${project.container_id} not found, creating new one`);
        } else {
          throw err;
        }
      }
    }

    // Create new container
    const containerName = `${CONTAINER_PREFIX}${project.slug}`;
    const limits = project.resource_limits || DEFAULT_RESOURCE_LIMITS;

    // Determine image: use committed image if available, otherwise base_image
    let image = project.committed_image || project.base_image || DEFAULT_IMAGE;

    // Verify committed image still exists (may have been pruned)
    if (project.committed_image) {
      try {
        await docker.getImage(image).inspect();
      } catch (imgErr) {
        if (imgErr.statusCode === 404) {
          logger.warn(
            `Committed image ${image} not found, falling back to ${project.base_image || DEFAULT_IMAGE}`
          );
          image = project.base_image || DEFAULT_IMAGE;
          await db.query('UPDATE sandbox_projects SET committed_image = NULL WHERE id = $1', [
            projectId,
          ]);
        }
      }
    }

    // Ensure project directory exists via container-local path
    const hostPath = project.host_path;
    const localPath = path.join(SANDBOX_DATA_DIR, project.slug);
    try {
      fs.mkdirSync(localPath, { recursive: true });
    } catch (err) {
      logger.warn(`Could not create dir ${localPath}: ${err.message}`);
    }

    // Build environment array
    const envVars = [`SANDBOX_PROJECT=${project.slug}`];
    if (project.environment && typeof project.environment === 'object') {
      envVars.push(`SANDBOX_ENV_JSON=${JSON.stringify(project.environment)}`);
    }

    // Remove existing container with same name (zombie cleanup)
    try {
      const zombie = docker.getContainer(containerName);
      await zombie.remove({ force: true });
    } catch (err) {
      // Ignore 404 — no zombie
    }

    // Determine network mode: 'isolated' (bridge, default) or 'internal' (backend network)
    const networkMode = project.network_mode === 'internal' ? NETWORK_NAME : 'bridge';

    const containerConfig = {
      Image: image,
      name: containerName,
      Hostname: `sandbox-${project.slug}`,
      Env: envVars,
      WorkingDir: '/workspace',
      HostConfig: {
        Binds: [`${hostPath}:/workspace`],
        NetworkMode: networkMode,
        RestartPolicy: { Name: 'unless-stopped' },
        Memory: parseMemoryLimit(limits.memory),
        NanoCpus: Math.round(parseFloat(limits.cpus || '2') * 1e9),
        PidsLimit: parseInt(limits.pids || '128'),
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'],
        CapAdd: ['NET_BIND_SERVICE'],
        Tmpfs: { '/tmp': 'noexec,nosuid,size=256M' },
      },
    };

    const container = await docker.createContainer(containerConfig);
    await container.start();

    await db.query(
      `UPDATE sandbox_projects
       SET container_id = $1, container_name = $2, container_status = 'running', last_accessed_at = NOW()
       WHERE id = $3`,
      [container.id, containerName, projectId]
    );

    logger.info(`Sandbox container created and started: ${containerName}`);
    return { success: true, containerId: container.id, containerName };
  } catch (err) {
    await db.query(`UPDATE sandbox_projects SET container_status = 'error' WHERE id = $1`, [
      projectId,
    ]);
    logger.error(`Sandbox container start failed for ${project.slug}: ${err.message}`);
    throw err;
  }
}

/**
 * Stop the container for a project (preserves container state)
 */
async function stopContainer(projectId, userId) {
  const project = await getProject(projectId, userId);

  if (
    !project.container_id ||
    project.container_status === 'stopped' ||
    project.container_status === 'none'
  ) {
    return { success: true, message: 'Container ist bereits gestoppt' };
  }

  try {
    const container = docker.getContainer(project.container_id);
    await container.stop({ t: 10 });
  } catch (err) {
    if (err.statusCode === 304) {
      // Already stopped
    } else if (err.statusCode === 404) {
      // Container gone
      await db.query(
        `UPDATE sandbox_projects SET container_id = NULL, container_name = NULL, container_status = 'none' WHERE id = $1`,
        [projectId]
      );
      return { success: true, message: 'Container existiert nicht mehr' };
    } else {
      throw err;
    }
  }

  // Close all active terminal sessions (in-memory WebSocket/stream cleanup + DB update)
  // Lazy require to avoid circular dependency (terminalService requires sandboxService)
  const terminalService = require('./terminalService');
  await terminalService.closeProjectSessions(projectId);
  await db.query(
    `UPDATE sandbox_terminal_sessions SET status = 'closed', ended_at = NOW()
     WHERE project_id = $1 AND status = 'active'`,
    [projectId]
  );

  await db.query(`UPDATE sandbox_projects SET container_status = 'stopped' WHERE id = $1`, [
    projectId,
  ]);

  logger.info(`Sandbox container stopped: ${project.container_name}`);
  return { success: true };
}

/**
 * Commit container state as a new image (preserves installed packages)
 */
async function commitContainer(projectId, userId) {
  const project = await getProject(projectId, userId);

  if (!project.container_id) {
    throw new ValidationError('Kein Container vorhanden zum Speichern');
  }

  await db.query(`UPDATE sandbox_projects SET container_status = 'committing' WHERE id = $1`, [
    projectId,
  ]);

  try {
    const container = docker.getContainer(project.container_id);
    const imageName = `arasul-sandbox-${project.slug}`;
    const tag = 'latest';

    await container.commit({
      repo: imageName,
      tag,
      comment: `Sandbox snapshot for project: ${project.name}`,
    });

    // Restore previous status
    const info = await container.inspect();
    const newStatus = info.State.Running ? 'running' : 'stopped';

    await db.query(
      `UPDATE sandbox_projects SET committed_image = $1, container_status = $2 WHERE id = $3`,
      [`${imageName}:${tag}`, newStatus, projectId]
    );

    logger.info(`Sandbox container committed: ${imageName}:${tag}`);
    return { success: true, image: `${imageName}:${tag}` };
  } catch (err) {
    // Restore status on error
    await db.query(
      `UPDATE sandbox_projects SET container_status = 'running' WHERE id = $1 AND container_status = 'committing'`,
      [projectId]
    );
    throw err;
  }
}

/**
 * Get live container status from Docker (not just DB)
 */
async function getContainerStatus(projectId, userId) {
  const project = await getProject(projectId, userId);

  if (!project.container_id) {
    return { status: 'none', running: false };
  }

  try {
    const container = docker.getContainer(project.container_id);
    const info = await container.inspect();

    const status = {
      running: info.State.Running,
      status: info.State.Status,
      startedAt: info.State.StartedAt,
      pid: info.State.Pid,
      exitCode: info.State.ExitCode,
    };

    // Sync DB if status diverged
    const dbStatus = info.State.Running ? 'running' : 'stopped';
    if (
      project.container_status !== dbStatus &&
      project.container_status !== 'creating' &&
      project.container_status !== 'committing'
    ) {
      await db.query(`UPDATE sandbox_projects SET container_status = $1 WHERE id = $2`, [
        dbStatus,
        projectId,
      ]);
    }

    return status;
  } catch (err) {
    if (err.statusCode === 404) {
      await db.query(
        `UPDATE sandbox_projects SET container_id = NULL, container_name = NULL, container_status = 'none' WHERE id = $1`,
        [projectId]
      );
      return { status: 'none', running: false };
    }
    throw err;
  }
}

/**
 * Get sandbox statistics
 */
async function getStatistics() {
  const result = await db.query('SELECT * FROM get_sandbox_statistics()');
  return result.rows[0];
}

// ============================================================================
// Idle Detection & Auto-Stop
// ============================================================================

const IDLE_TIMEOUT_MS = parseInt(process.env.SANDBOX_IDLE_TIMEOUT_MIN || '30', 10) * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
let _idleCheckTimer = null;

/**
 * Check for idle containers and auto-stop them.
 * A container is considered idle if:
 * 1. It's running
 * 2. last_accessed_at is older than IDLE_TIMEOUT_MS
 * 3. It has no active terminal sessions
 */
async function checkIdleContainers() {
  try {
    const result = await db.query(
      `SELECT id, name, slug, container_status, last_accessed_at
       FROM sandbox_projects
       WHERE status = 'active'
         AND container_status = 'running'
         AND last_accessed_at < NOW() - INTERVAL '${Math.floor(IDLE_TIMEOUT_MS / 1000)} seconds'
         AND NOT EXISTS (
           SELECT 1 FROM sandbox_terminal_sessions
           WHERE project_id = sandbox_projects.id AND status = 'active'
         )`
    );

    for (const project of result.rows) {
      try {
        logger.info(
          `Auto-stopping idle sandbox container: ${project.slug} (idle since ${project.last_accessed_at})`
        );
        await stopContainer(project.id);
      } catch (err) {
        logger.warn(`Failed to auto-stop sandbox ${project.slug}: ${err.message}`);
      }
    }

    if (result.rows.length > 0) {
      logger.info(`Auto-stopped ${result.rows.length} idle sandbox container(s)`);
    }
  } catch (err) {
    logger.error(`Idle container check failed: ${err.message}`);
  }
}

/**
 * Start the periodic idle container checker
 */
function startIdleChecker() {
  if (_idleCheckTimer) {
    return;
  }
  _idleCheckTimer = setInterval(checkIdleContainers, IDLE_CHECK_INTERVAL_MS);
  logger.info(
    `Sandbox idle checker started (timeout: ${IDLE_TIMEOUT_MS / 60000}min, interval: ${IDLE_CHECK_INTERVAL_MS / 60000}min)`
  );
}

/**
 * Stop the periodic idle container checker
 */
function stopIdleChecker() {
  if (_idleCheckTimer) {
    clearInterval(_idleCheckTimer);
    _idleCheckTimer = null;
  }
}

// Auto-start the idle checker when the module is loaded
startIdleChecker();

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  startContainer,
  stopContainer,
  commitContainer,
  getContainerStatus,
  getStatistics,
  checkIdleContainers,
  startIdleChecker,
  stopIdleChecker,
  CONTAINER_PREFIX,
  DEFAULT_IMAGE,
};
