/**
 * Flow-Registry (Plan 011, Schritt 4).
 *
 * Liest die Flow-Dateien aus `data/flows/` (im Container `/arasul/flows`),
 * hält sie im Speicher und schreibt Änderungen zurück. Das Verzeichnis ist ein
 * eigenes Docker-Volume, damit Flows einen Rebuild überleben und ins Backup
 * wandern — und bewusst getrennt vom Nutzer-Workspace, damit ein Flow mit
 * Schreibrecht seine eigene Definition nicht überschreiben kann (§8).
 *
 * Zwischenspeicher: Der Cache wird pro Datei über mtime+size invalidiert. Damit
 * ist eine von Hand editierte Datei sofort wirksam, ohne dass wir bei jedem
 * Slash-Menü-Aufruf jede Datei neu parsen.
 */

const path = require('path');
const fs = require('fs').promises;
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');
const { parseFlowFile, serializeFlowFile } = require('./flowFile');
const { FLOW_NAME_RE } = require('../../schemas/flows');

const FLOWS_DIR = process.env.FLOWS_DIR || '/arasul/flows';

/** name → { flow, mtimeMs, size } */
const cache = new Map();

/** Macht die temporären Schreibdateien pro Aufruf eindeutig (siehe `saveFlow`). */
let tmpCounter = 0;

/**
 * Wirft, wenn `name` kein sauberer Flow-Name ist. Der Name wird zum Dateinamen,
 * deshalb ist das hier die Pfad-Sperre: keine Trenner, kein `..`, nichts, was
 * aus dem Verzeichnis herausführt.
 */
function assertSafeName(name) {
  const n = String(name || '').trim();
  if (!FLOW_NAME_RE.test(n)) {
    throw new ValidationError(
      `Ungültiger Flow-Name "${name}" — erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche`
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

  let stat;
  try {
    stat = await fs.stat(file);
  } catch (err) {
    if (err.code === 'ENOENT') {
      cache.delete(safe);
      throw new NotFoundError(`Flow "${safe}" nicht gefunden`);
    }
    throw err;
  }

  const hit = cache.get(safe);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
    return hit.flow;
  }

  const text = await fs.readFile(file, 'utf8');
  const flow = parseFlowFile(text, { name: safe });
  cache.set(safe, { flow, mtimeMs: stat.mtimeMs, size: stat.size });
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

/**
 * Schreibt einen Flow. Validiert IMMER vor dem Schreiben, indem die erzeugte
 * Datei direkt wieder geparst wird — was auf der Platte landet, ist damit
 * garantiert ladbar. Ein kaputter Flow kann nicht entstehen.
 *
 * @param {object} definition - Rohe Definition (wird validiert).
 * @param {{ overwrite?: boolean }} [opts] - `overwrite:false` erzwingt Neuanlage.
 * @returns {Promise<object>} Die gespeicherte, normalisierte Definition.
 * @throws {ConflictError} wenn der Flow schon existiert und nicht überschrieben werden darf.
 */
async function saveFlow(definition, opts = {}) {
  const safe = assertSafeName(definition && definition.name);
  await ensureDir();
  const file = fileFor(safe);

  const exists = await fs
    .access(file)
    .then(() => true)
    .catch(() => false);

  if (exists && opts.overwrite === false) {
    throw new ConflictError(`Flow "${safe}" existiert bereits`);
  }
  if (!exists && opts.overwrite === true) {
    throw new NotFoundError(`Flow "${safe}" nicht gefunden`);
  }

  // Serialisieren und sofort zurücklesen: das ist die eigentliche Prüfung.
  // Sie fängt auch Fälle, in denen die Serialisierung selbst etwas verlöre.
  const text = serializeFlowFile({ ...definition, name: safe });
  const verified = parseFlowFile(text, { name: safe });

  // Atomar über eine temporäre Datei — ein abgebrochener Schreibvorgang darf
  // keinen halben Flow hinterlassen, der beim nächsten Laden scheitert.
  //
  // Der Name ist pro Aufruf eindeutig, nicht nur pro Prozess: zwei gleichzeitige
  // Speichervorgänge auf denselben Flow würden sich sonst dieselbe temporäre
  // Datei teilen und einander den Inhalt unter dem `rename` wegziehen. Das
  // Ergebnis wäre zwar nie halb geschrieben (rename ist atomar), aber einer der
  // beiden könnte am fehlenden Temp-File scheitern. Der Zähler kostet nichts.
  tmpCounter += 1;
  const tmp = `${file}.tmp-${process.pid}-${tmpCounter}`;
  try {
    await fs.writeFile(tmp, text, 'utf8');
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }

  cache.delete(safe);
  logger.info(`Flow "${safe}" gespeichert (${exists ? 'geändert' : 'neu'})`);
  return verified;
}

/**
 * Löscht einen Flow.
 * @param {string} name
 * @throws {NotFoundError} wenn es ihn nicht gibt.
 */
async function deleteFlow(name) {
  const safe = assertSafeName(name);
  try {
    await fs.unlink(fileFor(safe));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError(`Flow "${safe}" nicht gefunden`);
    }
    throw err;
  }
  cache.delete(safe);
  logger.info(`Flow "${safe}" gelöscht`);
}

/** Nur für Tests: Cache leeren. */
function clearCache() {
  cache.clear();
}

module.exports = {
  listFlows,
  loadFlow,
  saveFlow,
  deleteFlow,
  ensureDir,
  clearCache,
  assertSafeName,
  FLOWS_DIR,
};
