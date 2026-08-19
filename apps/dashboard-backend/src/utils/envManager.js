/**
 * Environment File Manager
 * Handles secure updating of .env file variables
 */

const fs = require('fs').promises;
const logger = require('./logger');

// Path to .env file (in project root, mounted as volume)
const ENV_FILE_PATH = process.env.ENV_FILE_PATH || '/arasul/config/.env';

/**
 * Read .env file contents
 */
async function readEnvFile() {
  try {
    const content = await fs.readFile(ENV_FILE_PATH, 'utf8');
    return content;
  } catch (error) {
    logger.error(`Failed to read .env file: ${error.message}`);
    throw new Error('Failed to read environment configuration');
  }
}

/**
 * Einen Schluessel im Inhalt setzen, ueberall.
 *
 * Ein Schluessel kann mehrfach in der Datei stehen. Am 19.08.2026 auf dem
 * Geraet gefunden: ADMIN_PASSWORD in Zeile 19 und noch einmal in Zeile 169.
 * dotenv laesst das SPAETERE Vorkommen gewinnen; ersetzt wurde aber nur das
 * erste. Der Werksreset hat das Erstpasswort damit zu entwerten geglaubt, und
 * der naechste Start hat den alten Zugang wieder angelegt. Wer einen Wert
 * setzt, meint immer alle Vorkommen.
 *
 * Eine Stelle fuer beide Aufrufer, damit sie nicht wieder auseinanderlaufen.
 */
function setzeSchluessel(content, key, value) {
  // BH11 FIX: Escape regex special characters in key to prevent injection
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedKey}=.*$`, 'gm');

  if (pattern.test(content)) {
    pattern.lastIndex = 0;
    return content.replace(pattern, `${key}=${value}`);
  }
  return `${content}\n${key}=${value}\n`;
}

/**
 * Update a single environment variable in .env file
 * Preserves all comments and formatting
 */
async function updateEnvVariable(key, value) {
  try {
    const content = setzeSchluessel(await readEnvFile(), key, value);
    await fs.writeFile(ENV_FILE_PATH, content, 'utf8');

    logger.info(`Environment variable ${key} updated successfully`);
    return true;
  } catch (error) {
    logger.error(`Failed to update environment variable ${key}: ${error.message}`);
    throw new Error(`Failed to update ${key} in environment configuration`);
  }
}

/**
 * Update multiple environment variables at once
 */
async function updateEnvVariables(updates) {
  try {
    let content = await readEnvFile();

    for (const [key, value] of Object.entries(updates)) {
      content = setzeSchluessel(content, key, value);
    }

    await fs.writeFile(ENV_FILE_PATH, content, 'utf8');

    logger.info(`Updated ${Object.keys(updates).length} environment variables`);
    return true;
  } catch (error) {
    logger.error(`Failed to update environment variables: ${error.message}`);
    throw new Error('Failed to update environment configuration');
  }
}

/**
 * Backup .env file before making changes
 */
async function backupEnvFile() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${ENV_FILE_PATH}.backup.${timestamp}`;

    await fs.copyFile(ENV_FILE_PATH, backupPath);
    logger.info(`Created .env backup: ${backupPath}`);

    return backupPath;
  } catch (error) {
    logger.error(`Failed to backup .env file: ${error.message}`);
    throw new Error('Failed to create environment configuration backup');
  }
}

module.exports = {
  updateEnvVariable,
  updateEnvVariables,
  backupEnvFile,
};
