/**
 * Environment File Manager
 * Handles secure updating of .env file variables
 *
 * **Die Sicherung liegt im Speicher, nicht auf der Platte** (Fund 23.08.2026).
 *
 * `.env` ist als EINZELNE DATEI eingehaengt
 * (`${ENV_DATEI:-../.env}:/arasul/config/.env`). `/arasul/config` gibt es im
 * Container nur als Halterung dafuer, gehoert `root` und ist fuer das Backend
 * nicht beschreibbar. Eine Sicherung als Nachbardatei kann dort nie entstehen:
 *
 *   EACCES: permission denied, copyfile
 *   '/arasul/config/.env' -> '/arasul/config/.env.backup.…'
 *
 * Der Passwortwechsel rief das als ERSTES auf und endete deshalb IMMER mit
 * HTTP 500. Auf dem Geraet nachgesehen: die einzigen zwei `.env.backup.*`
 * stammen vom 14.03.2026 und aus einem Host-Skript, an der Namensform
 * erkennbar. Diese Funktion hat nie eine Sicherung erzeugt.
 *
 * Was die Sicherung schuetzen soll, ist ein abgebrochener Schreibvorgang. Dagegen
 * hilft der Inhalt im Speicher genauso, und er dupliziert die Geheimnisse nicht
 * in eine zweite Datei.
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
  const inhalt = await readEnvFile();
  logger.info(`.env gesichert: ${inhalt.length} Zeichen im Speicher`);
  return inhalt;
}

/**
 * Setzt den gesicherten Inhalt zurueck.
 *
 * Wirft NICHT: der Aufrufer steckt bereits in einem Fehlerfall, und ein
 * zweiter Fehler daraus wuerde den ersten verdecken. Was hier schiefgeht,
 * steht im Protokoll.
 *
 * @param {string} inhalt Rueckgabe von `backupEnvFile`
 */
async function envZurueckrollen(inhalt) {
  if (typeof inhalt !== 'string' || inhalt.length === 0) {
    return false;
  }
  try {
    await fs.writeFile(ENV_FILE_PATH, inhalt, 'utf8');
    logger.warn('.env auf den Stand vor der Aenderung zurueckgesetzt');
    return true;
  } catch (error) {
    logger.error(`.env liess sich nicht zurueckrollen: ${error.message}`);
    return false;
  }
}

module.exports = {
  updateEnvVariable,
  updateEnvVariables,
  backupEnvFile,
  envZurueckrollen,
};
