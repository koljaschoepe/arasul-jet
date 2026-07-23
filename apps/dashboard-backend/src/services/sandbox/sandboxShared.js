/**
 * Sandbox Shared — constants, paths, resource parsing.
 * Extracted from sandboxService.js to keep per-concern modules under 500 LOC.
 */

const path = require('path');
const fs = require('fs');
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
 * Host-side path for read-only tool sources (e.g. open-ara), mounted into
 * sandbox containers at /opt/tools. Sibling of the projects dir:
 * data/sandbox/tools next to data/sandbox/projects.
 */
async function getHostToolsDir() {
  if (process.env.SANDBOX_HOST_TOOLS_DIR) {
    return process.env.SANDBOX_HOST_TOOLS_DIR;
  }
  const projectsDir = await getHostDataDir();
  return path.posix.join(path.posix.dirname(projectsDir), 'tools');
}

/**
 * Host-Pfad des Plattform-Repos für den Netzwerkmodus 'infrastructure'
 * (beschreibbarer Mount nach /workspace/repo). Vorrang hat
 * SANDBOX_HOST_REPO_DIR; sonst Ableitung als Vorfahr des Projekt-Mounts:
 * <repo>/data/sandbox/projects → drei Ebenen hoch = <repo>.
 * Auf dem Jetson: /home/arasul/arasul/arasul-jet.
 */
async function getHostRepoDir() {
  if (process.env.SANDBOX_HOST_REPO_DIR) {
    return process.env.SANDBOX_HOST_REPO_DIR;
  }
  const projectsDir = await getHostDataDir();
  // …/data/sandbox/projects → …
  return path.posix.dirname(path.posix.dirname(path.posix.dirname(projectsDir)));
}

// Container-lokaler Pfad der Erweiterungs-Werkstatt-Templates (ANLEITUNG.md +
// Beispiel-App/-Flow/-Tool). Die Quellen liegen tracked unter
// services/sandbox/dev-templates/ und werden per compose read-only als
// /arasul/sandbox-build gemountet. Beim Anlegen einer Werkstatt-Sandbox in den
// Projekt-Ordner kopiert (Plan 012 Phase E · Schritt 13).
const DEV_TEMPLATES_DIR =
  process.env.SANDBOX_DEV_TEMPLATES_DIR || '/arasul/sandbox-build/dev-templates';

/** Quellordner der Werkstatt-Templates (Container-lokal, read-only). */
function getDevTemplatesDir() {
  return DEV_TEMPLATES_DIR;
}

// Jetson-Standard für die docker-Gruppe (siehe compose.app.yaml group_add
// '${DOCKER_GID:-994}' am dashboard-backend).
const DEFAULT_DOCKER_SOCK_GID = 994;

/**
 * GID der Docker-Socket-Gruppe auf dem Host. Der Sandbox-Container läuft mit
 * CapDrop ALL + no-new-privileges; Zugriff auf /var/run/docker.sock braucht
 * daher nur die Gruppenmitgliedschaft (HostConfig.GroupAdd), keine Caps.
 * Reihenfolge: SANDBOX_DOCKER_SOCK_GID → DOCKER_GID → stat des (ggf. ins
 * Backend gemounteten) Sockets → Jetson-Default 994.
 */
function getDockerSockGid() {
  const envGid = process.env.SANDBOX_DOCKER_SOCK_GID || process.env.DOCKER_GID;
  if (envGid && /^\d+$/.test(envGid)) {
    return parseInt(envGid, 10);
  }
  try {
    return fs.statSync('/var/run/docker.sock').gid;
  } catch {
    logger.warn(
      `Docker-Socket-GID nicht ermittelbar (kein SANDBOX_DOCKER_SOCK_GID/DOCKER_GID, Socket nicht gemountet) — Fallback ${DEFAULT_DOCKER_SOCK_GID}`
    );
    return DEFAULT_DOCKER_SOCK_GID;
  }
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
  getHostToolsDir,
  getHostRepoDir,
  getDevTemplatesDir,
  getDockerSockGid,
  parseMemoryLimit,
};
