/**
 * Sandbox Idle Checker — periodic auto-stop for unused containers.
 * Extracted from sandboxService.js.
 */

const db = require('../../database');
const logger = require('../../utils/logger');

const IDLE_TIMEOUT_MS = parseInt(process.env.SANDBOX_IDLE_TIMEOUT_MIN || '30', 10) * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let _idleCheckTimer = null;

/**
 * Check for idle running containers and auto-stop them.
 * Idle = running + last_accessed_at older than IDLE_TIMEOUT_MS + no active terminal sessions.
 */
async function checkIdleContainers() {
  try {
    const idleSeconds = Math.max(60, Math.floor(IDLE_TIMEOUT_MS / 1000));
    const result = await db.query(
      `SELECT id, name, slug, container_status, last_accessed_at
       FROM sandbox_projects
       WHERE status = 'active'
         AND container_status = 'running'
         AND last_accessed_at < NOW() - make_interval(secs => $1::int)
         AND NOT EXISTS (
           SELECT 1 FROM sandbox_terminal_sessions
           WHERE project_id = sandbox_projects.id AND status = 'active'
         )`,
      [idleSeconds]
    );

    // Lazy require to avoid circular dependency (sandboxService requires this module via re-export).
    const { stopContainer } = require('./sandboxService');

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

function startIdleChecker() {
  if (_idleCheckTimer) {
    return;
  }
  _idleCheckTimer = setInterval(checkIdleContainers, IDLE_CHECK_INTERVAL_MS);
  logger.info(
    `Sandbox idle checker started (timeout: ${IDLE_TIMEOUT_MS / 60000}min, interval: ${IDLE_CHECK_INTERVAL_MS / 60000}min)`
  );
}

function stopIdleChecker() {
  if (_idleCheckTimer) {
    clearInterval(_idleCheckTimer);
    _idleCheckTimer = null;
  }
}

module.exports = {
  IDLE_TIMEOUT_MS,
  IDLE_CHECK_INTERVAL_MS,
  checkIdleContainers,
  startIdleChecker,
  stopIdleChecker,
};
