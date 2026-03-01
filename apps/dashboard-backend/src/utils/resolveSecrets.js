'use strict';

const fs = require('fs');

/**
 * Resolve Docker secrets from _FILE environment variables.
 *
 * For each variable name, checks if VAR_FILE exists and points to a readable file.
 * If so, reads the file content and sets process.env[VAR] to that value.
 * This allows all existing code to keep using process.env.VAR unchanged.
 */
function resolveSecrets() {
  const vars = [
    'POSTGRES_PASSWORD',
    'JWT_SECRET',
    'MINIO_ROOT_USER',
    'MINIO_ROOT_PASSWORD',
    'ARASUL_DATA_DB_PASSWORD',
    'TELEGRAM_ENCRYPTION_KEY',
  ];

  for (const name of vars) {
    const filePath = process.env[`${name}_FILE`];
    if (filePath && fs.existsSync(filePath)) {
      process.env[name] = fs.readFileSync(filePath, 'utf8').trim();
    }
  }
}

module.exports = resolveSecrets;
