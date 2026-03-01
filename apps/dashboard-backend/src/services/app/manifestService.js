/**
 * Manifest Service
 * Loads and caches app manifests from disk, provides app listing and category lookup.
 */

const fs = require('fs').promises;
const path = require('path');
const db = require('../../database');
const logger = require('../../utils/logger');

const MANIFESTS_DIR = process.env.APPSTORE_MANIFESTS_DIR || '/arasul/appstore/manifests';

// Cache for manifests (refresh every 60 seconds)
let manifestCache = null;
let manifestCacheTime = 0;
const CACHE_TTL = 60000;

/**
 * Load all manifests from disk
 * @returns {Promise<Object>} Map of app_id -> manifest
 */
async function loadManifests() {
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
function clearCache() {
  manifestCache = null;
  manifestCacheTime = 0;
}

/**
 * Get all apps with their current status
 * @param {Object} filters - Optional filters { category, status, search }
 * @returns {Promise<Array>} List of apps with status
 */
async function getAllApps(filters = {}) {
  const manifests = await loadManifests();

  // Lazy require to avoid circular dependency
  const containerService = require('./containerService');

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
    if (manifest.builtin) {
      // Built-in apps are always running when dashboard-backend is running
      if (installation && installation.status !== 'available') {
        realStatus = 'running';
      }
    } else if (installation && installation.status !== 'available') {
      try {
        const containerStatus = await containerService.getContainerStatus(id);
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
    if (a.status === 'running' && b.status !== 'running') {
      return -1;
    }
    if (a.status !== 'running' && b.status === 'running') {
      return 1;
    }
    if (a.appType === 'system' && b.appType !== 'system') {
      return -1;
    }
    if (a.appType !== 'system' && b.appType === 'system') {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  return apps;
}

/**
 * Get single app details
 * @param {string} appId - App ID
 * @returns {Promise<Object|null>} App details or null
 */
async function getApp(appId) {
  const apps = await getAllApps();
  return apps.find(a => a.id === appId) || null;
}

/**
 * Get available categories
 * @returns {Promise<Array>} List of categories
 */
async function getCategories() {
  const manifests = await loadManifests();
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

module.exports = {
  loadManifests,
  clearCache,
  getAllApps,
  getApp,
  getCategories,
};
