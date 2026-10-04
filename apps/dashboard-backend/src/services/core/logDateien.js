/**
 * Hilfen zu den Logdateien fuer `routes/system/logs.js`.
 *
 * Aus der Route hierher gezogen (M5, Auftrag jet-fehlerklassen): Routen
 * fangen keine Fehler.
 */

const fs = require('fs').promises;
const { NotFoundError } = require('../../utils/errors');

/** Wirft 404, wenn es die Logdatei des Dienstes nicht gibt. */
async function logDateiMussDaSein(service, pfad) {
  try {
    await fs.access(pfad);
  } catch {
    throw new NotFoundError(`Log file not found for service: ${service}`);
  }
}

/**
 * Groesse und Stand einer Logdatei fuer die Liste; eine Datei, die fehlt
 * oder nicht lesbar ist, steht mit `accessible: false` da.
 */
async function logDateiInfo(service, pfad) {
  try {
    const stats = await fs.stat(pfad);
    return {
      service,
      path: pfad,
      size: stats.size,
      size_mb: (stats.size / 1024 / 1024).toFixed(2),
      modified: stats.mtime,
      accessible: true,
    };
  } catch {
    return { service, path: pfad, accessible: false };
  }
}

/** Zeitstempel aus einer Logzeile ziehen (ISO oder `JJJJ-MM-TT hh:mm:ss`). */
function extractTimestamp(line) {
  // Try to extract ISO timestamp
  const isoMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);
  if (isoMatch) {
    return isoMatch[0];
  }

  // Try to extract standard timestamp
  const stdMatch = line.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  if (stdMatch) {
    return stdMatch[0];
  }

  return null;
}

/**
 * Eine Logzeile als Objekt: JSON-Zeilen geparst, alles andere als Text mit
 * Zeilennummer und Zeitstempel.
 */
function logZeileAlsObjekt(line, nummer) {
  try {
    return JSON.parse(line);
  } catch {
    return { line: nummer, text: line, timestamp: extractTimestamp(line) };
  }
}

module.exports = { logDateiMussDaSein, logDateiInfo, logZeileAlsObjekt, extractTimestamp };
