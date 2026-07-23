/**
 * Erweiterungs-Register (Plan 012 Phase E · Schritt 16).
 *
 * Verbindet die Paket-Ebene (`extensionPackage.js`) mit der Tabelle
 * `extensions` (Migration 116) und der Sandbox-Welt: eine in der Werkstatt
 * gebaute Erweiterung wird paketiert, kann heruntergeladen, wieder importiert
 * und als neue Werkstatt geforkt werden.
 *
 * Bewusst getrennt vom kuratierten `APP_MANIFEST` (n8n, routes/workspaceApps.js)
 * und vom Container-AppStore (`services/app/`): hier geht es um selbst gebaute
 * Pakete, nicht um mitgelieferte Plattform-Apps oder Container-Images.
 */

const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const db = require('../../database');
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');
const { SANDBOX_DATA_DIR } = require('../sandbox/sandboxShared');
const pkg = require('./extensionPackage');

/** DB-Zeile → API-Form (camelCase, ohne interne Pfade). */
function toApi(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.ext_type,
    accessTier: row.access_tier,
    version: row.version,
    source: row.source,
    enabled: row.enabled === true,
    manifest: row.manifest || {},
    installedAt: row.installed_at,
  };
}

/** Alle installierten Erweiterungen, neueste zuerst. */
async function listExtensions() {
  const result = await db.query('SELECT * FROM extensions ORDER BY installed_at DESC, id ASC');
  return result.rows.map(toApi);
}

/** Eine Erweiterung — wirft NotFoundError, wenn sie nicht registriert ist. */
async function getExtension(id) {
  pkg.assertSafeId(id);
  const result = await db.query('SELECT * FROM extensions WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError(`Erweiterung "${id}" ist nicht installiert`);
  }
  return toApi(result.rows[0]);
}

/**
 * Übernimmt einen validierten Quellordner als Paket: kopiert ihn nach
 * EXTENSIONS_DIR/<id> und schreibt/aktualisiert den Register-Eintrag.
 * `overwrite=false` schützt vor dem versehentlichen Überbügeln einer
 * bestehenden Erweiterung.
 */
async function registerPackage({ sourceDir, source, userId, overwrite = false }) {
  const manifest = await pkg.readManifest(sourceDir);
  const id = manifest.id;

  const existing = await db.query('SELECT id FROM extensions WHERE id = $1', [id]);
  if (existing.rows.length > 0 && !overwrite) {
    throw new ConflictError(
      `Erweiterung "${id}" ist bereits installiert — zum Ersetzen "überschreiben" wählen`
    );
  }

  pkg.ensureExtensionsDir();
  const target = pkg.packageDirFor(id);
  // Vollständig ersetzen statt mischen: sonst überleben Dateien einer
  // früheren Version, die es im neuen Paket nicht mehr gibt.
  await pkg.removeDir(target);
  await pkg.copyTree(sourceDir, target);

  const result = await db.query(
    `INSERT INTO extensions
       (id, name, description, ext_type, access_tier, version, source, manifest, package_path, created_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       ext_type = EXCLUDED.ext_type,
       access_tier = EXCLUDED.access_tier,
       version = EXCLUDED.version,
       source = EXCLUDED.source,
       manifest = EXCLUDED.manifest,
       package_path = EXCLUDED.package_path,
       updated_at = now()
     RETURNING *`,
    [
      id,
      manifest.name,
      manifest.description || '',
      manifest.type,
      manifest.accessTier,
      manifest.version,
      source,
      JSON.stringify(manifest),
      target,
      userId || null,
    ]
  );

  logger.info(`Erweiterung registriert: ${id} (${manifest.type}, Quelle: ${source})`);
  return toApi(result.rows[0]);
}

/**
 * Paketiert einen Ordner aus einer Sandbox (typischerweise einer
 * Erweiterungs-Werkstatt). `subfolder` ist relativ zum Sandbox-Ordner.
 */
async function buildFromSandbox({ slug, subfolder = '.', userId, overwrite = false }) {
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,98}$/.test(slug)) {
    throw new ValidationError('Ungültiger Sandbox-Slug');
  }
  const base = path.join(SANDBOX_DATA_DIR, slug);
  const resolved = path.resolve(base, subfolder || '.');
  // Ausbruch aus dem Sandbox-Ordner ist nicht verhandelbar.
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new ValidationError('Der Unterordner muss innerhalb der Sandbox liegen');
  }
  try {
    const stat = await fsp.stat(resolved);
    if (!stat.isDirectory()) {
      throw new ValidationError('Der angegebene Pfad ist kein Ordner');
    }
  } catch (err) {
    if (err instanceof ValidationError) {throw err;}
    throw new NotFoundError(`Ordner "${subfolder}" existiert in dieser Sandbox nicht`);
  }

  return registerPackage({ sourceDir: resolved, source: 'built', userId, overwrite });
}

/**
 * Importiert ein hochgeladenes `.tar.gz`-Paket. Entpackt in einen temporären
 * Ordner, validiert dort und übernimmt erst danach ins Register.
 */
async function installFromArchive({ archivePath, userId, overwrite = false }) {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arasul-ext-'));
  try {
    await pkg.extractArchive(archivePath, tmpDir);
    return await registerPackage({ sourceDir: tmpDir, source: 'imported', userId, overwrite });
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(archivePath, { force: true }).catch(() => {});
  }
}

/**
 * Forkt eine installierte Erweiterung in eine NEUE Erweiterungs-Werkstatt:
 * legt die Sandbox an und kopiert das Paket als Unterordner hinein.
 */
async function forkExtension({ id, name, userId, userRole }) {
  const ext = await getExtension(id);
  // Lazy require: bricht eine Import-Schleife und hält den Docker-Client aus
  // dem Modul-Ladepfad heraus, solange niemand forkt.
  const sandboxService = require('../sandbox/sandboxService');

  const project = await sandboxService.createProject({
    name: name || `${ext.name} (Fork)`,
    description: `Fork der Erweiterung "${ext.name}" (${ext.id})`,
    workspaceType: 'erweiterungs-werkstatt',
    network_mode: 'isolated',
    userId,
    userRole,
  });

  const target = path.join(SANDBOX_DATA_DIR, project.slug, ext.id);
  await pkg.copyTree(pkg.packageDirFor(ext.id), target);
  logger.info(`Erweiterung "${ext.id}" geforkt in Werkstatt "${project.slug}"`);

  return { project, extension: ext };
}

/** Aktiviert/deaktiviert eine Erweiterung. */
async function setEnabled(id, enabled) {
  await getExtension(id);
  const result = await db.query(
    'UPDATE extensions SET enabled = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, enabled === true]
  );
  return toApi(result.rows[0]);
}

/** Entfernt Register-Eintrag und Paket-Ordner. */
async function removeExtension(id) {
  const ext = await getExtension(id);
  await db.query('DELETE FROM extensions WHERE id = $1', [id]);
  await pkg.removeDir(pkg.packageDirFor(id)).catch(err => {
    logger.warn(`Paket-Ordner von "${id}" nicht gelöscht: ${err.message}`);
  });
  logger.info(`Erweiterung entfernt: ${id}`);
  return ext;
}

/**
 * Liefert einen Download-Stream (tar.gz) des Pakets plus Dateinamen.
 * Wirft, wenn die Erweiterung registriert, ihr Ordner aber verschwunden ist —
 * lieber ein ehrlicher Fehler als ein leeres Archiv.
 */
async function packageStream(id) {
  const ext = await getExtension(id);
  const dir = pkg.packageDirFor(id);
  try {
    await fsp.access(dir);
  } catch {
    throw new NotFoundError(
      `Paket-Ordner von "${id}" fehlt auf der Platte — Erweiterung neu importieren`
    );
  }
  return { stream: pkg.packToStream(dir), filename: `${id}-${ext.version}.tar.gz`, extension: ext };
}

module.exports = {
  listExtensions,
  getExtension,
  registerPackage,
  buildFromSandbox,
  installFromArchive,
  forkExtension,
  setEnabled,
  removeExtension,
  packageStream,
};
