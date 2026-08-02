/**
 * Flow-Registry (Plan 011, Schritt 4 · Plan 014, Phase 1).
 *
 * Flows haben zwei Heimaten:
 *
 *  1. GLOBAL: `data/flows/` (im Container `/arasul/flows`) — eigenes
 *     Docker-Volume, damit Flows einen Rebuild überleben und ins Backup
 *     wandern; bewusst getrennt vom Nutzer-Workspace, damit ein Flow mit
 *     Schreibrecht seine eigene Definition nicht überschreiben kann (§8).
 *  2. PROJEKTGEBUNDEN (Plan 014): `<projektordner>/flows/*.md` — der Flow
 *     existiert nur für sein Projekt, taucht nur dort im Chat auf und kommt
 *     als normale Datei mit einer Projekt-Vorlage mit. Alle Funktionen hier
 *     nehmen dafür ein optionales `{ projektId }`.
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

/** Unterordner im Projektordner, in dem projektgebundene Flows liegen. */
const PROJEKT_FLOWS_ORDNER = 'flows';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** cacheKey (projektId:name) → { flow, mtimeMs, size } */
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

/**
 * Verzeichnis für einen Kontext: global (kein projektId) oder der
 * `flows/`-Ordner des Projekts. Die Projekt-ID wird hart geprüft — sie wird
 * Teil eines Pfads.
 */
function dirFor(projektId) {
  if (!projektId) {
    return FLOWS_DIR;
  }
  const id = String(projektId);
  if (!UUID_RE.test(id)) {
    throw new ValidationError(`Ungültige Projekt-ID "${projektId}"`);
  }
  // Gleicher Wurzelpfad wie ablageService.projektOrdner — bewusst ohne
  // DB-Prüfung hier: die Routen validieren die Projekt-ID, und ein nicht
  // existierender Ordner ergibt schlicht "nicht gefunden"/leere Liste.
  const ablageDir = process.env.PROJECT_GIT_DIR || '/arasul/projects';
  return path.join(ablageDir, id, PROJEKT_FLOWS_ORDNER);
}

function cacheKey(name, projektId) {
  return `${projektId || ''}:${name}`;
}

function fileFor(name, projektId = null) {
  return path.join(dirFor(projektId), `${assertSafeName(name)}.md`);
}

/** Legt das Flow-Verzeichnis an, falls es fehlt (frisches Gerät, leeres Volume). */
async function ensureDir(projektId = null) {
  await fs.mkdir(dirFor(projektId), { recursive: true });
}

/**
 * Lädt einen Flow von der Platte — mit Cache über mtime+size.
 * @param {string} name
 * @param {{ projektId?: string|null }} [opts] - mit projektId: der Flow aus
 *   dem `flows/`-Ordner dieses Projekts, sonst der globale.
 * @returns {Promise<object>} Validierte Flow-Definition.
 * @throws {NotFoundError} wenn die Datei fehlt.
 */
async function loadFlow(name, { projektId = null } = {}) {
  const safe = assertSafeName(name);
  const file = fileFor(safe, projektId);
  const key = cacheKey(safe, projektId);

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
async function listFlows({ projektId = null } = {}) {
  // Nur das GLOBALE Verzeichnis wird bei Bedarf angelegt. Der `flows/`-Ordner
  // eines Projekts entsteht erst, wenn wirklich ein Projekt-Flow gespeichert
  // wird — sonst bekäme jedes Projekt beim bloßen Auflisten einen Leerordner.
  if (!projektId) {
    await ensureDir();
  }

  let entries;
  try {
    entries = await fs.readdir(dirFor(projektId), { withFileTypes: true });
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
      flows.push(await loadFlow(name, { projektId }));
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
  const projektId = opts.projektId || null;
  await ensureDir(projektId);
  const file = fileFor(safe, projektId);

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

  cache.delete(cacheKey(safe, projektId));
  logger.info(
    `Flow "${safe}" gespeichert (${exists ? 'geändert' : 'neu'}${projektId ? `, Projekt ${projektId}` : ''})`
  );
  return verified;
}

/**
 * Löscht einen Flow.
 * @param {string} name
 * @throws {NotFoundError} wenn es ihn nicht gibt.
 */
async function deleteFlow(name, { projektId = null } = {}) {
  const safe = assertSafeName(name);
  try {
    await fs.unlink(fileFor(safe, projektId));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError(`Flow "${safe}" nicht gefunden`);
    }
    throw err;
  }
  cache.delete(cacheKey(safe, projektId));
  logger.info(`Flow "${safe}" gelöscht${projektId ? ` (Projekt ${projektId})` : ''}`);
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
  PROJEKT_FLOWS_ORDNER,
};
