/**
 * Container Service
 * Manages Docker container lifecycle: start, stop, restart, recreate, logs.
 * Handles container configuration, image management, and Traefik label generation.
 */

const Docker = require('dockerode');
const db = require('../../database');
const logger = require('../../utils/logger');

// Docker client - uses socket for communication
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Docker Compose prefixes network names with project name
// The project name is derived from the directory name: arasul-jet
const NETWORK_NAME = process.env.DOCKER_NETWORK || 'arasul-jet_arasul-backend';

/**
 * Start an installed app
 * @param {string} appId - App ID to start
 * @returns {Promise<Object>} Start result
 */
async function startApp(appId) {
  const result = await db.query('SELECT * FROM app_installations WHERE app_id = $1', [appId]);

  if (result.rows.length === 0) {
    throw new Error(`App ${appId} ist nicht installiert`);
  }

  const installation = result.rows[0];

  if (installation.status === 'running') {
    return { success: true, message: 'App läuft bereits' };
  }

  // Built-in apps run inside dashboard-backend
  const manifestService = require('./manifestService');
  const manifests = await manifestService.loadManifests();
  if (manifests[appId]?.builtin) {
    await db.query(
      `UPDATE app_installations SET status = 'running', started_at = NOW(), last_error = NULL WHERE app_id = $1`,
      [appId]
    );
    return { success: true, message: 'App aktiviert' };
  }

  await db.query('UPDATE app_installations SET status = $1 WHERE app_id = $2', ['starting', appId]);

  try {
    const container = docker.getContainer(installation.container_name || appId);
    await container.start();

    await db.query(
      `
                UPDATE app_installations
                SET status = 'running',
                    started_at = NOW(),
                    stopped_at = NULL,
                    last_error = NULL
                WHERE app_id = $1
            `,
      [appId]
    );

    const configService = require('./configService');
    await configService.logEvent(appId, 'start', 'App gestartet');

    return { success: true, message: 'App gestartet' };
  } catch (error) {
    // Handle "already started" case
    if (error.statusCode === 304) {
      await db.query(
        'UPDATE app_installations SET status = $1, started_at = NOW() WHERE app_id = $2',
        ['running', appId]
      );
      return { success: true, message: 'App läuft bereits' };
    }

    await db.query(
      `
                UPDATE app_installations
                SET status = 'error', last_error = $1
                WHERE app_id = $2
            `,
      [error.message, appId]
    );

    const configService = require('./configService');
    await configService.logEvent(appId, 'start_error', error.message);

    throw error;
  }
}

/**
 * Stop a running app
 * @param {string} appId - App ID to stop
 * @returns {Promise<Object>} Stop result
 */
async function stopApp(appId) {
  const result = await db.query('SELECT * FROM app_installations WHERE app_id = $1', [appId]);

  if (result.rows.length === 0) {
    throw new Error(`App ${appId} ist nicht installiert`);
  }

  const installation = result.rows[0];

  // Check if other running apps depend on this app
  const installService = require('./installService');
  await installService.checkDependencies(appId);

  // Built-in apps run inside dashboard-backend
  const manifestService = require('./manifestService');
  const manifests = await manifestService.loadManifests();
  if (manifests[appId]?.builtin) {
    await db.query(
      `UPDATE app_installations SET status = 'installed', stopped_at = NOW() WHERE app_id = $1`,
      [appId]
    );
    return { success: true, message: 'App deaktiviert' };
  }

  // Check actual container state, not just DB status
  // This handles cases where DB and container state are out of sync
  const containerName = installation.container_name || appId;
  let containerRunning = false;
  try {
    const container = docker.getContainer(containerName);
    const containerInfo = await container.inspect();
    containerRunning = containerInfo.State.Running;
  } catch (e) {
    // Container doesn't exist - already stopped
    containerRunning = false;
  }

  if (
    !containerRunning &&
    (installation.status === 'installed' || installation.status === 'available')
  ) {
    return { success: true, message: 'App ist bereits gestoppt' };
  }

  await db.query('UPDATE app_installations SET status = $1 WHERE app_id = $2', ['stopping', appId]);

  try {
    const container = docker.getContainer(installation.container_name || appId);
    await container.stop({ t: 10 });

    await db.query(
      `
                UPDATE app_installations
                SET status = 'installed',
                    stopped_at = NOW(),
                    last_error = NULL
                WHERE app_id = $1
            `,
      [appId]
    );

    const configService = require('./configService');
    await configService.logEvent(appId, 'stop', 'App gestoppt');

    return { success: true, message: 'App gestoppt' };
  } catch (error) {
    // Handle "already stopped" case
    if (error.statusCode === 304) {
      await db.query(
        'UPDATE app_installations SET status = $1, stopped_at = NOW() WHERE app_id = $2',
        ['installed', appId]
      );
      return { success: true, message: 'App war bereits gestoppt' };
    }

    await db.query(
      `
                UPDATE app_installations
                SET status = 'error', last_error = $1
                WHERE app_id = $2
            `,
      [error.message, appId]
    );

    const configService = require('./configService');
    await configService.logEvent(appId, 'stop_error', error.message);

    throw error;
  }
}

/**
 * Restart an app
 * @param {string} appId - App ID to restart
 * @param {boolean} applyConfig - If true, recreate container with updated config
 * @returns {Promise<Object>} Restart result
 */
async function restartApp(appId, applyConfig = false) {
  const result = await db.query('SELECT * FROM app_installations WHERE app_id = $1', [appId]);

  if (result.rows.length === 0) {
    throw new Error(`App ${appId} ist nicht installiert`);
  }

  const installation = result.rows[0];

  // Built-in apps run inside dashboard-backend
  const manifestService = require('./manifestService');
  const manifests = await manifestService.loadManifests();
  if (manifests[appId]?.builtin) {
    return { success: true, message: 'Built-in App ist immer aktiv' };
  }

  try {
    // If applyConfig is true, we need to recreate the container with new env vars
    if (applyConfig) {
      return await recreateAppWithConfig(appId);
    }

    // Simple restart without config changes
    const container = docker.getContainer(installation.container_name || appId);
    await container.restart({ t: 10 });

    await db.query(
      `
                UPDATE app_installations
                SET status = 'running',
                    started_at = NOW(),
                    last_error = NULL
                WHERE app_id = $1
            `,
      [appId]
    );

    const configService = require('./configService');
    await configService.logEvent(appId, 'restart', 'App neu gestartet');

    return { success: true, message: 'App neu gestartet' };
  } catch (error) {
    await db.query(
      `
                UPDATE app_installations
                SET status = 'error', last_error = $1
                WHERE app_id = $2
            `,
      [error.message, appId]
    );

    const configService = require('./configService');
    await configService.logEvent(appId, 'restart_error', error.message);

    throw error;
  }
}

/**
 * Recreate an app container with updated configuration from database
 * This stops, removes, and recreates the container with new env vars
 * @param {string} appId - App ID to recreate
 * @param {boolean} asyncMode - If true, return immediately and recreate in background
 * @returns {Promise<Object>} Recreate result
 */
async function recreateAppWithConfig(appId, asyncMode = false) {
  const manifestService = require('./manifestService');
  const manifests = await manifestService.loadManifests();
  const manifest = manifests[appId];

  if (!manifest) {
    throw new Error(`App ${appId} not found in manifests`);
  }

  // Built-in apps don't have containers to recreate
  if (manifest.builtin) {
    return { success: true, message: 'Built-in App ist immer aktiv' };
  }

  // Get saved configuration from database
  const configService = require('./configService');
  const configOverrides = await configService.getConfigOverrides(appId);

  logger.info(
    `Recreating ${appId} with config overrides: ${Object.keys(configOverrides).join(', ')}${asyncMode ? ' (async)' : ''}`
  );

  await db.query('UPDATE app_installations SET status = $1 WHERE app_id = $2', [
    'restarting',
    appId,
  ]);

  // If async mode, start the recreation in background and return immediately
  if (asyncMode) {
    _doRecreateContainer(appId, manifest, configOverrides).catch(err => {
      logger.error(`Background recreate failed for ${appId}: ${err.message}`);
    });
    return {
      success: true,
      message: 'Container-Neuerstellung gestartet (läuft im Hintergrund)',
      async: true,
    };
  }

  // Synchronous mode - wait for completion
  return await _doRecreateContainer(appId, manifest, configOverrides);
}

/**
 * Internal method to perform the actual container recreation
 */
async function _doRecreateContainer(appId, manifest, configOverrides) {
  try {
    const containerName = appId;
    const container = docker.getContainer(containerName);

    // Stop if running
    try {
      await container.stop({ t: 5 });
      logger.debug(`Stopped container ${containerName}`);
    } catch (err) {
      // Ignore if not running
      logger.debug(`Stop during recreate: ${err.message}`);
    }

    // Remove container
    try {
      await container.remove();
      logger.debug(`Removed container ${containerName}`);
    } catch (err) {
      // Ignore if doesn't exist
      logger.debug(`Remove during recreate: ${err.message}`);
    }

    // Get dynamic workspace volumes for claude-code
    const configService = require('./configService');
    let dynamicVolumes = [];
    if (appId === 'claude-code') {
      dynamicVolumes = await configService.getClaudeWorkspaceVolumes();
      logger.info(`Loaded ${dynamicVolumes.length} workspace volumes for claude-code`);
    }

    // Build container config with database overrides and dynamic volumes
    const containerConfig = buildContainerConfig(manifest, configOverrides, dynamicVolumes);

    // Create new container
    const newContainer = await docker.createContainer(containerConfig);
    logger.info(`Created new container ${newContainer.id} for ${appId}`);

    // Start the new container
    await newContainer.start();
    logger.info(`Started container ${appId} with updated configuration`);

    // Update installation record
    await db.query(
      `
                UPDATE app_installations
                SET status = 'running',
                    container_id = $1,
                    started_at = NOW(),
                    last_error = NULL
                WHERE app_id = $2
            `,
      [newContainer.id, appId]
    );

    await configService.logEvent(appId, 'recreate', 'App mit neuer Konfiguration neu erstellt');

    return { success: true, message: 'App mit neuer Konfiguration neu gestartet' };
  } catch (error) {
    logger.error(`Recreate failed for ${appId}: ${error.message}`);

    await db.query(
      `
                UPDATE app_installations
                SET status = 'error', last_error = $1
                WHERE app_id = $2
            `,
      [error.message, appId]
    );

    const configService = require('./configService');
    await configService.logEvent(appId, 'recreate_error', error.message);

    throw error;
  }
}

/**
 * Get container logs
 * @param {string} appId - App ID
 * @param {number} tail - Number of lines to return
 * @returns {Promise<string>} Log output
 */
async function getAppLogs(appId, tail = 100) {
  const result = await db.query('SELECT container_name FROM app_installations WHERE app_id = $1', [
    appId,
  ]);

  if (result.rows.length === 0) {
    throw new Error(`App ${appId} ist nicht installiert`);
  }

  // Built-in apps share dashboard-backend logs
  const manifestService = require('./manifestService');
  const manifests = await manifestService.loadManifests();
  if (manifests[appId]?.builtin) {
    return (
      'Built-in App: Logs sind in den dashboard-backend Logs verfügbar.\n' +
      'Nutze: docker compose logs -f dashboard-backend'
    );
  }

  try {
    const container = docker.getContainer(result.rows[0].container_name || appId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: tail,
      timestamps: true,
    });

    // Convert buffer to string
    return logs.toString('utf8');
  } catch (error) {
    logger.error(`Error getting logs for ${appId}: ${error.message}`);
    throw error;
  }
}

// ========== HELPER METHODS ==========

/**
 * Build Docker container configuration from manifest
 * For claude-code, dynamically loads workspace volumes from database
 */
function buildContainerConfig(manifest, overrides = {}, dynamicVolumes = []) {
  const config = {
    name: manifest.id,
    Image: manifest.docker.image,
    Hostname: manifest.id,
    Env: buildEnvironment(manifest.docker.environment || [], overrides),
    ExposedPorts: {},
    HostConfig: {
      NetworkMode: manifest.docker.network || NETWORK_NAME,
      PortBindings: {},
      RestartPolicy: {
        Name: manifest.docker.restart || 'unless-stopped',
      },
      Binds: [],
      LogConfig: {
        Type: 'json-file',
        Config: {
          'max-size': '50m',
          'max-file': '3',
        },
      },
    },
    Labels: buildTraefikLabels(manifest),
  };

  // Ports
  if (manifest.docker.ports) {
    const port = manifest.docker.ports;
    config.ExposedPorts[`${port.internal}/tcp`] = {};
    config.HostConfig.PortBindings[`${port.internal}/tcp`] = [{ HostPort: String(port.external) }];
  }

  // Static volumes from manifest (non-workspace volumes like config, docker socket)
  for (const vol of manifest.docker.volumes || []) {
    // Skip workspace volumes for claude-code - they come from database
    if (manifest.id === 'claude-code' && vol.containerPath.startsWith('/workspace/')) {
      continue;
    }
    if (vol.type === 'volume') {
      config.HostConfig.Binds.push(`${vol.name}:${vol.containerPath}`);
    } else if (vol.type === 'bind') {
      config.HostConfig.Binds.push(`${vol.name}:${vol.containerPath}`);
    }
  }

  // Dynamic workspace volumes (from database)
  for (const vol of dynamicVolumes) {
    config.HostConfig.Binds.push(`${vol.hostPath}:${vol.containerPath}`);
  }

  // Resource limits
  if (manifest.docker.resources) {
    if (manifest.docker.resources.memory) {
      config.HostConfig.Memory = parseMemory(manifest.docker.resources.memory);
    }
    if (manifest.docker.resources.cpus) {
      config.HostConfig.NanoCpus = parseCpus(manifest.docker.resources.cpus);
    }
  }

  // Healthcheck
  if (manifest.docker.healthcheck) {
    config.Healthcheck = {
      Test: manifest.docker.healthcheck.test,
      Interval: parseInterval(manifest.docker.healthcheck.interval),
      Timeout: parseInterval(manifest.docker.healthcheck.timeout),
      Retries: manifest.docker.healthcheck.retries || 3,
    };
  }

  return config;
}

/**
 * Build environment variables, substituting ${VAR} patterns
 */
function buildEnvironment(envConfig, overrides = {}) {
  const env = [];

  for (const e of envConfig) {
    let value = overrides[e.name] || e.value;

    // Substitute ${VAR} patterns from process.env
    if (typeof value === 'string') {
      value = value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        return process.env[varName] || match;
      });
    }

    env.push(`${e.name}=${value}`);
  }

  return env;
}

/**
 * Build Traefik labels for routing
 */
function buildTraefikLabels(manifest) {
  const labels = {
    'arasul.app': manifest.id,
    'arasul.version': manifest.version || '1.0.0',
  };

  if (manifest.traefik?.enabled !== false) {
    labels['traefik.enable'] = 'true';

    const routerName = manifest.id.replace(/[^a-zA-Z0-9]/g, '-');

    if (manifest.traefik?.rule) {
      labels[`traefik.http.routers.${routerName}.rule`] = manifest.traefik.rule;
    } else {
      labels[`traefik.http.routers.${routerName}.rule`] = `PathPrefix(\`/${manifest.id}\`)`;
    }

    labels[`traefik.http.routers.${routerName}.priority`] = String(
      manifest.traefik?.priority || 50
    );
    labels[`traefik.http.routers.${routerName}.entrypoints`] = 'websecure';
    labels[`traefik.http.routers.${routerName}.tls`] = 'true';

    if (manifest.docker.ports?.internal) {
      labels[`traefik.http.services.${routerName}.loadbalancer.server.port`] = String(
        manifest.docker.ports.internal
      );
    }
  } else {
    labels['traefik.enable'] = 'false';
  }

  return labels;
}

/**
 * Pull Docker image
 */
async function pullImage(image) {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) {
        return reject(err);
      }

      docker.modem.followProgress(
        stream,
        (err, output) => {
          if (err) {
            return reject(err);
          }
          logger.debug(`Image pull complete: ${image}`);
          resolve(output);
        },
        event => {
          // Progress events
          if (event.status) {
            logger.debug(`Pull ${image}: ${event.status}`);
          }
        }
      );
    });
  });
}

/**
 * Check if a Docker image exists locally
 * @param {string} image - Image name to check
 * @returns {Promise<boolean>} True if image exists
 */
async function checkImageExists(image) {
  try {
    const imageObj = docker.getImage(image);
    await imageObj.inspect();
    return true;
  } catch (err) {
    if (err.statusCode === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Get container status
 */
async function getContainerStatus(containerName) {
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();
    return info.State;
  } catch (err) {
    return null;
  }
}

/**
 * Parse memory string (e.g., "2G", "512M") to bytes
 */
function parseMemory(mem) {
  if (!mem) {
    return undefined;
  }
  const match = mem.toString().match(/^(\d+)([GMKgmk])?$/);
  if (!match) {
    return undefined;
  }

  const value = parseInt(match[1]);
  const unit = (match[2] || 'M').toUpperCase();

  const multipliers = {
    G: 1024 * 1024 * 1024,
    M: 1024 * 1024,
    K: 1024,
  };

  return value * (multipliers[unit] || multipliers.M);
}

/**
 * Parse CPU string (e.g., "2", "0.5") to nanoseconds
 */
function parseCpus(cpus) {
  if (!cpus) {
    return undefined;
  }
  return Math.floor(parseFloat(cpus) * 1e9);
}

/**
 * Parse interval string (e.g., "30s", "1m") to nanoseconds
 */
function parseInterval(interval) {
  if (!interval) {
    return undefined;
  }
  const match = interval.toString().match(/^(\d+)(s|m|h)?$/);
  if (!match) {
    return undefined;
  }

  const value = parseInt(match[1]);
  const unit = match[2] || 's';

  const multipliers = {
    s: 1e9,
    m: 60e9,
    h: 3600e9,
  };

  return value * multipliers[unit];
}

/**
 * Execute a command inside a running container
 * @param {string} containerName - Container name
 * @param {string} command - Command to execute
 * @returns {Promise<string>} Command output
 */
async function _execInContainer(containerName, command) {
  try {
    const container = docker.getContainer(containerName);

    // Create exec instance
    const exec = await container.exec({
      Cmd: ['bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    // Start exec and collect output
    const stream = await exec.start();

    return new Promise((resolve, reject) => {
      let output = '';

      stream.on('data', chunk => {
        // Docker exec streams have a header, extract the actual data
        // Header is 8 bytes: [STREAM_TYPE, 0, 0, 0, SIZE1, SIZE2, SIZE3, SIZE4]
        if (chunk.length > 8) {
          output += chunk.slice(8).toString('utf8');
        } else {
          output += chunk.toString('utf8');
        }
      });

      stream.on('end', () => {
        resolve(output.trim());
      });

      stream.on('error', err => {
        reject(err);
      });

      // Handle case where stream doesn't emit 'end'
      setTimeout(() => {
        resolve(output.trim());
      }, 5000);
    });
  } catch (error) {
    logger.error(`Error executing in container ${containerName}: ${error.message}`);
    throw error;
  }
}

module.exports = {
  startApp,
  stopApp,
  restartApp,
  recreateAppWithConfig,
  _doRecreateContainer,
  getContainerStatus,
  pullImage,
  checkImageExists,
  getAppLogs,
  buildContainerConfig,
  buildEnvironment,
  buildTraefikLabels,
  parseMemory,
  parseCpus,
  parseInterval,
  _execInContainer,
};
