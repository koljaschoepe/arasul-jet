/**
 * Config Service
 * Manages app configuration and app event logging.
 */

const fs = require('fs').promises;
const db = require('../../database');
const logger = require('../../utils/logger');
const { NotFoundError, ValidationError } = require('../../utils/errors');

/**
 * Resolve ${VAR} patterns in a string from process.env
 */
function resolveEnvVars(str) {
  if (!str || typeof str !== 'string') {
    return str;
  }
  return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return process.env[varName] || match;
  });
}

/**
 * Get app configuration from database
 * Returns config values, masking secrets
 */
async function getAppConfig(appId) {
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
async function getAppConfigRaw(appId) {
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
async function setAppConfig(appId, config) {
  // Get manifest to check which fields are secrets
  const manifestService = require('./manifestService');
  const manifests = await manifestService.loadManifests();
  const manifest = manifests[appId];

  if (!manifest) {
    throw new NotFoundError(`App ${appId} nicht gefunden`);
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
  const currentConfig = await getAppConfigRaw(appId);

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

  await logEvent(appId, 'config_update', 'Configuration updated');
  logger.info(`Configuration updated for ${appId}`);
}

/**
 * Get environment overrides from stored configuration
 * Used when starting a container
 */
async function getConfigOverrides(appId) {
  return await getAppConfigRaw(appId);
}

/**
 * Log an app event
 */
async function logEvent(appId, eventType, message, details = null) {
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
 * Get app events
 * @param {string} appId - App ID
 * @param {number} limit - Max events to return
 * @returns {Promise<Array>} List of events
 */
async function getAppEvents(appId, limit = 50) {
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

module.exports = {
  getAppConfig,
  getAppConfigRaw,
  setAppConfig,
  getConfigOverrides,
  logEvent,
  getAppEvents,
};
