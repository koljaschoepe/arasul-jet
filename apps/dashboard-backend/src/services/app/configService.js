/**
 * Config Service
 * Manages app configuration, Claude workspace volumes, n8n credentials,
 * Claude auth status, and app event logging.
 */

const fs = require('fs').promises;
const db = require('../../database');
const logger = require('../../utils/logger');

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
 * Get dynamic workspace volumes for claude-code from database
 * Returns array of { hostPath, containerPath } objects
 */
async function getClaudeWorkspaceVolumes() {
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
async function getN8nCredentials(appId) {
  const manifestService = require('./manifestService');
  const manifests = await manifestService.loadManifests();
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
    workingDirectory: manifest.n8nIntegration.workingDirectory || '/home/arasul/arasul/arasul-jet',
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
async function getClaudeAuthStatus() {
  try {
    const containerService = require('./containerService');

    // First try to read the status file written by token-refresh service
    const statusResult = await containerService._execInContainer(
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
    const credentialsResult = await containerService._execInContainer(
      'claude-code',
      'cat /home/claude/.claude/.credentials.json 2>/dev/null || echo "{}"'
    );

    const configResult = await containerService._execInContainer(
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
    const appConfig = await getAppConfigRaw('claude-code');
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
async function refreshClaudeAuth() {
  try {
    const containerService = require('./containerService');

    logger.info('Triggering Claude Code OAuth refresh...');

    const result = await containerService._execInContainer(
      'claude-code',
      'claude auth refresh 2>&1'
    );

    logger.info(`Claude auth refresh result: ${result}`);

    // Check new status after refresh
    const status = await getClaudeAuthStatus();

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
  getClaudeWorkspaceVolumes,
  getN8nCredentials,
  getClaudeAuthStatus,
  refreshClaudeAuth,
  logEvent,
  getAppEvents,
};
