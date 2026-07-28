/**
 * Projektablage — der echte Geräte-Ordner eines Projekts.
 *
 * Jedes Projekt besitzt einen Ordner `/arasul/projects/<uuid>` (Host:
 * `data/projects/<uuid>`, Compose-Mount). Er ist die gemeinsame Wahrheit für
 * drei Welten:
 *
 *   - der Explorer zeigt und bearbeitet ihn (Datei-API in routes/ai/projects.js),
 *   - Flows nutzen ihn als Arbeitsverzeichnis (`projekt://aktiv` in ordner),
 *   - Sandboxes mounten ihn als /workspace/projekt (Batch 3).
 *
 * Der Git-Sync-Checkout (gitSyncService, PROJECT_GIT_DIR) liegt im SELBEN
 * Ordner — ein Git-gekoppeltes Projekt sieht hier schlicht sein Repo.
 *
 * Pfad-Sicherheit: jeder Zugriff läuft durch `resolveRealWithinRoots`
 * (symlink-sicher, Wurzel = der Projektordner). `.git` wird beim Auflisten
 * ausgeblendet und ist vor Löschen/Umbenennen geschützt — der Sync-Zustand
 * eines gekoppelten Repos soll nicht versehentlich aus dem Explorer heraus
 * zerlegt werden.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { resolveRealWithinRoots } = require('../flows/pathSafe');
const projectService = require('../rag/projectService');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');
const logger = require('../../utils/logger');

// Gleicher Standard wie gitSyncService — beide leben bewusst im selben Baum.
const ABLAGE_DIR = process.env.PROJECT_GIT_DIR || '/arasul/projects';

// Deckel gegen Ausreißer: der Editor ist für Text gedacht, nicht für Videos.
const MAX_EDITOR_BYTES = 1 * 1024 * 1024; // lesen/schreiben im Editor
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // Upload in die Ablage
const MAX_TREE_ENTRIES = 2000; // Baum-Budget (danach ehrlich „gekürzt")
const MAX_TREE_DEPTH = 12;

/** Ordner, die der Baum überspringt — Sync-Interna und Paket-Müllhalden. */
const VERSTECKT = new Set(['.git', 'node_modules', '__pycache__', '.venv']);

/**
 * Liefert den (angelegten) Ablage-Ordner eines Projekts.
 * Wirft NotFound, wenn es das Projekt nicht gibt — kein Ordner für Geister.
 */
async function projektOrdner(projectId, { getProject = projectService.getProject } = {}) {
  await getProject(projectId); // wirft NotFoundError bei unbekannt
  const dir = path.join(ABLAGE_DIR, String(projectId));
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/** Löst einen relativen Pfad sicher innerhalb des Projektordners auf. */
function sicher(dir, relPfad) {
  const roh = String(relPfad ?? '.').trim();
  return resolveRealWithinRoots([dir], roh === '' ? '.' : roh);
}

/** Ist der (bereits aufgelöste) Pfad der Projektordner selbst? */
function istWurzel(dir, absolut) {
  return path.resolve(absolut) === fs.realpathSync(dir);
}

/** Liegt eine Pfad-Komponente in der Verboten-Liste (.git & Co.)? */
function beruehrtVersteckt(relPfad) {
  return String(relPfad || '')
    .split('/')
    .some(teil => VERSTECKT.has(teil));
}

/**
 * Listet den Datei-Baum eines Projekts (rekursiv, Budget-gedeckelt).
 *
 * @returns {Promise<{eintraege: object[], gekuerzt: boolean}>}
 *   eintraege: [{ pfad, name, typ: 'ordner'|'datei', groesse, geaendert }],
 *   Ordner vor Dateien, alphabetisch, Pfade relativ mit '/'.
 */
async function listTree(projectId, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  const eintraege = [];
  let budget = MAX_TREE_ENTRIES;
  let gekuerzt = false;

  async function rekurse(abs, rel, tiefe) {
    if (tiefe > MAX_TREE_DEPTH || budget <= 0) {
      gekuerzt = gekuerzt || budget <= 0;
      return;
    }
    let dirents;
    try {
      dirents = await fsp.readdir(abs, { withFileTypes: true });
    } catch (err) {
      logger.warn(`Projektablage ${projectId}: "${rel || '.'}" nicht lesbar: ${err.message}`);
      return;
    }
    // Ordner zuerst, dann Dateien — jeweils alphabetisch (wie im Explorer üblich).
    dirents.sort((a, b) => {
      const da = a.isDirectory() ? 0 : 1;
      const db = b.isDirectory() ? 0 : 1;
      return da !== db ? da - db : a.name.localeCompare(b.name, 'de');
    });
    for (const d of dirents) {
      if (VERSTECKT.has(d.name)) {
        continue;
      }
      if (budget <= 0) {
        gekuerzt = true;
        return;
      }
      const kindRel = rel ? `${rel}/${d.name}` : d.name;
      const kindAbs = path.join(abs, d.name);
      // Symlinks nicht verfolgen — sie könnten aus der Ablage herausführen.
      if (d.isSymbolicLink()) {
        continue;
      }
      if (d.isDirectory()) {
        budget -= 1;
        eintraege.push({
          pfad: kindRel,
          name: d.name,
          typ: 'ordner',
          groesse: null,
          geaendert: null,
        });
        await rekurse(kindAbs, kindRel, tiefe + 1);
      } else if (d.isFile()) {
        budget -= 1;
        let stat = null;
        try {
          stat = await fsp.stat(kindAbs);
        } catch {
          continue;
        }
        eintraege.push({
          pfad: kindRel,
          name: d.name,
          typ: 'datei',
          groesse: stat.size,
          geaendert: stat.mtime.toISOString(),
        });
      }
    }
  }

  await rekurse(dir, '', 0);
  return { eintraege, gekuerzt };
}

/** Sieht der Puffer nach Binärdaten aus? (NUL-Byte im Anfangsstück) */
function istBinaer(buffer) {
  const probe = buffer.subarray(0, 8000);
  return probe.includes(0);
}

/**
 * Liest eine Datei für den Editor. Binärdateien und Übergrößen liefern
 * `binaer`/`zuGross` statt Inhalt — der Client bietet dann Download an.
 */
async function readFile(projectId, relPfad, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  const abs = sicher(dir, relPfad);
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    throw new NotFoundError(`Datei "${relPfad}" nicht gefunden`);
  }
  if (!stat.isFile()) {
    throw new ValidationError(`"${relPfad}" ist keine Datei`);
  }
  if (stat.size > MAX_EDITOR_BYTES) {
    return { inhalt: null, groesse: stat.size, binaer: false, zuGross: true };
  }
  const buffer = await fsp.readFile(abs);
  if (istBinaer(buffer)) {
    return { inhalt: null, groesse: stat.size, binaer: true, zuGross: false };
  }
  return { inhalt: buffer.toString('utf8'), groesse: stat.size, binaer: false, zuGross: false };
}

/** Schreibt eine Textdatei (legt Zwischenordner an). */
async function writeFile(projectId, relPfad, inhalt, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (beruehrtVersteckt(relPfad)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  const text = String(inhalt ?? '');
  if (Buffer.byteLength(text, 'utf8') > MAX_EDITOR_BYTES) {
    throw new ValidationError('Datei zu groß für den Editor (max. 1 MB)');
  }
  const abs = sicher(dir, relPfad);
  if (istWurzel(dir, abs)) {
    throw new ValidationError('Pfad zeigt auf den Projektordner selbst');
  }
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, text, 'utf8');
  const stat = await fsp.stat(abs);
  return { pfad: relPfad, groesse: stat.size, geaendert: stat.mtime.toISOString() };
}

/** Legt einen (verschachtelten) Ordner an. */
async function createDir(projectId, relPfad, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (beruehrtVersteckt(relPfad)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  const abs = sicher(dir, relPfad);
  if (istWurzel(dir, abs)) {
    throw new ValidationError('Pfad zeigt auf den Projektordner selbst');
  }
  await fsp.mkdir(abs, { recursive: true });
  return { pfad: relPfad };
}

/** Löscht eine Datei oder einen Ordner (rekursiv). Die Wurzel und .git nie. */
async function remove(projectId, relPfad, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (beruehrtVersteckt(relPfad)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  const abs = sicher(dir, relPfad);
  if (istWurzel(dir, abs)) {
    throw new ValidationError('Der Projektordner selbst kann nicht gelöscht werden');
  }
  let stat;
  try {
    stat = await fsp.lstat(abs);
  } catch {
    throw new NotFoundError(`"${relPfad}" nicht gefunden`);
  }
  await fsp.rm(abs, { recursive: true, force: true });
  return { pfad: relPfad, typ: stat.isDirectory() ? 'ordner' : 'datei' };
}

/** Benennt um / verschiebt innerhalb der Ablage. */
async function move(projectId, vonPfad, nachPfad, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (beruehrtVersteckt(vonPfad) || beruehrtVersteckt(nachPfad)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  const von = sicher(dir, vonPfad);
  const nach = sicher(dir, nachPfad);
  if (istWurzel(dir, von) || istWurzel(dir, nach)) {
    throw new ValidationError('Der Projektordner selbst kann nicht verschoben werden');
  }
  try {
    await fsp.access(von);
  } catch {
    throw new NotFoundError(`"${vonPfad}" nicht gefunden`);
  }
  let nachExistiert = true;
  try {
    await fsp.access(nach);
  } catch {
    nachExistiert = false;
  }
  if (nachExistiert) {
    throw new ConflictError(`"${nachPfad}" existiert bereits`);
  }
  await fsp.mkdir(path.dirname(nach), { recursive: true });
  await fsp.rename(von, nach);
  return { von: vonPfad, nach: nachPfad };
}

/** Legt eine hochgeladene Datei ab (Buffer aus multer). */
async function saveUpload(projectId, zielOrdner, originalname, buffer, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError('Datei zu groß (max. 50 MB)');
  }
  // Nur der Dateiname der hochgeladenen Datei — keine Pfad-Anteile von außen.
  const name = path.basename(String(originalname || 'datei'));
  if (!name || name === '.' || name === '..') {
    throw new ValidationError('Ungültiger Dateiname');
  }
  const relZiel = zielOrdner ? `${zielOrdner}/${name}` : name;
  if (beruehrtVersteckt(relZiel)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  const abs = sicher(dir, relZiel);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, buffer);
  return { pfad: relZiel, groesse: buffer.length };
}

/**
 * Löst einen Pfad für den Download auf (Datei ODER Ordner).
 * @returns {Promise<{abs: string, typ: 'datei'|'ordner', name: string, groesse: number|null, wurzel: string}>}
 */
async function fuerDownload(projectId, relPfad, deps = {}) {
  const { getProject = projectService.getProject } = deps;
  const dir = await projektOrdner(projectId, deps);
  const abs = sicher(dir, relPfad ?? '.');
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    throw new NotFoundError(`"${relPfad}" nicht gefunden`);
  }
  const projekt = await getProject(projectId);
  const name = istWurzel(dir, abs) ? projekt.slug || 'projekt' : path.basename(abs);
  return {
    abs,
    typ: stat.isDirectory() ? 'ordner' : 'datei',
    name,
    groesse: stat.isFile() ? stat.size : null,
    wurzel: dir,
  };
}

/**
 * Übernimmt eine Ablage-Datei in den Wissensraum (MinIO + documents-Zeile
 * mit status='pending' — der Indexer holt sie sich von dort). Gleicher
 * Vertrag wie der Dokument-Upload; das Projekt der Datei ist das Projekt
 * der Ablage.
 */
async function uebernehmen(
  { projectId, relPfad, spaceId = null, username = 'unknown' },
  deps = {}
) {
  const { minio = require('../documents/minioService'), db = require('../../database') } = deps;
  const dir = await projektOrdner(projectId, deps);
  const abs = sicher(dir, relPfad);
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    throw new NotFoundError(`Datei "${relPfad}" nicht gefunden`);
  }
  if (!stat.isFile()) {
    throw new ValidationError('Nur Dateien können in den Wissensraum übernommen werden');
  }
  if (stat.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError('Datei zu groß für den Wissensraum (max. 50 MB)');
  }
  if (spaceId) {
    const raum = await db.query('SELECT id FROM knowledge_spaces WHERE id = $1', [spaceId]);
    if (raum.rows.length === 0) {
      throw new ValidationError('Ungültiger Wissensbereich');
    }
  }

  const buffer = await fsp.readFile(abs);
  const filename = minio.sanitizeFilename(path.basename(abs));
  const fileExt = filename.includes('.') ? '.' + filename.split('.').pop().toLowerCase() : '';
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const fileHash = crypto.createHash('sha256').update(`${filename}:${buffer.length}`).digest('hex');

  await minio.enforceQuota(buffer.length);
  const objectName = `${Date.now()}_${filename}`;
  await minio.uploadObject(objectName, buffer, buffer.length, {
    'Content-Type': 'application/octet-stream',
  });

  const docId = crypto.randomUUID();
  const insert = await db.query(
    `INSERT INTO documents (
        id, filename, original_filename, file_path, file_size,
        mime_type, file_extension, content_hash, file_hash,
        status, uploaded_by, space_id, project_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, $12)
     ON CONFLICT (content_hash) WHERE deleted_at IS NULL AND status <> 'deleted'
     DO NOTHING
     RETURNING id`,
    [
      docId,
      filename,
      filename,
      objectName,
      buffer.length,
      'application/octet-stream',
      fileExt,
      contentHash,
      fileHash,
      username,
      spaceId,
      projectId,
    ]
  );
  if (insert.rows.length === 0) {
    // Duplikat — die eben hochgeladene MinIO-Kopie wieder wegräumen.
    try {
      const client = minio.getMinioClient();
      await client.removeObject(minio.MINIO_BUCKET, objectName);
    } catch (err) {
      logger.warn(`Projektablage: Duplikat-Aufräumen fehlgeschlagen: ${err.message}`);
    }
    throw new ConflictError('Ein Dokument mit gleichem Inhalt existiert bereits im Wissensraum');
  }
  return { documentId: docId, filename };
}

module.exports = {
  ABLAGE_DIR,
  MAX_EDITOR_BYTES,
  MAX_UPLOAD_BYTES,
  projektOrdner,
  listTree,
  readFile,
  writeFile,
  createDir,
  remove,
  move,
  saveUpload,
  fuerDownload,
  uebernehmen,
};
