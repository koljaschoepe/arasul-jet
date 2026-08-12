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
// Nur die Konstante — der Watcher selbst lädt extensionService seinerseits
// ausschließlich lazy (deps()), es entsteht kein Require-Zyklus beim Laden.
const { CANONICAL_WERKSTATT_SLUG } = require('./werkstattWatcher');

/** JSONB-Spalte defensiv als String-Array lesen (alte Zeilen: Spalte fehlt/null). */
function alsListe(value) {
  return Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
}

/**
 * Wirksame Brücken-Fähigkeiten einer Zeile: deklariert ∩ freigegeben.
 * Ein Update, das neue Fähigkeiten deklariert, macht sie damit NICHT
 * automatisch nutzbar — erst die erneute Freigabe (Plan 017 Schritt 2).
 */
function wirksameFaehigkeiten(row) {
  const deklariert = alsListe(row.declared_capabilities);
  const freigegeben = new Set(alsListe(row.approved_capabilities));
  return deklariert.filter(f => freigegeben.has(f));
}

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
    faehigkeiten: {
      deklariert: alsListe(row.declared_capabilities),
      freigegeben: alsListe(row.approved_capabilities),
      wirksam: wirksameFaehigkeiten(row),
    },
    n8nWorkflowId: row.n8n_workflow_id || null,
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

  // declared_capabilities folgt immer dem Manifest; approved_capabilities
  // bleibt beim Upsert unangetastet — wirksam ist nur der Schnitt, neue
  // Fähigkeiten eines Updates sind bis zur erneuten Freigabe inert.
  const result = await db.query(
    `INSERT INTO extensions
       (id, name, description, ext_type, access_tier, version, source, manifest, declared_capabilities, package_path, created_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       ext_type = EXCLUDED.ext_type,
       access_tier = EXCLUDED.access_tier,
       version = EXCLUDED.version,
       source = EXCLUDED.source,
       manifest = EXCLUDED.manifest,
       declared_capabilities = EXCLUDED.declared_capabilities,
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
      JSON.stringify(manifest.faehigkeiten || []),
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
  // Plan 017 Schritt 1: der Slug muss eine existierende, aktive
  // Erweiterungs-Werkstatt sein — sonst ließe sich JEDER Ordner unter
  // data/sandbox/projects (auch fremde Standard-Sandboxes) als Paket
  // exfiltrieren. Einzige Ausnahme: die kanonische Flow-Werkstatt „werkstatt“
  // OHNE eigene sandbox_projects-Zeile (Bau-Flows schreiben fest dorthin —
  // s. werkstattWatcher.CANONICAL_WERKSTATT_SLUG). Existiert eine Zeile mit
  // diesem Slug, wird sie normal geprüft — sonst könnte eine Standard-Sandbox
  // namens „werkstatt“ die Prüfung aushebeln.
  const projectResult = await db.query(
    `SELECT workspace_type FROM sandbox_projects WHERE slug = $1 AND status = 'active'`,
    [slug]
  );
  if (projectResult.rows.length === 0) {
    if (slug !== CANONICAL_WERKSTATT_SLUG) {
      throw new NotFoundError(`Sandbox "${slug}" existiert nicht`);
    }
  } else if (projectResult.rows[0].workspace_type !== 'erweiterungs-werkstatt') {
    throw new ValidationError(
      'Pakete lassen sich nur aus einer Erweiterungs-Werkstatt bauen — dieses Projekt ist eine Standard-Sandbox'
    );
  }
  try {
    const stat = await fsp.stat(resolved);
    if (!stat.isDirectory()) {
      throw new ValidationError('Der angegebene Pfad ist kein Ordner');
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
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

/**
 * Aktiviert/deaktiviert eine Erweiterung.
 *
 * Plan 017 Schritt 2: Deklariert die Erweiterung Brücken-Fähigkeiten, die noch
 * nicht freigegeben sind, verlangt das Aktivieren die ausdrückliche Freigabe
 * (`faehigkeitenFreigeben: true` — der Freigabe-Dialog aus Schritt 7 setzt
 * das). Ohne Freigabe kommt ein Validierungsfehler mit der fehlenden Liste,
 * damit die UI den Dialog zeigen kann. Deaktivieren ist immer erlaubt und
 * lässt die Freigabe stehen.
 */
async function setEnabled(id, enabled, { faehigkeitenFreigeben = false, userId = null } = {}) {
  const ext = await getExtension(id);
  const einschalten = enabled === true;

  // Freigabe-Gate: Aktivieren mit noch nicht freigegebenen Fähigkeiten braucht
  // die ausdrückliche Bestätigung.
  let mitFreigabe = false;
  if (einschalten) {
    const deklariert = ext.faehigkeiten.deklariert;
    const freigegeben = new Set(ext.faehigkeiten.freigegeben);
    const fehlend = deklariert.filter(f => !freigegeben.has(f));
    if (fehlend.length > 0 && !faehigkeitenFreigeben) {
      throw new ValidationError(
        `Erweiterung "${id}" verlangt die Freigabe ihrer Fähigkeiten: ${deklariert.join(', ')}`,
        { freigabe_erforderlich: true, faehigkeiten: deklariert, fehlend }
      );
    }
    mitFreigabe = faehigkeitenFreigeben && deklariert.length > 0;
  }

  const flowDeployService = require('./flowDeployService');

  // Flow-Erweiterung ZUERST live schalten, DANN den Register-Zustand kippen:
  // scheitert der n8n-Import (n8n aus, Key fehlt), bleibt enabled=false und der
  // Fehler ist sichtbar — kein „enabled, aber nichts in n8n"-Widerspruch
  // (Plan 017 Schritt 3). Deaktivieren pausiert nach dem DB-Update (best effort).
  let workflowId = ext.n8nWorkflowId || null;
  if (ext.type === 'flow' && einschalten) {
    workflowId = await flowDeployService.liveSchalten(ext);
  }

  const result = mitFreigabe
    ? await db.query(
        `UPDATE extensions
            SET enabled = TRUE,
                approved_capabilities = declared_capabilities,
                capabilities_approved_at = now(),
                capabilities_approved_by = $2,
                n8n_workflow_id = $3,
                updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [id, userId, workflowId]
      )
    : await db.query(
        'UPDATE extensions SET enabled = $2, n8n_workflow_id = $3, updated_at = now() WHERE id = $1 RETURNING *',
        [id, einschalten, workflowId]
      );
  if (mitFreigabe) {
    logger.info(
      `Erweiterung "${id}" aktiviert — Fähigkeiten freigegeben: ${ext.faehigkeiten.deklariert.join(', ')}`
    );
  }

  const aktualisiert = toApi(result.rows[0]);

  if (aktualisiert.type === 'flow' && !einschalten) {
    // Deaktivieren pausiert den Workflow; ein n8n-Fehler hier darf den bereits
    // vollzogenen Deaktivierungs-Zustand nicht zurückdrehen.
    try {
      await flowDeployService.pausieren(aktualisiert);
    } catch (err) {
      logger.warn(`Flow-Erweiterung "${id}": Pausieren in n8n fehlgeschlagen: ${err.message}`);
    }
  }

  return aktualisiert;
}

/** n8n-Live-Status einer Flow-Erweiterung (aktiv? letzter Lauf?). */
async function flowStatus(id) {
  const ext = await getExtension(id);
  if (ext.type !== 'flow') {
    throw new ValidationError('Nur Flow-Erweiterungen haben einen n8n-Status');
  }
  return require('./flowDeployService').status(ext);
}

/** Entfernt Register-Eintrag und Paket-Ordner. */
async function removeExtension(id) {
  const ext = await getExtension(id);
  // Flow-Erweiterung: den n8n-Workflow mit abräumen. entfernen() ist best
  // effort und wirft nicht — kein try/catch nötig.
  if (ext.type === 'flow' && ext.n8nWorkflowId) {
    await require('./flowDeployService').entfernen(ext);
  }
  await db.query('DELETE FROM extensions WHERE id = $1', [id]);
  await pkg.removeDir(pkg.packageDirFor(id)).catch(err => {
    logger.warn(`Paket-Ordner von "${id}" nicht gelöscht: ${err.message}`);
  });
  logger.info(`Erweiterung entfernt: ${id}`);
  return ext;
}

// Content-Type je Dateiendung für die ausgelieferte App-Oberfläche. Bewusst eng:
// nur die Typen, die eine selbst-enthaltene HTML-App braucht.
const APP_ASSET_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Löst eine Datei INNERHALB des Paket-Ordners einer App-Erweiterung auf — die
 * Grundlage, um ihre Oberfläche „in der Mitte" (wie n8n) zu rendern. Nur für
 * `type = 'app'`; jeder Pfad wird symlink-sicher im Paket-Ordner eingesperrt
 * (kein `..`, kein absoluter Pfad, kein Symlink aus dem Paket heraus). Ein
 * leerer/`/`-Pfad liefert die Startdatei (`manifest.entry`).
 */
async function resolveAppAsset(id, relPath = '') {
  const ext = await getExtension(id); // NotFound, wenn nicht installiert
  if (ext.type !== 'app') {
    throw new ValidationError('Nur App-Erweiterungen haben eine Oberfläche');
  }

  const entry = (ext.manifest && ext.manifest.entry) || 'index.html';
  const wanted = !relPath || relPath === '/' ? entry : relPath;
  // Führende Slashes/`..` abstreifen, danach hart auf Ausbruch prüfen.
  const normalized = path.normalize(wanted).replace(/^([\\/]|\.\.([\\/]|$))+/, '');
  if (path.isAbsolute(normalized) || normalized.split(/[\\/]/).includes('..')) {
    throw new ValidationError('Ungültiger Pfad in der Erweiterung');
  }

  let baseReal;
  try {
    baseReal = await fsp.realpath(pkg.packageDirFor(id));
  } catch {
    throw new NotFoundError(`Paket-Ordner von "${id}" fehlt auf der Platte — neu importieren`);
  }
  const target = path.join(baseReal, normalized);
  let targetReal;
  try {
    targetReal = await fsp.realpath(target);
  } catch {
    throw new NotFoundError('Datei in der Erweiterung nicht gefunden');
  }
  // Symlink-sichere Zugehörigkeit: der aufgelöste Zielpfad muss im Paket liegen.
  if (targetReal !== baseReal && !targetReal.startsWith(baseReal + path.sep)) {
    throw new ValidationError('Pfad verlässt das Erweiterungs-Paket');
  }
  const stat = await fsp.stat(targetReal);
  if (!stat.isFile()) {
    throw new NotFoundError('Datei in der Erweiterung nicht gefunden');
  }

  const fileExt = path.extname(targetReal).toLowerCase();
  return {
    filePath: targetReal,
    contentType: APP_ASSET_MIME[fileExt] || 'application/octet-stream',
    size: stat.size,
  };
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
  flowStatus,
  resolveAppAsset,
  packageStream,
};
