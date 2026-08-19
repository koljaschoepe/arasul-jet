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
 * Update a single environment variable in .env file
 * Preserves all comments and formatting
 */
async function updateEnvVariable(key, value) {
  try {
    let content = await readEnvFile();

    // BH11 FIX: Escape regex special characters in key to prevent injection
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Pattern to match: KEY=value (with or without quotes)
    //
    // Global: ein Schluessel kann mehrfach in der Datei stehen. Am 19.08.2026
    // auf dem Geraet gefunden: ADMIN_PASSWORD in Zeile 19 und noch einmal in
    // Zeile 169. dotenv laesst das SPAETERE Vorkommen gewinnen, ersetzt wurde
    // aber nur das erste. Der Werksreset hat das Erstpasswort damit zu
    // entwerten geglaubt und es stand danach unveraendert weiter drin. Wer
    // einen Wert setzt, meint immer alle Vorkommen.
    const pattern = new RegExp(`^${escapedKey}=.*$`, 'gm');

    if (pattern.test(content)) {
      // Update existing variable
      pattern.lastIndex = 0;
      content = content.replace(pattern, `${key}=${value}`);
    } else {
      // Add new variable at the end
      content += `\n${key}=${value}\n`;
    }

    // Write back to file
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
      // BH11 FIX: Escape regex special characters in key
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`^${escapedKey}=.*$`, 'm');

      if (pattern.test(content)) {
        content = content.replace(pattern, `${key}=${value}`);
      } else {
        content += `\n${key}=${value}\n`;
      }
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
