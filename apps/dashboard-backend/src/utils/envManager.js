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
 * Einen Wert so schreiben, dass docker compose ihn nicht als Variable liest.
 *
 * Ein bcrypt-Hash sieht aus wie `$2y$10$dvbE0IB...`. docker compose loest
 * beim Lesen der `.env` `$dvbE0IB` auf und warnt bei jedem Aufruf "The
 * dvbE0IB... variable is not set" (am 28.08.2026 am Orin im Bootstrap
 * gemessen). Einfache Anfuehrungszeichen schalten die Aufloesung ab --
 * dieselbe Form, die `scripts/interactive_setup.sh` beim ersten Schreiben der
 * Datei nutzt. Wer den Wert wieder liest, streicht sie (`env_wert` im Skript
 * `arasul`).
 *
 * Nur Werte mit `$` werden eingefasst: eine Datei, in der jede Zeile
 * Anfuehrungszeichen traegt, liest sich schlechter und aendert mehr, als sie
 * muss. Ein einfaches Anfuehrungszeichen IM Wert kann es nicht geben -- der
 * einzige Wert mit `$` ist ein bcrypt-Hash, und dessen Alphabet ist
 * `./A-Za-z0-9$`.
 */
function fasseWert(value) {
  const text = String(value);
  if (!text.includes('$') || /^['"].*['"]$/.test(text)) {
    return text;
  }
  return `'${text.replace(/'/g, '')}'`;
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
  const zeile = `${key}=${fasseWert(value)}`;

  if (pattern.test(content)) {
    pattern.lastIndex = 0;
    // Ersetzung als FUNKTION, nicht als Zeichenkette: in einer
    // Ersetzungszeichenkette haette JavaScript `$&` und `$'` aus einem
    // bcrypt-Hash als Rueckverweise gelesen und den Hash dabei verstuemmelt.
    return content.replace(pattern, () => zeile);
  }
  return `${content}\n${zeile}\n`;
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
