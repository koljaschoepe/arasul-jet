/**
 * Flow-Registry (Plan 011, Schritt 4).
 *
 * Flows liegen unter `data/flows/` (im Container `/arasul/flows`) — eigenes
 * Docker-Volume, damit Flows einen Rebuild überleben und ins Backup wandern;
 * bewusst getrennt vom Nutzer-Workspace, damit ein Flow mit Schreibrecht
 * seine eigene Definition nicht überschreiben kann (§8). Die zweite Heimat,
 * projektgebundene Flows (Plan 014), ist mit den Projekten in Phase B4
 * (26.08.2026) gefallen.
 *
 * Zwischenspeicher: Der Cache wird pro Datei über mtime+size invalidiert. Damit
 * ist eine von Hand editierte Datei sofort wirksam, ohne dass wir bei jedem
 * Slash-Menü-Aufruf jede Datei neu parsen.
 */

const path = require('path');
const fs = require('fs').promises;
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const { parseFlowFile } = require('./flowFile');
const { FLOW_NAME_RE } = require('../../schemas/flows');

const FLOWS_DIR = process.env.FLOWS_DIR || '/arasul/flows';

/** name → { flow, mtimeMs, size } */
const cache = new Map();

/**
 * Wirft, wenn `name` kein sauberer Flow-Name ist. Der Name wird zum Dateinamen,
 * deshalb ist das hier die Pfad-Sperre: keine Trenner, kein `..`, nichts, was
 * aus dem Verzeichnis herausführt.
 */
function assertSafeName(name) {
  const n = String(name || '').trim();
  if (!FLOW_NAME_RE.test(n)) {
    throw new ValidationError(
      `Ungültiger Flow-Name "${name}", erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche`
    );
  }
  return n;
}

function fileFor(name) {
  return path.join(FLOWS_DIR, `${assertSafeName(name)}.md`);
}

/** Legt das Flow-Verzeichnis an, falls es fehlt (frisches Gerät, leeres Volume). */
async function ensureDir() {
  await fs.mkdir(FLOWS_DIR, { recursive: true });
}

/**
 * Lädt einen Flow von der Platte — mit Cache über mtime+size.
 * @param {string} name
 * @returns {Promise<object>} Validierte Flow-Definition.
 * @throws {NotFoundError} wenn die Datei fehlt.
 */
async function loadFlow(name) {
  const safe = assertSafeName(name);
  const file = fileFor(safe);
  const key = safe;

  let stat;
  try {
    stat = await fs.stat(file);
  } catch (err) {
    if (err.code === 'ENOENT') {
      cache.delete(key);
      throw new NotFoundError(`Flow "${safe}" nicht gefunden`);
    }
    throw err;
  }

  const hit = cache.get(key);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
    return hit.flow;
  }

  const text = await fs.readFile(file, 'utf8');
  const flow = parseFlowFile(text, { name: safe });
  cache.set(key, { flow, mtimeMs: stat.mtimeMs, size: stat.size });
  return flow;
}

/**
 * Listet alle Flows. Eine kaputte Datei lässt den Aufruf NICHT scheitern —
 * sie wird mit ihrem Fehler zurückgegeben, damit das Menü weiter funktioniert
 * und der Nutzer sieht, welcher Flow klemmt (statt eines leeren Menüs).
 * @returns {Promise<{flows: object[], fehlerhaft: {name:string, fehler:string}[]}>}
 */
async function listFlows() {
  await ensureDir();

  let entries;
  try {
    entries = await fs.readdir(FLOWS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { flows: [], fehlerhaft: [] };
    }
    throw err;
  }

  const names = entries
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map(e => e.name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b));

  const flows = [];
  const fehlerhaft = [];
  for (const name of names) {
    try {
      flows.push(await loadFlow(name));
    } catch (err) {
      fehlerhaft.push({ name, fehler: err.message });
      logger.warn(`Flow "${name}" ist fehlerhaft und wird übersprungen: ${err.message}`);
    }
  }
  return { flows, fehlerhaft };
}

/** Nur für Tests: Cache leeren. */
function clearCache() {
  cache.clear();
}

module.exports = {
  listFlows,
  loadFlow,
  ensureDir,
  clearCache,
  assertSafeName,
  FLOWS_DIR,
};
