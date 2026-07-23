/**
 * Erweiterungs-Paket — Format, Validierung, Pack/Entpack (Plan 012 Phase E · Schritt 16).
 *
 * Ein Paket ist ein Ordner mit `manifest.json` im Wurzelverzeichnis plus
 * beliebigen Assets. Das Format ist in
 * `services/sandbox/dev-templates/ANLEITUNG.md` für Erweiterungs-Bauer
 * beschrieben — diese Datei ist die durchsetzende Gegenseite.
 *
 * Sicherheitsprinzip beim Import: einem hochgeladenen Archiv wird NICHTS
 * geglaubt. Jeder Eintrag muss ein einfacher relativer Pfad sein — kein `..`,
 * kein absoluter Pfad, kein Symlink/Hardlink, kein Gerätefile. Was die Prüfung
 * nicht besteht, wird verworfen statt „bereinigt".
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const tar = require('tar');
const { ValidationError } = require('../../utils/errors');

// Container-lokaler Ablageort der Pakete (compose: ../data/extensions).
const EXTENSIONS_DIR = process.env.EXTENSIONS_DIR || '/arasul/extensions';

const MANIFEST_NAME = 'manifest.json';
const EXT_TYPES = ['app', 'flow', 'tool'];
const ACCESS_TIERS = ['internet', 'internal', 'full'];
const PACKAGE_FORMAT_VERSION = 1;

// Gleiche Form wie Skill-Namen: Kleinbuchstaben/Ziffern/Bindestriche, kein
// führender/abschließender Bindestrich. Der Wert wird zum Ordnernamen.
const EXTENSION_ID_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]$/;

// Obergrenzen gegen Zip-Bombs und Ausreißer-Pakete.
const MAX_ENTRIES = 2000;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024; // 64 MB entpackt
const MAX_MANIFEST_BYTES = 64 * 1024;

/** Wirft, wenn die Id nicht als Ordnername taugt. */
function assertSafeId(id) {
  if (typeof id !== 'string' || !EXTENSION_ID_RE.test(id)) {
    throw new ValidationError(
      `Ungültige Erweiterungs-Id "${id}" — erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche (2–50 Zeichen)`
    );
  }
  return id;
}

/** Container-lokaler Paket-Ordner einer Erweiterung. */
function packageDirFor(id) {
  return path.join(EXTENSIONS_DIR, assertSafeId(id));
}

/**
 * Prüft ein rohes Manifest-Objekt und gibt eine normalisierte Fassung zurück.
 * Unbekannte Zusatzfelder bleiben erhalten (Vorwärtskompatibilität), die
 * bekannten werden hart geprüft.
 */
function validateManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('manifest.json muss ein JSON-Objekt sein');
  }
  const id = assertSafeId(raw.id);

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > 100) {
    throw new ValidationError('manifest.json: "name" ist erforderlich (max. 100 Zeichen)');
  }

  const type = raw.type;
  if (!EXT_TYPES.includes(type)) {
    throw new ValidationError(`manifest.json: "type" muss eines von ${EXT_TYPES.join(' | ')} sein`);
  }

  const accessTier = raw.accessTier ?? 'internet';
  if (!ACCESS_TIERS.includes(accessTier)) {
    throw new ValidationError(
      `manifest.json: "accessTier" muss eines von ${ACCESS_TIERS.join(' | ')} sein`
    );
  }

  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (description.length > 500) {
    throw new ValidationError('manifest.json: "description" darf höchstens 500 Zeichen haben');
  }

  const version =
    typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : '0.1.0';
  if (version.length > 32) {
    throw new ValidationError('manifest.json: "version" darf höchstens 32 Zeichen haben');
  }

  const entry = typeof raw.entry === 'string' ? raw.entry.trim() : '';
  if (!entry) {
    throw new ValidationError('manifest.json: "entry" (Startdatei) ist erforderlich');
  }
  // entry zeigt immer relativ INS Paket — kein Ausbruch, kein absoluter Pfad.
  if (path.isAbsolute(entry) || entry.split(/[\\/]/).includes('..')) {
    throw new ValidationError('manifest.json: "entry" muss ein relativer Pfad im Paket sein');
  }

  const formatVersion = raw.arasulExtensionVersion ?? PACKAGE_FORMAT_VERSION;
  if (formatVersion !== PACKAGE_FORMAT_VERSION) {
    throw new ValidationError(
      `Nicht unterstütztes Paketformat (arasulExtensionVersion=${formatVersion}, erwartet ${PACKAGE_FORMAT_VERSION})`
    );
  }

  return {
    ...raw,
    id,
    name,
    description,
    type,
    accessTier,
    version,
    entry,
    arasulExtensionVersion: PACKAGE_FORMAT_VERSION,
  };
}

/** Liest und validiert die manifest.json eines Ordners. */
async function readManifest(dir) {
  const file = path.join(dir, MANIFEST_NAME);
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    throw new ValidationError(`Keine ${MANIFEST_NAME} in "${dir}" gefunden`);
  }
  if (stat.size > MAX_MANIFEST_BYTES) {
    throw new ValidationError(`${MANIFEST_NAME} ist zu groß (max. ${MAX_MANIFEST_BYTES} Bytes)`);
  }
  let parsed;
  try {
    parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (err) {
    throw new ValidationError(`${MANIFEST_NAME} ist kein gültiges JSON: ${err.message}`);
  }
  return validateManifest(parsed);
}

/** Schreibt ein (bereits validiertes) Manifest in einen Ordner. */
async function writeManifest(dir, manifest) {
  await fsp.writeFile(path.join(dir, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Schnürt einen Paket-Ordner zu einem gzip-Tar und gibt einen lesbaren Stream
 * zurück. Die Einträge sind relativ zum Paket-Ordner (kein führender Pfad),
 * damit ein Import symmetrisch entpacken kann.
 */
function packToStream(dir) {
  return tar.create({ gzip: true, cwd: dir, portable: true }, ['.']);
}

/**
 * Entpackt ein hochgeladenes Archiv in einen leeren Zielordner.
 * Verwirft alles, was kein einfacher relativer Datei-/Ordner-Eintrag ist.
 */
async function extractArchive(archivePath, targetDir) {
  await fsp.mkdir(targetDir, { recursive: true });

  let entries = 0;
  let bytes = 0;
  // Aus dem tar-filter darf NICHT geworfen werden — die Bibliothek erwartet
  // dort ein Boolean; eine Ausnahme reißt den Stream ab, ohne das Promise zu
  // beenden (Hänger). Also: ersten Verstoß merken, Eintrag ablehnen und nach
  // dem Entpacken hart abbrechen.
  let verstoss = null;

  await tar.extract({
    file: archivePath,
    cwd: targetDir,
    strip: 0,
    // Keine Sonderrechte oder absoluten Pfade aus dem Archiv übernehmen.
    preservePaths: false,
    noMtime: true,
    filter: (entryPath, entry) => {
      if (verstoss) {return false;}
      // Nur normale Dateien und Ordner — keine Symlinks/Hardlinks/Devices.
      if (entry.type !== 'File' && entry.type !== 'Directory') {
        verstoss = `unerlaubter Eintragstyp (${entry.type}) — nur Dateien und Ordner sind zulässig`;
        return false;
      }
      const normalized = path.normalize(entryPath);
      if (path.isAbsolute(normalized) || normalized.split(/[\\/]/).includes('..')) {
        verstoss = `unerlaubter Pfad: ${entryPath}`;
        return false;
      }
      if (++entries > MAX_ENTRIES) {
        verstoss = `zu viele Einträge (max. ${MAX_ENTRIES})`;
        return false;
      }
      bytes += entry.size || 0;
      if (bytes > MAX_TOTAL_BYTES) {
        verstoss = `entpackt zu groß (max. ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB)`;
        return false;
      }
      return true;
    },
  });

  if (verstoss) {
    // Nichts halb Entpacktes stehen lassen.
    await fsp.rm(targetDir, { recursive: true, force: true });
    throw new ValidationError(`Archiv abgewiesen — ${verstoss}`);
  }

  return readManifest(targetDir);
}

/** Kopiert einen Ordner rekursiv (ohne Symlinks zu folgen). */
async function copyTree(src, dest) {
  await fsp.cp(src, dest, { recursive: true, dereference: false, force: true });
}

/** Löscht einen Paket-Ordner (idempotent). */
async function removeDir(dir) {
  await fsp.rm(dir, { recursive: true, force: true });
}

/** Stellt sicher, dass EXTENSIONS_DIR existiert. */
function ensureExtensionsDir() {
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
  return EXTENSIONS_DIR;
}

module.exports = {
  EXTENSIONS_DIR,
  MANIFEST_NAME,
  EXT_TYPES,
  ACCESS_TIERS,
  PACKAGE_FORMAT_VERSION,
  EXTENSION_ID_RE,
  assertSafeId,
  packageDirFor,
  validateManifest,
  readManifest,
  writeManifest,
  packToStream,
  extractArchive,
  copyTree,
  removeDir,
  ensureExtensionsDir,
};
