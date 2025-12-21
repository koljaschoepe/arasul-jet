/**
 * Environment File Manager
 * Handles secure updating of .env file variables
 */

const fs = require('fs').promises;
const path = require('path');
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

        // Escape special characters in value for regex
        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Pattern to match: KEY=value (with or without quotes)
        const pattern = new RegExp(`^${key}=.*$`, 'm');

        if (pattern.test(content)) {
            // Update existing variable
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
            const pattern = new RegExp(`^${key}=.*$`, 'm');

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
 * Get value of an environment variable from .env file
 */
async function getEnvVariable(key) {
    try {
        const content = await readEnvFile();
        const pattern = new RegExp(`^${key}=(.*)$`, 'm');
        const match = content.match(pattern);

        if (match) {
            return match[1].trim();
        }

        return null;

    } catch (error) {
        logger.error(`Failed to get environment variable ${key}: ${error.message}`);
        throw new Error(`Failed to read ${key} from environment configuration`);
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

/**
 * Restore .env file from backup
 */
async function restoreEnvFile(backupPath) {
    try {
        await fs.copyFile(backupPath, ENV_FILE_PATH);
        logger.info(`Restored .env from backup: ${backupPath}`);

        return true;

    } catch (error) {
        logger.error(`Failed to restore .env file: ${error.message}`);
        throw new Error('Failed to restore environment configuration');
    }
}

module.exports = {
    readEnvFile,
    updateEnvVariable,
    updateEnvVariables,
    getEnvVariable,
    backupEnvFile,
    restoreEnvFile
};
