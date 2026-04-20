/**
 * Sandbox Shared — constants, paths, resource parsing.
 * Extracted from sandboxService.js to keep per-concern modules under 500 LOC.
 */

const logger = require('../../utils/logger');
const { docker } = require('../core/docker');

const CONTAINER_PREFIX = 'arasul-sandbox-';
const DEFAULT_IMAGE = 'arasul-sandbox:latest';
const NETWORK_NAME = process.env.DOCKER_NETWORK || 'arasul-platform_arasul-backend';

// Container-local path where sandbox project directories are accessible.
// Bind-mounted from host via compose.app.yaml.
const SANDBOX_DATA_DIR = process.env.SANDBOX_DATA_DIR || '/arasul/sandbox/projects';

const DEFAULT_RESOURCE_LIMITS = {
  memory: '2G',
  cpus: '2',
  pids: 256,
};

let _hostDirCache = null;

/**
 * Host-side base path for Docker API bind mounts. Discovered by inspecting
 * our own container's bind mounts; falls back to /opt/arasul/data/...
 */
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

/**
 * Parse memory string (e.g., "2G", "512M") to bytes.
 */
function parseMemoryLimit(mem) {
  const match = String(mem).match(/^(\d+(?:\.\d+)?)\s*(B|K|M|G|T)?$/i);
  if (!match) {
    return 2 * 1024 * 1024 * 1024; // default 2G
  }
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return Math.round(value * (multipliers[unit] || 1));
}

module.exports = {
  CONTAINER_PREFIX,
  DEFAULT_IMAGE,
  NETWORK_NAME,
  SANDBOX_DATA_DIR,
  DEFAULT_RESOURCE_LIMITS,
  getHostDataDir,
  parseMemoryLimit,
};
