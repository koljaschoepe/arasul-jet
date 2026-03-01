/**
 * Install Service
 * Handles app installation, uninstallation, dependency checking, and system app sync.
 */

const Docker = require('dockerode');
const db = require('../../database');
const logger = require('../../utils/logger');

// Docker client - uses socket for communication
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Install an app
 * @param {string} appId - App ID to install
 * @param {Object} config - Optional configuration overrides
 * @returns {Promise<Object>} Installation result
 */
async function installApp(appId, config = {}) {
  const manifestService = require('./manifestService');
  const containerService = require('./containerService');
  const configService = require('./configService');

  const manifests = await manifestService.loadManifests();
  const manifest = manifests[appId];

  if (!manifest) {
    throw new Error(`App ${appId} not found`);
  }

  // Check if already installed
  const existing = await db.query('SELECT status FROM app_installations WHERE app_id = $1', [
    appId,
  ]);
  if (existing.rows.length > 0 && existing.rows[0].status !== 'available') {
    throw new Error(`App ${appId} is already installed`);
  }

  // Check dependencies
  for (const dep of manifest.dependencies || []) {
    if (dep.required) {
      const depStatus = await containerService.getContainerStatus(dep.container);
      if (!depStatus || !depStatus.Running) {
        throw new Error(`Abhängigkeit ${dep.container} ist nicht aktiv`);
      }
    }
  }

  // Built-in apps run inside dashboard-backend, no container needed
  if (manifest.builtin) {
    await db.query(
      `
        INSERT INTO app_installations (app_id, status, version, container_name, app_type)
        VALUES ($1, 'running', $2, $3, $4)
        ON CONFLICT (app_id) DO UPDATE SET
          status = 'running', version = $2, started_at = NOW(), last_error = NULL, updated_at = NOW()
      `,
      [appId, manifest.version, appId, manifest.appType || 'official']
    );
    await configService.logEvent(appId, 'install_complete', 'Built-in App aktiviert');
    return { success: true, appId, message: 'App erfolgreich aktiviert' };
  }

  // Update status to installing
  await db.query(
    `
            INSERT INTO app_installations (app_id, status, version, container_name, internal_port, external_port, traefik_route, app_type)
            VALUES ($1, 'installing', $2, $3, $4, $5, $6, $7)
            ON CONFLICT (app_id) DO UPDATE SET
                status = 'installing',
                version = $2,
                app_type = $7,
                last_error = NULL,
                updated_at = NOW()
        `,
    [
      appId,
      manifest.version,
      appId,
      manifest.docker.ports?.internal,
      manifest.docker.ports?.external,
      manifest.traefik?.rule,
      manifest.appType || 'official',
    ]
  );

  await configService.logEvent(appId, 'install_start', 'Installation gestartet');

  try {
    // Handle image - either pull from registry or verify local build
    if (manifest.docker.buildRequired) {
      // For locally built images, verify it exists
      logger.info(`Checking local image ${manifest.docker.image} for ${appId}`);
      const imageExists = await containerService.checkImageExists(manifest.docker.image);
      if (!imageExists) {
        throw new Error(
          `Lokales Image ${manifest.docker.image} nicht gefunden. Bitte zuerst mit 'docker build' erstellen.`
        );
      }
      logger.info(`Local image ${manifest.docker.image} found`);
    } else {
      // Pull image from registry
      logger.info(`Pulling image ${manifest.docker.image} for ${appId}`);
      await containerService.pullImage(manifest.docker.image);
    }

    // Create volumes
    for (const vol of manifest.docker.volumes || []) {
      if (vol.type === 'volume') {
        try {
          await docker.createVolume({ Name: vol.name });
          logger.debug(`Created volume ${vol.name}`);
        } catch (err) {
          // Volume might already exist
          if (!err.message.includes('already exists')) {
            throw err;
          }
        }
      }
    }

    // Get dynamic workspace volumes for claude-code
    let dynamicVolumes = [];
    if (appId === 'claude-code') {
      dynamicVolumes = await configService.getClaudeWorkspaceVolumes();
      logger.info(`Loaded ${dynamicVolumes.length} workspace volumes for claude-code installation`);
    }

    // Build container config with dynamic volumes
    const containerConfig = containerService.buildContainerConfig(manifest, config, dynamicVolumes);

    // Create container
    const container = await docker.createContainer(containerConfig);
    logger.info(`Created container ${container.id} for ${appId}`);

    // Update installation record
    await db.query(
      `
                UPDATE app_installations
                SET status = 'installed',
                    container_id = $1,
                    installed_at = NOW(),
                    last_error = NULL
                WHERE app_id = $2
            `,
      [container.id, appId]
    );

    await configService.logEvent(appId, 'install_complete', 'Installation erfolgreich');

    return {
      success: true,
      appId,
      containerId: container.id,
      message: 'App erfolgreich installiert',
    };
  } catch (error) {
    logger.error(`Installation failed for ${appId}: ${error.message}`);

    await db.query(
      `
                UPDATE app_installations
                SET status = 'error',
                    last_error = $1,
                    error_count = COALESCE(error_count, 0) + 1
                WHERE app_id = $2
            `,
      [error.message, appId]
    );

    await configService.logEvent(appId, 'install_error', error.message);

    throw error;
  }
}

/**
 * Uninstall an app
 * @param {string} appId - App ID to uninstall
 * @param {boolean} removeVolumes - Whether to remove associated volumes
 * @returns {Promise<Object>} Uninstall result
 */
async function uninstallApp(appId, removeVolumes = false) {
  const manifestService = require('./manifestService');
  const configService = require('./configService');

  const result = await db.query('SELECT * FROM app_installations WHERE app_id = $1', [appId]);

  if (result.rows.length === 0) {
    throw new Error(`App ${appId} ist nicht installiert`);
  }

  const installation = result.rows[0];

  // Check if other running apps depend on this app
  await checkDependencies(appId);

  // Built-in apps: just remove DB records
  const manifests = await manifestService.loadManifests();
  if (manifests[appId]?.builtin) {
    await db.query('DELETE FROM app_configurations WHERE app_id = $1', [appId]);
    await db.query('DELETE FROM app_dependencies WHERE app_id = $1', [appId]);
    await db.query('DELETE FROM app_installations WHERE app_id = $1', [appId]);
    await configService.logEvent(appId, 'uninstall_complete', 'Built-in App deaktiviert');
    return { success: true, message: 'App deinstalliert' };
  }

  await db.query('UPDATE app_installations SET status = $1 WHERE app_id = $2', [
    'uninstalling',
    appId,
  ]);

  await configService.logEvent(appId, 'uninstall_start', 'Deinstallation gestartet');

  try {
    const container = docker.getContainer(installation.container_name || appId);

    // Stop if running
    try {
      await container.stop({ t: 5 });
    } catch (err) {
      // Ignore stop errors (might already be stopped)
      logger.debug(`Stop during uninstall: ${err.message}`);
    }

    // Remove container
    await container.remove({ v: removeVolumes });
    logger.info(`Removed container for ${appId}`);

    // Delete from database
    await db.query('DELETE FROM app_configurations WHERE app_id = $1', [appId]);
    await db.query('DELETE FROM app_dependencies WHERE app_id = $1', [appId]);
    await db.query('DELETE FROM app_installations WHERE app_id = $1', [appId]);

    await configService.logEvent(appId, 'uninstall_complete', 'Deinstallation erfolgreich');

    return { success: true, message: 'App deinstalliert' };
  } catch (error) {
    // If container doesn't exist, just clean up database
    if (error.statusCode === 404) {
      await db.query('DELETE FROM app_installations WHERE app_id = $1', [appId]);
      return { success: true, message: 'App-Eintrag entfernt' };
    }

    await db.query(
      `
                UPDATE app_installations
                SET status = 'error', last_error = $1
                WHERE app_id = $2
            `,
      [error.message, appId]
    );

    await configService.logEvent(appId, 'uninstall_error', error.message);

    throw error;
  }
}

/**
 * Check if other running apps depend on this app
 * @param {string} appId - App ID to check
 * @returns {Promise<Object>} Object with hasDependents boolean and dependentApps array
 */
async function checkDependencies(appId) {
  // Query for running apps that depend on this app
  const result = await db.query(
    `
            SELECT ai.app_id, ai.status
            FROM app_installations ai
            JOIN app_dependencies ad ON ai.app_id = ad.app_id
            WHERE ad.depends_on = $1 AND ai.status = 'running'
        `,
    [appId]
  );

  const dependentApps = result.rows.map(row => row.app_id);

  if (dependentApps.length > 0) {
    const error = new Error(
      `Diese App kann nicht gestoppt werden. Folgende Apps hängen davon ab: ${dependentApps.join(', ')}`
    );
    error.dependentApps = dependentApps;
    error.statusCode = 409; // Conflict
    throw error;
  }

  return { hasDependents: false, dependentApps: [] };
}

/**
 * Sync system apps status with actual Docker state
 */
async function syncSystemApps() {
  const containerService = require('./containerService');
  const systemApps = ['n8n', 'minio'];

  for (const appId of systemApps) {
    try {
      const status = await containerService.getContainerStatus(appId);
      const dbStatus = status?.Running ? 'running' : 'installed';

      await db.query(
        `
                    UPDATE app_installations
                    SET status = $1,
                        started_at = CASE WHEN $1 = 'running' AND started_at IS NULL THEN NOW() ELSE started_at END
                    WHERE app_id = $2
                `,
        [dbStatus, appId]
      );
    } catch (err) {
      logger.debug(`Could not sync status for ${appId}: ${err.message}`);
    }
  }
}

module.exports = {
  installApp,
  uninstallApp,
  checkDependencies,
  syncSystemApps,
};
