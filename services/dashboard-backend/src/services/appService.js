/**
 * App Store Service
 * Manages app lifecycle: install, start, stop, uninstall
 * Uses Docker API via dockerode for container management
 */

const Docker = require('dockerode');
const fs = require('fs').promises;
const path = require('path');
const db = require('../database');
const logger = require('../utils/logger');

// Docker client - uses socket for communication
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Manifest directory path
const MANIFESTS_DIR = process.env.APPSTORE_MANIFESTS_DIR || '/arasul/appstore/manifests';
// Docker Compose prefixes network names with project name
// The project name is derived from the directory name: arasul-jet
const NETWORK_NAME = process.env.DOCKER_NETWORK || 'arasul-jet_arasul-backend';

// Cache for manifests (refresh every 60 seconds)
let manifestCache = null;
let manifestCacheTime = 0;
const CACHE_TTL = 60000;

class AppService {
  /**
   * Load all manifests from disk
   * @returns {Promise<Object>} Map of app_id -> manifest
   */
  async loadManifests() {
    const now = Date.now();

    // Return cached if fresh
    if (manifestCache && now - manifestCacheTime < CACHE_TTL) {
      return manifestCache;
    }

    const manifests = {};

    try {
      const files = await fs.readdir(MANIFESTS_DIR);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(MANIFESTS_DIR, file), 'utf8');
            const manifest = JSON.parse(content);
            manifests[manifest.id] = manifest;
          } catch (err) {
            logger.error(`Error loading manifest ${file}: ${err.message}`);
          }
        }
      }

      manifestCache = manifests;
      manifestCacheTime = now;
      logger.debug(`Loaded ${Object.keys(manifests).length} app manifests`);
    } catch (err) {
      logger.error(`Error reading manifests directory: ${err.message}`);
      // Return empty if can't read directory
      if (!manifestCache) {
        manifestCache = {};
      }
    }

    return manifestCache;
  }

  /**
   * Clear manifest cache (call after adding new manifests)
   */
  clearCache() {
    manifestCache = null;
    manifestCacheTime = 0;
  }

  /**
   * Get all apps with their current status
   * @param {Object} filters - Optional filters { category, status, search }
   * @returns {Promise<Array>} List of apps with status
   */
  async getAllApps(filters = {}) {
    const manifests = await this.loadManifests();

    // Get installation records from database
    const installations = await db.query('SELECT * FROM app_installations ORDER BY app_id');
    const installationMap = {};
    for (const inst of installations.rows) {
      installationMap[inst.app_id] = inst;
    }

    // Merge manifest data with installation status
    const apps = [];

    for (const [id, manifest] of Object.entries(manifests)) {
      const installation = installationMap[id];

      // Check real container status if installed
      let realStatus = installation?.status || 'available';
      if (installation && installation.status !== 'available') {
        try {
          const containerStatus = await this.getContainerStatus(id);
          if (containerStatus) {
            if (containerStatus.Running) {
              realStatus = 'running';
            } else {
              realStatus = 'installed';
            }
          }
        } catch (err) {
          // Container might not exist
          if (installation.status === 'running' || installation.status === 'installed') {
            realStatus = 'error';
          }
        }
      }

      const app = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        longDescription: manifest.longDescription,
        category: manifest.category,
        icon: manifest.icon,
        author: manifest.author,
        homepage: manifest.homepage,
        appType: manifest.appType || 'official',
        status: realStatus,
        installedAt: installation?.installed_at || null,
        startedAt: installation?.started_at || null,
        stoppedAt: installation?.stopped_at || null,
        lastError: installation?.last_error || null,
        canUninstall: manifest.appType !== 'system',
        canStop: manifest.appType !== 'system',
        requirements: manifest.requirements || {},
        ports: manifest.docker?.ports || {},
        traefikRoute: manifest.traefik?.rule || null,
        hasCustomPage: manifest.hasCustomPage || false,
        customPageRoute: manifest.customPageRoute || null,
        hasN8nIntegration: manifest.n8nIntegration?.enabled || false,
      };

      // Apply filters
      if (filters.category && filters.category !== 'all' && app.category !== filters.category) {
        continue;
      }
      if (filters.status) {
        // Support comma-separated status values (e.g., "running,installed")
        const statusList = filters.status.split(',').map(s => s.trim());
        if (!statusList.includes(app.status)) {
          continue;
        }
      }
      if (filters.search) {
        const search = filters.search.toLowerCase();
        if (
          !app.name.toLowerCase().includes(search) &&
          !app.description.toLowerCase().includes(search)
        ) {
          continue;
        }
      }

      apps.push(app);
    }

    // Sort: running first, then by name
    apps.sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') {return -1;}
      if (a.status !== 'running' && b.status === 'running') {return 1;}
      if (a.appType === 'system' && b.appType !== 'system') {return -1;}
      if (a.appType !== 'system' && b.appType === 'system') {return 1;}
      return a.name.localeCompare(b.name);
    });

    return apps;
  }

  /**
   * Get single app details
   * @param {string} appId - App ID
   * @returns {Promise<Object|null>} App details or null
   */
  async getApp(appId) {
    const apps = await this.getAllApps();
    return apps.find(a => a.id === appId) || null;
  }

  /**
   * Get available categories
   * @returns {Promise<Array>} List of categories
   */
  async getCategories() {
    const manifests = await this.loadManifests();
    const categories = new Set();

    for (const manifest of Object.values(manifests)) {
      if (manifest.category) {
        categories.add(manifest.category);
      }
    }

    const categoryLabels = {
      development: 'Entwicklung',
      productivity: 'Produktivität',
      ai: 'KI & ML',
      storage: 'Speicher',
      monitoring: 'Monitoring',
      networking: 'Netzwerk',
    };

    return Array.from(categories).map(cat => ({
      id: cat,
      name: categoryLabels[cat] || cat,
    }));
  }

  /**
   * Install an app
   * @param {string} appId - App ID to install
   * @param {Object} config - Optional configuration overrides
   * @returns {Promise<Object>} Installation result
   */
  async installApp(appId, config = {}) {
    const manifests = await this.loadManifests();
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
        const depStatus = await this.getContainerStatus(dep.container);
        if (!depStatus || !depStatus.Running) {
          throw new Error(`Abhängigkeit ${dep.container} ist nicht aktiv`);
        }
      }
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

    await this.logEvent(appId, 'install_start', 'Installation gestartet');

    try {
      // Handle image - either pull from registry or verify local build
      if (manifest.docker.buildRequired) {
        // For locally built images, verify it exists
        logger.info(`Checking local image ${manifest.docker.image} for ${appId}`);
        const imageExists = await this.checkImageExists(manifest.docker.image);
        if (!imageExists) {
          throw new Error(
            `Lokales Image ${manifest.docker.image} nicht gefunden. Bitte zuerst mit 'docker build' erstellen.`
          );
        }
        logger.info(`Local image ${manifest.docker.image} found`);
      } else {
        // Pull image from registry
        logger.info(`Pulling image ${manifest.docker.image} for ${appId}`);
        await this.pullImage(manifest.docker.image);
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
        dynamicVolumes = await this.getClaudeWorkspaceVolumes();
        logger.info(
          `Loaded ${dynamicVolumes.length} workspace volumes for claude-code installation`
        );
      }

      // Build container config with dynamic volumes
      const containerConfig = this.buildContainerConfig(manifest, config, dynamicVolumes);

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

      await this.logEvent(appId, 'install_complete', 'Installation erfolgreich');

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

      await this.logEvent(appId, 'install_error', error.message);

      throw error;
    }
  }

  /**
   * Start an installed app
   * @param {string} appId - App ID to start
   * @returns {Promise<Object>} Start result
   */
  async startApp(appId) {
    const result = await db.query('SELECT * FROM app_installations WHERE app_id = $1', [appId]);

    if (result.rows.length === 0) {
      throw new Error(`App ${appId} ist nicht installiert`);
    }

    const installation = result.rows[0];

    if (installation.status === 'running') {
      return { success: true, message: 'App läuft bereits' };
    }

    await db.query('UPDATE app_installations SET status = $1 WHERE app_id = $2', [
      'starting',
      appId,
    ]);

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

      await this.logEvent(appId, 'start', 'App gestartet');

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

      await this.logEvent(appId, 'start_error', error.message);

      throw error;
    }
  }

  /**
   * Check if other running apps depend on this app
   * @param {string} appId - App ID to check
   * @returns {Promise<Object>} Object with hasDependents boolean and dependentApps array
   */
  async checkDependencies(appId) {
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
   * Stop a running app
   * @param {string} appId - App ID to stop
   * @returns {Promise<Object>} Stop result
   */
  async stopApp(appId) {
    const result = await db.query('SELECT * FROM app_installations WHERE app_id = $1', [appId]);

    if (result.rows.length === 0) {
      throw new Error(`App ${appId} ist nicht installiert`);
    }

    const installation = result.rows[0];

    // Check if other running apps depend on this app
    await this.checkDependencies(appId);

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

    await db.query('UPDATE app_installations SET status = $1 WHERE app_id = $2', [
      'stopping',
      appId,
    ]);

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

      await this.logEvent(appId, 'stop', 'App gestoppt');

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

      await this.logEvent(appId, 'stop_error', error.message);

      throw error;
    }
  }

  /**
   * Restart an app
   * @param {string} appId - App ID to restart
   * @param {boolean} applyConfig - If true, recreate container with updated config
   * @returns {Promise<Object>} Restart result
   */
  async restartApp(appId, applyConfig = false) {
    const result = await db.query('SELECT * FROM app_installations WHERE app_id = $1', [appId]);

    if (result.rows.length === 0) {
      throw new Error(`App ${appId} ist nicht installiert`);
    }

    const installation = result.rows[0];

    try {
      // If applyConfig is true, we need to recreate the container with new env vars
      if (applyConfig) {
        return await this.recreateAppWithConfig(appId);
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

      await this.logEvent(appId, 'restart', 'App neu gestartet');

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

      await this.logEvent(appId, 'restart_error', error.message);

      throw error;
    }
  }

  /**
   * Recreate an app container with updated configuration from database
   * This stops, removes, and recreates the container with new env vars
   * @param {string} appId - App ID to recreate
   * @param {boolean} async - If true, return immediately and recreate in background
   * @returns {Promise<Object>} Recreate result
   */
  async recreateAppWithConfig(appId, asyncMode = false) {
    const manifests = await this.loadManifests();
    const manifest = manifests[appId];

    if (!manifest) {
      throw new Error(`App ${appId} not found in manifests`);
    }

    // Get saved configuration from database
    const configOverrides = await this.getConfigOverrides(appId);

    logger.info(
      `Recreating ${appId} with config overrides: ${Object.keys(configOverrides).join(', ')}${asyncMode ? ' (async)' : ''}`
    );

    await db.query('UPDATE app_installations SET status = $1 WHERE app_id = $2', [
      'restarting',
      appId,
    ]);

    // If async mode, start the recreation in background and return immediately
    if (asyncMode) {
      this._doRecreateContainer(appId, manifest, configOverrides).catch(err => {
        logger.error(`Background recreate failed for ${appId}: ${err.message}`);
      });
      return {
        success: true,
        message: 'Container-Neuerstellung gestartet (läuft im Hintergrund)',
        async: true,
      };
    }

    // Synchronous mode - wait for completion
    return await this._doRecreateContainer(appId, manifest, configOverrides);
  }

  /**
   * Internal method to perform the actual container recreation
   */
  async _doRecreateContainer(appId, manifest, configOverrides) {
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
      let dynamicVolumes = [];
      if (appId === 'claude-code') {
        dynamicVolumes = await this.getClaudeWorkspaceVolumes();
        logger.info(`Loaded ${dynamicVolumes.length} workspace volumes for claude-code`);
      }

      // Build container config with database overrides and dynamic volumes
      const containerConfig = this.buildContainerConfig(manifest, configOverrides, dynamicVolumes);

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

      await this.logEvent(appId, 'recreate', 'App mit neuer Konfiguration neu erstellt');

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

      await this.logEvent(appId, 'recreate_error', error.message);

      throw error;
    }
  }

  /**
   * Uninstall an app
   * @param {string} appId - App ID to uninstall
   * @param {boolean} removeVolumes - Whether to remove associated volumes
   * @returns {Promise<Object>} Uninstall result
   */
  async uninstallApp(appId, removeVolumes = false) {
    const result = await db.query('SELECT * FROM app_installations WHERE app_id = $1', [appId]);

    if (result.rows.length === 0) {
      throw new Error(`App ${appId} ist nicht installiert`);
    }

    const installation = result.rows[0];

    // Check if other running apps depend on this app
    await this.checkDependencies(appId);

    await db.query('UPDATE app_installations SET status = $1 WHERE app_id = $2', [
      'uninstalling',
      appId,
    ]);

    await this.logEvent(appId, 'uninstall_start', 'Deinstallation gestartet');

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

      await this.logEvent(appId, 'uninstall_complete', 'Deinstallation erfolgreich');

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

      await this.logEvent(appId, 'uninstall_error', error.message);

      throw error;
    }
  }

  /**
   * Get container logs
   * @param {string} appId - App ID
   * @param {number} tail - Number of lines to return
   * @returns {Promise<string>} Log output
   */
  async getAppLogs(appId, tail = 100) {
    const result = await db.query(
      'SELECT container_name FROM app_installations WHERE app_id = $1',
      [appId]
    );

    if (result.rows.length === 0) {
      throw new Error(`App ${appId} ist nicht installiert`);
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

  /**
   * Get app events
   * @param {string} appId - App ID
   * @param {number} limit - Max events to return
   * @returns {Promise<Array>} List of events
   */
  async getAppEvents(appId, limit = 50) {
    const result = await db.query(
      `
            SELECT * FROM app_events
            WHERE app_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `,
      [appId, limit]
    );

    return result.rows;
  }

  // ========== HELPER METHODS ==========

  /**
   * Build Docker container configuration from manifest
   * For claude-code, dynamically loads workspace volumes from database
   */
  buildContainerConfig(manifest, overrides = {}, dynamicVolumes = []) {
    const config = {
      name: manifest.id,
      Image: manifest.docker.image,
      Hostname: manifest.id,
      Env: this.buildEnvironment(manifest.docker.environment || [], overrides),
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
      Labels: this.buildTraefikLabels(manifest),
    };

    // Ports
    if (manifest.docker.ports) {
      const port = manifest.docker.ports;
      config.ExposedPorts[`${port.internal}/tcp`] = {};
      config.HostConfig.PortBindings[`${port.internal}/tcp`] = [
        { HostPort: String(port.external) },
      ];
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
        config.HostConfig.Memory = this.parseMemory(manifest.docker.resources.memory);
      }
      if (manifest.docker.resources.cpus) {
        config.HostConfig.NanoCpus = this.parseCpus(manifest.docker.resources.cpus);
      }
    }

    // Healthcheck
    if (manifest.docker.healthcheck) {
      config.Healthcheck = {
        Test: manifest.docker.healthcheck.test,
        Interval: this.parseInterval(manifest.docker.healthcheck.interval),
        Timeout: this.parseInterval(manifest.docker.healthcheck.timeout),
        Retries: manifest.docker.healthcheck.retries || 3,
      };
    }

    return config;
  }

  /**
   * Build environment variables, substituting ${VAR} patterns
   */
  buildEnvironment(envConfig, overrides = {}) {
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
  buildTraefikLabels(manifest) {
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
  async pullImage(image) {
    return new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) {return reject(err);}

        docker.modem.followProgress(
          stream,
          (err, output) => {
            if (err) {return reject(err);}
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
  async checkImageExists(image) {
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
  async getContainerStatus(containerName) {
    try {
      const container = docker.getContainer(containerName);
      const info = await container.inspect();
      return info.State;
    } catch (err) {
      return null;
    }
  }

  /**
   * Log an app event
   */
  async logEvent(appId, eventType, message, details = null) {
    try {
      await db.query(
        `
                INSERT INTO app_events (app_id, event_type, event_message, event_details)
                VALUES ($1, $2, $3, $4)
            `,
        [appId, eventType, message, details ? JSON.stringify(details) : null]
      );
    } catch (err) {
      logger.error(`Failed to log event: ${err.message}`);
    }
  }

  /**
   * Parse memory string (e.g., "2G", "512M") to bytes
   */
  parseMemory(mem) {
    if (!mem) {return undefined;}
    const match = mem.toString().match(/^(\d+)([GMKgmk])?$/);
    if (!match) {return undefined;}

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
  parseCpus(cpus) {
    if (!cpus) {return undefined;}
    return Math.floor(parseFloat(cpus) * 1e9);
  }

  /**
   * Parse interval string (e.g., "30s", "1m") to nanoseconds
   */
  parseInterval(interval) {
    if (!interval) {return undefined;}
    const match = interval.toString().match(/^(\d+)(s|m|h)?$/);
    if (!match) {return undefined;}

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
   * Sync system apps status with actual Docker state
   */
  async syncSystemApps() {
    const systemApps = ['n8n', 'minio'];

    for (const appId of systemApps) {
      try {
        const status = await this.getContainerStatus(appId);
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

  /**
   * Get app configuration from database
   * Returns config values, masking secrets
   */
  async getAppConfig(appId) {
    try {
      const result = await db.query(
        `
                SELECT config_key, config_value, is_secret
                FROM app_configurations
                WHERE app_id = $1
            `,
        [appId]
      );

      const config = {};
      for (const row of result.rows) {
        // Mask secrets with asterisks (only show last 4 chars if available)
        if (row.is_secret && row.config_value) {
          const val = row.config_value;
          config[row.config_key] = val.length > 4 ? '****' + val.slice(-4) : '****';
          // Also store a flag that the value exists
          config[`${row.config_key}_set`] = true;
        } else {
          config[row.config_key] = row.config_value;
        }
      }

      return config;
    } catch (err) {
      logger.error(`Error getting config for ${appId}: ${err.message}`);
      return {};
    }
  }

  /**
   * Get raw app configuration (including secrets, for internal use)
   */
  async getAppConfigRaw(appId) {
    try {
      const result = await db.query(
        `
                SELECT config_key, config_value, is_secret
                FROM app_configurations
                WHERE app_id = $1
            `,
        [appId]
      );

      const config = {};
      for (const row of result.rows) {
        config[row.config_key] = row.config_value;
      }

      return config;
    } catch (err) {
      logger.error(`Error getting raw config for ${appId}: ${err.message}`);
      return {};
    }
  }

  /**
   * Set app configuration
   * Stores key-value pairs in database
   *
   * Secret field handling:
   * - Masked values (****xxxx) are skipped (keep existing)
   * - Empty string for secrets: skip (keep existing) unless value is exactly " " (space) to clear
   * - New non-empty value: save the new value
   */
  async setAppConfig(appId, config) {
    // Get manifest to check which fields are secrets
    const manifests = await this.loadManifests();
    const manifest = manifests[appId];

    if (!manifest) {
      throw new Error(`App ${appId} not found`);
    }

    // Build a map of secret fields
    const secretFields = new Set();
    if (manifest.docker?.environment) {
      for (const env of manifest.docker.environment) {
        if (env.secret) {
          secretFields.add(env.name);
        }
      }
    }

    // Get current config to check which secrets are already set
    const currentConfig = await this.getAppConfigRaw(appId);

    // Store each config value
    for (const [key, value] of Object.entries(config)) {
      // Skip masked values (they haven't changed)
      if (typeof value === 'string' && value.startsWith('****')) {
        continue;
      }

      // Skip _set flags
      if (key.endsWith('_set')) {
        continue;
      }

      const isSecret = secretFields.has(key);

      // For secret fields: empty string means "keep existing" unless it's a space (to clear)
      if (isSecret && value === '' && currentConfig[key]) {
        // Keep existing value - don't update
        logger.debug(`Keeping existing secret value for ${key}`);
        continue;
      }

      // If value is exactly a space, treat it as "clear this field"
      const finalValue = value === ' ' ? '' : value || '';

      await db.query(
        `
                INSERT INTO app_configurations (app_id, config_key, config_value, is_secret, updated_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (app_id, config_key)
                DO UPDATE SET config_value = $3, is_secret = $4, updated_at = NOW()
            `,
        [appId, key, finalValue, isSecret]
      );
    }

    await this.logEvent(appId, 'config_update', 'Configuration updated');
    logger.info(`Configuration updated for ${appId}`);
  }

  /**
   * Get environment overrides from stored configuration
   * Used when starting a container
   */
  async getConfigOverrides(appId) {
    return await this.getAppConfigRaw(appId);
  }

  /**
   * Get dynamic workspace volumes for claude-code from database
   * Returns array of { hostPath, containerPath } objects
   */
  async getClaudeWorkspaceVolumes() {
    try {
      const result = await db.query(`
                SELECT host_path, container_path
                FROM claude_workspaces
                WHERE is_active = TRUE
                ORDER BY id ASC
            `);

      return result.rows.map(row => ({
        hostPath: row.host_path,
        containerPath: row.container_path,
      }));
    } catch (err) {
      // If table doesn't exist yet, return default volumes
      logger.warn(`Could not load workspace volumes: ${err.message}. Using defaults.`);
      return [
        { hostPath: '/home/arasul/arasul/arasul-jet', containerPath: '/workspace/arasul' },
        { hostPath: '/home/arasul/workspace', containerPath: '/workspace/custom' },
      ];
    }
  }

  /**
   * Get n8n integration credentials for SSH access
   * Returns host IP, port, username, and private key for n8n SSH connection to host
   * @param {string} appId - App ID
   * @returns {Promise<Object>} n8n credentials object
   */
  async getN8nCredentials(appId) {
    const manifests = await this.loadManifests();
    const manifest = manifests[appId];

    if (!manifest) {
      throw new Error(`App ${appId} not found`);
    }

    if (!manifest.n8nIntegration?.enabled) {
      throw new Error(`App ${appId} unterstützt keine n8n-Integration`);
    }

    // Docker Gateway = Host IP from container perspective
    // The gateway of the arasul-net network (172.30.0.1) points to the host
    const hostIp = process.env.DOCKER_GATEWAY_IP || '172.30.0.1';
    const sshPort = parseInt(process.env.SSH_PORT || '22');
    const sshUser = process.env.SSH_USER || 'arasul';

    // Try to read the private key from shared volume
    let privateKey = null;
    try {
      const keyPath = process.env.N8N_SSH_KEY_PATH || '/arasul/ssh-keys/n8n_private_key';
      privateKey = await fs.readFile(keyPath, 'utf8');
      privateKey = privateKey.trim();
    } catch (err) {
      logger.debug('Could not read n8n private key: ' + err.message);
    }

    return {
      enabled: true,
      type: 'ssh-key', // Changed to ssh-key
      ssh: {
        host: hostIp,
        port: sshPort,
        username: sshUser,
        privateKey: privateKey,
        passphrase: '', // No passphrase
        hints: {
          host: 'Docker Gateway IP - zeigt auf den Host aus Container-Sicht',
          port: 'Standard SSH-Port',
          username: 'System-Benutzer auf dem Arasul-Host',
          privateKey: 'SSH Private Key für passwortlose Authentifizierung',
        },
      },
      command: manifest.n8nIntegration.command || null,
      workingDirectory:
        manifest.n8nIntegration.workingDirectory || '/home/arasul/arasul/arasul-jet',
      instructions: [
        'Öffne n8n (Port 5678 oder /n8n)',
        'Gehe zu Credentials → Add Credential → SSH',
        'Wähle "Private Key" als Authentifizierungsmethode',
        'Kopiere Host, Port, Username und Private Key von oben',
        'Passphrase leer lassen',
        'Speichern und in einem Workflow verwenden',
      ],
      exampleCommand:
        manifest.n8nIntegration.exampleCommand ||
        'cd /home/arasul/arasul/arasul-jet && echo "Dein Prompt hier" | /home/arasul/.local/bin/claude -p --dangerously-skip-permissions',
    };
  }

  /**
   * Get Claude Code OAuth authentication status
   * Reads credentials and config from the container volume
   * @returns {Promise<Object>} Auth status with oauth and apiKey info
   */
  async getClaudeAuthStatus() {
    try {
      // First try to read the status file written by token-refresh service
      const statusResult = await this._execInContainer(
        'claude-code',
        'cat /home/claude/.claude/auth-status.json 2>/dev/null || echo "{}"'
      );

      if (statusResult && statusResult !== '{}') {
        try {
          const status = JSON.parse(statusResult);
          if (status.oauth) {
            return status;
          }
        } catch (e) {
          logger.debug('Could not parse auth-status.json');
        }
      }

      // Fallback: read credentials directly
      const credentialsResult = await this._execInContainer(
        'claude-code',
        'cat /home/claude/.claude/.credentials.json 2>/dev/null || echo "{}"'
      );

      const configResult = await this._execInContainer(
        'claude-code',
        'cat /home/claude/.claude/config.json 2>/dev/null || echo "{}"'
      );

      let credentials = {};
      let config = {};

      try {
        credentials = JSON.parse(credentialsResult);
      } catch (e) {
        logger.debug('Could not parse credentials.json');
      }

      try {
        config = JSON.parse(configResult);
      } catch (e) {
        logger.debug('Could not parse config.json');
      }

      const now = Date.now();
      const oauthData = credentials.claudeAiOauth || {};
      const expiresAt = oauthData.expiresAt || 0;
      const valid = expiresAt > now;

      // Get API key status from our config
      const appConfig = await this.getAppConfigRaw('claude-code');
      const apiKey = appConfig.ANTHROPIC_API_KEY || '';
      const apiKeySet = apiKey.length > 0 && apiKey !== 'sk-ant-test12345';

      return {
        oauth: {
          valid,
          expiresAt,
          expiresIn: valid ? Math.floor((expiresAt - now) / 1000) : 0,
          expiresInHours: valid ? ((expiresAt - now) / 3600000).toFixed(1) : '0',
          hasRefreshToken: !!oauthData.refreshToken,
          subscriptionType: oauthData.subscriptionType || null,
          account: config.oauthAccount
            ? {
                email: config.oauthAccount.emailAddress || null,
                displayName: config.oauthAccount.displayName || null,
              }
            : null,
        },
        apiKey: {
          set: apiKeySet,
          masked: apiKeySet ? '****' + apiKey.slice(-4) : null,
        },
        lastCheck: now,
      };
    } catch (error) {
      logger.error(`Error getting Claude auth status: ${error.message}`);
      return {
        oauth: { valid: false, error: error.message },
        apiKey: { set: false },
        lastCheck: Date.now(),
      };
    }
  }

  /**
   * Trigger OAuth token refresh for Claude Code
   * @returns {Promise<Object>} Refresh result
   */
  async refreshClaudeAuth() {
    try {
      logger.info('Triggering Claude Code OAuth refresh...');

      const result = await this._execInContainer('claude-code', 'claude auth refresh 2>&1');

      logger.info(`Claude auth refresh result: ${result}`);

      // Check new status after refresh
      const status = await this.getClaudeAuthStatus();

      return {
        success: status.oauth.valid,
        message: status.oauth.valid
          ? `Token erfolgreich erneuert. Gültig für ${status.oauth.expiresInHours}h`
          : 'Token-Refresh fehlgeschlagen. Bitte neu anmelden.',
        output: result,
        status,
      };
    } catch (error) {
      logger.error(`Error refreshing Claude auth: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a command inside a running container
   * @param {string} containerName - Container name
   * @param {string} command - Command to execute
   * @returns {Promise<string>} Command output
   */
  async _execInContainer(containerName, command) {
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
}

module.exports = new AppService();
